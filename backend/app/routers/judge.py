from fastapi import APIRouter, Depends, HTTPException, Response, status
from fastapi.concurrency import run_in_threadpool

from ..auth import AuthenticatedUser, get_current_user
from ..dependencies import get_execution_gate, get_judge_rate_limiter, get_judge_worker
from ..execution import ExecutionQueueFull, ExecutionQueueTimeout, execution_slot
from ..judge import JudgeStorageUnavailable, ProblemNotFound
from ..judge_worker import JudgeWorker, JudgeWorkerUnavailable
from ..models import SubmitRequest, SubmitResponse
from ..protection import ExecutionGate, InMemoryRateLimiter, RateLimitExceeded

router = APIRouter()


@router.post("/api/problems/{problem_id}/submit", response_model=SubmitResponse)
async def submit_problem(
    problem_id: str,
    payload: SubmitRequest,
    response: Response,
    user: AuthenticatedUser = Depends(get_current_user),
    worker: JudgeWorker = Depends(get_judge_worker),
    limiter: InMemoryRateLimiter = Depends(get_judge_rate_limiter),
    gate: ExecutionGate = Depends(get_execution_gate),
) -> SubmitResponse:
    try:
        limiter.check(f"judge:{user.user_id}")
    except RateLimitExceeded as error:
        response.headers["Retry-After"] = str(error.retry_after_seconds)
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many submissions. Please wait before submitting again.",
        ) from error

    try:
        async with execution_slot(gate):
            return await run_in_threadpool(worker.submit, user, problem_id, payload)
    except ExecutionQueueFull as error:
        response.headers["Retry-After"] = "1"
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="The Judge queue is full. Please try again shortly.",
        ) from error
    except ExecutionQueueTimeout as error:
        response.headers["Retry-After"] = "1"
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="The Judge queue wait timed out. Please try again.",
        ) from error
    except ProblemNotFound as error:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="The requested problem does not exist.",
        ) from error
    except JudgeStorageUnavailable as error:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Judge storage is temporarily unavailable.",
        ) from error
    except JudgeWorkerUnavailable as error:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(error),
        ) from error
