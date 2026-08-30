import asyncio
from contextlib import suppress

from fastapi import Depends, FastAPI, HTTPException, Request, Response, WebSocket, WebSocketDisconnect, status
from fastapi.concurrency import run_in_threadpool
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

from .ai_connections import (
    AiConnectionService,
    AiProviderAccessDenied,
    AiProviderUnavailable,
    AiStorageUnavailable,
    FernetKeyCipher,
    GroqKeyValidator,
    InvalidProviderKey,
    SupabaseAiConnectionStore,
)
from .auth import AuthenticatedUser, SupabaseTokenVerifier, get_current_user
from .ai_tutor import (
    AiConnectionRequired,
    AiProviderRateLimited,
    AiTutorBusy,
    AiTutorService,
    GroqTutorProvider,
    TutorPrompt,
)
from .compiler import CompilerService, CompilerUnavailable, DockerCompiler
from .config import settings
from .interactive import DockerInteractiveCompiler, InteractiveCompilerService, READY_MARKER
from .judge import (
    JudgeStorageUnavailable,
    JudgeStore,
    ProblemNotFound,
    SupabaseJudgeStore,
)
from .judge_worker import (
    JudgeWorker,
    JudgeWorkerUnavailable,
    LocalJudgeWorker,
    RemoteJudgeWorker,
)
from .models import (
    HealthResponse,
    AuthMeResponse,
    AiConnectionRequest,
    AiConnectionStatusResponse,
    AiTutorRequest,
    InteractiveInputRequest,
    InteractiveStartRequest,
    RunRequest,
    RunResponse,
    SubmitRequest,
    SubmitResponse,
)
from .protection import ExecutionGate, InMemoryRateLimiter, RateLimitExceeded
from .problem_admin import (
    AdminProblem,
    AdminProblemSummary,
    AdminStatusResponse,
    ProblemAdminUnavailable,
    SupabaseProblemAdminStore,
)
from .test_generation import (
    ApplyGenerationBatchRequest,
    ApplyGenerationBatchResponse,
    GenerateCasesRequest,
    GenerationBatchResponse,
    GenerationVersionMetadata,
    GenerationVersionUpload,
    HiddenTestGenerationService,
    TestGenerationError,
)
from .problem_translation import (
    GroqProblemTranslationProvider,
    ProblemTranslationConnectionRequired,
    ProblemTranslationInvalidResponse,
    ProblemTranslationRateLimited,
    ProblemTranslationRequest,
    ProblemTranslationResponse,
    ProblemTranslationService,
)


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
judge_rate_limiter = InMemoryRateLimiter(
    max_requests=settings.judge_rate_limit_requests,
    window_seconds=settings.judge_rate_limit_window_seconds,
)
execution_gate = ExecutionGate(
    max_concurrent=settings.max_concurrent_runs,
    max_queued=settings.max_queued_runs,
    wait_timeout_seconds=settings.queue_wait_seconds,
)
app.state.token_verifier = (
    SupabaseTokenVerifier(settings.supabase_url) if settings.supabase_url else None
)
app.state.judge_store = (
    SupabaseJudgeStore(
        settings.supabase_url,
        settings.supabase_server_key,
        settings.ai_request_timeout_seconds,
    )
    if settings.supabase_url and settings.supabase_server_key
    else None
)
app.state.problem_admin_store = (
    SupabaseProblemAdminStore(
        settings.supabase_url,
        settings.supabase_server_key,
        settings.ai_request_timeout_seconds,
    )
    if settings.supabase_url and settings.supabase_server_key
    else None
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


def create_ai_tutor_service() -> AiTutorService | None:
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
    return AiTutorService(
        store=SupabaseAiConnectionStore(
            settings.supabase_url,
            settings.supabase_publishable_key,
            settings.ai_request_timeout_seconds,
        ),
        cipher=cipher,
        provider=GroqTutorProvider(
            model=settings.ai_model,
            timeout_seconds=settings.ai_tutor_timeout_seconds,
            max_completion_tokens=settings.ai_max_completion_tokens,
        ),
    )


app.state.ai_tutor_service = create_ai_tutor_service()


def create_problem_translation_service() -> ProblemTranslationService | None:
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
    return ProblemTranslationService(
        store=SupabaseAiConnectionStore(
            settings.supabase_url,
            settings.supabase_publishable_key,
            settings.ai_request_timeout_seconds,
        ),
        cipher=cipher,
        provider=GroqProblemTranslationProvider(
            model=settings.ai_model,
            timeout_seconds=settings.ai_tutor_timeout_seconds,
        ),
    )


app.state.problem_translation_service = create_problem_translation_service()


def get_compiler() -> CompilerService:
    return DockerCompiler(settings)


def get_rate_limiter() -> InMemoryRateLimiter:
    return rate_limiter


def get_execution_gate() -> ExecutionGate:
    return execution_gate


def get_judge_rate_limiter() -> InMemoryRateLimiter:
    return judge_rate_limiter


def get_judge_store(request: Request) -> JudgeStore:
    store: JudgeStore | None = getattr(request.app.state, "judge_store", None)
    if store is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Judge storage is not configured on the server.",
        )
    return store


