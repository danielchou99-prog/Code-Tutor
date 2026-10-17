from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Protocol
from urllib.parse import quote

import httpx

from .auth import AuthenticatedUser
from .compiler import CompilerService, CompilerUnavailable
from .problem_models import DEFAULT_CASE_POINTS
from .models import JudgeStatus, RunResponse, SubmitRequest, SubmitResponse
from .scoring import ScoreCalculator, outputs_match
from .supabase_rest import SupabaseRestClient


class JudgeStorageUnavailable(RuntimeError):
    """Raised when the trusted problem store cannot be reached."""


class ProblemNotFound(RuntimeError):
    pass


@dataclass(frozen=True)
class JudgeCase:
    input: str
    expected_output: str
    score_points: int = DEFAULT_CASE_POINTS


@dataclass(frozen=True)
class JudgeGroup:
    group_order: int
    score_percent: int
    cases: tuple[JudgeCase, ...]


@dataclass(frozen=True)
class JudgeProblem:
    problem_id: str
    groups: tuple[JudgeGroup, ...]
    time_limit_ms: int = 3000
    memory_limit_mb: int = 512

    @property
    def total_cases(self) -> int:
        return sum(len(group.cases) for group in self.groups)


class JudgeStore(Protocol):
    def get_problem(self, problem_id: str) -> JudgeProblem: ...

    def save_submission(
        self,
        user: AuthenticatedUser,
        request: SubmitRequest,
        result: SubmitResponse,
    ) -> str: ...


class SupabaseJudgeStore:
    def __init__(
        self,
        supabase_url: str,
        server_key: str,
        timeout_seconds: float = 10,
    ) -> None:
        self._rest = SupabaseRestClient(
            supabase_url,
            server_key,
            timeout_seconds,
            error_type=JudgeStorageUnavailable,
            unavailable_message="The Judge database is unavailable.",
            rejected_message="The Judge database rejected the request.",
        )

    def _headers(self, prefer: str | None = None) -> dict[str, str]:
        return self._rest.headers(prefer)

    def _request(
        self,
        method: str,
        path: str,
        *,
        json: Any = None,
        prefer: str | None = None,
    ) -> httpx.Response:
        return self._rest.request(method, path, json=json, prefer=prefer)

    def get_problem(self, problem_id: str) -> JudgeProblem:
        encoded_id = quote(problem_id, safe="")
        problem_response = self._request(
            "GET",
            f"problems?id=eq.{encoded_id}&published=eq.true&select=id,time_limit_ms,memory_limit_mb&limit=1",
        )
        problem_records = problem_response.json()
        if not isinstance(problem_records, list) or not problem_records:
            raise ProblemNotFound(problem_id)

        groups_response = self._request(
            "GET",
            "problem_test_groups"
            f"?problem_id=eq.{encoded_id}&select=id,group_order,score_percent"
            "&order=group_order.asc",
        )
        group_records = groups_response.json()
        if not isinstance(group_records, list) or not group_records:
            raise JudgeStorageUnavailable("The problem has no Judge groups.")

        group_ids = [str(record["id"]) for record in group_records]
        encoded_group_ids = ",".join(quote(group_id, safe="-") for group_id in group_ids)
        cases_response = self._request(
            "GET",
            "problem_test_cases"
            f"?group_id=in.({encoded_group_ids})&select=group_id,case_order,input,expected_output,score_points"
            "&order=group_id.asc,case_order.asc",
        )
        case_records = cases_response.json()
        if not isinstance(case_records, list):
            raise JudgeStorageUnavailable("The Judge cases are invalid.")

        cases_by_group: dict[str, list[JudgeCase]] = {group_id: [] for group_id in group_ids}
        for record in case_records:
            group_id = str(record.get("group_id", ""))
            if group_id not in cases_by_group:
                continue
            cases_by_group[group_id].append(
                JudgeCase(
                    input=str(record.get("input", "")),
                    expected_output=str(record.get("expected_output", "")),
                    score_points=int(record.get("score_points", DEFAULT_CASE_POINTS)),
                )
            )

        groups = tuple(
            JudgeGroup(
                group_order=int(record["group_order"]),
                score_percent=int(record["score_percent"]),
                cases=tuple(cases_by_group[str(record["id"])]),
            )
            for record in group_records
        )
        if any(not group.cases for group in groups):
            raise JudgeStorageUnavailable("A Judge group has no test cases.")
        problem_record = problem_records[0]
        return JudgeProblem(
            problem_id=problem_id,
            groups=groups,
            time_limit_ms=int(problem_record.get("time_limit_ms", 3000)),
            memory_limit_mb=int(problem_record.get("memory_limit_mb", 512)),
        )

    def save_submission(
        self,
        user: AuthenticatedUser,
        request: SubmitRequest,
        result: SubmitResponse,
    ) -> str:
        response = self._request(
            "POST",
            "submissions",
            prefer="return=representation",
            json={
                "user_id": user.user_id,
                "problem_id": result.problem_id,
                "language": request.language,
                "source_code": request.code,
                "status": result.status,
                "score": result.score,
                "passed_cases": result.passed_cases,
                "total_cases": result.total_cases,
                "duration_ms": result.duration_ms,
                "peak_memory_kb": result.peak_memory_kb,
                "group_results": [group.model_dump() for group in result.groups],
            },
        )
        records = response.json()
        if not isinstance(records, list) or not records or not records[0].get("id"):
            raise JudgeStorageUnavailable("The submission could not be saved.")
        return str(records[0]["id"])


