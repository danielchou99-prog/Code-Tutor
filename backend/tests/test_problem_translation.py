import pytest
from pydantic import ValidationError

from app.auth import AuthenticatedUser
from app.problem_translation import (
    ProblemTranslationInvalidResponse,
    ProblemTranslationRequest,
    ProblemTranslationService,
)


class FakeStore:
    def __init__(self, encrypted_key: str | None = "encrypted") -> None:
        self.encrypted_key = encrypted_key

    def get_encrypted_key(self, user: AuthenticatedUser) -> str | None:
        assert user.user_id == "admin-1"
        return self.encrypted_key


class FakeCipher:
    def decrypt(self, value: str) -> str:
        assert value == "encrypted"
        return "private-api-key"

    def encrypt(self, value: str) -> str:
        raise AssertionError("Translation must never encrypt or change the key.")


class FakeProvider:
    def __init__(self, missing: bool = False) -> None:
        self.missing = missing

    def translate(self, api_key: str, request: ProblemTranslationRequest) -> dict[str, str]:
        assert api_key == "private-api-key"
        result = {item.id: f"English: {item.text}" for item in request.items}
        if self.missing:
            result.pop(next(iter(result)))
        return result


admin = AuthenticatedUser(user_id="admin-1", email="admin@example.com")


def test_translation_preserves_ids_and_order() -> None:
    service = ProblemTranslationService(FakeStore(), FakeCipher(), FakeProvider())
    request = ProblemTranslationRequest.model_validate(
        {"items": [{"id": "title", "text": "矩陣總和"}, {"id": "constraint.0", "text": "無額外限制"}]}
    )

    response = service.translate(admin, request)

    assert [item.id for item in response.items] == ["title", "constraint.0"]
    assert response.items[0].text == "English: 矩陣總和"


def test_incomplete_translation_is_rejected() -> None:
    service = ProblemTranslationService(FakeStore(), FakeCipher(), FakeProvider(missing=True))
    request = ProblemTranslationRequest.model_validate(
        {"items": [{"id": "title", "text": "矩陣總和"}]}
    )

    with pytest.raises(ProblemTranslationInvalidResponse, match="incomplete"):
        service.translate(admin, request)


def test_duplicate_translation_ids_are_rejected() -> None:
    with pytest.raises(ValidationError, match="unique"):
        ProblemTranslationRequest.model_validate(
            {"items": [{"id": "title", "text": "甲"}, {"id": "title", "text": "乙"}]}
        )
