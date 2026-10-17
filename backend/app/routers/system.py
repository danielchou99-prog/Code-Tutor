from fastapi import APIRouter, Depends
from fastapi.concurrency import run_in_threadpool

from ..auth import AuthenticatedUser, get_current_user
from ..compiler import CompilerService
from ..dependencies import get_compiler
from ..models import AuthMeResponse, HealthResponse

router = APIRouter()


@router.get("/health", response_model=HealthResponse)
async def health(compiler: CompilerService = Depends(get_compiler)) -> HealthResponse:
    compiler_available = await run_in_threadpool(compiler.is_available)
    return HealthResponse(compiler_available=compiler_available)


@router.get("/api/auth/me", response_model=AuthMeResponse)
async def auth_me(user: AuthenticatedUser = Depends(get_current_user)) -> AuthMeResponse:
    return AuthMeResponse(user_id=user.user_id, email=user.email)
