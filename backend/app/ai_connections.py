from dataclasses import dataclass
import ssl
from typing import Protocol
from urllib.parse import quote

from cryptography.fernet import Fernet, InvalidToken
import httpx
import truststore

from .auth import AuthenticatedUser


class AiConnectionError(Exception):
    """Base exception that is safe to map to a generic API response."""


class InvalidProviderKey(AiConnectionError):
    pass


class AiProviderUnavailable(AiConnectionError):
    pass


class AiProviderAccessDenied(AiConnectionError):
    pass


class AiStorageUnavailable(AiConnectionError):
    pass


def secure_http_request(
    method: str,
    url: str,
    *,
    headers: dict[str, str],
    timeout: float,
    json: dict[str, str] | None = None,
) -> httpx.Response:
    with secure_http_client(timeout) as client:
        return client.request(method, url, headers=headers, json=json)


def secure_http_client(timeout: float) -> httpx.Client:
    ssl_context = truststore.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
    return httpx.Client(verify=ssl_context, timeout=timeout)


@dataclass(frozen=True)
class ConnectionStatus:
    connected: bool
    provider: str = "groq"
    key_last_four: str | None = None
    updated_at: str | None = None


class KeyCipher(Protocol):
    def encrypt(self, value: str) -> str: ...

    def decrypt(self, value: str) -> str: ...


class ProviderKeyValidator(Protocol):
    def validate(self, api_key: str) -> None: ...


class AiConnectionStore(Protocol):
    def get(self, user: AuthenticatedUser) -> ConnectionStatus: ...

    def upsert(
        self,
        user: AuthenticatedUser,
        encrypted_key: str,
        key_last_four: str,
    ) -> ConnectionStatus: ...

    def delete(self, user: AuthenticatedUser) -> None: ...


class FernetKeyCipher:
    def __init__(self, encryption_key: str) -> None:
        try:
            self._fernet = Fernet(encryption_key.encode("ascii"))
        except (UnicodeEncodeError, ValueError) as error:
            raise ValueError("CODE_TUTOR_AI_ENCRYPTION_KEY is not a valid Fernet key.") from error

    def encrypt(self, value: str) -> str:
        return self._fernet.encrypt(value.encode("utf-8")).decode("ascii")

    def decrypt(self, value: str) -> str:
        try:
            return self._fernet.decrypt(value.encode("ascii")).decode("utf-8")
        except (InvalidToken, UnicodeError) as error:
            raise AiStorageUnavailable("The stored AI connection cannot be decrypted.") from error


class GroqKeyValidator:
    models_url = "https://api.groq.com/openai/v1/models"

    def __init__(self, timeout_seconds: float = 10) -> None:
        self.timeout_seconds = timeout_seconds

    def validate(self, api_key: str) -> None:
        try:
            response = secure_http_request(
                "GET",
                self.models_url,
                headers={"Authorization": f"Bearer {api_key}"},
                timeout=self.timeout_seconds,
            )
        except httpx.RequestError as error:
            raise AiProviderUnavailable("Groq is temporarily unavailable.") from error

        if response.status_code == 401:
            raise InvalidProviderKey("Groq rejected this API key.")
        if response.status_code == 403:
            raise AiProviderAccessDenied("Groq denied access for this network or account.")
        if response.status_code != 200:
            raise AiProviderUnavailable("Groq could not validate the API key.")


class SupabaseAiConnectionStore:
    def __init__(self, supabase_url: str, publishable_key: str, timeout_seconds: float = 10) -> None:
        self.base_url = f"{supabase_url.rstrip('/')}/rest/v1/ai_connections"
        self.publishable_key = publishable_key
        self.timeout_seconds = timeout_seconds

    def _headers(self, user: AuthenticatedUser, prefer: str | None = None) -> dict[str, str]:
        if not user.access_token:
            raise AiStorageUnavailable("The authenticated session is missing its access token.")
        headers = {
            "apikey": self.publishable_key,
            "Authorization": f"Bearer {user.access_token}",
            "Content-Type": "application/json",
        }
        if prefer:
            headers["Prefer"] = prefer
        return headers

    def get(self, user: AuthenticatedUser) -> ConnectionStatus:
        query = (
            f"?user_id=eq.{quote(user.user_id)}&provider=eq.groq"
            "&select=provider,key_last_four,updated_at&limit=1"
        )
        response = self._request("GET", f"{self.base_url}{query}", self._headers(user))
        records = response.json()
        if not isinstance(records, list) or not records:
            return ConnectionStatus(connected=False)
        record = records[0]
        return ConnectionStatus(
            connected=True,
            provider="groq",
            key_last_four=str(record.get("key_last_four", "")) or None,
            updated_at=str(record.get("updated_at", "")) or None,
        )

    def get_encrypted_key(self, user: AuthenticatedUser) -> str | None:
        query = (
            f"?user_id=eq.{quote(user.user_id)}&provider=eq.groq"
            "&select=encrypted_key&limit=1"
        )
        response = self._request("GET", f"{self.base_url}{query}", self._headers(user))
        records = response.json()
        if not isinstance(records, list) or not records:
            return None
        encrypted_key = records[0].get("encrypted_key")
        return encrypted_key if isinstance(encrypted_key, str) and encrypted_key else None

    def upsert(
        self,
        user: AuthenticatedUser,
        encrypted_key: str,
        key_last_four: str,
    ) -> ConnectionStatus:
        url = f"{self.base_url}?on_conflict=user_id,provider"
        response = self._request(
            "POST",
            url,
            self._headers(user, "resolution=merge-duplicates,return=representation"),
            json={
                "user_id": user.user_id,
                "provider": "groq",
                "encrypted_key": encrypted_key,
                "key_last_four": key_last_four,
            },
        )
        records = response.json()
        updated_at = None
        if isinstance(records, list) and records:
            updated_at = str(records[0].get("updated_at", "")) or None
        return ConnectionStatus(
            connected=True,
            provider="groq",
            key_last_four=key_last_four,
            updated_at=updated_at,
        )

    def delete(self, user: AuthenticatedUser) -> None:
        query = f"?user_id=eq.{quote(user.user_id)}&provider=eq.groq"
        self._request("DELETE", f"{self.base_url}{query}", self._headers(user))

    def _request(
        self,
        method: str,
        url: str,
        headers: dict[str, str],
        json: dict[str, str] | None = None,
    ) -> httpx.Response:
        try:
            response = secure_http_request(
                method,
                url,
                headers=headers,
                json=json,
                timeout=self.timeout_seconds,
            )
        except httpx.RequestError as error:
            raise AiStorageUnavailable("The AI connection store is unavailable.") from error
        if response.status_code >= 400:
            raise AiStorageUnavailable("The AI connection store rejected the request.")
        return response


class AiConnectionService:
    def __init__(
        self,
        store: AiConnectionStore,
        cipher: KeyCipher,
        validator: ProviderKeyValidator,
    ) -> None:
        self.store = store
        self.cipher = cipher
        self.validator = validator

    def status(self, user: AuthenticatedUser) -> ConnectionStatus:
        return self.store.get(user)

    def connect(self, user: AuthenticatedUser, api_key: str) -> ConnectionStatus:
        normalized_key = api_key.strip()
        self.validator.validate(normalized_key)
        encrypted_key = self.cipher.encrypt(normalized_key)
        return self.store.upsert(user, encrypted_key, normalized_key[-4:])

    def remove(self, user: AuthenticatedUser) -> None:
        self.store.delete(user)
