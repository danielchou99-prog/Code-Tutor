from fastapi import Depends, FastAPI, Response, status
from fastapi.concurrency import run_in_threadpool
from fastapi.middleware.cors import CORSMiddleware

from .compiler import CompilerService, CompilerUnavailable, DockerCompiler
from .config import settings
from .models import HealthResponse, RunRequest, RunResponse


app = FastAPI(
    title="Code Tutor API",
    description="Compiler and tutoring API for Code Tutor.",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=list(settings.allowed_origins),
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)


def get_compiler() -> CompilerService:
    return DockerCompiler(settings)


@app.get("/health", response_model=HealthResponse)
async def health(compiler: CompilerService = Depends(get_compiler)) -> HealthResponse:
    compiler_available = await run_in_threadpool(compiler.is_available)
    return HealthResponse(compiler_available=compiler_available)


@app.post("/api/run", response_model=RunResponse)
async def run_code(
    request: RunRequest,
    response: Response,
    compiler: CompilerService = Depends(get_compiler),
) -> RunResponse:
    try:
        return await run_in_threadpool(compiler.run, request.code, request.stdin)
    except CompilerUnavailable as error:
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
        return RunResponse(status="service_unavailable", stderr=str(error))
