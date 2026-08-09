import asyncio
from contextlib import suppress

from fastapi import Depends, FastAPI, HTTPException, Request, Response, WebSocket, WebSocketDisconnect, status
from fastapi.concurrency import run_in_threadpool
from fastapi.middleware.cors import CORSMiddleware

from .ai_connections import (
    AiConnectionService,
    AiProviderUnavailable,
    AiStorageUnavailable,
    FernetKeyCipher,
    GroqKeyValidator,
    InvalidProviderKey,
    SupabaseAiConnectionStore,
)
from .auth import AuthenticatedUser, SupabaseTokenVerifier, get_current_user
from .compiler import CompilerService, CompilerUnavailable, DockerCompiler
from .config import settings
from .interactive import DockerInteractiveCompiler, InteractiveCompilerService, READY_MARKER
from .models import (
    HealthResponse,
    AuthMeResponse,
    AiConnectionRequest,
    AiConnectionStatusResponse,
    InteractiveInputRequest,
    InteractiveStartRequest,
    RunRequest,
    RunResponse,
)
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
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["Content-Type", "Authorization"],
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
app.state.token_verifier = (
    SupabaseTokenVerifier(settings.supabase_url) if settings.supabase_url else None
)


def create_ai_connection_service() -> AiConnectionService | None:
    if not (
        settings.supabase_url
        and settings.supabase_publishable_key
        and settings.ai_encryption_key
    ):
        return None
    try:
        cipher = FernetKeyCipher(settings.ai_encryption_key)
    except ValueError:
        return None
    return AiConnectionService(
        store=SupabaseAiConnectionStore(
            settings.supabase_url,
            settings.supabase_publishable_key,
            settings.ai_request_timeout_seconds,
        ),
        cipher=cipher,
        validator=GroqKeyValidator(settings.ai_request_timeout_seconds),
    )


app.state.ai_connection_service = create_ai_connection_service()


def get_compiler() -> CompilerService:
    return DockerCompiler(settings)


def get_rate_limiter() -> InMemoryRateLimiter:
    return rate_limiter


def get_execution_gate() -> ExecutionGate:
    return execution_gate


def get_interactive_compiler() -> InteractiveCompilerService:
    return DockerInteractiveCompiler(settings)


def get_ai_connection_service(request: Request) -> AiConnectionService:
    service: AiConnectionService | None = getattr(
        request.app.state, "ai_connection_service", None
    )
    if service is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="AI connections are not configured on the server.",
        )
    return service


@app.get("/health", response_model=HealthResponse)
async def health(compiler: CompilerService = Depends(get_compiler)) -> HealthResponse:
    compiler_available = await run_in_threadpool(compiler.is_available)
    return HealthResponse(compiler_available=compiler_available)


@app.get("/api/auth/me", response_model=AuthMeResponse)
async def auth_me(user: AuthenticatedUser = Depends(get_current_user)) -> AuthMeResponse:
    return AuthMeResponse(user_id=user.user_id, email=user.email)


def ai_connection_response(connection: object) -> AiConnectionStatusResponse:
    return AiConnectionStatusResponse(
        connected=bool(getattr(connection, "connected")),
        provider="groq",
        key_last_four=getattr(connection, "key_last_four"),
        updated_at=getattr(connection, "updated_at"),
    )


@app.get("/api/ai/connection", response_model=AiConnectionStatusResponse)
async def get_ai_connection(
    user: AuthenticatedUser = Depends(get_current_user),
    service: AiConnectionService = Depends(get_ai_connection_service),
) -> AiConnectionStatusResponse:
    try:
        connection = await run_in_threadpool(service.status, user)
    except AiStorageUnavailable as error:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="AI connection storage is temporarily unavailable.",
        ) from error
    return ai_connection_response(connection)


@app.put("/api/ai/connection", response_model=AiConnectionStatusResponse)
async def connect_ai(
    payload: AiConnectionRequest,
    user: AuthenticatedUser = Depends(get_current_user),
    service: AiConnectionService = Depends(get_ai_connection_service),
) -> AiConnectionStatusResponse:
    try:
        connection = await run_in_threadpool(service.connect, user, payload.api_key)
    except InvalidProviderKey as error:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Groq rejected this API key. Check the key and try again.",
        ) from error
    except AiProviderUnavailable as error:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Groq is temporarily unavailable. Try again later.",
        ) from error
    except AiStorageUnavailable as error:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="AI connection storage is temporarily unavailable.",
        ) from error
    return ai_connection_response(connection)


@app.delete("/api/ai/connection", response_model=AiConnectionStatusResponse)
async def remove_ai_connection(
    user: AuthenticatedUser = Depends(get_current_user),
    service: AiConnectionService = Depends(get_ai_connection_service),
) -> AiConnectionStatusResponse:
    try:
        await run_in_threadpool(service.remove, user)
    except AiStorageUnavailable as error:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="AI connection storage is temporarily unavailable.",
        ) from error
    return AiConnectionStatusResponse(connected=False)


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


