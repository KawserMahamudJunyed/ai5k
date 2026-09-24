"""RBAC tests (Task 1.6): roles, permission enforcement, admin grant/revoke.

`platform_admin` has no self-serve path (docs/auth.md): an existing platform_admin
must grant it. For tests we bootstrap the first admin directly through the service
layer (the same path a manual/DB bootstrap would take), then exercise the API.
"""

import uuid

from app.services import rbac as rbac_service
from helpers import activated_user_token


async def _bootstrap_platform_admin(client, db, email: str, full_name: str) -> str:
    token = await activated_user_token(client, email, full_name)
    me = await client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"})
    user_id = uuid.UUID(me.json()["user"]["id"])
    await rbac_service.grant_role(
        db, actor_id=user_id, target_user_id=user_id, role_name="platform_admin"
    )
    return token


async def test_roles_catalog_lists_roles_with_permissions(client):
    token = await activated_user_token(client, "catalog@example.com", "Catalog User")
    resp = await client.get("/api/v1/roles", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    roles = {r["name"]: r["permissions"] for r in resp.json()}
    assert "professional" in roles
    assert "org_admin" in roles
    assert "platform_admin" in roles
    assert "opportunity:read" in roles["professional"]
    assert "organization:manage" in roles["org_admin"]
    assert "rbac:manage" in roles["platform_admin"]


async def test_professional_cannot_grant_roles(client):
    token = await activated_user_token(client, "user@example.com", "Regular User")
    resp = await client.post(
        "/api/v1/admin/users/00000000-0000-0000-0000-000000000001/roles",
        headers={"Authorization": f"Bearer {token}"},
        json={"role_name": "platform_admin"},
    )
    assert resp.status_code == 403
    assert resp.json()["error"]["code"] == "permission_denied"


async def test_platform_admin_can_grant_and_revoke_org_admin(client, db):
    admin_token = await _bootstrap_platform_admin(client, db, "admin@example.com", "Platform Admin")
    user_token = await activated_user_token(client, "target@example.com", "Target User")

    # Find the target user id
    me = await client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {user_token}"})
    target_id = me.json()["user"]["id"]

    grant = await client.post(
        f"/api/v1/admin/users/{target_id}/roles",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={"role_name": "org_admin"},
    )
    assert grant.status_code == 201, grant.text

    me_again = await client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {user_token}"})
    role_names = {r["name"] for r in me_again.json()["roles"]}
    assert "org_admin" in role_names

    revoke = await client.request(
        "DELETE",
        f"/api/v1/admin/users/{target_id}/roles",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={"role_name": "org_admin"},
    )
    assert revoke.status_code == 204

    me_final = await client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {user_token}"})
    role_names = {r["name"] for r in me_final.json()["roles"]}
    assert "org_admin" not in role_names


async def test_audit_logs_are_platform_admin_only(client, db):
    user_token = await activated_user_token(client, "viewer@example.com", "Viewer")
    resp = await client.get("/api/v1/audit-logs", headers={"Authorization": f"Bearer {user_token}"})
    assert resp.status_code == 403

    admin_token = await _bootstrap_platform_admin(client, db, "auditadmin@example.com", "Audit Admin")

    logs = await client.get("/api/v1/audit-logs", headers={"Authorization": f"Bearer {admin_token}"})
    assert logs.status_code == 200
    actions = {entry["action"] for entry in logs.json()}
    assert "user_role.granted" in actions