def get_judge_worker(
    store: JudgeStore = Depends(get_judge_store),
    compiler: CompilerService = Depends(get_compiler),
) -> JudgeWorker:
    if settings.judge_worker_url:
        if not settings.judge_worker_token:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="The remote Judge worker token is not configured.",
            )
        return RemoteJudgeWorker(
            settings.judge_worker_url,
            settings.judge_worker_token,
            settings.judge_worker_timeout_seconds,
        )
    return LocalJudgeWorker(store, compiler)


def get_problem_admin_store(request: Request) -> SupabaseProblemAdminStore:
    store: SupabaseProblemAdminStore | None = getattr(
        request.app.state, "problem_admin_store", None
    )
    if store is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Problem administration is not configured on the server.",
        )
    return store


def is_problem_admin(
    user: AuthenticatedUser,
    *,
    user_ids: frozenset[str] | None = None,
    emails: frozenset[str] | None = None,
) -> bool:
    allowed_user_ids = settings.admin_user_ids if user_ids is None else user_ids
    allowed_emails = settings.admin_emails if emails is None else emails
    normalized_email = user.email.casefold() if user.email else None
    return user.user_id in allowed_user_ids or (
        normalized_email is not None and normalized_email in allowed_emails
    )


def require_problem_admin(
    user: AuthenticatedUser = Depends(get_current_user),
) -> AuthenticatedUser:
    if not is_problem_admin(user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Problem administrator access is required.",
        )
    return user


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


def get_ai_tutor_service(request: Request) -> AiTutorService:
    service: AiTutorService | None = getattr(request.app.state, "ai_tutor_service", None)
    if service is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="AI Tutor is not configured on the server.",
        )
    return service


def get_problem_translation_service(request: Request) -> ProblemTranslationService:
    service: ProblemTranslationService | None = getattr(
        request.app.state, "problem_translation_service", None
    )
    if service is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Problem translation is not configured on the server.",
        )
    return service


@app.get("/health", response_model=HealthResponse)
async def health(compiler: CompilerService = Depends(get_compiler)) -> HealthResponse:
    compiler_available = await run_in_threadpool(compiler.is_available)
    return HealthResponse(compiler_available=compiler_available)


@app.get("/api/auth/me", response_model=AuthMeResponse)
async def auth_me(user: AuthenticatedUser = Depends(get_current_user)) -> AuthMeResponse:
    return AuthMeResponse(user_id=user.user_id, email=user.email)


@app.get("/api/admin/me", response_model=AdminStatusResponse)
async def admin_me(
    user: AuthenticatedUser = Depends(get_current_user),
) -> AdminStatusResponse:
    return AdminStatusResponse(is_admin=is_problem_admin(user))


@app.get("/api/admin/problems", response_model=list[AdminProblemSummary])
async def list_admin_problems(
    _user: AuthenticatedUser = Depends(require_problem_admin),
    store: SupabaseProblemAdminStore = Depends(get_problem_admin_store),
) -> list[AdminProblemSummary]:
    try:
        return await run_in_threadpool(store.list_problems)
    except ProblemAdminUnavailable as error:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(error),
        ) from error


