import subprocess
from pathlib import Path
from unittest.mock import patch

from app.compiler import (
    COMPILE_ERROR_MARKER,
    TIMEOUT_MARKER,
    TRUNCATED_MARKER,
    DockerCompiler,
)
from app.config import Settings
from app.models import ProjectSourceFile


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
    assert "-i" in command
    assert "--read-only" in command
    assert "--cap-drop ALL" in combined
    assert "no-new-privileges" in combined
    assert "--pids-limit 64" in combined
    assert "--memory 512m" in combined
    assert "code-tutor-compiler:local" in command
    assert "g++ /source/*.cpp" in combined


def test_writes_all_project_sources() -> None:
    sources = [
        ProjectSourceFile(name="main.cpp", content='#include "helper.hpp"\nint main() {}'),
        ProjectSourceFile(name="helper.hpp", content="int helper();"),
        ProjectSourceFile(name="helper.cpp", content="int helper() { return 1; }"),
    ]

    with patch.object(Path, "write_text") as write_text:
        DockerCompiler._write_source_files(Path("C:/project-sources"), sources)

    assert [call.args[0] for call in write_text.call_args_list] == [
        '#include "helper.hpp"\nint main() {}',
        "int helper();",
        "int helper() { return 1; }",
    ]
