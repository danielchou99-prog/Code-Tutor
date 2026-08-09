from __future__ import annotations

import asyncio
from dataclasses import dataclass, field
import os
from pathlib import Path
import shutil
import tempfile
from typing import Protocol
from uuid import uuid4

from .compiler import CompilerUnavailable, DockerCompiler
from .config import Settings


READY_MARKER = "__CODE_TUTOR_INTERACTIVE_READY__"


class InteractiveSessionProtocol(Protocol):
    process: asyncio.subprocess.Process
    container_name: str

    async def write(self, data: str) -> None: ...

    async def close(self) -> None: ...


class InteractiveCompilerService(Protocol):
    def is_available(self) -> bool: ...

    async def start(self, code: str) -> InteractiveSessionProtocol: ...


@dataclass
class DockerInteractiveSession:
    process: asyncio.subprocess.Process
    container_name: str
    docker_binary: str
    temporary_directory: tempfile.TemporaryDirectory[str]
    _close_lock: asyncio.Lock = field(default_factory=asyncio.Lock)
    _closed: bool = False

    async def write(self, data: str) -> None:
        if self.process.stdin is None or self.process.returncode is not None:
            raise BrokenPipeError("The interactive program is no longer running.")
        self.process.stdin.write(data.encode("utf-8"))
        await self.process.stdin.drain()

    async def close(self) -> None:
        async with self._close_lock:
            if self._closed:
                return
            self._closed = True

            if self.process.stdin and not self.process.stdin.is_closing():
                self.process.stdin.close()

            if self.process.returncode is None:
                try:
                    cleanup = await asyncio.create_subprocess_exec(
                        self.docker_binary,
                        "rm",
                        "--force",
                        self.container_name,
                        stdout=asyncio.subprocess.DEVNULL,
                        stderr=asyncio.subprocess.DEVNULL,
                    )
                    try:
                        await asyncio.wait_for(cleanup.wait(), timeout=5)
                    except asyncio.TimeoutError:
                        cleanup.kill()
                        await cleanup.wait()
                except OSError:
                    pass

            if self.process.returncode is None:
                self.process.kill()
            try:
                await asyncio.wait_for(self.process.wait(), timeout=5)
            except asyncio.TimeoutError:
                pass
            self.temporary_directory.cleanup()


@dataclass
class DockerInteractiveCompiler:
    settings: Settings

    def is_available(self) -> bool:
        return (
            shutil.which(self.settings.docker_binary) is not None
            and DockerCompiler(self.settings).is_available()
        )

    async def start(self, code: str) -> DockerInteractiveSession:
        if not self.is_available():
            raise CompilerUnavailable("Docker is not installed or unavailable.")

        temporary_directory = tempfile.TemporaryDirectory(prefix="code-tutor-interactive-")
        source_directory = Path(temporary_directory.name)
        source_file = source_directory / "main.cpp"
        source_file.write_text(code, encoding="utf-8", newline="\n")
        if os.name != "nt":
            source_directory.chmod(0o755)
            source_file.chmod(0o644)

        container_name = f"code-tutor-interactive-{uuid4().hex}"
        command = self._docker_command(source_directory, container_name)
        try:
            process = await asyncio.create_subprocess_exec(
                *command,
                stdin=asyncio.subprocess.PIPE,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
        except OSError as error:
            temporary_directory.cleanup()
            raise CompilerUnavailable("Unable to start Docker.") from error

        return DockerInteractiveSession(
            process=process,
            container_name=container_name,
            docker_binary=self.settings.docker_binary,
            temporary_directory=temporary_directory,
        )

    def _docker_command(
        self, source_directory: Path, container_name: str
    ) -> list[str]:
        script = f"""
set -u
g++ /source/main.cpp -std=c++20 -O2 -pipe -Wall -Wextra -o /tmp/program
compile_status=$?
if [ "$compile_status" -ne 0 ]; then
  exit "$compile_status"
fi
echo {READY_MARKER} >&2
exec timeout --signal=KILL {self.settings.interactive_timeout_seconds}s /tmp/program
""".strip()

        return [
            self.settings.docker_binary,
            "run",
            "--rm",
            "--name",
            container_name,
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