@app.get("/api/admin/problems/{problem_id}", response_model=AdminProblem)
async def get_admin_problem(
    problem_id: str,
    _user: AuthenticatedUser = Depends(require_problem_admin),
    store: SupabaseProblemAdminStore = Depends(get_problem_admin_store),
) -> AdminProblem:
    try:
        return await run_in_threadpool(store.get_problem, problem_id)
    except ProblemAdminUnavailable as error:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(error),
        ) from error


@app.put("/api/admin/problems/{problem_id}", response_model=AdminProblem)
async def save_admin_problem(
    problem_id: str,
    payload: AdminProblem,
    _user: AuthenticatedUser = Depends(require_problem_admin),
    store: SupabaseProblemAdminStore = Depends(get_problem_admin_store),
) -> AdminProblem:
    if payload.id != problem_id:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="The path problem ID must match the payload ID.",
        )
    try:
        return await run_in_threadpool(store.save_problem, payload)
    except ProblemAdminUnavailable as error:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(error),
        ) from error


@app.get(
    "/api/admin/problems/{problem_id}/generation-versions",
    response_model=list[GenerationVersionMetadata],
)
async def list_generation_versions(
    problem_id: str,
    _user: AuthenticatedUser = Depends(require_problem_admin),
    store: SupabaseProblemAdminStore = Depends(get_problem_admin_store),
) -> list[GenerationVersionMetadata]:
    try:
        return await run_in_threadpool(store.list_generation_versions, problem_id)
    except ProblemAdminUnavailable as error:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(error),
        ) from error


@app.put(
    "/api/admin/problems/{problem_id}/generation-versions/{version}",
    response_model=GenerationVersionMetadata,
)
async def save_generation_version(
    problem_id: str,
    version: str,
    payload: GenerationVersionUpload,
    user: AuthenticatedUser = Depends(require_problem_admin),
    store: SupabaseProblemAdminStore = Depends(get_problem_admin_store),
) -> GenerationVersionMetadata:
    if payload.version != version:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="The path version must match the payload version.",
        )
    try:
        return await run_in_threadpool(
            store.save_generation_version, problem_id, payload, user.user_id
        )
    except ProblemAdminUnavailable as error:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(error),
        ) from error


@app.post(
    "/api/admin/problems/{problem_id}/generate-tests",
    response_model=GenerationBatchResponse,
)
async def generate_hidden_tests(
    problem_id: str,
    payload: GenerateCasesRequest,
    user: AuthenticatedUser = Depends(require_problem_admin),
    compiler: CompilerService = Depends(get_compiler),
    store: SupabaseProblemAdminStore = Depends(get_problem_admin_store),
    gate: ExecutionGate = Depends(get_execution_gate),
) -> GenerationBatchResponse:
    if not gate.try_enter():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="The compiler queue is full. Try generation again shortly.",
        )
    has_execution_slot = False
    try:
        has_execution_slot = await run_in_threadpool(gate.wait_for_execution)
        if not has_execution_slot:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="The compiler queue wait timed out.",
            )
        service = HiddenTestGenerationService(store=store, compiler=compiler)
        generated = await run_in_threadpool(service.generate, problem_id, payload)
        return await run_in_threadpool(
            store.save_generation_batch,
            problem_id,
            payload.version,
            generated,
            user.user_id,
        )
    except (ProblemAdminUnavailable, TestGenerationError) as error:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=str(error),
        ) from error
    finally:
        if has_execution_slot:
            gate.leave_execution()
        gate.leave()


@app.post(
    "/api/admin/generation-batches/{batch_id}/apply",
    response_model=ApplyGenerationBatchResponse,
)
async def apply_generation_batch(
    batch_id: str,
    payload: ApplyGenerationBatchRequest,
    _user: AuthenticatedUser = Depends(require_problem_admin),
    store: SupabaseProblemAdminStore = Depends(get_problem_admin_store),
) -> ApplyGenerationBatchResponse:
    try:
        applied = await run_in_threadpool(
            store.apply_generation_batch,
            batch_id,
            payload.group_order,
            payload.replace_existing,
        )
        return ApplyGenerationBatchResponse(
            batch_id=batch_id, applied_cases=applied
        )
    except ProblemAdminUnavailable as error:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=str(error),
        ) from error