class JudgeService:
    def __init__(
        self,
        store: JudgeStore,
        compiler: CompilerService,
        calculator: ScoreCalculator | None = None,
    ) -> None:
        self.store = store
        self.compiler = compiler
        self.calculator = calculator or ScoreCalculator()

    def submit(
        self,
        user: AuthenticatedUser,
        problem_id: str,
        request: SubmitRequest,
    ) -> SubmitResponse:
        problem = self.store.get_problem(problem_id)
        all_cases = [case for group in problem.groups for case in group.cases]
        batch_results: list[RunResponse] | None = None
        batch_unavailable = False
        batch_runner = getattr(self.compiler, "run_many", None)
        if callable(batch_runner):
            try:
                batch_results = batch_runner(
                    request.code,
                    [case.input for case in all_cases],
                    language=request.language,
                    files=request.files or None,
                    time_limit_ms=problem.time_limit_ms,
                    memory_limit_mb=problem.memory_limit_mb,
                )
                if len(batch_results) != len(all_cases):
                    batch_unavailable = True
            except CompilerUnavailable:
                batch_unavailable = True

        executed: list[list[bool]] = []
        result_index = 0
        duration_ms = 0
        peak_memory_kb = 0
        fatal_status: JudgeStatus | None = None
        fatal_message = ""

        for group in problem.groups:
            outcomes: list[bool] = []
            executed.append(outcomes)
            for case in group.cases:
                if batch_unavailable:
                    fatal_status = "system_error"
                    fatal_message = "The isolated compiler is unavailable."
                    break
                if batch_results is not None:
                    run_result = batch_results[result_index]
                    result_index += 1
                else:
                    try:
                        run_result = self.compiler.run(
                            request.code,
                            case.input,
                            request.files or None,
                            request.language,
                            time_limit_ms=problem.time_limit_ms,
                            memory_limit_mb=problem.memory_limit_mb,
                        )
                    except CompilerUnavailable:
                        fatal_status = "system_error"
                        fatal_message = "The isolated compiler is unavailable."
                        break

                duration_ms += run_result.duration_ms
                peak_memory_kb = max(peak_memory_kb, run_result.peak_memory_kb)
                if run_result.status != "accepted":
                    fatal_status = run_result.status  # type: ignore[assignment]
                    fatal_message = run_result.stderr[:2000]
                    break
                outcomes.append(outputs_match(run_result.stdout, case.expected_output))
            if fatal_status is not None:
                break

        summary = self.calculator.calculate(problem.groups, executed, fatal_status)
        result = SubmitResponse(
            problem_id=problem_id,
            status=summary.status,
            score=summary.score,
            max_score=summary.max_score,
            passed_cases=summary.passed_cases,
            total_cases=summary.total_cases,
            duration_ms=duration_ms,
            peak_memory_kb=peak_memory_kb,
            groups=summary.groups,
            message=fatal_message,
        )
        result.submission_id = self.store.save_submission(user, request, result)
        return result
