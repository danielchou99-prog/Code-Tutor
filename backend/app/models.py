from typing import Literal

from pydantic import BaseModel, Field, field_validator, model_validator


RunStatus = Literal[
    "accepted",
    "compile_error",
    "runtime_error",
    "timeout",
    "service_unavailable",
    "rate_limited",
    "server_busy",
]


class ProjectSourceFile(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    content: str = Field(default="", max_length=65_536)

    @field_validator("name")
    @classmethod
    def validate_name(cls, value: str) -> str:
        name = value.strip()
        base_name = name.rsplit(".", 1)[0].rstrip(" .").casefold()
        windows_reserved_names = {
            "con",
            "prn",
            "aux",
            "nul",
            *(f"com{index}" for index in range(1, 10)),
            *(f"lpt{index}" for index in range(1, 10)),
        }
        if (
            name != value
            or not base_name
            or "/" in name
            or "\\" in name
            or any(character in '<>:"|?*' or ord(character) < 32 for character in name)
            or base_name in windows_reserved_names
            or not name.lower().endswith((".cpp", ".h", ".hpp"))
        ):
            raise ValueError("Use a safe .cpp, .h, or .hpp file name.")
        return name


class ProjectSourcesMixin(BaseModel):
    code: str = Field(default="", max_length=65_536)
    files: list[ProjectSourceFile] = Field(default_factory=list, max_length=50)
    language: Literal["cpp"] = "cpp"

    @model_validator(mode="after")
    def validate_project_sources(self) -> "ProjectSourcesMixin":
        if not self.files:
            if not self.code:
                raise ValueError("Code cannot be empty.")
            return self

        normalized_names = [source.name.casefold() for source in self.files]
        if len(normalized_names) != len(set(normalized_names)):
            raise ValueError("Project file names must be unique.")
        if not any(source.name.lower().endswith(".cpp") for source in self.files):
            raise ValueError("A C++ project must contain at least one .cpp file.")
        if sum(len(source.content.encode("utf-8")) for source in self.files) > 262_144:
            raise ValueError("Project source files exceed the 256 KiB limit.")
        return self


class RunRequest(ProjectSourcesMixin):
    stdin: str = Field(default="", max_length=16_384)


class InteractiveStartRequest(ProjectSourcesMixin):
    type: Literal["start"]


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


class AiConnectionRequest(BaseModel):
    api_key: str = Field(min_length=8, max_length=256)


class AiConnectionStatusResponse(BaseModel):
    connected: bool
    provider: Literal["groq"] = "groq"
    key_last_four: str | None = None
    updated_at: str | None = None


class AiTutorRequest(BaseModel):
    action: Literal["analyze", "explain_error", "hint", "ask"]
    code: str = Field(default="", max_length=40_000)
    error_output: str = Field(default="", max_length=8_000)
    question: str = Field(default="", max_length=2_000)
    language: Literal["zh-Hant", "en"] = "zh-Hant"
