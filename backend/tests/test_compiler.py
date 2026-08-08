import subprocess
from pathlib import Path

from app.compiler import (
    COMPILE_ERROR_MARKER,
    TIMEOUT_MARKER,
    TRUNCATED_MARKER,
    DockerCompiler,
)
from app.config import Settings


def compiler() -> DockerCompiler:
    return DockerCompiler(Settings())


def test_maps_successful_process_to_accepted() -> None:
    completed = subprocess.CompletedProcess([], 0, stdout="42\n", stderr="")

    result = compiler()._to_response(completed, 50)

    assert result.status == "accepted"
    assert result.stdout == "42\n"
    assert result.exit_code == 0


def test_maps_compile_error_and_removes_internal_marker() -> None:
    completed = subprocess.CompletedProcess(
        [], 1, stdout="", stderr=f"{COMPILE_ERROR_MARKER}\nmain.cpp:1: error"
    )

    result = compiler()._to_response(completed, 60)

    assert result.status == "compile_error"
    assert result.stderr == "main.cpp:1: error"
    assert COMPILE_ERROR_MARKER not in result.stderr


def test_maps_timeout_and_output_truncation() -> None:
    completed = subprocess.CompletedProcess(
        [],
        1,
        stdout="partial",
        stderr=f"{TRUNCATED_MARKER}\n{TIMEOUT_MARKER}",
    )

    result = compiler()._to_response(completed, 3_000)

    assert result.status == "timeout"
    assert result.truncated is True
    assert result.exit_code is None


def test_docker_command_contains_sandbox_limits() -> None:
    command = compiler()._docker_command(Path("C:/temporary/source"))
    combined = " ".join(command)

    assert "--network none" in combined
    assert "--read-only" in command
    assert "--cap-drop ALL" in combined
    assert "no-new-privileges" in combined
    assert "--pids-limit 64" in combined
    assert "--memory 512m" in combined
    assert "code-tutor-compiler:local" in command
