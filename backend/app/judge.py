from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Protocol
from urllib.parse import quote

import httpx

from .ai_connections import secure_http_request
from .auth import AuthenticatedUser
from .compiler import CompilerService, CompilerUnavailable
from .models import JudgeGroupResult, SubmitRequest, SubmitResponse


class JudgeStorageUnavailable(RuntimeError):
    """Raised when the trusted problem store cannot be reached."""


class ProblemNotFound(RuntimeError):
    pass


@dataclass(frozen=True)
class JudgeCase:
    input: str
    expected_output: str


@dataclass(frozen=True)
class JudgeGroup:
    group_order: int
    score_percent: int
    cases: tuple[JudgeCase, ...]


@dataclass(frozen=True)
class JudgeProblem:
    problem_id: str
    groups: tuple[JudgeGroup, ...]

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
        self.rest_url = f"{supabase_url.rstrip('/')}/rest/v1"
        self.server_key = server_key
        self.timeout_seconds = timeout_seconds

    def _headers(self, prefer: str | None = None) -> dict[str, str]:
        headers = {
            "apikey": self.server_key,
            "Content-Type": "application/json",
        }
        if not self.server_key.startswith("sb_secret_"):
            headers["Authorization"] = f"Bearer {self.server_key}"
        if prefer:
            headers["Prefer"] = prefer
        return headers

    def _request(
        self,
        method: str,
        path: str,
        *,
        json: dict[str, Any] | None = None,
        prefer: str | None = None,
    ) -> httpx.Response:
        try:
            response = secure_http_request(
                method,
                f"{self.rest_url}/{path}",
                headers=self._headers(prefer),
                json=json,
                timeout=self.timeout_seconds,
            )
        except httpx.RequestError as error:
            raise JudgeStorageUnavailable("The Judge database is unavailable.") from error
        if response.status_code >= 400:
            raise JudgeStorageUnavailable("The Judge database rejected the request.")
        return response

    def get_problem(self, problem_id: str) -> JudgeProblem:
        encoded_id = quote(problem_id, safe="")
        problem_response = self._request(
            "GET",
            f"problems?id=eq.{encoded_id}&published=eq.true&select=id&limit=1",
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
            f"?group_id=in.({encoded_group_ids})&select=group_id,case_order,input,expected_output"
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
        return JudgeProblem(problem_id=problem_id, groups=groups)

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
                "group_results": [group.model_dump() for group in result.groups],
            },
        )
        records = response.json()
        if not isinstance(records, list) or not records or not records[0].get("id"):
            raise JudgeStorageUnavailable("The submission could not be saved.")
        return str(records[0]["id"])


def normalize_output(value: str) -> str:
    normalized = value.replace("\r\n", "\n").replace("\r", "\n")
    lines = [line.rstrip(" \t") for line in normalized.split("\n")]
    while lines and lines[-1] == "":
        lines.pop()
    return "\n".join(lines)


class JudgeService:
    def __init__(self, store: JudgeStore, compiler: CompilerService) -> None:
        self.store = store
        self.compiler = compiler

    def submit(
        self,
        user: AuthenticatedUser,
        problem_id: str,
        request: SubmitRequest,
    ) -> SubmitResponse:
        problem = self.store.get_problem(problem_id)
        groups: list[JudgeGroupResult] = []
        passed_cases = 0
        duration_ms = 0
        fatal_status: str | None = None
        fatal_message = ""

        for group_index, group in enumerate(problem.groups):
            group_passed = 0
            for case in group.cases:
                try:
                    run_result = self.compiler.run(
                        request.code,
                        case.input,
                        request.files or None,
                        request.language,
                    )
                except CompilerUnavailable:
                    fatal_status = "service_unavailable"
                    fatal_message = "The isolated compiler is unavailable."
                    break

                duration_ms += run_result.duration_ms
                if run_result.status != "accepted":
                    fatal_status = run_result.status
                    fatal_message = run_result.stderr[:2000]
                    break
                if normalize_output(run_result.stdout) == normalize_output(case.expected_output):
                    group_passed += 1
                    passed_cases += 1

            group_complete = group_passed == len(group.cases) and fatal_status is None
            groups.append(
                JudgeGroupResult(
                    group_order=group.group_order,
                    score_percent=group.score_percent,
                    earned_score=group.score_percent if group_complete else 0,
                    passed_cases=group_passed,
                    total_cases=len(group.cases),
                    status="passed" if group_complete else "failed",
                )
            )
            if fatal_status is not None:
                for remaining in problem.groups[group_index + 1 :]:
                    groups.append(
                        JudgeGroupResult(
                            group_order=remaining.group_order,
                            score_percent=remaining.score_percent,
                            earned_score=0,
                            passed_cases=0,
                            total_cases=len(remaining.cases),
                            status="not_run",
                        )
                    )
                break

        score = sum(group.earned_score for group in groups)
        status = (
            fatal_status
            if fatal_status is not None
            else "accepted"
            if passed_cases == problem.total_cases
            else "wrong_answer"
        )
        result = SubmitResponse(
            problem_id=problem_id,
            status=status,  # type: ignore[arg-type]
            score=score,
            passed_cases=passed_cases,
            total_cases=problem.total_cases,
            duration_ms=duration_ms,
            groups=groups,
            message=fatal_message,
        )
        result.submission_id = self.store.save_submission(user, request, result)
        return result
