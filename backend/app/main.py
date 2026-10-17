from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import settings
from .container import configure_app_state
from .routers import admin, ai, judge, run, system

# Re-exported so tests and scripts can keep importing these from `app.main`.
from .auth import get_current_user  # noqa: F401
from .dependencies import (  # noqa: F401
    get_ai_connection_service,
    get_ai_hidden_test_generation_service,
    get_ai_tutor_service,
    get_compiler,
    get_execution_gate,
    get_interactive_compiler,
    get_judge_rate_limiter,
    get_judge_store,
    get_judge_worker,
    get_problem_admin_store,
    get_problem_translation_service,
    get_rate_limiter,
    is_problem_admin,
    require_problem_admin,
)

app = FastAPI(
    title="Code Tutor API",
    description="Compiler and tutoring API for Code Tutor.",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=list(settings.allowed_origins),
    allow_credentials=False,
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["Content-Type", "Authorization"],
    expose_headers=["Retry-After"],
)

configure_app_state(app)

for module in (system, admin, ai, run, judge):
    app.include_router(module.router)
