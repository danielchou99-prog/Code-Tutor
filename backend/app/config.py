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


settings = Settings()
