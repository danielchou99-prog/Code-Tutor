from cryptography.fernet import Fernet
from fastapi.testclient import TestClient

from app.ai_connections import (
    AiProviderUnavailable,
    AiConnectionService,
    ConnectionStatus,
    FernetKeyCipher,
    InvalidProviderKey,
    GroqKeyValidator,
)
from app.auth import AuthenticatedUser
from app.main import app, get_ai_connection_service


class FakeStore:
    def __init__(self) -> None:
        self.encrypted_key: str | None = None
        self.last_four: str | None = None
        self.deleted = False

    def get(self, user: AuthenticatedUser) -> ConnectionStatus:
        assert user.user_id == "user-123"
        return ConnectionStatus(
            connected=self.encrypted_key is not None,
            key_last_four=self.last_four,
            updated_at="2026-08-09T00:00:00+00:00" if self.encrypted_key else None,
        )

    def upsert(
        self,
        user: AuthenticatedUser,
        encrypted_key: str,
        key_last_four: str,
    ) -> ConnectionStatus:
        assert user.user_id == "user-123"
        self.encrypted_key = encrypted_key
        self.last_four = key_last_four
        return ConnectionStatus(
            connected=True,
            key_last_four=key_last_four,
            updated_at="2026-08-09T00:00:00+00:00",
        )

    def delete(self, user: AuthenticatedUser) -> None:
        assert user.user_id == "user-123"
        self.encrypted_key = None
        self.last_four = None
        self.deleted = True


class AcceptingValidator:
    def validate(self, api_key: str) -> None:
        assert api_key == "gsk_test-secret-1234"


class RejectingValidator:
    def validate(self, api_key: str) -> None:
        raise InvalidProviderKey("rejected")


class FakeTokenVerifier:
    def verify(self, token: str) -> AuthenticatedUser:
        assert token == "valid-test-token"
        return AuthenticatedUser(
            user_id="user-123",
            email="student@example.com",
            access_token=token,
        )


def make_service(validator: object | None = None) -> tuple[AiConnectionService, FakeStore, FernetKeyCipher]:
    store = FakeStore()
    cipher = FernetKeyCipher(Fernet.generate_key().decode("ascii"))
    service = AiConnectionService(
        store=store,
        cipher=cipher,
        validator=validator or AcceptingValidator(),  # type: ignore[arg-type]
    )
    return service, store, cipher


def test_service_encrypts_key_and_only_keeps_last_four() -> None:
    service, store, cipher = make_service()
    user = AuthenticatedUser(user_id="user-123", access_token="token")

    status = service.connect(user, "  gsk_test-secret-1234  ")

    assert status.connected is True
    assert status.key_last_four == "1234"
    assert store.encrypted_key is not None
    assert "gsk_test-secret" not in store.encrypted_key
    assert cipher.decrypt(store.encrypted_key) == "gsk_test-secret-1234"


def test_service_does_not_store_rejected_key() -> None:
    service, store, _cipher = make_service(RejectingValidator())
    user = AuthenticatedUser(user_id="user-123", access_token="token")

    try:
        service.connect(user, "gsk_test-secret-1234")
    except InvalidProviderKey:
        pass
    else:
        raise AssertionError("Expected InvalidProviderKey")

    assert store.encrypted_key is None


def test_groq_validator_maps_rejected_key_without_exposing_it(monkeypatch) -> None:
    class RejectedResponse:
        status_code = 401

    monkeypatch.setattr("app.ai_connections.secure_http_request", lambda *args, **kwargs: RejectedResponse())

    try:
        GroqKeyValidator().validate("gsk_private-value")
    except InvalidProviderKey as error:
        assert "gsk_private-value" not in str(error)
    else:
        raise AssertionError("Expected InvalidProviderKey")


def test_groq_validator_maps_provider_failure(monkeypatch) -> None:
    class FailedResponse:
        status_code = 500

    monkeypatch.setattr("app.ai_connections.secure_http_request", lambda *args, **kwargs: FailedResponse())

    try:
        GroqKeyValidator().validate("gsk_private-value")
    except AiProviderUnavailable as error:
        assert "gsk_private-value" not in str(error)
    else:
        raise AssertionError("Expected AiProviderUnavailable")


def test_ai_connection_endpoints_require_authentication() -> None:
    client = TestClient(app)
    response = client.get("/api/ai/connection")
    assert response.status_code == 401


def test_ai_connection_endpoints_connect_status_and_remove() -> None:
    service, store, _cipher = make_service()
    previous_verifier = app.state.token_verifier
    app.state.token_verifier = FakeTokenVerifier()
    app.dependency_overrides[get_ai_connection_service] = lambda: service
    client = TestClient(app)
    headers = {"Authorization": "Bearer valid-test-token"}
    try:
        initial = client.get("/api/ai/connection", headers=headers)
        connected = client.put(
            "/api/ai/connection",
            headers=headers,
            json={"api_key": "gsk_test-secret-1234"},
        )
        removed = client.delete("/api/ai/connection", headers=headers)
    finally:
        app.dependency_overrides.clear()
        app.state.token_verifier = previous_verifier

    assert initial.json()["connected"] is False
    assert connected.status_code == 200
    assert connected.json()["key_last_four"] == "1234"
    assert "gsk_test-secret" not in connected.text
    assert removed.json() == {
        "connected": False,
        "provider": "groq",
        "key_last_four": None,
        "updated_at": None,
    }
    assert store.deleted is True


def test_ai_connection_endpoint_maps_rejected_key_to_safe_error() -> None:
    service, _store, _cipher = make_service(RejectingValidator())
    previous_verifier = app.state.token_verifier
    app.state.token_verifier = FakeTokenVerifier()
    app.dependency_overrides[get_ai_connection_service] = lambda: service
    client = TestClient(app)
    try:
        response = client.put(
            "/api/ai/connection",
            headers={"Authorization": "Bearer valid-test-token"},
            json={"api_key": "gsk_test-secret-1234"},
        )
    finally:
        app.dependency_overrides.clear()
        app.state.token_verifier = previous_verifier

    assert response.status_code == 400
    assert "gsk_test-secret-1234" not in response.text
