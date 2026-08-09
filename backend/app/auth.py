from dataclasses import dataclass
from typing import Any, Protocol

import jwt
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jwt import PyJWKClient


@dataclass(frozen=True)
class AuthenticatedUser:
    user_id: str
    email: str | None = None


class TokenVerifier(Protocol):
    def verify(self, token: str) -> AuthenticatedUser: ...


class SupabaseTokenVerifier:
    def __init__(self, supabase_url: str) -> None:
        self.issuer = f"{supabase_url.rstrip('/')}/auth/v1"
        self.jwks_client = PyJWKClient(f"{self.issuer}/.well-known/jwks.json")

    def verify(self, token: str) -> AuthenticatedUser:
        signing_key = self.jwks_client.get_signing_key_from_jwt(token)
        claims: dict[str, Any] = jwt.decode(
            token,
            signing_key.key,
            algorithms=["ES256", "RS256"],
            audience="authenticated",
            issuer=self.issuer,
            options={"require": ["exp", "iat", "sub", "aud", "iss"]},
        )
        return AuthenticatedUser(
            user_id=str(claims["sub"]),
            email=claims.get("email") if isinstance(claims.get("email"), str) else None,
        )


bearer_scheme = HTTPBearer(auto_error=False)


def get_current_user(
    request: Request,
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
) -> AuthenticatedUser:
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication is required.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    verifier: TokenVerifier | None = getattr(request.app.state, "token_verifier", None)
    if verifier is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Supabase authentication is not configured.",
        )

    try:
        return verifier.verify(credentials.credentials)
    except jwt.PyJWTError as error:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="The authentication token is invalid or expired.",
            headers={"WWW-Authenticate": "Bearer"},
        ) from error
    except Exception as error:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="The authentication provider is temporarily unavailable.",
        ) from error
