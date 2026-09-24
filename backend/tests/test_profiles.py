"""Profile CRUD tests (workstream 1, Task 2.1)."""

import uuid

from helpers import activated_user_token, create_org


async def create_individual_profile(client, token: str, **overrides) -> dict:
    body = {
        "display_name": "Alice Dev",
        "headline": "Backend engineer",
        "job_roles": ["Backend Engineer"],
        "visibility": "public",
    }
    body.update(overrides)
    resp = await client.post(
        "/api/v1/profiles", headers={"Authorization": f"Bearer {token}"}, json=body
    )
    return resp


async def test_create_individual_profile(client):
    token = await activated_user_token(client, "alice@example.com", "Alice")
    resp = await create_individual_profile(client, token)
    assert resp.status_code == 201, resp.text
    data = resp.json()
    assert data["owner_type"] == "individual"
    assert data["display_name"] == "Alice Dev"
    assert data["headline"] == "Backend engineer"
    assert data["visibility"] == "public"
    assert data["job_roles"] == ["Backend Engineer"]


async def test_duplicate_individual_profile_conflict(client):
    token = await activated_user_token(client, "dup@example.com", "Dup")
    first = await create_individual_profile(client, token)
    assert first.status_code == 201
    second = await create_individual_profile(client, token)
    assert second.status_code == 409
    assert second.json()["error"]["code"] == "profile_exists"


async def test_get_my_profile(client):
    token = await activated_user_token(client, "me@example.com", "Me")
    resp = await client.get("/api/v1/profiles/me", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 404
    assert resp.json()["error"]["code"] == "profile_not_found"

    await create_individual_profile(client, token)
    resp = await client.get("/api/v1/profiles/me", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    assert resp.json()["display_name"] == "Alice Dev"


async def test_public_profile_visible_to_other_users(client):
    owner_token = await activated_user_token(client, "owner@example.com", "Owner")
    profile = (await create_individual_profile(client, owner_token)).json()

    other_token = await activated_user_token(client, "other@example.com", "Other")
    resp = await client.get(
        f"/api/v1/profiles/{profile['id']}", headers={"Authorization": f"Bearer {other_token}"}
    )
    assert resp.status_code == 200


async def test_private_profile_hidden_from_other_users(client):
    owner_token = await activated_user_token(client, "powner@example.com", "Owner")
    profile = (await create_individual_profile(client, owner_token, visibility="private")).json()

    other_token = await activated_user_token(client, "pother@example.com", "Other")
    resp = await client.get(
        f"/api/v1/profiles/{profile['id']}", headers={"Authorization": f"Bearer {other_token}"}
    )
    assert resp.status_code == 403
    assert resp.json()["error"]["code"] == "permission_denied"

    # Owner can see it.
    ok = await client.get(
        f"/api/v1/profiles/{profile['id']}", headers={"Authorization": f"Bearer {owner_token}"}
    )
    assert ok.status_code == 200


async def test_platform_admin_can_view_and_edit_any_profile(client, db):
    from app.services import rbac as rbac_service

    owner_token = await activated_user_token(client, "adm@example.com", "Owner")
    profile = (await create_individual_profile(client, owner_token, visibility="private")).json()

    admin_token = await activated_user_token(client, "padmin@example.com", "Platform Admin")
    me = await client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {admin_token}"})
    admin_id = uuid.UUID(me.json()["user"]["id"])
    await rbac_service.grant_role(db, actor_id=admin_id, target_user_id=admin_id, role_name="platform_admin")

    resp = await client.get(
        f"/api/v1/profiles/{profile['id']}", headers={"Authorization": f"Bearer {admin_token}"}
    )
    assert resp.status_code == 200

    patch = await client.patch(
        f"/api/v1/profiles/{profile['id']}",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={"headline": "Admin-set headline"},
    )
    assert patch.status_code == 200
    assert patch.json()["headline"] == "Admin-set headline"


async def test_patch_profile_owner_only(client):
    owner_token = await activated_user_token(client, "editowner@example.com", "Owner")
    profile = (await create_individual_profile(client, owner_token)).json()

    stranger_token = await activated_user_token(client, "stranger@example.com", "Stranger")
    forbidden = await client.patch(
        f"/api/v1/profiles/{profile['id']}",
        headers={"Authorization": f"Bearer {stranger_token}"},
        json={"headline": "hijacked"},
    )
    assert forbidden.status_code == 403

    ok = await client.patch(
        f"/api/v1/profiles/{profile['id']}",
        headers={"Authorization": f"Bearer {owner_token}"},
        json={"headline": "Updated headline", "portfolio_links": [{"label": "GitHub", "url": "https://github.com/alice"}]},
    )
    assert ok.status_code == 200, ok.text
    data = ok.json()
    assert data["headline"] == "Updated headline"
    assert data["portfolio_links"][0]["label"] == "GitHub"


async def test_profile_validation(client):
    token = await activated_user_token(client, "valid@example.com", "Valid")
    resp = await client.post(
        "/api/v1/profiles",
        headers={"Authorization": f"Bearer {token}"},
        json={"display_name": "", "job_roles": ["a"] * 11},
    )
    assert resp.status_code == 422
    assert resp.json()["error"]["code"] == "validation_error"


async def test_org_profile_requires_manage_permission(client):
    founder_token = await activated_user_token(client, "founder@example.com", "Founder")
    org = await create_org(client, founder_token, "Profile Org")

    outsider_token = await activated_user_token(client, "outsider@example.com", "Outsider")
    denied = await client.post(
        "/api/v1/profiles",
        headers={"Authorization": f"Bearer {outsider_token}"},
        json={"organization_id": org["id"], "display_name": "Profile Org"},
    )
    assert denied.status_code == 403

    allowed = await client.post(
        "/api/v1/profiles",
        headers={"Authorization": f"Bearer {founder_token}"},
        json={"organization_id": org["id"], "display_name": "Profile Org"},
    )
    assert allowed.status_code == 201, allowed.text
    assert allowed.json()["owner_type"] == "organization"

    dup = await client.post(
        "/api/v1/profiles",
        headers={"Authorization": f"Bearer {founder_token}"},
        json={"organization_id": org["id"], "display_name": "Profile Org"},
    )
    assert dup.status_code == 409


async def test_profile_audit_rows_written(client, db):
    from sqlalchemy import select

    from app.models.audit import AuditLog

    token = await activated_user_token(client, "audit@example.com", "Audit")
    profile = (await create_individual_profile(client, token)).json()
    await client.patch(
        f"/api/v1/profiles/{profile['id']}",
        headers={"Authorization": f"Bearer {token}"},
        json={"headline": "v2"},
    )

    actions = set((await db.execute(select(AuditLog.action))).scalars())
    assert "profile.created" in actions
    assert "profile.updated" in actions
