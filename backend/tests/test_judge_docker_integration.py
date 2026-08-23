import pytest

from app.auth import AuthenticatedUser
from app.compiler import DockerCompiler
from app.config import Settings
from app.judge import JudgeCase, JudgeGroup, JudgeProblem, JudgeService
from app.models import SubmitRequest, SubmitResponse


compiler = DockerCompiler(Settings())
pytestmark = pytest.mark.skipif(
    not compiler.is_available(),
    reason="Docker compiler is not available.",
)


class IntegrationStore:
    problem = JudgeProblem(
        problem_id="1001",
        groups=(
            JudgeGroup(
                group_order=1,
                score_percent=100,
                cases=(JudgeCase("1 2", "3"), JudgeCase("-5 12", "7")),
            ),
        ),
    )

    def get_problem(self, problem_id: str) -> JudgeProblem:
        assert problem_id == "1001"
        return self.problem

    def save_submission(
        self,
        user: AuthenticatedUser,
        request: SubmitRequest,
        result: SubmitResponse,
    ) -> str:
        return "docker-integration-submission"


user = AuthenticatedUser(user_id="docker-student")


def test_real_docker_judge_accepts_cpp_solution() -> None:
    code = """#include <iostream>
int main() {
    long long a, b;
    std::cin >> a >> b;
    std::cout << a + b << '\\n';
}
"""
    result = JudgeService(IntegrationStore(), compiler).submit(
        user, "1001", SubmitRequest(code=code, language="cpp")
    )

    assert result.status == "accepted"
    assert result.score == 100
    assert result.passed_cases == 2


def test_real_docker_judge_accepts_python_solution() -> None:
    code = "a, b = map(int, input().split())\nprint(a + b)\n"
    result = JudgeService(IntegrationStore(), compiler).submit(
        user, "1001", SubmitRequest(code=code, language="python")
    )

    assert result.status == "accepted"
    assert result.score == 100
    assert result.passed_cases == 2
