"""Organization onboarding tests (Task 1.6 org_admin path)."""

from helpers import activated_user_token


async def test_create_organization_onboards_creator_as_org_admin(client):
    token = await activated_user_token(client, "founder@example.com", "Founder")

    resp = await client.post(
        "/api/v1/organizations",
        headers={"Authorization": f"Bearer {token}"},
        json={"name": "Acme Studio", "description": "Design studio"},
    )
    assert resp.status_code == 201, resp.text
    org = resp.json()
    assert org["name"] == "Acme Studio"
    assert org["slug"] == "acme-studio"

    me = await client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"})
    roles = {(r["name"], r["organization_id"]) for r in me.json()["roles"]}
    assert ("org_admin", org["id"]) in roles


async def test_org_admin_role_is_org_scoped(client):
    token_a = await activated_user_token(client, "a@example.com", "Founder A")
    org_a = await client.post(
        "/api/v1/organizations",
        headers={"Authorization": f"Bearer {token_a}"},
        json={"name": "Org A"},
    )
    org_a_id = org_a.json()["id"]

    # Founder B creates a different org; org_admin must not leak between orgs.
    token_b = await activated_user_token(client, "b@example.com", "Founder B")
    org_b = await client.post(
        "/api/v1/organizations",
        headers={"Authorization": f"Bearer {token_b}"},
        json={"name": "Org B"},
    )
    org_b_id = org_b.json()["id"]

    # A cannot see B's org, B cannot see A's org.
    resp_a = await client.get(
        f"/api/v1/organizations/{org_b_id}", headers={"Authorization": f"Bearer {token_a}"}
    )
    assert resp_a.status_code == 403
    resp_b = await client.get(
        f"/api/v1/organizations/{org_a_id}", headers={"Authorization": f"Bearer {token_b}"}
    )
    assert resp_b.status_code == 403

    # Each sees their own.
    ok_a = await client.get(
        f"/api/v1/organizations/{org_a_id}", headers={"Authorization": f"Bearer {token_a}"}
    )
    assert ok_a.status_code == 200


async def test_explicit_duplicate_slug_conflict(client):
    token = await activated_user_token(client, "dup@example.com", "Dup Founder")
    await client.post(
        "/api/v1/organizations",
        headers={"Authorization": f"Bearer {token}"},
        json={"name": "Acme", "slug": "acme"},
    )
    resp = await client.post(
        "/api/v1/organizations",
        headers={"Authorization": f"Bearer {token}"},
        json={"name": "Other", "slug": "acme"},
    )
    assert resp.status_code == 409
    assert resp.json()["error"]["code"] == "slug_taken"


async def test_duplicate_names_get_unique_auto_slugs(client):
    token = await activated_user_token(client, "auto@example.com", "Auto Founder")
    r1 = await client.post(
        "/api/v1/organizations",
        headers={"Authorization": f"Bearer {token}"},
        json={"name": "Same Name"},
    )
    r2 = await client.post(
        "/api/v1/organizations",
        headers={"Authorization": f"Bearer {token}"},
        json={"name": "Same Name"},
    )
    assert r1.status_code == 201
    assert r2.status_code == 201
    assert r1.json()["slug"] != r2.json()["slug"]


async def test_list_my_organizations(client):
    token = await activated_user_token(client, "member@example.com", "Member")
    await client.post(
        "/api/v1/organizations",
        headers={"Authorization": f"Bearer {token}"},
        json={"name": "My Team"},
    )
    resp = await client.get("/api/v1/organizations", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    assert [o["name"] for o in resp.json()] == ["My Team"]
