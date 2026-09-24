"""Org member management, consent & aggregated skill view tests (workstream 2, Task 2.2)."""

from helpers import activated_user_token, create_org


async def _invite(client, admin_token: str, org_id: str, email: str):
    return await client.post(
        f"/api/v1/organizations/{org_id}/members",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={"email": email},
    )


async def _consent(client, token: str, org_id: str):
    return await client.post(
        f"/api/v1/organizations/{org_id}/members/me/consent",
        headers={"Authorization": f"Bearer {token}"},
    )


async def _claim_skill(client, token: str, profile_id: str, name: str, **extra):
    return await client.post(
        f"/api/v1/profiles/{profile_id}/skills",
        headers={"Authorization": f"Bearer {token}"},
        json={"skill_name": name, **extra},
    )


async def _own_profile(client, token: str, email: str) -> dict:
    resp = await client.post(
        "/api/v1/profiles",
        headers={"Authorization": f"Bearer {token}"},
        json={"display_name": f"Member {email.split('@')[0]}"},
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


async def test_invite_consent_role_and_aggregate(client):
    admin_token = await activated_user_token(client, "orgadmin@example.com", "Org Admin")
    org = await create_org(client, admin_token, "Skill Org")
    org_id = org["id"]

    # Invite flow: existing user, starts invited + no consent.
    invitee_token = await activated_user_token(client, "invitee@example.com", "Invitee")
    invited = await _invite(client, admin_token, org_id, "invitee@example.com")
    assert invited.status_code == 201, invited.text
    member = invited.json()
    assert member["status"] == "invited"
    assert member["consent_given"] is False

    # Duplicate invite conflicts.
    dup = await _invite(client, admin_token, org_id, "invitee@example.com")
    assert dup.status_code == 409
    assert dup.json()["error"]["code"] == "member_exists"

    # Invitee sees the pending invitation.
    invitations = await client.get(
        "/api/v1/organizations/invitations", headers={"Authorization": f"Bearer {invitee_token}"}
    )
    assert invitations.status_code == 200
    assert [i["organization_name"] for i in invitations.json()] == ["Skill Org"]

    # Before consent, invitee is not a member.
    orgs = await client.get("/api/v1/organizations", headers={"Authorization": f"Bearer {invitee_token}"})
    assert orgs.json() == []

    # Consent flips to active and grants an org-scoped professional role.
    consented = await _consent(client, invitee_token, org_id)
    assert consented.status_code == 200, consented.text
    assert consented.json()["status"] == "active"
    assert consented.json()["consent_given"] is True

    me = await client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {invitee_token}"})
    roles = {(r["name"], r["organization_id"]) for r in me.json()["roles"]}
    assert ("professional", org_id) in roles  # NOT org_admin

    # Second consent attempt conflicts (idempotency guard).
    again = await _consent(client, invitee_token, org_id)
    assert again.status_code == 409

    # Aggregate: admin (consenting founder) + invitee both claim Python once.
    admin_profile = await _own_profile(client, admin_token, "orgadmin@example.com")
    invitee_profile = await _own_profile(client, invitee_token, "invitee@example.com")
    await _claim_skill(client, admin_token, admin_profile["id"], "Python")
    await _claim_skill(client, invitee_token, invitee_profile["id"], "Python")
    await _claim_skill(client, invitee_token, invitee_profile["id"], "Go", proficiency_level="expert")

    skills = await client.get(
        f"/api/v1/organizations/{org_id}/skills",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert skills.status_code == 200, skills.text
    rows = {r["name"]: r for r in skills.json()}
    assert rows["python"]["member_count"] == 2
    assert rows["python"]["self_declared_count"] == 2
    assert rows["python"]["evidenced_count"] == 0
    assert rows["go"]["member_count"] == 1
    # Sorted by member_count desc, then name asc.
    assert [r["name"] for r in skills.json()] == ["python", "go"]


async def test_no_double_count_single_member_single_claim(client):
    """One member claiming one skill counts once (uq + DISTINCT defense in depth)."""
    admin_token = await activated_user_token(client, "dc-admin@example.com", "DC Admin")
    org = await create_org(client, admin_token, "DC Org")
    profile = await _own_profile(client, admin_token, "dc-admin@example.com")
    await _claim_skill(client, admin_token, profile["id"], "Terraform")

    skills = await client.get(
        f"/api/v1/organizations/{org['id']}/skills",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    rows = skills.json()
    assert len(rows) == 1
    assert rows[0]["member_count"] == 1


async def test_non_consenting_member_not_counted(client):
    admin_token = await activated_user_token(client, "nc-admin@example.com", "NC Admin")
    org = await create_org(client, admin_token, "NC Org")
    admin_profile = await _own_profile(client, admin_token, "nc-admin@example.com")
    await _claim_skill(client, admin_token, admin_profile["id"], "Kubernetes")

    # Member invited but hasn't consented.
    pending_token = await activated_user_token(client, "pending@example.com", "Pending")
    await _invite(client, admin_token, org["id"], "pending@example.com")
    pending_profile = await _own_profile(client, pending_token, "pending@example.com")
    await _claim_skill(client, pending_token, pending_profile["id"], "Kubernetes")

    # Removed member (consented, then removed).
    removed_token = await activated_user_token(client, "removed@example.com", "Removed")
    await _invite(client, admin_token, org["id"], "removed@example.com")
    await _consent(client, removed_token, org["id"])
    removed_profile = await _own_profile(client, removed_token, "removed@example.com")
    await _claim_skill(client, removed_token, removed_profile["id"], "Kubernetes")
    members = await client.get(
        f"/api/v1/organizations/{org['id']}/members",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    removed_member = next(m for m in members.json() if m["user"]["email"] == "removed@example.com")
    deleted = await client.delete(
        f"/api/v1/organizations/{org['id']}/members/{removed_member['id']}",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert deleted.status_code == 204

    # Only the admin (consenting, active) counts.
    skills = await client.get(
        f"/api/v1/organizations/{org['id']}/skills",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    rows = {r["name"]: r for r in skills.json()}
    assert rows["kubernetes"]["member_count"] == 1


async def test_invite_unknown_email_404(client):
    admin_token = await activated_user_token(client, "unk@example.com", "Unknown Admin")
    org = await create_org(client, admin_token, "Unknown Org")
    resp = await _invite(client, admin_token, org["id"], "ghost@example.com")
    assert resp.status_code == 404
    assert resp.json()["error"]["code"] == "user_not_found"


async def test_member_routes_permission_matrix(client):
    admin_token = await activated_user_token(client, "pm-admin@example.com", "PM Admin")
    org = await create_org(client, admin_token, "PM Org")
    org_id = org["id"]

    # Unauthenticated.
    anon = await client.get(f"/api/v1/organizations/{org_id}/members")
    assert anon.status_code == 401

    # Non-member professional.
    outsider_token = await activated_user_token(client, "outsider@example.com", "Outsider")
    denied = await client.get(
        f"/api/v1/organizations/{org_id}/members", headers={"Authorization": f"Bearer {outsider_token}"}
    )
    assert denied.status_code == 403
    assert denied.json()["error"]["code"] == "permission_denied"

    # Member of a *different* org (org_admin elsewhere, org-scoped must not leak).
    other_admin_token = await activated_user_token(client, "other@example.com", "Other Admin")
    await create_org(client, other_admin_token, "Other Org")
    leaked = await client.get(
        f"/api/v1/organizations/{org_id}/members", headers={"Authorization": f"Bearer {other_admin_token}"}
    )
    assert leaked.status_code == 403

    # Org-scoped professional (consented member) can view the org but not manage members.
    member_token = await activated_user_token(client, "member@example.com", "Member")
    await _invite(client, admin_token, org_id, "member@example.com")
    await _consent(client, member_token, org_id)
    member_view = await client.get(
        f"/api/v1/organizations/{org_id}", headers={"Authorization": f"Bearer {member_token}"}
    )
    assert member_view.status_code == 200
    member_manage = await client.get(
        f"/api/v1/organizations/{org_id}/members", headers={"Authorization": f"Bearer {member_token}"}
    )
    assert member_manage.status_code == 403


async def test_remove_member_revokes_role_and_reinvite_resets(client):
    admin_token = await activated_user_token(client, "rm-admin@example.com", "RM Admin")
    org = await create_org(client, admin_token, "RM Org")
    org_id = org["id"]

    member_token = await activated_user_token(client, "rm-member@example.com", "RM Member")
    await _invite(client, admin_token, org_id, "rm-member@example.com")
    await _consent(client, member_token, org_id)

    members = await client.get(
        f"/api/v1/organizations/{org_id}/members", headers={"Authorization": f"Bearer {admin_token}"}
    )
    target = next(m for m in members.json() if m["user"]["email"] == "rm-member@example.com")

    # Admin cannot remove self (last-admin lockout guard).
    admin_member = next(m for m in members.json() if m["user"]["email"] == "rm-admin@example.com")
    self_removal = await client.delete(
        f"/api/v1/organizations/{org_id}/members/{admin_member['id']}",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert self_removal.status_code == 409
    assert self_removal.json()["error"]["code"] == "cannot_remove_self"

    # Remove the member.
    removed = await client.delete(
        f"/api/v1/organizations/{org_id}/members/{target['id']}",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert removed.status_code == 204

    # Org-scoped professional role revoked.
    me = await client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {member_token}"})
    roles = {(r["name"], r["organization_id"]) for r in me.json()["roles"]}
    assert ("professional", org_id) not in roles
    # Platform-wide professional (from signup) is untouched.
    assert ("professional", None) in roles

    # No longer sees the org.
    gone = await client.get(
        f"/api/v1/organizations/{org_id}", headers={"Authorization": f"Bearer {member_token}"}
    )
    assert gone.status_code == 403

    # Re-invite resets to invited with fresh consent.
    reinvited = await _invite(client, admin_token, org_id, "rm-member@example.com")
    assert reinvited.status_code == 201
    assert reinvited.json()["status"] == "invited"
    assert reinvited.json()["consent_given"] is False


async def test_patch_organization_by_admin(client):
    admin_token = await activated_user_token(client, "patch-admin@example.com", "Patch Admin")
    org = await create_org(client, admin_token, "Patch Org", description="Before")

    patched = await client.patch(
        f"/api/v1/organizations/{org['id']}",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={"name": "Patch Org Renamed", "description": "After"},
    )
    assert patched.status_code == 200, patched.text
    assert patched.json()["name"] == "Patch Org Renamed"
    assert patched.json()["description"] == "After"

    outsider_token = await activated_user_token(client, "patch-outsider@example.com", "Outsider")
    denied = await client.patch(
        f"/api/v1/organizations/{org['id']}",
        headers={"Authorization": f"Bearer {outsider_token}"},
        json={"name": "Hijack"},
    )
    assert denied.status_code == 403
