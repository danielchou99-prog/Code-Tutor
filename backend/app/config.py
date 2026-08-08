from dataclasses import dataclass
import os


@dataclass(frozen=True)
class Settings:
    compiler_image: str = os.getenv(
        "CODE_TUTOR_COMPILER_IMAGE", "code-tutor-compiler:local"
    )
    compile_timeout_seconds: int = 15
    run_timeout_seconds: int = 3
    max_output_bytes: int = 65_536
    docker_binary: str = "docker"
    allowed_origins: tuple[str, ...] = (
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    )


settings = Settings()
