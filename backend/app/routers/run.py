import asyncio
from contextlib import suppress

from fastapi import APIRouter, Depends, Request, Response, WebSocket, WebSocketDisconnect, status
from fastapi.concurrency import run_in_threadpool

from ..compiler import CompilerService, CompilerUnavailable
from ..config import settings
from ..dependencies import (
    get_compiler,
    get_execution_gate,
    get_interactive_compiler,
    get_rate_limiter,
)
from ..execution import ExecutionQueueFull, ExecutionQueueTimeout, execution_slot
from ..interactive import READY_MARKER, InteractiveCompilerService, final_interactive_status
from ..models import (
    InteractiveInputRequest,
    InteractiveStartRequest,
    RunRequest,
    RunResponse,
)
from ..protection import ExecutionGate, InMemoryRateLimiter, RateLimitExceeded

router = APIRouter()


@router.post("/api/run", response_model=RunResponse)
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

    try:
        async with execution_slot(gate):
            return await run_in_threadpool(
                compiler.run,
                request.code,
                request.stdin,
                request.files or None,
                request.language,
            )
    except ExecutionQueueFull:
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
        response.headers["Retry-After"] = "1"
        return RunResponse(
            status="server_busy",
            stderr="The compiler queue is full. Please try again shortly.",
        )
    except ExecutionQueueTimeout:
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
        response.headers["Retry-After"] = "1"
        return RunResponse(
            status="server_busy",
            stderr="The compiler queue wait timed out. Please try again.",
        )
    except CompilerUnavailable as error:
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
        return RunResponse(status="service_unavailable", stderr=str(error))


@router.websocket("/api/run/interactive")
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
        session = await compiler.start(
            start_request.code,
            start_request.files or None,
            start_request.language,
        )

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
            final_status = final_interactive_status(ready, return_code)
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
