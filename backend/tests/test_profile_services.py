"""Service (rates & availability) tests (workstream 1)."""

from helpers import activated_user_token


async def _profile(client, token: str, email: str, **overrides) -> dict:
    body = {"display_name": f"Provider {email.split('@')[0]}"}
    body.update(overrides)
    resp = await client.post(
        "/api/v1/profiles", headers={"Authorization": f"Bearer {token}"}, json=body
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


async def test_service_crud_lifecycle(client):
    token = await activated_user_token(client, "svc1@example.com", "S1")
    profile = await _profile(client, token, "svc1@example.com")
    base = f"/api/v1/profiles/{profile['id']}/services"
    headers = {"Authorization": f"Bearer {token}"}

    created = await client.post(
        base,
        headers=headers,
        json={
            "title": "API integration",
            "description": "Build and integrate REST APIs.",
            "rate_type": "hourly",
            "rate_amount": 45.5,
            "availability_status": "available",
        },
    )
    assert created.status_code == 201, created.text
    service = created.json()
    assert service["rate_type"] == "hourly"
    assert service["rate_amount"] == 45.5

    listed = await client.get(base, headers=headers)
    assert listed.status_code == 200
    assert [s["id"] for s in listed.json()] == [service["id"]]

    updated = await client.patch(
        f"{base}/{service['id']}",
        headers=headers,
        json={"availability_status": "booked", "rate_amount": 50},
    )
    assert updated.status_code == 200
    assert updated.json()["availability_status"] == "booked"
    assert updated.json()["rate_amount"] == 50

    deleted = await client.delete(f"{base}/{service['id']}", headers=headers)
    assert deleted.status_code == 204
    listed_again = await client.get(base, headers=headers)
    assert listed_again.json() == []


async def test_service_validation_and_defaults(client):
    token = await activated_user_token(client, "svc2@example.com", "S2")
    profile = await _profile(client, token, "svc2@example.com")
    base = f"/api/v1/profiles/{profile['id']}/services"
    headers = {"Authorization": f"Bearer {token}"}

    bad_rate = await client.post(
        base, headers=headers, json={"title": "x", "description": "y", "rate_type": "hourly", "rate_amount": -5}
    )
    assert bad_rate.status_code == 422

    bad_type = await client.post(
        base, headers=headers, json={"title": "x", "description": "y", "rate_type": "barter", "rate_amount": 5}
    )
    assert bad_type.status_code == 422

    defaulted = await client.post(
        base,
        headers=headers,
        json={"title": "Consulting", "description": "Advisory.", "rate_type": "retainer", "rate_amount": 1000},
    )
    assert defaulted.status_code == 201
    assert defaulted.json()["availability_status"] == "available"


async def test_service_permissions(client):
    owner_token = await activated_user_token(client, "svc3@example.com", "S3")
    profile = await _profile(client, owner_token, "svc3@example.com", visibility="public")
    base = f"/api/v1/profiles/{profile['id']}/services"

    stranger_token = await activated_user_token(client, "svc4@example.com", "S4")
    stranger_headers = {"Authorization": f"Bearer {stranger_token}"}

    denied = await client.post(
        base,
        headers=stranger_headers,
        json={"title": "hack", "description": "nope", "rate_type": "fixed", "rate_amount": 1},
    )
    assert denied.status_code == 403

    # Public profile: stranger can view services but not edit.
    view = await client.get(base, headers=stranger_headers)
    assert view.status_code == 200
    assert view.json() == []
