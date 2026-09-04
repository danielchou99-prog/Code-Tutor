from fastapi.testclient import TestClient

from app.auth import AuthenticatedUser, get_current_user
from app.judge import JudgeCase, JudgeGroup, JudgeProblem, JudgeService, SupabaseJudgeStore
from app.main import (
    app,
    get_compiler,
    get_execution_gate,
    get_judge_rate_limiter,
    get_judge_store,
)
from app.models import ProjectSourceFile, RunResponse, SubmitRequest, SubmitResponse
from app.protection import ExecutionGate, InMemoryRateLimiter


class FakeJudgeStore:
    def __init__(self) -> None:
        self.saved_result: SubmitResponse | None = None
        self.problem = JudgeProblem(
            problem_id="1001",
            groups=(
                JudgeGroup(
                    group_order=1,
                    score_percent=40,
                    cases=(JudgeCase("1 2", "3"), JudgeCase("-5 12", "7")),
                ),
                JudgeGroup(
                    group_order=2,
                    score_percent=60,
                    cases=(JudgeCase("20 22", "42"),),
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
        assert user.user_id == "student-1"
        assert request.language in ("cpp", "python")
        self.saved_result = result
        return "submission-123"


class AnsweringCompiler:
    def __init__(self, answers: dict[str, str], status: str = "accepted") -> None:
        self.answers = answers
        self.status = status
        self.limits: list[tuple[int | None, int | None]] = []

    def is_available(self) -> bool:
        return True

    def run(
        self,
        code: str,
        stdin: str,
        files: list[ProjectSourceFile] | None = None,
        language: str = "cpp",
        *,
        time_limit_ms: int | None = None,
        memory_limit_mb: int | None = None,
    ) -> RunResponse:
        self.limits.append((time_limit_ms, memory_limit_mb))
        if self.status != "accepted":
            return RunResponse(status=self.status, stderr="compiler message", duration_ms=5, peak_memory_kb=524288)  # type: ignore[arg-type]
        return RunResponse(
            status="accepted",
            stdout=self.answers.get(stdin, "wrong") + "  \n\n",
            duration_ms=5,
        )


class UnavailableCompiler(AnsweringCompiler):
    def run(self, *args, **kwargs) -> RunResponse:
        from app.compiler import CompilerUnavailable

        raise CompilerUnavailable("Docker unavailable")


class BatchAnsweringCompiler(AnsweringCompiler):
    def __init__(self, answers: dict[str, str]) -> None:
        super().__init__(answers)
        self.batch_calls: list[dict[str, object]] = []

    def run(self, *args, **kwargs) -> RunResponse:
        raise AssertionError("Judge should use the compile-once batch runner")

    def run_many(
        self,
        code: str,
        stdins: list[str],
        language: str = "cpp",
        files: list[ProjectSourceFile] | None = None,
        *,
        time_limit_ms: int | None = None,
        memory_limit_mb: int | None = None,
    ) -> list[RunResponse]:
        self.batch_calls.append(
            {
                "code": code,
                "stdins": stdins,
                "files": files,
                "language": language,
                "time_limit_ms": time_limit_ms,
                "memory_limit_mb": memory_limit_mb,
            }
        )
        return [
            RunResponse(
                status="accepted",
                stdout=self.answers.get(stdin, "wrong"),
                duration_ms=4,
                peak_memory_kb=1024 + index,
            )
            for index, stdin in enumerate(stdins)
        ]


user = AuthenticatedUser(user_id="student-1", email="student@example.com")


def test_supabase_store_uses_new_secret_key_only_as_api_key() -> None:
    headers = SupabaseJudgeStore("https://project.supabase.co", "sb_secret_test")._headers()

    assert headers["apikey"] == "sb_secret_test"
    assert "Authorization" not in headers


def test_supabase_store_keeps_legacy_service_role_bearer_compatibility() -> None:
    headers = SupabaseJudgeStore("https://project.supabase.co", "legacy.jwt.key")._headers()

    assert headers["apikey"] == "legacy.jwt.key"
    assert headers["Authorization"] == "Bearer legacy.jwt.key"


def test_judge_accepts_normalized_output_and_awards_all_groups() -> None:
    store = FakeJudgeStore()
    compiler = AnsweringCompiler({"1 2": "3", "-5 12": "7", "20 22": "42"})
    service = JudgeService(
        store,
        compiler,
    )

    result = service.submit(user, "1001", SubmitRequest(code="solution"))

    assert result.status == "accepted"
    assert result.score == 100
    assert result.passed_cases == 3
    assert result.submission_id == "submission-123"
    assert [group.earned_score for group in result.groups] == [40, 60]
    assert compiler.limits == [(3000, 512)] * 3


def test_judge_compiles_once_and_passes_files_and_problem_limits() -> None:
    store = FakeJudgeStore()
    compiler = BatchAnsweringCompiler({"1 2": "3", "-5 12": "7", "20 22": "42"})
    files = [
        ProjectSourceFile(name="main.cpp", content='#include "sum.hpp"\nint main() {}'),
        ProjectSourceFile(name="sum.hpp", content="long long sum(long long, long long);"),
    ]

    result = JudgeService(store, compiler).submit(
        user,
        "1001",
        SubmitRequest(code="", files=files, language="cpp"),
    )

    assert result.status == "accepted"
    assert result.peak_memory_kb == 1026
    assert len(compiler.batch_calls) == 1
    assert compiler.batch_calls[0] == {
        "code": "",
        "stdins": ["1 2", "-5 12", "20 22"],
        "files": files,
        "language": "cpp",
        "time_limit_ms": 3000,
        "memory_limit_mb": 512,
    }


def test_judge_persists_peak_memory_and_memory_limit_status() -> None:
    store = FakeJudgeStore()
    compiler = AnsweringCompiler({}, status="memory_limit")
    result = JudgeService(store, compiler).submit(
        user, "1001", SubmitRequest(code="large allocation")
    )

    assert result.status == "memory_limit"
    assert result.peak_memory_kb == 524288
    assert result.groups[0].status == "failed"
    assert result.groups[1].status == "not_run"


def test_judge_uses_all_or_nothing_group_scoring_for_wrong_answer() -> None:
    store = FakeJudgeStore()
    service = JudgeService(
        store,
        AnsweringCompiler({"1 2": "3", "-5 12": "wrong", "20 22": "42"}),
    )

    result = service.submit(user, "1001", SubmitRequest(code="solution"))

    assert result.status == "wrong_answer"
    assert result.score == 60
    assert result.passed_cases == 2
    assert [group.status for group in result.groups] == ["failed", "passed"]


def test_judge_stops_after_compile_error_without_exposing_cases() -> None:
    store = FakeJudgeStore()
    result = JudgeService(store, AnsweringCompiler({}, status="compile_error")).submit(
        user, "1001", SubmitRequest(code="broken")
    )

    assert result.status == "compile_error"
    assert result.score == 0
    assert result.groups[0].status == "failed"
    assert result.groups[1].status == "not_run"
    serialized = result.model_dump_json()
    assert "1 2" not in serialized
    assert "expected_output" not in serialized


def test_judge_persists_infrastructure_failure_as_system_error() -> None:
    result = JudgeService(FakeJudgeStore(), UnavailableCompiler({})).submit(
        user, "1001", SubmitRequest(code="solution")
    )

    assert result.status == "system_error"
    assert result.groups[0].status == "failed"
    assert result.groups[1].status == "not_run"


def test_submit_endpoint_requires_authentication() -> None:
    response = TestClient(app).post(
        "/api/problems/1001/submit",
        json={"code": "solution", "language": "cpp"},
    )

    assert response.status_code == 401


def test_submit_endpoint_returns_saved_judge_result() -> None:
    store = FakeJudgeStore()
    compiler = AnsweringCompiler({"1 2": "3", "-5 12": "7", "20 22": "42"})
    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_judge_store] = lambda: store
    app.dependency_overrides[get_compiler] = lambda: compiler
    app.dependency_overrides[get_judge_rate_limiter] = lambda: InMemoryRateLimiter(10, 60)
    app.dependency_overrides[get_execution_gate] = lambda: ExecutionGate(1, 0, 1)
    try:
        response = TestClient(app).post(
            "/api/problems/1001/submit",
            json={"code": "solution", "language": "cpp"},
        )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    body = response.json()
    assert body["submission_id"] == "submission-123"
    assert body["status"] == "accepted"
    assert body["score"] == 100
    assert "expected_output" not in response.text
    assert "1 2" not in response.text
