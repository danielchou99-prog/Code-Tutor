from __future__ import annotations

from dataclasses import dataclass
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import time
from typing import Protocol, Sequence

from .config import Settings
from .models import ProjectSourceFile, RunResponse


COMPILE_ERROR_MARKER = "__CODE_TUTOR_COMPILE_ERROR__"
TIMEOUT_MARKER = "__CODE_TUTOR_TIMEOUT__"
TRUNCATED_MARKER = "__CODE_TUTOR_TRUNCATED__"


class CompilerUnavailable(RuntimeError):
    """Raised when the isolated compiler service cannot be used."""


class CompilerService(Protocol):
    def is_available(self) -> bool: ...

    def run(
        self,
        code: str,
        stdin: str,
        files: Sequence[ProjectSourceFile] | None = None,
    ) -> RunResponse: ...


@dataclass
class DockerCompiler:
    settings: Settings

    def is_available(self) -> bool:
        if shutil.which(self.settings.docker_binary) is None:
            return False

        try:
            completed = subprocess.run(
                [self.settings.docker_binary, "info", "--format", "{{.ServerVersion}}"],
                capture_output=True,
                check=False,
                text=True,
                timeout=5,
            )
        except (OSError, subprocess.SubprocessError):
            return False
        return completed.returncode == 0

    def run(
        self,
        code: str,
        stdin: str,
        files: Sequence[ProjectSourceFile] | None = None,
    ) -> RunResponse:
        if not self.is_available():
            raise CompilerUnavailable(
                "Docker is not installed or Docker Desktop is not running."
            )

        started_at = time.perf_counter()
        with tempfile.TemporaryDirectory(prefix="code-tutor-") as temp_directory:
            source_directory = Path(temp_directory)
            source_files = (
                list(files)
                if files
                else [ProjectSourceFile(name="main.cpp", content=code)]
            )
            self._write_source_files(source_directory, source_files)

            command = self._docker_command(source_directory)
            try:
                completed = subprocess.run(
                    command,
                    input=stdin,
                    capture_output=True,
                    check=False,
                    text=True,
                    encoding="utf-8",
                    errors="replace",
                    timeout=(
                        self.settings.compile_timeout_seconds
                        + self.settings.run_timeout_seconds
                        + 7
                    ),
                )
            except subprocess.TimeoutExpired as error:
                raise CompilerUnavailable(
                    "The Docker compiler did not respond within the service timeout."
                ) from error
            except OSError as error:
                raise CompilerUnavailable("Unable to start Docker.") from error

        duration_ms = round((time.perf_counter() - started_at) * 1000)
        return self._to_response(completed, duration_ms)

    def _docker_command(self, source_directory: Path) -> list[str]:
        output_limit = self.settings.max_output_bytes
        run_timeout = self.settings.run_timeout_seconds
        script = f"""
set -u
g++ /source/*.cpp -std=c++20 -O2 -pipe -Wall -Wextra -o /tmp/program 2>/tmp/compile.err
compile_status=$?
if [ "$compile_status" -ne 0 ]; then
  echo {COMPILE_ERROR_MARKER} >&2
  head -c {output_limit} /tmp/compile.err >&2
  exit 1
fi

timeout --signal=KILL {run_timeout}s /tmp/program > /tmp/stdout 2>/tmp/stderr
run_status=$?

stdout_size=$(wc -c < /tmp/stdout)
stderr_size=$(wc -c < /tmp/stderr)
if [ "$stdout_size" -gt {output_limit} ] || [ "$stderr_size" -gt {output_limit} ]; then
  echo {TRUNCATED_MARKER} >&2
fi

head -c {output_limit} /tmp/stdout
head -c {output_limit} /tmp/stderr >&2

if [ "$run_status" -eq 124 ] || [ "$run_status" -eq 137 ]; then
  echo {TIMEOUT_MARKER} >&2
  exit 1
fi
exit "$run_status"
""".strip()

        return [
            self.settings.docker_binary,
            "run",
            "--rm",
            "-i",
            "--network",
            "none",
            "--memory",
            "512m",
            "--cpus",
            "0.5",
            "--pids-limit",
            "64",
            "--read-only",
            "--cap-drop",
            "ALL",
            "--security-opt",
            "no-new-privileges",
            "--user",
            "65534:65534",
            "--tmpfs",
            "/tmp:rw,exec,nosuid,size=64m",
            "--mount",
            f"type=bind,source={source_directory.resolve()},target=/source,readonly",
            self.settings.compiler_image,
            "bash",
            "-lc",
            script,
        ]

    @staticmethod
    def _write_source_files(
        directory: Path, source_files: Sequence[ProjectSourceFile]
    ) -> None:
        for source in source_files:
            (directory / source.name).write_text(
                source.content, encoding="utf-8", newline="\n"
            )
        if os.name != "nt":
            directory.chmod(0o755)
            for source in source_files:
                (directory / source.name).chmod(0o644)

    @staticmethod
    def _to_response(
        completed: subprocess.CompletedProcess[str], duration_ms: int
    ) -> RunResponse:
        stderr = completed.stderr
        truncated = TRUNCATED_MARKER in stderr
        stderr = stderr.replace(TRUNCATED_MARKER, "").strip()

        if COMPILE_ERROR_MARKER in stderr:
            return RunResponse(
                status="compile_error",
                stderr=stderr.replace(COMPILE_ERROR_MARKER, "").strip(),
                exit_code=completed.returncode,
                duration_ms=duration_ms,
                truncated=truncated,
            )

        if TIMEOUT_MARKER in stderr:
            return RunResponse(
                status="timeout",
                stdout=completed.stdout,
                stderr=stderr.replace(TIMEOUT_MARKER, "").strip(),
                exit_code=None,
                duration_ms=duration_ms,
                truncated=truncated,
            )

        if completed.returncode == 125:
            raise CompilerUnavailable(stderr or "Docker could not start the compiler container.")

        status = "accepted" if completed.returncode == 0 else "runtime_error"
        return RunResponse(
            status=status,
            stdout=completed.stdout,
            stderr=stderr,
            exit_code=completed.returncode,
            duration_ms=duration_ms,
            truncated=truncated,
        )
