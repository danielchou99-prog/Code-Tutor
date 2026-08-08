from typing import Literal

from pydantic import BaseModel, Field


RunStatus = Literal[
    "accepted",
    "compile_error",
    "runtime_error",
    "timeout",
    "service_unavailable",
]


class RunRequest(BaseModel):
    code: str = Field(min_length=1, max_length=65_536)
    stdin: str = Field(default="", max_length=16_384)
    language: Literal["cpp"] = "cpp"


class RunResponse(BaseModel):
    status: RunStatus
    stdout: str = ""
    stderr: str = ""
    exit_code: int | None = None
    duration_ms: int = 0
    truncated: bool = False


class HealthResponse(BaseModel):
    status: Literal["ok"] = "ok"
    compiler_available: bool
