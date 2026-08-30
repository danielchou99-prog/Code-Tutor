from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol

import httpx

from .auth import AuthenticatedUser
from .compiler import CompilerService
from .judge import JudgeService, JudgeStorageUnavailable, JudgeStore
from .models import SubmitRequest, SubmitResponse


class JudgeWorkerUnavailable(RuntimeError):
    """The isolated Judge worker could not accept or finish the job safely."""


class JudgeWorker(Protocol):
    def submit(
        self, user: AuthenticatedUser, problem_id: str, request: SubmitRequest
    ) -> SubmitResponse: ...


@dataclass
class LocalJudgeWorker:
    store: JudgeStore
    compiler: CompilerService

    def submit(
        self, user: AuthenticatedUser, problem_id: str, request: SubmitRequest
    ) -> SubmitResponse:
        return JudgeService(self.store, self.compiler).submit(user, problem_id, request)


@dataclass
class RemoteJudgeWorker:
    base_url: str
    token: str
    timeout_seconds: float = 120

    def submit(
        self, user: AuthenticatedUser, problem_id: str, request: SubmitRequest
    ) -> SubmitResponse:
        try:
            response = httpx.post(
                f"{self.base_url.rstrip('/')}/internal/judge",
                headers={"X-Code-Tutor-Worker-Token": self.token},
                json={
                    "user_id": user.user_id,
                    "email": user.email,
                    "problem_id": problem_id,
                    "request": request.model_dump(),
                },
                timeout=self.timeout_seconds,
            )
        except httpx.RequestError as error:
            raise JudgeWorkerUnavailable("The Judge worker is unavailable.") from error
        if response.status_code != 200:
            raise JudgeWorkerUnavailable("The Judge worker rejected or failed the job.")
        try:
            return SubmitResponse.model_validate(response.json())
        except ValueError as error:
            raise JudgeWorkerUnavailable("The Judge worker returned invalid data.") from error
