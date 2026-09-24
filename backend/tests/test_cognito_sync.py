"""Cognito path tests (docs/auth.md flow steps 4-5).

Simulates a real Cognito ID token: signed RS256 by a key whose public part is served
from the pool's JWKS endpoint. The backend must verify the signature, resolve by
`cognito_sub`, and sync-create the user on first authenticated call.
"""

import base64
import time

import jwt
from cryptography.hazmat.primitives.asymmetric import rsa

from app.core.config import get_settings
from app.core.security import get_token_manager

COGNITO_REGION = "us-east-1"
COGNITO_POOL_ID = "us-east-1_testpool"
COGNITO_CLIENT_ID = "test-client-id"
COGNITO_ISSUER = f"https://cognito-idp.{COGNITO_REGION}.amazonaws.com/{COGNITO_POOL_ID}"


def _b64url(data: int) -> str:
    length = (data.bit_length() + 7) // 8
    return base64.urlsafe_b64encode(data.to_bytes(length, "big")).rstrip(b"=").decode("ascii")


def _make_jwks(public_key, kid: str) -> dict:
    pub = public_key.public_numbers()
    return {
        "keys": [
            {
                "kty": "RSA",
                "use": "sig",
                "alg": "RS256",
                "kid": kid,
                "n": _b64url(pub.n),
                "e": _b64url(pub.e),
            }
        ]
    }


def _make_id_token(private_key, kid: str, *, email: str, sub: str, name: str) -> str:
    now = int(time.time())
    return jwt.encode(
        {
            "iss": COGNITO_ISSUER,
            "aud": COGNITO_CLIENT_ID,
            "sub": sub,
            "email": email,
            "name": name,
            "iat": now,
            "exp": now + 3600,
        },
        private_key,
        algorithm="RS256",
        headers={"kid": kid},
    )


def _enable_cognito(monkeypatch) -> None:
    """Point the cached Settings instance at a fake Cognito pool.

    `get_settings()` is lru_cached, so we must patch the *instance* attributes
    (patching the class would be shadowed by the instance's own field values).
    The TokenManager singleton holds a reference to the same instance.
    """
    settings = get_settings()
    monkeypatch.setattr(settings, "cognito_user_pool_id", COGNITO_POOL_ID)
    monkeypatch.setattr(settings, "cognito_region", COGNITO_REGION)
    monkeypatch.setattr(settings, "cognito_client_id", COGNITO_CLIENT_ID)


async def test_cognito_token_syncs_user_on_first_authenticated_call(client, monkeypatch):
    _enable_cognito(monkeypatch)

    private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    kid = "test-kid-1"
    token_manager = get_token_manager()
    # Stub the JWKS fetch so no network call is made.
    monkeypatch.setattr(token_manager, "_jwks", _make_jwks(private_key.public_key(), kid))
    monkeypatch.setattr(token_manager, "_jwks_fetched_at", time.monotonic())

    id_token = _make_id_token(
        private_key,
        kid,
        email="cognito.user@example.com",
        sub="cognito-sub-123",
        name="Cognito User",
    )

    resp = await client.get(
        "/api/v1/auth/me", headers={"Authorization": f"Bearer {id_token}"}
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["user"]["email"] == "cognito.user@example.com"
    assert body["user"]["status"] == "active"
    assert {r["name"] for r in body["roles"]} == {"professional"}

    # Second call resolves the existing row rather than duplicating it.
    resp2 = await client.get(
        "/api/v1/auth/me", headers={"Authorization": f"Bearer {id_token}"}
    )
    assert resp2.status_code == 200
    assert resp2.json()["user"]["id"] == body["user"]["id"]


async def test_cognito_token_rejected_with_wrong_key(client, monkeypatch):
    _enable_cognito(monkeypatch)

    real_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    other_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    kid = "kid-2"
    token_manager = get_token_manager()
    # JWKS advertises `other_key`'s public key, token signed by `real_key` -> must fail.
    monkeypatch.setattr(token_manager, "_jwks", _make_jwks(other_key.public_key(), kid))
    monkeypatch.setattr(token_manager, "_jwks_fetched_at", time.monotonic())

    id_token = _make_id_token(
        real_key,
        kid,
        email="bad@example.com",
        sub="cognito-sub-bad",
        name="Bad Signer",
    )
    resp = await client.get(
        "/api/v1/auth/me", headers={"Authorization": f"Bearer {id_token}"}
    )
    assert resp.status_code == 401
    assert resp.json()["error"]["code"] == "invalid_token"
