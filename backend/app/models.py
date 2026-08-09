from typing import Literal

from pydantic import BaseModel, Field


RunStatus = Literal[
    "accepted",
    "compile_error",
    "runtime_error",
    "timeout",
    "service_unavailable",
    "rate_limited",
    "server_busy",
]


class RunRequest(BaseModel):
    code: str = Field(min_length=1, max_length=65_536)
    stdin: str = Field(default="", max_length=16_384)
    language: Literal["cpp"] = "cpp"


class InteractiveStartRequest(BaseModel):
    type: Literal["start"]
    code: str = Field(min_length=1, max_length=65_536)
    language: Literal["cpp"] = "cpp"


class InteractiveInputRequest(BaseModel):
    type: Literal["input"]
    data: str = Field(max_length=4_096)


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


class AuthMeResponse(BaseModel):
    user_id: str
    email: str | None = None
