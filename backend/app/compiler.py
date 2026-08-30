from __future__ import annotations

import base64
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
MEMORY_LIMIT_MARKER = "__CODE_TUTOR_MEMORY_LIMIT__"
PEAK_MEMORY_MARKER = "__CODE_TUTOR_PEAK_MEMORY_KB__="


class CompilerUnavailable(RuntimeError):
    """Raised when the isolated compiler service cannot be used."""


class CompilerService(Protocol):
    def is_available(self) -> bool: ...

    def run(
        self,
        code: str,
        stdin: str,
        files: Sequence[ProjectSourceFile] | None = None,
        language: str = "cpp",
        *,
        time_limit_ms: int | None = None,
        memory_limit_mb: int | None = None,
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
        language: str = "cpp",
        *,
        time_limit_ms: int | None = None,
        memory_limit_mb: int | None = None,
    ) -> RunResponse:
        if not self.is_available():
            raise CompilerUnavailable(
                "Docker Engine is unavailable. Check the Docker service and service-account permissions."
            )

        started_at = time.perf_counter()
        with tempfile.TemporaryDirectory(prefix="code-tutor-") as temp_directory:
            source_directory = Path(temp_directory)
            source_files = (
                list(files)
                if files
                else [ProjectSourceFile(name="main.py" if language == "python" else "main.cpp", content=code)]
            )
            self._write_source_files(source_directory, source_files)

            command = self._docker_command(
                source_directory,
                language,
                time_limit_ms=time_limit_ms,
                memory_limit_mb=memory_limit_mb,
            )
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

    def run_many(
        self,
        code: str,
        stdins: Sequence[str],
        language: str = "cpp",
    ) -> list[RunResponse]:
        """Compile once, then execute one isolated process for every stdin value."""
        if not stdins:
            return []
        if len(stdins) > 200:
            raise ValueError("A compiler batch cannot exceed 200 candidate runs.")
        if not self.is_available():
            raise CompilerUnavailable(
                "Docker Engine is unavailable. Check the Docker service and service-account permissions."
            )

        started_at = time.perf_counter()
        with tempfile.TemporaryDirectory(prefix="code-tutor-batch-") as temp_directory:
            source_directory = Path(temp_directory)
            source_name = "main.py" if language == "python" else "main.cpp"
            self._write_source_files(
                source_directory,
                [ProjectSourceFile(name=source_name, content=code)],
            )
            input_directory = source_directory / ".batch-inputs"
            input_directory.mkdir()
            for index, stdin in enumerate(stdins):
                (input_directory / f"{index:03d}.txt").write_text(
                    stdin, encoding="utf-8", newline="\n"
                )
            if os.name != "nt":
                input_directory.chmod(0o755)
                for input_file in input_directory.iterdir():
                    input_file.chmod(0o644)

            command = self._docker_batch_command(source_directory, language)
            try:
                completed = subprocess.run(
                    command,
                    capture_output=True,
                    check=False,
                    text=True,
                    encoding="utf-8",
                    errors="replace",
                    timeout=(
                        self.settings.compile_timeout_seconds
                        + self.settings.run_timeout_seconds * len(stdins)
                        + 10
                    ),
                )
            except subprocess.TimeoutExpired as error:
                raise CompilerUnavailable(
                    "The Docker batch compiler did not respond within the service timeout."
                ) from error
            except OSError as error:
                raise CompilerUnavailable("Unable to start Docker.") from error

        duration_ms = round((time.perf_counter() - started_at) * 1000)
        return self._to_batch_responses(completed, len(stdins), duration_ms)

    def _docker_command(
        self,
        source_directory: Path,
        language: str = "cpp",
        *,
        time_limit_ms: int | None = None,
        memory_limit_mb: int | None = None,
    ) -> list[str]:
        output_limit = self.settings.max_output_bytes
        run_timeout = max(
            0.1,
            (time_limit_ms / 1000) if time_limit_ms is not None else self.settings.run_timeout_seconds,
        )
        memory_limit = max(16, memory_limit_mb or 512)
        prepare_and_run = (
            """PYTHONPYCACHEPREFIX=/tmp/pycache python3 -m py_compile /source/*.py 2>/tmp/compile.err
compile_status=$?
if [ "$compile_status" -ne 0 ]; then
  echo {compile_error_marker} >&2
  head -c {output_limit} /tmp/compile.err >&2
  exit 1
fi

timeout --signal=TERM --kill-after=1s {run_timeout}s /usr/bin/time -f %M -o /tmp/memory_kb python3 -B /source/main.py > /tmp/stdout 2>/tmp/stderr"""
            if language == "python"
            else """g++ /source/*.cpp -std=c++20 -O2 -pipe -Wall -Wextra -o /tmp/program 2>/tmp/compile.err
compile_status=$?
if [ "$compile_status" -ne 0 ]; then
  echo {compile_error_marker} >&2
  head -c {output_limit} /tmp/compile.err >&2
  exit 1
fi

timeout --signal=TERM --kill-after=1s {run_timeout}s /usr/bin/time -f %M -o /tmp/memory_kb /tmp/program > /tmp/stdout 2>/tmp/stderr"""
        ).format(
            compile_error_marker=COMPILE_ERROR_MARKER,
            output_limit=output_limit,
            run_timeout=run_timeout,
        )
        script = f"""
set -u
{prepare_and_run}
run_status=$?

stdout_size=$(wc -c < /tmp/stdout)
stderr_size=$(wc -c < /tmp/stderr)
if [ "$stdout_size" -gt {output_limit} ] || [ "$stderr_size" -gt {output_limit} ]; then
  echo {TRUNCATED_MARKER} >&2
fi

head -c {output_limit} /tmp/stdout
head -c {output_limit} /tmp/stderr >&2

printf '\n{PEAK_MEMORY_MARKER}%s\n' "$(cat /tmp/memory_kb 2>/dev/null || echo 0)" >&2
if [ "$run_status" -eq 124 ] || [ "$run_status" -eq 137 ]; then
  if [ "$run_status" -eq 124 ]; then
    echo {TIMEOUT_MARKER} >&2
  else
    echo {MEMORY_LIMIT_MARKER} >&2
  fi
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
            f"{memory_limit}m",
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

    def _docker_batch_command(self, source_directory: Path, language: str) -> list[str]:
        output_limit = self.settings.max_output_bytes
        run_timeout = self.settings.run_timeout_seconds
        if language == "python":
            compile_script = '''PYTHONPYCACHEPREFIX=/tmp/pycache python3 -m py_compile /source/main.py 2>/tmp/compile.err
compile_status=$?
runner="python3 -B /source/main.py"'''
        else:
            compile_script = '''g++ /source/main.cpp -std=c++20 -O2 -pipe -Wall -Wextra -o /tmp/program 2>/tmp/compile.err
compile_status=$?
runner="/tmp/program"'''
        script = f"""
