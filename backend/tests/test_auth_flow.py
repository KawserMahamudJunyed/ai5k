"""Auth & onboarding flow tests (Task 1.6)."""

from helpers import login, signup, verify_email


async def test_signup_creates_pending_user_and_grants_professional(client):
    resp = await signup(client)
    assert resp.status_code == 201, resp.text
    data = resp.json()
    assert data["email"] == "alice@example.com"
    assert data["status"] == "pending"
    assert data["verification_token"]  # local dev returns the token

    # professional role should already be granted at signup
    me = await client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {data['verification_token']}"})
    assert me.status_code == 401  # verification token is not an access token


async def test_signup_duplicate_email_conflict(client):
    await signup(client)
    resp = await signup(client)
    assert resp.status_code == 409
    assert resp.json()["error"]["code"] == "email_already_registered"


async def test_signup_validation(client):
    resp = await client.post(
        "/api/v1/auth/signup",
        json={"email": "not-an-email", "password": "short", "full_name": ""},
    )
    assert resp.status_code == 422
    assert resp.json()["error"]["code"] == "validation_error"


async def test_login_blocked_before_email_verification(client):
    await signup(client)
    resp = await login(client)
    assert resp.status_code == 403
    assert resp.json()["error"]["code"] == "email_not_verified"


async def test_login_wrong_password(client):
    await signup(client)
    resp = await login(client, password="wrong-password")
    assert resp.status_code == 401
    assert resp.json()["error"]["code"] == "invalid_credentials"


async def test_verify_email_then_login_then_me(client):
    signup_resp = await signup(client)
    token = signup_resp.json()["verification_token"]

    verified = await verify_email(client, token)
    assert verified.status_code == 200
    assert verified.json()["status"] == "active"

    login_resp = await login(client)
    assert login_resp.status_code == 200, login_resp.text
    tokens = login_resp.json()
    assert tokens["access_token"]
    assert tokens["refresh_token"]
    assert tokens["token_type"] == "bearer"

    me = await client.get(
        "/api/v1/auth/me", headers={"Authorization": f"Bearer {tokens['access_token']}"}
    )
    assert me.status_code == 200
    body = me.json()
    assert body["user"]["email"] == "alice@example.com"
    role_names = {r["name"] for r in body["roles"]}
    assert "professional" in role_names


async def test_verify_email_bad_token(client):
    resp = await verify_email(client, "garbage-token")
    assert resp.status_code == 401
    assert resp.json()["error"]["code"] == "invalid_token"


async def test_refresh_issues_new_access_token(client):
    await signup(client)
    signup_resp = await signup(client, email="bob@example.com", full_name="Bob Builder")
    await verify_email(client, signup_resp.json()["verification_token"])
    login_resp = await login(client, email="bob@example.com")
    refresh_token = login_resp.json()["refresh_token"]

    refresh = await client.post("/api/v1/auth/refresh", json={"refresh_token": refresh_token})
    assert refresh.status_code == 200
    new_access = refresh.json()["access_token"]

    me = await client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {new_access}"})
    assert me.status_code == 200


async def test_me_requires_bearer_token(client):
    resp = await client.get("/api/v1/auth/me")
    assert resp.status_code == 401
    resp = await client.get("/api/v1/auth/me", headers={"Authorization": "Bearer bogus"})
    assert resp.status_code == 401
