import pytest

from app.config import DEFAULT_ALLOWED_ORIGINS, Settings


def test_allowed_origins_use_safe_local_defaults(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("CODE_TUTOR_ALLOWED_ORIGINS", raising=False)

    assert Settings().allowed_origins == DEFAULT_ALLOWED_ORIGINS


def test_allowed_origins_accept_explicit_lan_origin(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv(
        "CODE_TUTOR_ALLOWED_ORIGINS",
        "http://localhost:3000, http://192.168.1.131:3000/",
    )

    assert Settings().allowed_origins == (
        "http://localhost:3000",
        "http://192.168.1.131:3000",
    )


def test_allowed_origins_reject_wildcard(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("CODE_TUTOR_ALLOWED_ORIGINS", "*")

    with pytest.raises(ValueError, match="explicit HTTP"):
        Settings()
