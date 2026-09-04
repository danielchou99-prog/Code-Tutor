import subprocess
import base64
import os
from pathlib import Path

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


def test_batch_response_parser_preserves_order_and_status() -> None:
    first_stdout = base64.b64encode(b"first\n").decode("ascii")
    second_stderr = base64.b64encode(b"bad input\n").decode("ascii")
    completed = subprocess.CompletedProcess(
        args=[],
        returncode=0,
        stdout=(
            f"accepted\t0\t0\t1200\t{first_stdout}\t\n"
            f"runtime_error\t1\t0\t2400\t\t{second_stderr}\n"
        ),
        stderr="",
    )

    results = compiler()._to_batch_responses(completed, 2, 100)

    assert [result.status for result in results] == ["accepted", "runtime_error"]
    assert results[0].stdout == "first\n"
    assert results[1].stderr == "bad input"
    assert [result.peak_memory_kb for result in results] == [1200, 2400]


def test_batch_response_parser_maps_memory_limit() -> None:
    completed = subprocess.CompletedProcess(
        args=[],
        returncode=0,
        stdout="memory_limit\t137\t0\t65536\t\t\n",
        stderr="",
    )

    result = compiler()._to_batch_responses(completed, 1, 100)[0]

    assert result.status == "memory_limit"
    assert result.peak_memory_kb == 65536
    assert result.exit_code == 137


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
    assert "timeout --signal=KILL 15s g++" in combined
    assert "code-tutor-compiler:local" in command
    assert "g++ /source/*.cpp" in combined


def test_python_docker_command_uses_python_with_same_sandbox() -> None:
    command = compiler()._docker_command(Path("C:/temporary/source"), "python")
    combined = " ".join(command)

    assert "python3 -m py_compile /source/*.py" in combined
    assert "python3 -B /source/main.py" in combined
    assert "--network none" in combined
    assert "--read-only" in command
    assert "--memory 512m" in combined
    assert "timeout --signal=KILL 15s env" in combined


def test_batch_command_applies_problem_limits_and_cleanup_options() -> None:
    command = compiler()._docker_batch_command(
        Path("C:/temporary/source"),
        "cpp",
        container_name="code-tutor-batch-test",
        time_limit_ms=1250,
        memory_limit_mb=96,
    )
    combined = " ".join(command)

    assert "--name code-tutor-batch-test" in combined
    assert "--init" in command
    assert "--memory 96m" in combined
    assert "--memory-swap 96m" in combined
    assert "1.25s" in combined
    assert "/usr/bin/time -f %M" in combined
    assert "result_status=memory_limit" in combined
    assert "timeout --signal=KILL 15s g++" in combined


def test_force_remove_container_uses_exact_name(monkeypatch) -> None:
    calls: list[list[str]] = []

    def fake_run(command, **kwargs):
        calls.append(command)
        return subprocess.CompletedProcess(command, 0)

    monkeypatch.setattr(subprocess, "run", fake_run)

    compiler()._force_remove_container("code-tutor-batch-exact")

    assert calls == [["docker", "rm", "-f", "code-tutor-batch-exact"]]


def test_writes_all_project_sources(tmp_path: Path) -> None:
    sources = [
        ProjectSourceFile(name="main.cpp", content='#include "helper.hpp"\nint main() {}'),
        ProjectSourceFile(name="helper.hpp", content="int helper();"),
        ProjectSourceFile(name="helper.cpp", content="int helper() { return 1; }"),
    ]

    DockerCompiler._write_source_files(tmp_path, sources)

    assert [(tmp_path / source.name).read_text(encoding="utf-8") for source in sources] == [
        '#include "helper.hpp"\nint main() {}',
        "int helper();",
        "int helper() { return 1; }",
    ]
    if os.name != "nt":
        assert tmp_path.stat().st_mode & 0o777 == 0o755
        assert all((tmp_path / source.name).stat().st_mode & 0o777 == 0o644 for source in sources)
