"""Account settings — change password / change email endpoints."""

from helpers import activated_user_token, login

AUTH = "/api/v1/auth"


async def _authed(client) -> tuple[str, str]:
    email = "settings-user@example.com"
    token = await activated_user_token(client, email=email, full_name="Settings User")
    return token, email


async def test_change_password_roundtrip(client):
    token, email = await _authed(client)
    headers = {"Authorization": f"Bearer {token}"}

    resp = await client.post(
        f"{AUTH}/change-password",
        headers=headers,
        json={"current_password": "password123", "new_password": "new-password-456"},
    )
    assert resp.status_code == 204, resp.text

    # Old password no longer works; new one does.
    old_login = await login(client, email=email, password="password123")
    assert old_login.status_code == 401
    new_login = await login(client, email=email, password="new-password-456")
    assert new_login.status_code == 200


async def test_change_password_requires_correct_current_password(client):
    token, _ = await _authed(client)
    resp = await client.post(
        f"{AUTH}/change-password",
        headers={"Authorization": f"Bearer {token}"},
        json={"current_password": "totally-wrong", "new_password": "new-password-456"},
    )
    assert resp.status_code == 401
    assert resp.json()["error"]["code"] == "invalid_credentials"


async def test_change_password_rejects_short_new_password(client):
    token, _ = await _authed(client)
    resp = await client.post(
        f"{AUTH}/change-password",
        headers={"Authorization": f"Bearer {token}"},
        json={"current_password": "password123", "new_password": "short"},
    )
    assert resp.status_code == 422
    assert resp.json()["error"]["code"] == "validation_error"


async def test_change_password_requires_auth(client):
    resp = await client.post(
        f"{AUTH}/change-password",
        json={"current_password": "x", "new_password": "new-password-456"},
    )
    assert resp.status_code == 401


async def test_change_email_roundtrip(client):
    token, old_email = await _authed(client)
    headers = {"Authorization": f"Bearer {token}"}

    resp = await client.post(
        f"{AUTH}/change-email",
        headers=headers,
        json={"new_email": "renamed@example.com", "current_password": "password123"},
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["email"] == "renamed@example.com"
    assert body["status"] == "active"

    # /auth/me reflects the new email immediately.
    me = await client.get(f"{AUTH}/me", headers=headers)
    assert me.json()["user"]["email"] == "renamed@example.com"

    # Login works with the new email (case-insensitive), and the old one is gone.
    new_login = await login(client, email="Renamed@Example.com", password="password123")
    assert new_login.status_code == 200
    old_login = await login(client, email=old_email, password="password123")
    assert old_login.status_code == 401


async def test_change_email_to_existing_address_conflicts(client):
    token, _ = await _authed(client)
    # Register a second user so the target address is taken.
    other = await client.post(
        f"{AUTH}/signup",
        json={"email": "taken@example.com", "password": "password123", "full_name": "T T"},
    )
    assert other.status_code == 201

    resp = await client.post(
        f"{AUTH}/change-email",
        headers={"Authorization": f"Bearer {token}"},
        json={"new_email": "taken@example.com", "current_password": "password123"},
    )
    assert resp.status_code == 409
    assert resp.json()["error"]["code"] == "email_already_registered"


async def test_change_email_same_address_rejected(client):
    token, _ = await _authed(client)
    resp = await client.post(
        f"{AUTH}/change-email",
        headers={"Authorization": f"Bearer {token}"},
        json={"new_email": "settings-user@example.com", "current_password": "password123"},
    )
    assert resp.status_code == 422
    assert resp.json()["error"]["code"] == "email_unchanged"


async def test_change_email_wrong_current_password(client):
    token, _ = await _authed(client)
    resp = await client.post(
        f"{AUTH}/change-email",
        headers={"Authorization": f"Bearer {token}"},
        json={"new_email": "renamed@example.com", "current_password": "nope"},
    )
    assert resp.status_code == 401
    assert resp.json()["error"]["code"] == "invalid_credentials"
