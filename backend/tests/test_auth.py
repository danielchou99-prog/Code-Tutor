from datetime import datetime, timedelta, timezone

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa

from app.auth import SupabaseTokenVerifier


class FakeSigningKey:
    def __init__(self, key: object) -> None:
        self.key = key


class FakeJWKClient:
    def __init__(self, key: object) -> None:
        self.key = key

    def get_signing_key_from_jwt(self, token: str) -> FakeSigningKey:
        assert token
        return FakeSigningKey(self.key)


def make_token(audience: str = "authenticated") -> tuple[str, object]:
    private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    now = datetime.now(timezone.utc)
    token = jwt.encode(
        {
            "sub": "user-123",
            "email": "student@example.com",
            "aud": audience,
            "iss": "https://project.supabase.co/auth/v1",
            "iat": now,
            "exp": now + timedelta(minutes=5),
        },
        private_key,
        algorithm="RS256",
        headers={"kid": "test-key"},
    )
    return token, private_key.public_key()


def test_supabase_verifier_accepts_valid_signed_token() -> None:
    token, public_key = make_token()
    verifier = SupabaseTokenVerifier("https://project.supabase.co")
    verifier.jwks_client = FakeJWKClient(public_key)  # type: ignore[assignment]

    user = verifier.verify(token)

    assert user.user_id == "user-123"
    assert user.email == "student@example.com"


def test_supabase_verifier_rejects_wrong_audience() -> None:
    token, public_key = make_token(audience="anonymous")
    verifier = SupabaseTokenVerifier("https://project.supabase.co")
    verifier.jwks_client = FakeJWKClient(public_key)  # type: ignore[assignment]

    with pytest.raises(jwt.InvalidAudienceError):
        verifier.verify(token)