@app.websocket("/api/run/interactive")
async def run_interactive(
    websocket: WebSocket,
    compiler: InteractiveCompilerService = Depends(get_interactive_compiler),
    limiter: InMemoryRateLimiter = Depends(get_rate_limiter),
    gate: ExecutionGate = Depends(get_execution_gate),
) -> None:
    origin = websocket.headers.get("origin")
    if origin and origin.rstrip("/") not in settings.allowed_origins:
        await websocket.close(code=1008, reason="Origin is not allowed.")
        return

    await websocket.accept()
    client_key = websocket.client.host if websocket.client else "unknown"
    try:
        limiter.check(client_key)
    except RateLimitExceeded as error:
        await websocket.send_json(
            {
                "type": "error",
                "status": "rate_limited",
                "message": "Too many compiler requests.",
                "retry_after_seconds": error.retry_after_seconds,
            }
        )
        await websocket.close(code=4429)
        return

    if not gate.try_enter():
        await websocket.send_json(
            {"type": "error", "status": "server_busy", "message": "Compiler queue is full."}
        )
        await websocket.close(code=4503)
        return

    has_execution_slot = False
    session = None
    send_lock = asyncio.Lock()
    output_bytes = 0
    ready = False

    async def send_json(message: dict[str, object]) -> None:
        async with send_lock:
            await websocket.send_json(message)

    async def stream_stdout() -> None:
        nonlocal output_bytes
        assert session is not None and session.process.stdout is not None
        while chunk := await session.process.stdout.read(1024):
            output_bytes += len(chunk)
            if output_bytes > settings.max_output_bytes:
                await send_json({"type": "error", "status": "output_limit", "message": "Output limit exceeded."})
                await session.close()
                return
            await send_json(
                {"type": "output", "stream": "stdout", "data": chunk.decode("utf-8", errors="replace")}
            )

    async def stream_stderr() -> None:
        nonlocal output_bytes, ready
        assert session is not None and session.process.stderr is not None
        while line := await session.process.stderr.readline():
            decoded = line.decode("utf-8", errors="replace")
            if decoded.strip() == READY_MARKER:
                ready = True
                await send_json({"type": "status", "status": "running"})
                continue
            output_bytes += len(line)
            if output_bytes > settings.max_output_bytes:
                await send_json({"type": "error", "status": "output_limit", "message": "Output limit exceeded."})
                await session.close()
                return
            await send_json({"type": "output", "stream": "stderr", "data": decoded})

    async def receive_input() -> None:
        assert session is not None
        while True:
            message = await websocket.receive_json()
            if message.get("type") == "stop":
                await session.close()
                return
            parsed = InteractiveInputRequest.model_validate(message)
            await session.write(parsed.data)

    try:
        first_message = await asyncio.wait_for(websocket.receive_json(), timeout=10)
        start_request = InteractiveStartRequest.model_validate(first_message)
        has_execution_slot = await run_in_threadpool(gate.wait_for_execution)
        if not has_execution_slot:
            await send_json({"type": "error", "status": "server_busy", "message": "Queue wait timed out."})
            return
        await send_json({"type": "status", "status": "compiling"})
        session = await compiler.start(start_request.code)

        stdout_task = asyncio.create_task(stream_stdout())
        stderr_task = asyncio.create_task(stream_stderr())
        input_task = asyncio.create_task(receive_input())
        wait_task = asyncio.create_task(session.process.wait())
        done, pending = await asyncio.wait(
            {input_task, wait_task},
            return_when=asyncio.FIRST_COMPLETED,
        )

        if wait_task in done:
            await asyncio.gather(stdout_task, stderr_task)
            return_code = wait_task.result()
            final_status = (
                "compile_error"
                if not ready
                else "accepted"
                if return_code == 0
                else "timeout"
                if return_code in (124, 137)
                else "runtime_error"
            )
            await send_json(
                {"type": "status", "status": final_status, "exit_code": return_code}
            )

        for task in pending:
            task.cancel()
        for task in (stdout_task, stderr_task, input_task, wait_task):
            if not task.done():
                task.cancel()
            with suppress(asyncio.CancelledError, WebSocketDisconnect):
                await task
    except (WebSocketDisconnect, asyncio.TimeoutError):
        pass
    except Exception as error:
        with suppress(WebSocketDisconnect, RuntimeError):
            await send_json({"type": "error", "status": "invalid_request", "message": str(error)})
    finally:
        if session is not None:
            await session.close()
        if has_execution_slot:
            gate.leave_execution()
        gate.leave()
        with suppress(RuntimeError):
            await websocket.close()
