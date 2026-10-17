"""Builds the long-lived services once and attaches them to `app.state`."""

from __future__ import annotations

from fastapi import FastAPI

from .ai_connections import (
    AiConnectionService,
    FernetKeyCipher,
    GroqKeyValidator,
    SupabaseAiConnectionStore,
)
from .ai_tutor import AiTutorService, GroqTutorProvider
from .auth import SupabaseTokenVerifier
from .config import settings
from .judge import SupabaseJudgeStore
from .problem_admin import SupabaseProblemAdminStore
from .problem_translation import GroqProblemTranslationProvider, ProblemTranslationService


def _ai_parts() -> tuple[SupabaseAiConnectionStore, FernetKeyCipher] | None:
    if not (
        settings.supabase_url
        and settings.supabase_publishable_key
        and settings.ai_encryption_key
    ):
        return None
    try:
        cipher = FernetKeyCipher(settings.ai_encryption_key)
    except ValueError:
        return None
    store = SupabaseAiConnectionStore(
        settings.supabase_url,
        settings.supabase_publishable_key,
        settings.ai_request_timeout_seconds,
    )
    return store, cipher


def create_ai_connection_service() -> AiConnectionService | None:
    parts = _ai_parts()
    if parts is None:
        return None
    store, cipher = parts
    return AiConnectionService(
        store=store,
        cipher=cipher,
        validator=GroqKeyValidator(settings.ai_request_timeout_seconds),
    )


def create_ai_tutor_service() -> AiTutorService | None:
    parts = _ai_parts()
    if parts is None:
        return None
    store, cipher = parts
    return AiTutorService(
        store=store,
        cipher=cipher,
        provider=GroqTutorProvider(
            model=settings.ai_model,
            timeout_seconds=settings.ai_tutor_timeout_seconds,
            max_completion_tokens=settings.ai_max_completion_tokens,
        ),
    )


def create_problem_translation_service() -> ProblemTranslationService | None:
    parts = _ai_parts()
    if parts is None:
        return None
    store, cipher = parts
    return ProblemTranslationService(
        store=store,
        cipher=cipher,
        provider=GroqProblemTranslationProvider(
            model=settings.ai_model,
            timeout_seconds=settings.ai_tutor_timeout_seconds,
        ),
    )


def configure_app_state(app: FastAPI) -> None:
    has_server_key = bool(settings.supabase_url and settings.supabase_server_key)
    app.state.token_verifier = (
        SupabaseTokenVerifier(settings.supabase_url) if settings.supabase_url else None
    )
    app.state.judge_store = (
        SupabaseJudgeStore(
            settings.supabase_url,
            settings.supabase_server_key,
            settings.ai_request_timeout_seconds,
        )
        if has_server_key
        else None
    )
    app.state.problem_admin_store = (
        SupabaseProblemAdminStore(
            settings.supabase_url,
            settings.supabase_server_key,
            settings.ai_request_timeout_seconds,
        )
        if has_server_key
        else None
    )
    app.state.ai_connection_service = create_ai_connection_service()
    app.state.ai_tutor_service = create_ai_tutor_service()
    app.state.problem_translation_service = create_problem_translation_service()
