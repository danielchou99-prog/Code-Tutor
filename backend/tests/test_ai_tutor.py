import httpx
from fastapi.testclient import TestClient

from app.ai_tutor import (
    AiConnectionRequired,
    AiProviderRateLimited,
    AiTutorBusy,
    AiTutorService,
    GroqTutorProvider,
    TutorPrompt,
    build_messages,
)
from app.auth import AuthenticatedUser
from app.main import app, get_ai_tutor_service


class FakeTokenVerifier:
    def verify(self, token: str) -> AuthenticatedUser:
        assert token == "valid-test-token"
        return AuthenticatedUser(
            user_id="user-123",
            email="student@example.com",
            access_token=token,
        )


class FakeKeyStore:
    def __init__(self, encrypted_key: str | None = "encrypted") -> None:
        self.encrypted_key = encrypted_key

    def get_encrypted_key(self, user: AuthenticatedUser) -> str | None:
        assert user.user_id == "user-123"
        return self.encrypted_key


class FakeCipher:
    def decrypt(self, value: str) -> str:
        assert value == "encrypted"
        return "gsk_private-value"


class FakeProvider:
    def __init__(self) -> None:
        self.received_key: str | None = None
        self.received_messages: list[dict[str, str]] | None = None

    def start_stream(self, api_key: str, messages: list[dict[str, str]]):
        self.received_key = api_key
        self.received_messages = messages
        return iter(["第一段", "第二段"])


class FakeTutorEndpointService:
    def start(self, user: AuthenticatedUser, prompt: TutorPrompt):
        assert user.user_id == "user-123"
        assert prompt.action == "analyze"
        return iter(["Hello", " tutor"])


class MissingConnectionService:
    def start(self, user: AuthenticatedUser, prompt: TutorPrompt):
        raise AiConnectionRequired("missing")


def sample_prompt(action: str = "analyze") -> TutorPrompt:
    return TutorPrompt(
        action=action,
        code="int main() { return 0; }",
        error_output="",
        question="",
        language="zh-Hant",
    )


def test_service_decrypts_key_only_on_backend_and_streams() -> None:
    provider = FakeProvider()
    service = AiTutorService(FakeKeyStore(), FakeCipher(), provider)
    user = AuthenticatedUser(user_id="user-123", access_token="token")

    chunks = list(service.start(user, sample_prompt()))

    assert chunks == ["第一段", "第二段"]
    assert provider.received_key == "gsk_private-value"
    assert provider.received_messages is not None
    assert "gsk_private-value" not in repr(provider.received_messages)


def test_service_requires_saved_connection() -> None:
    service = AiTutorService(FakeKeyStore(None), FakeCipher(), FakeProvider())
    user = AuthenticatedUser(user_id="user-123", access_token="token")

    try:
        service.start(user, sample_prompt())
    except AiConnectionRequired:
        pass
    else:
        raise AssertionError("Expected AiConnectionRequired")


def test_service_allows_only_one_active_stream_per_user() -> None:
    service = AiTutorService(FakeKeyStore(), FakeCipher(), FakeProvider())
    user = AuthenticatedUser(user_id="user-123", access_token="token")
    first_stream = service.start(user, sample_prompt())

    try:
        service.start(user, sample_prompt())
    except AiTutorBusy:
        pass
    else:
        raise AssertionError("Expected AiTutorBusy")

    assert list(first_stream) == ["第一段", "第二段"]
    assert list(service.start(user, sample_prompt())) == ["第一段", "第二段"]


def test_hint_prompt_resists_code_instructions_and_avoids_full_solution() -> None:
    prompt = sample_prompt("hint")
    messages = build_messages(prompt)

    assert "Traditional Chinese" in messages[0]["content"]
    assert "Do not reveal a complete solution" in messages[0]["content"]
    assert "untrusted learner data" in messages[0]["content"]
    assert "<CODE>" in messages[1]["content"]


def test_groq_provider_parses_stream_chunks(monkeypatch) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.headers["Authorization"] == "Bearer gsk_private-value"
        return httpx.Response(
            200,
            headers={"Content-Type": "text/event-stream"},
            content=(
                b'data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n'
                b'data: {"choices":[{"delta":{"content":" world"}}]}\n\n'
                b"data: [DONE]\n\n"
            ),
        )

    client = httpx.Client(transport=httpx.MockTransport(handler))
    monkeypatch.setattr("app.ai_tutor.secure_http_client", lambda timeout: client)

    chunks = list(GroqTutorProvider().start_stream("gsk_private-value", []))

    assert chunks == ["Hello", " world"]


def test_groq_provider_maps_rate_limit_without_exposing_key(monkeypatch) -> None:
    client = httpx.Client(
        transport=httpx.MockTransport(
            lambda request: httpx.Response(429, headers={"Retry-After": "7"})
        )
    )
    monkeypatch.setattr("app.ai_tutor.secure_http_client", lambda timeout: client)

    try:
        GroqTutorProvider().start_stream("gsk_private-value", [])
    except AiProviderRateLimited as error:
        assert error.retry_after_seconds == 7
        assert "gsk_private-value" not in str(error)
    else:
        raise AssertionError("Expected AiProviderRateLimited")


def test_ai_tutor_endpoint_requires_authentication() -> None:
    response = TestClient(app).post(
        "/api/ai/tutor",
        json={"action": "analyze", "code": "", "language": "en"},
    )
    assert response.status_code == 401


def test_ai_tutor_endpoint_streams_authenticated_response() -> None:
    previous_verifier = app.state.token_verifier
    app.state.token_verifier = FakeTokenVerifier()
    app.dependency_overrides[get_ai_tutor_service] = lambda: FakeTutorEndpointService()
    client = TestClient(app)
    try:
        response = client.post(
            "/api/ai/tutor",
            headers={"Authorization": "Bearer valid-test-token"},
            json={"action": "analyze", "code": "int main(){}", "language": "en"},
        )
    finally:
        app.dependency_overrides.clear()
        app.state.token_verifier = previous_verifier

    assert response.status_code == 200
    assert response.text == "Hello tutor"
    assert response.headers["cache-control"] == "no-store"


def test_ai_tutor_endpoint_explains_missing_connection() -> None:
    previous_verifier = app.state.token_verifier
    app.state.token_verifier = FakeTokenVerifier()
    app.dependency_overrides[get_ai_tutor_service] = lambda: MissingConnectionService()
    client = TestClient(app)
    try:
        response = client.post(
            "/api/ai/tutor",
            headers={"Authorization": "Bearer valid-test-token"},
            json={"action": "analyze", "code": "", "language": "en"},
        )
    finally:
        app.dependency_overrides.clear()
        app.state.token_verifier = previous_verifier

    assert response.status_code == 409
    assert "Connect Groq" in response.text
