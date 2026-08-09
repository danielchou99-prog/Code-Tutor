import pytest

from app.compiler import DockerCompiler
from app.config import Settings
from app.models import ProjectSourceFile


compiler = DockerCompiler(Settings())

pytestmark = pytest.mark.skipif(
    not compiler.is_available(),
    reason="Docker compiler is not available.",
)


def test_docker_compiler_accepts_valid_cpp_with_stdin() -> None:
    result = compiler.run(
        """#include <iostream>

int main() {
    int first = 0;
    int second = 0;
    std::cin >> first >> second;
    std::cout << first + second << '\\n';
}
""",
        "20 22\n",
    )

    assert result.status == "accepted"
    assert result.stdout == "42\n"
    assert result.stderr == ""
    assert result.exit_code == 0


def test_docker_compiler_builds_multiple_project_files() -> None:
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

    result = compiler.run(files[0].content, "", files)

    assert result.status == "accepted"
    assert result.stdout == "42\n"
    assert result.stderr == ""


def test_docker_compiler_reports_compile_error() -> None:
    result = compiler.run("int main( {", "")

    assert result.status == "compile_error"
    assert result.stderr
    assert result.exit_code != 0


def test_docker_compiler_reports_runtime_error() -> None:
    result = compiler.run("int main() { return 7; }", "")

    assert result.status == "runtime_error"
    assert result.exit_code == 7


def test_docker_compiler_stops_infinite_loop() -> None:
    result = compiler.run("int main() { for (;;) {} }", "")

    assert result.status == "timeout"
    assert result.exit_code is None


def test_docker_compiler_applies_runtime_isolation() -> None:
    result = compiler.run(
        """#include <cstdio>
#include <iostream>
#include <net/if.h>
#include <unistd.h>

int main() {
    const bool root_is_writable = std::fopen("/blocked.txt", "w") != nullptr;
    const bool has_ethernet_interface = if_nametoindex("eth0") != 0;
    std::cout << geteuid() << ' '
              << root_is_writable << ' '
              << has_ethernet_interface << '\\n';
}
""",
        "",
    )

    assert result.status == "accepted"
    assert result.stdout == "65534 0 0\n"


def test_docker_compiler_truncates_large_output() -> None:
    result = compiler.run(
        """#include <iostream>

int main() {
    for (int index = 0; index < 70000; ++index) {
        std::cout << 'x';
    }
}
""",
        "",
    )

    assert result.status == "accepted"
    assert result.truncated is True
    assert len(result.stdout) == Settings().max_output_bytes


def test_docker_compiler_applies_cgroup_resource_limits() -> None:
    result = compiler.run(
        """#include <fstream>
#include <iostream>
#include <string>

int main() {
    std::string cpu_limit;
    std::string memory_limit;
    std::string process_limit;
    std::ifstream cpu_file("/sys/fs/cgroup/cpu.max");
    std::ifstream memory_file("/sys/fs/cgroup/memory.max");
    std::ifstream process_file("/sys/fs/cgroup/pids.max");
    std::getline(cpu_file, cpu_limit);
    std::getline(memory_file, memory_limit);
    std::getline(process_file, process_limit);
    std::cout << cpu_limit << '\\n'
              << memory_limit << '\\n'
              << process_limit << '\\n';
}
""",
        "",
    )

    assert result.status == "accepted"
    assert result.stdout.splitlines() == ["50000 100000", "536870912", "64"]


def test_docker_compiler_enforces_process_limit() -> None:
    result = compiler.run(
        """#include <iostream>
#include <sys/wait.h>
#include <unistd.h>
#include <vector>

int main() {
    std::vector<pid_t> children;
    for (int index = 0; index < 100; ++index) {
        const pid_t child = fork();
        if (child == 0) {
            sleep(1);
            _exit(0);
        }
        if (child < 0) {
            break;
        }
        children.push_back(child);
    }

    std::cout << children.size() << '\\n';
    for (const pid_t child : children) {
        waitpid(child, nullptr, 0);
    }
}
""",
        "",
    )

    assert result.status == "accepted"
    assert 1 <= int(result.stdout) < 64