@app.post(
    "/api/admin/problem-translations",
    response_model=ProblemTranslationResponse,
)
async def translate_problem_content(
    payload: ProblemTranslationRequest,
    user: AuthenticatedUser = Depends(require_problem_admin),
    service: ProblemTranslationService = Depends(get_problem_translation_service),
) -> ProblemTranslationResponse:
    try:
        return await run_in_threadpool(service.translate, user, payload)
    except ProblemTranslationConnectionRequired as error:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Connect Groq in Settings before saving a problem.",
        ) from error
    except ProblemTranslationRateLimited as error:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="The Groq translation limit was reached. Try again later.",
        ) from error
    except ProblemTranslationInvalidResponse as error:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=str(error),
        ) from error
    except InvalidProviderKey as error:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Groq rejected the stored API key. Reconnect it in Settings.",
        ) from error
    except AiProviderAccessDenied as error:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Groq denied translation access for this account or network.",
        ) from error
    except (AiProviderUnavailable, AiStorageUnavailable) as error:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Problem translation is temporarily unavailable. The problem was not saved.",
        ) from error


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
    except AiProviderAccessDenied as error:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Groq denied access from this network or account. Check your network and Groq permissions.",
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


@app.post("/api/ai/tutor")
async def start_ai_tutor(
    payload: AiTutorRequest,
    user: AuthenticatedUser = Depends(get_current_user),
    service: AiTutorService = Depends(get_ai_tutor_service),
) -> StreamingResponse:
    if payload.action == "ask" and not payload.question.strip():
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Enter a question before sending it to AI Tutor.",
        )
    prompt = TutorPrompt(
        action=payload.action,
        code=payload.code,
        error_output=payload.error_output,
        question=payload.question.strip(),
        language=payload.language,
        programming_language=payload.programming_language,
        judge_summary=payload.judge_summary.model_dump() if payload.judge_summary else None,
    )
    try:
        stream = await run_in_threadpool(service.start, user, prompt)
    except AiConnectionRequired as error:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Connect Groq in Settings before using AI Tutor.",
        ) from error
    except AiTutorBusy as error:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Another AI Tutor response is already in progress.",
        ) from error
    except InvalidProviderKey as error:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="The saved Groq API key is no longer valid. Reconnect it in Settings.",
        ) from error
    except AiProviderAccessDenied as error:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Groq denied access from this network or account.",
        ) from error
    except AiProviderRateLimited as error:
        headers = (
            {"Retry-After": str(error.retry_after_seconds)}
            if error.retry_after_seconds is not None
            else None
        )
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Your Groq free-plan limit has been reached. Try again later.",
            headers=headers,
        ) from error
    except (AiProviderUnavailable, AiStorageUnavailable) as error:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="AI Tutor is temporarily unavailable. Try again later.",
        ) from error

    return StreamingResponse(
        stream,
        media_type="text/plain; charset=utf-8",
        headers={
            "Cache-Control": "no-store",
            "X-Content-Type-Options": "nosniff",
        },
    )


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
        return await run_in_threadpool(
            compiler.run,
            request.code,
            request.stdin,
            request.files or None,
            request.language,
        )
    except CompilerUnavailable as error:
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
        return RunResponse(status="service_unavailable", stderr=str(error))
    finally:
        if has_execution_slot:
            gate.leave_execution()
        gate.leave()


@app.post("/api/problems/{problem_id}/submit", response_model=SubmitResponse)
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

    if not gate.try_enter():
        response.headers["Retry-After"] = "1"
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="The Judge queue is full. Please try again shortly.",
        )

    has_execution_slot = False
    try:
        has_execution_slot = await run_in_threadpool(gate.wait_for_execution)
        if not has_execution_slot:
            response.headers["Retry-After"] = "1"
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="The Judge queue wait timed out. Please try again.",
            )
        return await run_in_threadpool(worker.submit, user, problem_id, payload)
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
