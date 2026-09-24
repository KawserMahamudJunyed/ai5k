"""Skill catalog & skill-claim tests (workstream 1, Task 2.3 precursor)."""

from helpers import activated_user_token


async def _profile(client, token: str, email: str) -> dict:
    resp = await client.post(
        "/api/v1/profiles",
        headers={"Authorization": f"Bearer {token}"},
        json={"display_name": f"Skiller {email.split('@')[0]}"},
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


async def _claim(client, token: str, profile_id: str, name: str, **extra) -> dict:
    body = {"skill_name": name, **extra}
    return await client.post(
        f"/api/v1/profiles/{profile_id}/skills",
        headers={"Authorization": f"Bearer {token}"},
        json=body,
    )


async def test_create_or_get_skill_via_claim(client):
    token = await activated_user_token(client, "sk1@example.com", "S1")
    profile = await _profile(client, token, "sk1@example.com")

    first = await _claim(client, token, profile["id"], "Python", proficiency_level="expert")
    assert first.status_code == 201, first.text
    data = first.json()
    assert data["claim_type"] == "self_declared"  # server-asserted; never client-set
    assert data["skill_name"] == "python"
    assert data["proficiency_level"] == "expert"

    second = await _claim(client, token, profile["id"], "Python")
    assert second.status_code == 409
    assert second.json()["error"]["code"] == "skill_already_claimed"


async def test_claim_type_cannot_be_evidenced(client):
    token = await activated_user_token(client, "sk2@example.com", "S2")
    profile = await _profile(client, token, "sk2@example.com")

    resp = await _claim(
        client, token, profile["id"], "Rust", claim_type="evidenced"  # client-sent, must be ignored
    )
    assert resp.status_code == 201
    assert resp.json()["claim_type"] == "self_declared"


async def test_claim_by_skill_id_and_catalog(client):
    token = await activated_user_token(client, "sk3@example.com", "S3")
    profile = await _profile(client, token, "sk3@example.com")

    created = await _claim(client, token, profile["id"], "SQL", category="data")
    assert created.status_code == 201
    skill_id = created.json()["skill_id"]

    # Catalog shows the skill with pagination envelope.
    resp = await client.get(
        "/api/v1/skills?category=data&page=1&page_size=10",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["total"] == 1
    assert body["data"][0]["id"] == skill_id
    assert body["data"][0]["name"] == "sql"

    # Claim via skill_id reuses the same skill row.
    other_token = await activated_user_token(client, "sk4@example.com", "S4")
    other_profile = await _profile(client, other_token, "sk4@example.com")
    reuse = await client.post(
        f"/api/v1/profiles/{other_profile['id']}/skills",
        headers={"Authorization": f"Bearer {other_token}"},
        json={"skill_id": skill_id},
    )
    assert reuse.status_code == 201
    assert reuse.json()["skill_id"] == skill_id


async def test_list_update_delete_claim(client):
    token = await activated_user_token(client, "sk5@example.com", "S5")
    profile = await _profile(client, token, "sk5@example.com")

    claim = (await _claim(client, token, profile["id"], "Go")).json()

    listed = await client.get(
        f"/api/v1/profiles/{profile['id']}/skills", headers={"Authorization": f"Bearer {token}"}
    )
    assert listed.status_code == 200
    assert [c["skill_name"] for c in listed.json()] == ["go"]

    updated = await client.patch(
        f"/api/v1/profiles/{profile['id']}/skills/{claim['id']}",
        headers={"Authorization": f"Bearer {token}"},
        json={"proficiency_level": "advanced"},
    )
    assert updated.status_code == 200
    assert updated.json()["proficiency_level"] == "advanced"

    deleted = await client.delete(
        f"/api/v1/profiles/{profile['id']}/skills/{claim['id']}",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert deleted.status_code == 204

    listed_again = await client.get(
        f"/api/v1/profiles/{profile['id']}/skills", headers={"Authorization": f"Bearer {token}"}
    )
    assert listed_again.json() == []


async def test_claim_permissions(client):
    owner_token = await activated_user_token(client, "sk6@example.com", "S6")
    profile = await _profile(client, owner_token, "sk6@example.com")

    stranger_token = await activated_user_token(client, "sk7@example.com", "S7")
    denied = await client.post(
        f"/api/v1/profiles/{profile['id']}/skills",
        headers={"Authorization": f"Bearer {stranger_token}"},
        json={"skill_name": "python"},
    )
    assert denied.status_code == 403
    assert denied.json()["error"]["code"] == "permission_denied"

    view = await client.get(
        f"/api/v1/profiles/{profile['id']}/skills", headers={"Authorization": f"Bearer {stranger_token}"}
    )
    # Profile defaults to private -> strangers can't even list claims.
    assert view.status_code == 403


async def test_claim_requires_skill_reference(client):
    token = await activated_user_token(client, "sk8@example.com", "S8")
    profile = await _profile(client, token, "sk8@example.com")
    resp = await client.post(
        f"/api/v1/profiles/{profile['id']}/skills",
        headers={"Authorization": f"Bearer {token}"},
        json={},
    )
    assert resp.status_code == 422
