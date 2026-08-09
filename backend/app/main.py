from fastapi import Depends, FastAPI, Request, Response, status
from fastapi.concurrency import run_in_threadpool
from fastapi.middleware.cors import CORSMiddleware

from .compiler import CompilerService, CompilerUnavailable, DockerCompiler
from .config import settings
from .models import HealthResponse, RunRequest, RunResponse
from .protection import ExecutionGate, InMemoryRateLimiter, RateLimitExceeded


app = FastAPI(
    title="Code Tutor API",
    description="Compiler and tutoring API for Code Tutor.",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=list(settings.allowed_origins),
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
    expose_headers=["Retry-After"],
)

rate_limiter = InMemoryRateLimiter(
    max_requests=settings.rate_limit_requests,
    window_seconds=settings.rate_limit_window_seconds,
)
execution_gate = ExecutionGate(
    max_concurrent=settings.max_concurrent_runs,
    max_queued=settings.max_queued_runs,
    wait_timeout_seconds=settings.queue_wait_seconds,
)


def get_compiler() -> CompilerService:
    return DockerCompiler(settings)


def get_rate_limiter() -> InMemoryRateLimiter:
    return rate_limiter


def get_execution_gate() -> ExecutionGate:
    return execution_gate


@app.get("/health", response_model=HealthResponse)
async def health(compiler: CompilerService = Depends(get_compiler)) -> HealthResponse:
    compiler_available = await run_in_threadpool(compiler.is_available)
    return HealthResponse(compiler_available=compiler_available)


@app.post("/api/run", response_model=RunResponse)
async def run_code(
    request: RunRequest,
    http_request: Request,
    response: Response,
    compiler: CompilerService = Depends(get_compiler),
    limiter: InMemoryRateLimiter = Depends(get_rate_limiter),
    gate: ExecutionGate = Depends(get_execution_gate),
) -> RunResponse:
    client_key = http_request.client.host if http_request.client else "unknown"
    try:
        limiter.check(client_key)
    except RateLimitExceeded as error:
        response.status_code = status.HTTP_429_TOO_MANY_REQUESTS
        response.headers["Retry-After"] = str(error.retry_after_seconds)
        return RunResponse(
            status="rate_limited",
            stderr="Too many compiler requests. Please wait before trying again.",
        )

    if not gate.try_enter():
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
        response.headers["Retry-After"] = "1"
        return RunResponse(
            status="server_busy",
            stderr="The compiler queue is full. Please try again shortly.",
        )

    has_execution_slot = False
    try:
        has_execution_slot = await run_in_threadpool(gate.wait_for_execution)
        if not has_execution_slot:
            response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
            response.headers["Retry-After"] = "1"
            return RunResponse(
                status="server_busy",
                stderr="The compiler queue wait timed out. Please try again.",
            )
        return await run_in_threadpool(compiler.run, request.code, request.stdin)
    except CompilerUnavailable as error:
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
        return RunResponse(status="service_unavailable", stderr=str(error))
    finally:
        if has_execution_slot:
            gate.leave_execution()
        gate.leave()
