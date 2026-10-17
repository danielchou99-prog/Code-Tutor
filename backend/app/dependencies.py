"""FastAPI dependency providers shared by every router.

Tests replace these with `app.dependency_overrides[<function>]`, so keep each
provider a module-level function and import it from here (or `app.main`).
"""

from __future__ import annotations

from fastapi import Depends, HTTPException, Request, status

from .ai_connections import AiConnectionService, FernetKeyCipher, SupabaseAiConnectionStore
from .ai_test_generation import AiHiddenTestGenerationService, GroqAiBlueprintProvider
from .ai_tutor import AiTutorService
from .auth import AuthenticatedUser, get_current_user
from .compiler import CompilerService, DockerCompiler
from .config import settings
from .interactive import DockerInteractiveCompiler, InteractiveCompilerService
from .judge import JudgeStore
from .judge_worker import JudgeWorker, LocalJudgeWorker, RemoteJudgeWorker
from .problem_admin import SupabaseProblemAdminStore
from .problem_translation import ProblemTranslationService
from .protection import ExecutionGate, InMemoryRateLimiter

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


def _service_unavailable(detail: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=detail)


def get_compiler() -> CompilerService:
    return DockerCompiler(settings)


def get_interactive_compiler() -> InteractiveCompilerService:
    return DockerInteractiveCompiler(settings)


def get_rate_limiter() -> InMemoryRateLimiter:
    return rate_limiter


def get_execution_gate() -> ExecutionGate:
    return execution_gate


def get_judge_rate_limiter() -> InMemoryRateLimiter:
    return judge_rate_limiter


def get_judge_store(request: Request) -> JudgeStore:
    store: JudgeStore | None = getattr(request.app.state, "judge_store", None)
    if store is None:
        raise _service_unavailable("Judge storage is not configured on the server.")
    return store


def get_judge_worker(
    store: JudgeStore = Depends(get_judge_store),
    compiler: CompilerService = Depends(get_compiler),
) -> JudgeWorker:
    if settings.judge_worker_url:
        if not settings.judge_worker_token:
            raise _service_unavailable("The remote Judge worker token is not configured.")
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
        raise _service_unavailable("Problem administration is not configured on the server.")
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


def get_ai_connection_service(request: Request) -> AiConnectionService:
    service: AiConnectionService | None = getattr(
        request.app.state, "ai_connection_service", None
    )
    if service is None:
        raise _service_unavailable("AI connections are not configured on the server.")
    return service


def get_ai_tutor_service(request: Request) -> AiTutorService:
    service: AiTutorService | None = getattr(request.app.state, "ai_tutor_service", None)
    if service is None:
        raise _service_unavailable("AI Tutor is not configured on the server.")
    return service


def get_problem_translation_service(request: Request) -> ProblemTranslationService:
    service: ProblemTranslationService | None = getattr(
        request.app.state, "problem_translation_service", None
    )
    if service is None:
        raise _service_unavailable("Problem translation is not configured on the server.")
    return service


def get_ai_hidden_test_generation_service(
    store: SupabaseProblemAdminStore = Depends(get_problem_admin_store),
    compiler: CompilerService = Depends(get_compiler),
) -> AiHiddenTestGenerationService:
    unavailable = "AI hidden-test generation is not configured on the server."
    if not (
        settings.supabase_url
        and settings.supabase_publishable_key
        and settings.ai_encryption_key
    ):
        raise _service_unavailable(unavailable)
    try:
        cipher = FernetKeyCipher(settings.ai_encryption_key)
    except ValueError as error:
        raise _service_unavailable(unavailable) from error
    return AiHiddenTestGenerationService(
        key_store=SupabaseAiConnectionStore(
            settings.supabase_url,
            settings.supabase_publishable_key,
            settings.ai_request_timeout_seconds,
        ),
        cipher=cipher,
        provider=GroqAiBlueprintProvider(
            model=settings.ai_model,
            timeout_seconds=max(settings.ai_tutor_timeout_seconds, 90),
        ),
        store=store,
        compiler=compiler,
    )
