"""Security primitives.

Two token paths, per docs/auth.md:

1. **Local fallback auth** (no AWS): the backend issues HS256 JWTs signed with
   `SECRET_KEY` for signup/login/email-verification/refresh. `users.password_hash`
   exists for exactly this non-Cognito path.
2. **Cognito path**: the backend never manages credentials; it verifies Cognito ID
   tokens (RS256) against the pool's public JWKS, cached and refreshed periodically.

In production (Cognito configured) the frontend calls Cognito directly; the local
fallback remains available for local development and tests.
"""

import logging
import time
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

import bcrypt
import httpx
import jwt
from jwt.algorithms import RSAAlgorithm

from app.core.config import Settings, get_settings
from app.core.errors import AppError

logger = logging.getLogger("ai5k")

# Token `type` claim values
TYPE_ACCESS = "access"
TYPE_REFRESH = "refresh"
TYPE_EMAIL_VERIFICATION = "email_verification"


class TokenVerificationError(AppError):
    def __init__(self, message: str = "Invalid or expired token.") -> None:
        super().__init__(401, "invalid_token", message)


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, password_hash: str | None) -> bool:
    if not password_hash:
        return False
    try:
        return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("utf-8"))
    except ValueError:
        return False


class TokenManager:
    """Issues local JWTs and verifies both local and Cognito tokens."""

    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self._jwks: dict[str, Any] | None = None
        self._jwks_fetched_at: float = 0.0

    # ---------- local token issuance ----------

    def _local_payload(self, token_type: str, sub: str, ttl_seconds: int, **extra: Any) -> dict[str, Any]:
        now = datetime.now(timezone.utc)
        return {
            "sub": sub,
            "type": token_type,
            "iss": self.settings.local_token_issuer,
            "aud": self.settings.local_token_audience,
            "iat": now,
            "exp": now + timedelta(seconds=ttl_seconds),
            **extra,
        }

    def create_access_token(self, user_id: uuid.UUID) -> str:
        return jwt.encode(
            self._local_payload(TYPE_ACCESS, str(user_id), self.settings.access_token_ttl_seconds),
            self.settings.secret_key,
            algorithm="HS256",
        )

    def create_refresh_token(self, user_id: uuid.UUID) -> str:
        return jwt.encode(
            self._local_payload(TYPE_REFRESH, str(user_id), self.settings.refresh_token_ttl_seconds),
            self.settings.secret_key,
            algorithm="HS256",
        )

    def create_email_verification_token(self, user_id: uuid.UUID) -> str:
        return jwt.encode(
            self._local_payload(
                TYPE_EMAIL_VERIFICATION, str(user_id), self.settings.email_verification_ttl_seconds
            ),
            self.settings.secret_key,
            algorithm="HS256",
        )

    # ---------- Cognito JWKS ----------

    @property
    def cognito_issuer(self) -> str | None:
        if not self.settings.cognito_configured:
            return None
        return (
            f"https://cognito-idp.{self.settings.cognito_region}.amazonaws.com/"
            f"{self.settings.cognito_user_pool_id}"
        )

    async def warmup(self) -> None:
        """Best-effort JWKS warm-up at startup when Cognito is configured."""
        if self.cognito_issuer:
            try:
                await self._fetch_jwks()
            except Exception:  # pragma: no cover - network dependent
                logger.warning("cognito_jwks_warmup_failed")

    async def _fetch_jwks(self) -> dict[str, Any]:
        now = time.monotonic()
        if self._jwks and now - self._jwks_fetched_at < self.settings.cognito_jwks_cache_ttl_seconds:
            return self._jwks
        url = f"{self.cognito_issuer}/.well-known/jwks.json"
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(url)
            resp.raise_for_status()
            self._jwks = resp.json()
            self._jwks_fetched_at = now
        return self._jwks

    def _cognito_public_key(self, jwks: dict[str, Any], kid: str) -> Any:
        for jwk in jwks.get("keys", []):
            if jwk.get("kid") == kid:
                return RSAAlgorithm.from_jwk(jwk)
        return None

    # ---------- verification ----------

    async def verify(self, token: str) -> dict[str, Any]:
        """Verify a bearer token and return its claims.

        Dispatches on issuer: Cognito pool issuer -> RS256 via cached JWKS;
        otherwise local HS256.
        """
        try:
            unverified = jwt.decode(token, options={"verify_signature": False, "verify_exp": False})
        except jwt.PyJWTError:
            raise TokenVerificationError() from None

        issuer = unverified.get("iss")
        try:
            if issuer == self.cognito_issuer:
                # `kid` lives in the JWT header, not the payload claims.
                kid = jwt.get_unverified_header(token).get("kid", "")
                jwks = await self._fetch_jwks()
                key = self._cognito_public_key(jwks, kid)
                if key is None:
                    raise TokenVerificationError()
                options: dict[str, Any] = {}
                if not self.settings.cognito_client_id:
                    options["verify_aud"] = False
                return jwt.decode(
                    token,
                    key,
                    algorithms=["RS256"],
                    audience=self.settings.cognito_client_id or None,
                    options=options,
                )
            # Local path
            return jwt.decode(
                token,
                self.settings.secret_key,
                algorithms=["HS256"],
                audience=self.settings.local_token_audience,
                options={"require": ["exp", "iat", "iss", "aud"]},
            )
        except jwt.ExpiredSignatureError:
            raise TokenVerificationError("Token has expired.") from None
        except (jwt.PyJWTError, KeyError, TypeError, ValueError):
            # KeyError/TypeError guard against a malformed JWKS entry (from_jwk).
            raise TokenVerificationError() from None


_token_manager: TokenManager | None = None


def get_token_manager() -> TokenManager:
    global _token_manager
    if _token_manager is None:
        _token_manager = TokenManager(get_settings())
    return _token_manager
