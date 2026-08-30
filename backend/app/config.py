from dataclasses import dataclass, field
import os

from dotenv import load_dotenv


load_dotenv()


DEFAULT_ALLOWED_ORIGINS = (
    "http://localhost:3000",
    "http://127.0.0.1:3000",
)


def read_allowed_origins() -> tuple[str, ...]:
    configured = os.getenv("CODE_TUTOR_ALLOWED_ORIGINS")
    if not configured:
        return DEFAULT_ALLOWED_ORIGINS

    origins = tuple(
        origin.strip().rstrip("/")
        for origin in configured.split(",")
        if origin.strip()
    )
    if not origins:
        raise ValueError("At least one allowed origin is required.")
    if any(
        origin == "*" or not origin.startswith(("http://", "https://"))
        for origin in origins
    ):
        raise ValueError("Allowed origins must be explicit HTTP(S) origins.")
    return origins


def read_admin_user_ids() -> frozenset[str]:
    return frozenset(
        user_id.strip()
        for user_id in os.getenv("CODE_TUTOR_ADMIN_USER_IDS", "").split(",")
        if user_id.strip()
    )


def read_admin_emails() -> frozenset[str]:
    return frozenset(
        email.strip().casefold()
        for email in os.getenv("CODE_TUTOR_ADMIN_EMAILS", "").split(",")
        if email.strip()
    )


@dataclass(frozen=True)
class Settings:
    compiler_image: str = os.getenv(
        "CODE_TUTOR_COMPILER_IMAGE", "code-tutor-compiler:local"
    )
    compile_timeout_seconds: int = 15
    run_timeout_seconds: int = 3
    interactive_timeout_seconds: int = int(
        os.getenv("CODE_TUTOR_INTERACTIVE_TIMEOUT_SECONDS", "60")
    )
    max_output_bytes: int = 65_536
    docker_binary: str = "docker"
    rate_limit_requests: int = int(os.getenv("CODE_TUTOR_RATE_LIMIT_REQUESTS", "10"))
    rate_limit_window_seconds: int = int(
        os.getenv("CODE_TUTOR_RATE_LIMIT_WINDOW_SECONDS", "60")
    )
    max_concurrent_runs: int = int(
        os.getenv("CODE_TUTOR_MAX_CONCURRENT_RUNS", "2")
    )
    max_queued_runs: int = int(os.getenv("CODE_TUTOR_MAX_QUEUED_RUNS", "4"))
    queue_wait_seconds: float = float(
        os.getenv("CODE_TUTOR_QUEUE_WAIT_SECONDS", "10")
    )
    allowed_origins: tuple[str, ...] = field(default_factory=read_allowed_origins)
    supabase_url: str | None = (
        os.getenv("CODE_TUTOR_SUPABASE_URL", "").strip().rstrip("/") or None
    )
    supabase_publishable_key: str | None = (
        os.getenv("CODE_TUTOR_SUPABASE_PUBLISHABLE_KEY", "").strip() or None
    )
    supabase_server_key: str | None = (
        os.getenv("CODE_TUTOR_SUPABASE_SECRET_KEY", "").strip()
        or os.getenv("CODE_TUTOR_SUPABASE_SERVICE_ROLE_KEY", "").strip()
        or None
    )
    judge_rate_limit_requests: int = int(
        os.getenv("CODE_TUTOR_JUDGE_RATE_LIMIT_REQUESTS", "5")
    )
    judge_rate_limit_window_seconds: int = int(
        os.getenv("CODE_TUTOR_JUDGE_RATE_LIMIT_WINDOW_SECONDS", "60")
    )
    judge_worker_url: str | None = (
        os.getenv("CODE_TUTOR_JUDGE_WORKER_URL", "").strip().rstrip("/") or None
    )
    judge_worker_token: str | None = (
        os.getenv("CODE_TUTOR_JUDGE_WORKER_TOKEN", "").strip() or None
    )
    judge_worker_timeout_seconds: float = float(
        os.getenv("CODE_TUTOR_JUDGE_WORKER_TIMEOUT_SECONDS", "120")
    )
    admin_user_ids: frozenset[str] = field(default_factory=read_admin_user_ids)
    admin_emails: frozenset[str] = field(default_factory=read_admin_emails)
    ai_encryption_key: str | None = (
        os.getenv("CODE_TUTOR_AI_ENCRYPTION_KEY", "").strip() or None
    )
    ai_request_timeout_seconds: float = float(
        os.getenv("CODE_TUTOR_AI_REQUEST_TIMEOUT_SECONDS", "10")
    )
    ai_tutor_timeout_seconds: float = float(
        os.getenv("CODE_TUTOR_AI_TUTOR_TIMEOUT_SECONDS", "60")
    )
    ai_model: str = os.getenv(
        "CODE_TUTOR_AI_MODEL", "openai/gpt-oss-120b"
    ).strip()
    ai_max_completion_tokens: int = int(
        os.getenv("CODE_TUTOR_AI_MAX_COMPLETION_TOKENS", "900")
    )


settings = Settings()
