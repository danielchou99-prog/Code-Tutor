"""One place that talks to Supabase's PostgREST API with the server key."""

from __future__ import annotations

from collections.abc import Callable
from typing import Any

import httpx

from .ai_connections import secure_http_request

RejectionHandler = Callable[[httpx.Response], None]


class SupabaseRestClient:
    """Sends server-key REST requests and converts failures to a caller-chosen error.

    `error_type` is raised when Supabase cannot be reached or rejects a request.
    `on_rejection` may raise a more specific error first (for example to explain
    which migration is missing); if it returns, the generic rejection is raised.
    """

    def __init__(
        self,
        supabase_url: str,
        server_key: str,
        timeout_seconds: float = 10,
        *,
        error_type: type[Exception],
        unavailable_message: str,
        rejected_message: str,
        on_rejection: RejectionHandler | None = None,
    ) -> None:
        self.rest_url = f"{supabase_url.rstrip('/')}/rest/v1"
        self.server_key = server_key
        self.timeout_seconds = timeout_seconds
        self._error_type = error_type
        self._unavailable_message = unavailable_message
        self._rejected_message = rejected_message
        self._on_rejection = on_rejection

    def headers(self, prefer: str | None = None) -> dict[str, str]:
        headers = {"apikey": self.server_key, "Content-Type": "application/json"}
        # New-style secret keys are not JWTs, so they must not be sent as a Bearer token.
        if not self.server_key.startswith("sb_secret_"):
            headers["Authorization"] = f"Bearer {self.server_key}"
        if prefer:
            headers["Prefer"] = prefer
        return headers

    def request(
        self,
        method: str,
        path: str,
        *,
        json: Any = None,
        prefer: str | None = None,
    ) -> httpx.Response:
        try:
            response = secure_http_request(
                method,
                f"{self.rest_url}/{path}",
                headers=self.headers(prefer),
                json=json,
                timeout=self.timeout_seconds,
            )
        except httpx.RequestError as error:
            raise self._error_type(self._unavailable_message) from error
        if response.status_code >= 400:
            if self._on_rejection is not None:
                self._on_rejection(response)
            raise self._error_type(self._rejected_message)
        return response
