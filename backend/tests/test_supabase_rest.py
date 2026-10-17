import httpx
import pytest

from app.supabase_rest import SupabaseRestClient


class Boom(RuntimeError):
    pass


class Specific(RuntimeError):
    pass


def make_client(on_rejection=None, key: str = "sb_secret_test") -> SupabaseRestClient:
    return SupabaseRestClient(
        "https://project.supabase.co/",
        key,
        error_type=Boom,
        unavailable_message="down",
        rejected_message="rejected",
        on_rejection=on_rejection,
    )


class FakeResponse:
    def __init__(self, status_code: int) -> None:
        self.status_code = status_code


def test_secret_key_is_not_sent_as_bearer_token() -> None:
    headers = make_client().headers(prefer="return=minimal")
    assert headers["apikey"] == "sb_secret_test"
    assert "Authorization" not in headers
    assert headers["Prefer"] == "return=minimal"


def test_legacy_jwt_key_is_sent_as_bearer_token() -> None:
    assert make_client(key="legacy.jwt.key").headers()["Authorization"] == "Bearer legacy.jwt.key"


def test_request_builds_rest_url_and_returns_success(monkeypatch) -> None:
    seen = {}

    def fake(method, url, **kwargs):
        seen.update(method=method, url=url, **kwargs)
        return FakeResponse(200)

    monkeypatch.setattr("app.supabase_rest.secure_http_request", fake)
    response = make_client().request("GET", "problems?select=id")
    assert response.status_code == 200
    assert seen["url"] == "https://project.supabase.co/rest/v1/problems?select=id"


def test_network_failure_raises_the_configured_error(monkeypatch) -> None:
    def fail(*args, **kwargs):
        raise httpx.ConnectError("nope")

    monkeypatch.setattr("app.supabase_rest.secure_http_request", fail)
    with pytest.raises(Boom, match="down"):
        make_client().request("GET", "problems")


def test_rejection_uses_generic_message_unless_handler_raises(monkeypatch) -> None:
    monkeypatch.setattr("app.supabase_rest.secure_http_request", lambda *a, **k: FakeResponse(400))
    with pytest.raises(Boom, match="rejected"):
        make_client().request("GET", "problems")

    def explain(response) -> None:
        raise Specific("missing migration")

    with pytest.raises(Specific):
        make_client(on_rejection=explain).request("GET", "problems")