set -u
{compile_script}
if [ "$compile_status" -ne 0 ]; then
  echo {COMPILE_ERROR_MARKER} >&2
  head -c {output_limit} /tmp/compile.err >&2
  exit 1
fi

for input_file in /source/.batch-inputs/*.txt; do
  timeout --signal=TERM --kill-after=1s {run_timeout}s bash -lc "$runner" < "$input_file" > /tmp/stdout 2>/tmp/stderr
  run_status=$?
  stdout_size=$(wc -c < /tmp/stdout)
  stderr_size=$(wc -c < /tmp/stderr)
  truncated=0
  if [ "$stdout_size" -gt {output_limit} ] || [ "$stderr_size" -gt {output_limit} ]; then
    truncated=1
  fi
  if [ "$run_status" -eq 124 ] || [ "$run_status" -eq 137 ]; then
    result_status=timeout
  elif [ "$truncated" -eq 1 ]; then
    result_status=output_limit
  elif [ "$run_status" -eq 0 ]; then
    result_status=accepted
  else
    result_status=runtime_error
  fi
  stdout_b64=$(head -c {output_limit} /tmp/stdout | base64 -w 0)
  stderr_b64=$(head -c {output_limit} /tmp/stderr | base64 -w 0)
  printf '%s\\t%s\\t%s\\t%s\\t%s\\n' "$result_status" "$run_status" "$truncated" "$stdout_b64" "$stderr_b64"
done
""".strip()
        return [
            self.settings.docker_binary,
            "run",
            "--rm",
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
        peak_memory_kb = 0
        cleaned_lines: list[str] = []
        for line in stderr.splitlines():
            if line.startswith(PEAK_MEMORY_MARKER):
                try:
                    peak_memory_kb = max(0, int(line.removeprefix(PEAK_MEMORY_MARKER)))
                except ValueError:
                    peak_memory_kb = 0
            else:
                cleaned_lines.append(line)
        stderr = "\n".join(cleaned_lines)
        truncated = TRUNCATED_MARKER in stderr
        stderr = stderr.replace(TRUNCATED_MARKER, "").strip()

        if COMPILE_ERROR_MARKER in stderr:
            return RunResponse(
                status="compile_error",
                stderr=stderr.replace(COMPILE_ERROR_MARKER, "").strip(),
                exit_code=completed.returncode,
                duration_ms=duration_ms,
                truncated=truncated,
                peak_memory_kb=peak_memory_kb,
            )

        if TIMEOUT_MARKER in stderr:
            return RunResponse(
                status="timeout",
                stdout=completed.stdout,
                stderr=stderr.replace(TIMEOUT_MARKER, "").strip(),
                exit_code=None,
                duration_ms=duration_ms,
                truncated=truncated,
                peak_memory_kb=peak_memory_kb,
            )

        if MEMORY_LIMIT_MARKER in stderr:
            return RunResponse(
                status="memory_limit",
                stdout=completed.stdout,
                stderr=stderr.replace(MEMORY_LIMIT_MARKER, "").strip(),
                exit_code=completed.returncode,
                duration_ms=duration_ms,
                truncated=truncated,
                peak_memory_kb=peak_memory_kb,
            )

        if completed.returncode == 125:
            raise CompilerUnavailable(stderr or "Docker could not start the compiler container.")

        if truncated:
            return RunResponse(
                status="output_limit",
                stdout=completed.stdout,
                stderr=stderr,
                exit_code=completed.returncode,
                duration_ms=duration_ms,
                truncated=True,
                peak_memory_kb=peak_memory_kb,
            )

        status = "accepted" if completed.returncode == 0 else "runtime_error"
        return RunResponse(
            status=status,
            stdout=completed.stdout,
            stderr=stderr,
            exit_code=completed.returncode,
            duration_ms=duration_ms,
            truncated=truncated,
            peak_memory_kb=peak_memory_kb,
        )

    @staticmethod
    def _to_batch_responses(
        completed: subprocess.CompletedProcess[str],
        expected_count: int,
        duration_ms: int,
    ) -> list[RunResponse]:
        stderr = completed.stderr.strip()
        average_duration = max(0, round(duration_ms / expected_count))
        if COMPILE_ERROR_MARKER in stderr:
            compile_error = stderr.replace(COMPILE_ERROR_MARKER, "").strip()
            return [
                RunResponse(
                    status="compile_error",
                    stderr=compile_error,
                    exit_code=completed.returncode,
                    duration_ms=average_duration,
                )
                for _ in range(expected_count)
            ]
        if completed.returncode == 125:
            raise CompilerUnavailable(stderr or "Docker could not start the compiler container.")

        rows = completed.stdout.splitlines()
        if completed.returncode != 0 or len(rows) != expected_count:
            raise CompilerUnavailable("The Docker batch compiler returned an incomplete result.")
        responses: list[RunResponse] = []
        for row in rows:
            parts = row.split("\t")
            if len(parts) != 5:
                raise CompilerUnavailable("The Docker batch compiler returned invalid data.")
            run_status, exit_code, truncated, stdout_b64, stderr_b64 = parts
            if run_status not in {"accepted", "runtime_error", "timeout", "output_limit"}:
                raise CompilerUnavailable("The Docker batch compiler returned an unknown status.")
            try:
                stdout = base64.b64decode(stdout_b64).decode("utf-8", errors="replace")
                run_stderr = base64.b64decode(stderr_b64).decode("utf-8", errors="replace")
            except ValueError as error:
                raise CompilerUnavailable("The Docker batch compiler returned corrupt output.") from error
            responses.append(
                RunResponse(
                    status=run_status,  # type: ignore[arg-type]
                    stdout=stdout,
                    stderr=run_stderr.strip(),
                    exit_code=None if run_status == "timeout" else int(exit_code),
                    duration_ms=average_duration,
                    truncated=truncated == "1",
                )
            )
        return responses
