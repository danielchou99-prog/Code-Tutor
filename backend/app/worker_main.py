from __future__ import annotations

import hmac
import json
import logging
import time

from fastapi import FastAPI, Header, HTTPException, status
from pydantic import BaseModel

from .auth import AuthenticatedUser
from .compiler import DockerCompiler
from .config import settings
from .judge import JudgeService, SupabaseJudgeStore
from .models import SubmitRequest, SubmitResponse
from .protection import ExecutionGate


logger = logging.getLogger("code_tutor.judge_worker")
worker_app = FastAPI(title="Code Tutor Judge Worker", docs_url=None, redoc_url=None)
worker_gate = ExecutionGate(
    max_concurrent=settings.max_concurrent_runs,
    max_queued=settings.max_queued_runs,
    wait_timeout_seconds=settings.queue_wait_seconds,
)


class InternalJudgeJob(BaseModel):
    user_id: str
    email: str | None = None
    problem_id: str
    request: SubmitRequest


def require_worker_token(received: str | None) -> None:
    expected = settings.judge_worker_token
    if not expected or not received or not hmac.compare_digest(received, expected):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid worker token.")


@worker_app.get("/health")
def health() -> dict[str, object]:
    return {"status": "ok", "compiler_available": DockerCompiler(settings).is_available()}


@worker_app.post("/internal/judge", response_model=SubmitResponse)
def judge(job: InternalJudgeJob, x_code_tutor_worker_token: str | None = Header(default=None)) -> SubmitResponse:
    require_worker_token(x_code_tutor_worker_token)
    if not worker_gate.try_enter():
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Worker queue is full.")
    has_execution_slot = worker_gate.wait_for_execution()
    if not has_execution_slot:
        worker_gate.leave()
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Worker queue wait timed out.")
    started = time.perf_counter()
    try:
        if not settings.supabase_url or not settings.supabase_server_key:
            raise HTTPException(status_code=503, detail="Worker storage is not configured.")
        store = SupabaseJudgeStore(settings.supabase_url, settings.supabase_server_key)
        result = JudgeService(store, DockerCompiler(settings)).submit(
            AuthenticatedUser(user_id=job.user_id, email=job.email),
            job.problem_id,
            job.request,
        )
        logger.info(json.dumps({"event": "judge_complete", "problem_id": job.problem_id, "status": result.status, "duration_ms": round((time.perf_counter() - started) * 1000)}))
        return result
    finally:
        if has_execution_slot:
            worker_gate.leave_execution()
        worker_gate.leave()
