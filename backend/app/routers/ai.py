from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import StreamingResponse

from ..ai_connections import (
    AiConnectionService,
    AiProviderAccessDenied,
    AiProviderUnavailable,
    AiStorageUnavailable,
    InvalidProviderKey,
)
from ..ai_tutor import (
    AiConnectionRequired,
    AiProviderRateLimited,
    AiTutorBusy,
    AiTutorService,
    TutorPrompt,
)
from ..auth import AuthenticatedUser, get_current_user
from ..dependencies import get_ai_connection_service, get_ai_tutor_service
from ..models import AiConnectionRequest, AiConnectionStatusResponse, AiTutorRequest

router = APIRouter()


def ai_connection_response(connection: object) -> AiConnectionStatusResponse:
    return AiConnectionStatusResponse(
        connected=bool(getattr(connection, "connected")),
        provider="groq",
        key_last_four=getattr(connection, "key_last_four"),
        updated_at=getattr(connection, "updated_at"),
    )


@router.get("/api/ai/connection", response_model=AiConnectionStatusResponse)
async def get_ai_connection(
    user: AuthenticatedUser = Depends(get_current_user),
    service: AiConnectionService = Depends(get_ai_connection_service),
) -> AiConnectionStatusResponse:
    try:
        connection = await run_in_threadpool(service.status, user)
    except AiStorageUnavailable as error:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="AI connection storage is temporarily unavailable.",
        ) from error
    return ai_connection_response(connection)


@router.put("/api/ai/connection", response_model=AiConnectionStatusResponse)
async def connect_ai(
    payload: AiConnectionRequest,
    user: AuthenticatedUser = Depends(get_current_user),
    service: AiConnectionService = Depends(get_ai_connection_service),
) -> AiConnectionStatusResponse:
    try:
        connection = await run_in_threadpool(service.connect, user, payload.api_key)
    except InvalidProviderKey as error:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Groq rejected this API key. Check the key and try again.",
        ) from error
    except AiProviderAccessDenied as error:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Groq denied access from this network or account. Check your network and Groq permissions.",
        ) from error
    except AiProviderUnavailable as error:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Groq is temporarily unavailable. Try again later.",
        ) from error
    except AiStorageUnavailable as error:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="AI connection storage is temporarily unavailable.",
        ) from error
    return ai_connection_response(connection)


@router.delete("/api/ai/connection", response_model=AiConnectionStatusResponse)
async def remove_ai_connection(
    user: AuthenticatedUser = Depends(get_current_user),
    service: AiConnectionService = Depends(get_ai_connection_service),
) -> AiConnectionStatusResponse:
    try:
        await run_in_threadpool(service.remove, user)
    except AiStorageUnavailable as error:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="AI connection storage is temporarily unavailable.",
        ) from error
    return AiConnectionStatusResponse(connected=False)


@router.post("/api/ai/tutor")
async def start_ai_tutor(
    payload: AiTutorRequest,
    user: AuthenticatedUser = Depends(get_current_user),
    service: AiTutorService = Depends(get_ai_tutor_service),
) -> StreamingResponse:
    if payload.action == "ask" and not payload.question.strip():
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Enter a question before sending it to AI Tutor.",
        )
    prompt = TutorPrompt(
        action=payload.action,
        code=payload.code,
        error_output=payload.error_output,
        question=payload.question.strip(),
        language=payload.language,
        programming_language=payload.programming_language,
        judge_summary=payload.judge_summary.model_dump() if payload.judge_summary else None,
    )
    try:
        stream = await run_in_threadpool(service.start, user, prompt)
    except AiConnectionRequired as error:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Connect Groq in Settings before using AI Tutor.",
        ) from error
    except AiTutorBusy as error:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Another AI Tutor response is already in progress.",
        ) from error
    except InvalidProviderKey as error:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="The saved Groq API key is no longer valid. Reconnect it in Settings.",
        ) from error
    except AiProviderAccessDenied as error:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Groq denied access from this network or account.",
        ) from error
    except AiProviderRateLimited as error:
        headers = (
            {"Retry-After": str(error.retry_after_seconds)}
            if error.retry_after_seconds is not None
            else None
        )
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Your Groq free-plan limit has been reached. Try again later.",
            headers=headers,
        ) from error
    except (AiProviderUnavailable, AiStorageUnavailable) as error:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="AI Tutor is temporarily unavailable. Try again later.",
        ) from error

    return StreamingResponse(
        stream,
        media_type="text/plain; charset=utf-8",
        headers={
            "Cache-Control": "no-store",
            "X-Content-Type-Options": "nosniff",
        },
    )
