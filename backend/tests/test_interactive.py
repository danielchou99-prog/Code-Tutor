import asyncio
from pathlib import Path

import pytest

from app.config import Settings
from app.interactive import DockerInteractiveCompiler, READY_MARKER
from app.models import ProjectSourceFile


compiler = DockerInteractiveCompiler(Settings())


def test_interactive_command_keeps_compiler_security_limits() -> None:
    command = compiler._docker_command(Path("C:/code-tutor-test"), "code-tutor-interactive-test")

    assert command[:5] == ["docker", "run", "--rm", "--name", "code-tutor-interactive-test"]
    assert ["--network", "none"] == command[command.index("--network") : command.index("--network") + 2]
    assert "--read-only" in command
    assert ["--cap-drop", "ALL"] == command[command.index("--cap-drop") : command.index("--cap-drop") + 2]
    assert ["--user", "65534:65534"] == command[command.index("--user") : command.index("--user") + 2]
    assert READY_MARKER in command[-1]
    assert "g++ /source/*.cpp" in command[-1]


def test_python_interactive_command_uses_python_with_same_limits() -> None:
    command = compiler._docker_command(
        Path("C:/code-tutor-test"), "code-tutor-interactive-test", "python"
    )

    assert "python3 -m py_compile /source/*.py" in command[-1]
    assert "python3 -B /source/main.py" in command[-1]
    assert "--network" in command
    assert "none" in command


@pytest.mark.skipif(
    not compiler.is_available(),
    reason="Docker compiler is not available.",
)
def test_interactive_compiler_supports_multiple_input_rounds() -> None:
    async def exercise() -> None:
        session = await compiler.start(
            """#include <iostream>
#include <string>

int main() {
    std::string name;
    int age = 0;
    std::cout << "Name? " << std::flush;
    std::getline(std::cin, name);
    std::cout << "Age? " << std::flush;
    std::cin >> age;
    std::cout << "Hello " << name << ", " << age << "!\\n";
}
"""
        )
        try:
            assert session.process.stderr is not None
            assert session.process.stdout is not None
            while True:
                line = await asyncio.wait_for(session.process.stderr.readline(), timeout=10)
                assert line
                if line.decode().strip() == READY_MARKER:
                    break

            assert (await asyncio.wait_for(session.process.stdout.read(6), timeout=5)).decode() == "Name? "
            await session.write("Daniel\n")
            assert (await asyncio.wait_for(session.process.stdout.read(5), timeout=5)).decode() == "Age? "
            await session.write("18\n")
            output = await asyncio.wait_for(session.process.stdout.read(), timeout=5)
            assert output.decode() == "Hello Daniel, 18!\n"
            assert await session.process.wait() == 0
        finally:
            await session.close()

    asyncio.run(exercise())


@pytest.mark.skipif(
    not compiler.is_available(),
    reason="Docker compiler is not available.",
)
def test_interactive_compiler_builds_multiple_project_files() -> None:
    async def exercise() -> None:
        files = [
            ProjectSourceFile(
                name="main.cpp",
                content='#include <iostream>\n#include "helper.hpp"\nint main() { std::cout << answer() << "\\n"; }',
            ),
            ProjectSourceFile(name="helper.hpp", content="int answer();"),
            ProjectSourceFile(
                name="helper.cpp",
                content='#include "helper.hpp"\nint answer() { return 42; }',
            ),
        ]
        session = await compiler.start(files[0].content, files)
        try:
            assert session.process.stderr is not None
            assert session.process.stdout is not None
            while True:
                line = await asyncio.wait_for(session.process.stderr.readline(), timeout=10)
                assert line
                if line.decode().strip() == READY_MARKER:
                    break
            assert (await asyncio.wait_for(session.process.stdout.read(), timeout=5)).decode() == "42\n"
            assert await session.process.wait() == 0
        finally:
            await session.close()

    asyncio.run(exercise())


@pytest.mark.skipif(
    not compiler.is_available(),
    reason="Docker compiler is not available.",
)
def test_python_interactive_compiler_supports_input() -> None:
    async def exercise() -> None:
        session = await compiler.start(
            "name = input()\nprint(f'Hello {name}', flush=True)",
            language="python",
        )
        try:
            assert session.process.stderr is not None
            assert session.process.stdout is not None
            while True:
                line = await asyncio.wait_for(session.process.stderr.readline(), timeout=10)
                assert line
                if line.decode().strip() == READY_MARKER:
                    break
            await session.write("Daniel\n")
            output = await asyncio.wait_for(session.process.stdout.readline(), timeout=5)
            assert output.decode() == "Hello Daniel\n"
        finally:
            await session.close()

    asyncio.run(exercise())
