"""Shared helpers for auth flow tests."""

DEFAULT_PASSWORD = "password123"


async def signup(client, email="alice@example.com", full_name="Alice Example", password=DEFAULT_PASSWORD):
    return await client.post(
        "/api/v1/auth/signup",
        json={"email": email, "password": password, "full_name": full_name},
    )


async def verify_email(client, token):
    return await client.post("/api/v1/auth/verify-email", json={"token": token})


async def login(client, email="alice@example.com", password=DEFAULT_PASSWORD):
    return await client.post("/api/v1/auth/login", json={"email": email, "password": password})


async def activated_user_token(client, email: str, full_name: str) -> str:
    """Sign up, verify email, log in, and return an access token for a fresh user."""
    resp = await signup(client, email=email, full_name=full_name)
    assert resp.status_code == 201, resp.text
    verified = await verify_email(client, resp.json()["verification_token"])
    assert verified.status_code == 200, verified.text
    login_resp = await login(client, email=email)
    assert login_resp.status_code == 200, login_resp.text
    return login_resp.json()["access_token"]


async def create_org(client, token: str, name: str, **overrides) -> dict:
    """Create an organization and return its JSON (caller authenticated by token)."""
    body = {"name": name}
    body.update(overrides)
    resp = await client.post(
        "/api/v1/organizations", headers={"Authorization": f"Bearer {token}"}, json=body
    )
    assert resp.status_code == 201, resp.text
    return resp.json()
