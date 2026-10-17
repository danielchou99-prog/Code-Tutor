from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.concurrency import run_in_threadpool

from ..ai_connections import (
    AiProviderAccessDenied,
    AiProviderUnavailable,
    AiStorageUnavailable,
    InvalidProviderKey,
)
from ..ai_test_generation import (
    AiAutoGenerateRequest,
    AiAutoGenerateResponse,
    AiHiddenTestError,
    AiHiddenTestGenerationService,
)
from ..ai_tutor import AiConnectionRequired, AiProviderRateLimited
from ..auth import AuthenticatedUser, get_current_user
from ..compiler import CompilerService
from ..dependencies import (
    get_ai_hidden_test_generation_service,
    get_compiler,
    get_execution_gate,
    get_problem_admin_store,
    get_problem_translation_service,
    is_problem_admin,
    require_problem_admin,
)
from ..execution import ExecutionQueueFull, ExecutionQueueTimeout, execution_slot
from ..problem_admin import (
    AdminProblem,
    AdminProblemCreate,
    AdminProblemSummary,
    AdminStatusResponse,
    ProblemAdminUnavailable,
    SupabaseProblemAdminStore,
)
from ..problem_translation import (
    ProblemTranslationConnectionRequired,
    ProblemTranslationInvalidResponse,
    ProblemTranslationRateLimited,
    ProblemTranslationRequest,
    ProblemTranslationResponse,
    ProblemTranslationService,
)
from ..protection import ExecutionGate
from ..test_generation import (
    ApplyGenerationBatchRequest,
    ApplyGenerationBatchResponse,
    GenerateCasesRequest,
    GenerationBatchResponse,
    GenerationVersionMetadata,
    GenerationVersionUpload,
    HiddenTestGenerationService,
    TestGenerationError,
)

router = APIRouter()


@asynccontextmanager
async def generation_slot(gate: ExecutionGate) -> AsyncIterator[None]:
    """Admission control for admin test generation, mapped to HTTP errors."""
    try:
        async with execution_slot(gate):
            yield
    except ExecutionQueueFull as error:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="The compiler queue is full. Try generation again shortly.",
        ) from error
    except ExecutionQueueTimeout as error:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="The compiler queue wait timed out.",
        ) from error


@router.get("/api/admin/me", response_model=AdminStatusResponse)
async def admin_me(
    user: AuthenticatedUser = Depends(get_current_user),
) -> AdminStatusResponse:
    return AdminStatusResponse(is_admin=is_problem_admin(user))


@router.get("/api/admin/problems", response_model=list[AdminProblemSummary])
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


@router.post("/api/admin/problems", response_model=AdminProblem, status_code=status.HTTP_201_CREATED)
async def create_admin_problem(
    payload: AdminProblemCreate,
    _user: AuthenticatedUser = Depends(require_problem_admin),
    store: SupabaseProblemAdminStore = Depends(get_problem_admin_store),
) -> AdminProblem:
    try:
        return await run_in_threadpool(store.create_problem, payload)
    except ProblemAdminUnavailable as error:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(error),
        ) from error


@router.get("/api/admin/problems/{problem_id}", response_model=AdminProblem)
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


@router.put("/api/admin/problems/{problem_id}", response_model=AdminProblem)
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


@router.get(
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


@router.put(
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


@router.post(
    "/api/admin/problems/{problem_id}/generate-tests/ai",
    response_model=AiAutoGenerateResponse,
)
async def generate_hidden_tests_with_ai(
    problem_id: str,
    payload: AiAutoGenerateRequest,
    user: AuthenticatedUser = Depends(require_problem_admin),
    store: SupabaseProblemAdminStore = Depends(get_problem_admin_store),
    service: AiHiddenTestGenerationService = Depends(get_ai_hidden_test_generation_service),
    gate: ExecutionGate = Depends(get_execution_gate),
) -> AiAutoGenerateResponse:
    try:
        async with generation_slot(gate):
            problem = await run_in_threadpool(store.get_problem, problem_id)
            return await run_in_threadpool(service.generate, user, problem, payload)
    except AiConnectionRequired as error:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(error)) from error
    except InvalidProviderKey as error:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(error)) from error
    except AiProviderAccessDenied as error:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(error)) from error
    except AiProviderRateLimited as error:
        headers = {"Retry-After": str(error.retry_after_seconds)} if error.retry_after_seconds else None
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Groq rate limit reached. Try again later.",
            headers=headers,
        ) from error
    except (AiProviderUnavailable, AiStorageUnavailable) as error:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="AI hidden-test generation is temporarily unavailable.",
        ) from error
    except (ProblemAdminUnavailable, AiHiddenTestError, TestGenerationError) as error:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=str(error),
        ) from error


@router.post(
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
    try:
        async with generation_slot(gate):
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


@router.post(
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
            payload.case_scores,
        )
        return ApplyGenerationBatchResponse(
            batch_id=batch_id, applied_cases=applied
        )
    except ProblemAdminUnavailable as error:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=str(error),
        ) from error


@router.post(
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
