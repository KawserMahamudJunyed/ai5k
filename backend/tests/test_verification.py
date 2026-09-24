"""Verification queue tests (Tasks 2.4/2.5): review identity docs & skill claims."""

import uuid

import pytest

import app.api.v1.evidence as evidence_api
from helpers import activated_user_token, create_org


class FakeStorage:
    bucket = "fake-bucket"
    upload_ttl_seconds = 900
    download_ttl_seconds = 300

    def build_key(self, profile_id, content_type):
        return f"evidence/{profile_id}/00000000-0000-0000-0000-00000000beef.pdf"

    def validate_key(self, profile_id, key):
        return key.startswith(f"evidence/{profile_id}/") and ".." not in key and len(key) <= 512

    def file_url(self, key):
        return f"s3://fake-bucket/{key}"

    def presign_put(self, key, content_type):
        return f"https://s3.example/{key}?sig=put"

    def presign_get(self, key):
        return f"https://s3.example/{key}?sig=get"


async def _bootstrap_platform_admin(client, db, email: str) -> str:
    """Activate a user and grant platform_admin via the service layer (test bootstrap)."""
    from app.services import rbac as rbac_service

    token = await activated_user_token(client, email, "Platform Admin")
    me = await client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"})
    admin_id = uuid.UUID(me.json()["user"]["id"])
    await rbac_service.grant_role(db, actor_id=admin_id, target_user_id=admin_id, role_name="platform_admin")
    return token


async def _profile_with_claim(client, token: str, email: str) -> tuple[dict, dict]:
    resp = await client.post(
        "/api/v1/profiles",
        headers={"Authorization": f"Bearer {token}"},
        json={"display_name": f"Verifier {email.split('@')[0]}"},
    )
    assert resp.status_code == 201, resp.text
    profile = resp.json()
    claim = await client.post(
        f"/api/v1/profiles/{profile['id']}/skills",
        headers={"Authorization": f"Bearer {token}"},
        json={"skill_name": "Python"},
    )
    assert claim.status_code == 201, claim.text
    return profile, claim.json()


async def _identity_doc(client, monkeypatch, token: str, email: str) -> tuple[dict, dict]:
    """Create a profile + a file-type (certificate) evidence row via the fake storage."""
    monkeypatch.setattr(evidence_api, "_storage", lambda: FakeStorage())
    resp = await client.post(
        "/api/v1/profiles",
        headers={"Authorization": f"Bearer {token}"},
        json={"display_name": f"DocOwner {email.split('@')[0]}"},
    )
    assert resp.status_code == 201, resp.text
    profile = resp.json()
    headers = {"Authorization": f"Bearer {token}"}
    key = FakeStorage().build_key(uuid.UUID(profile["id"]), "application/pdf")
    evidence = await client.post(
        f"/api/v1/profiles/{profile['id']}/evidence",
        headers=headers,
        json={"source_type": "certificate", "title": "Identity doc", "file_key": key},
    )
    assert evidence.status_code == 201, evidence.text
    return profile, evidence.json()


async def test_approve_skill_claim_flips_to_evidenced(client, db):
    from sqlalchemy import select

    from app.models.audit import AuditLog
    from app.models.profile import ProfileSkill

    owner_token = await activated_user_token(client, "v-owner@example.com", "Owner")
    profile, claim = await _profile_with_claim(client, owner_token, "v-owner@example.com")
    admin_token = await _bootstrap_platform_admin(client, db, "v-admin@example.com")

    created = await client.post(
        "/api/v1/verification-requests",
        headers={"Authorization": f"Bearer {owner_token}"},
        json={"target_type": "profile_skill", "target_id": claim["id"]},
    )
    assert created.status_code == 201, created.text
    vr = created.json()
    assert vr["status"] == "pending"

    approved = await client.post(
        f"/api/v1/verification-requests/{vr['id']}/approve",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={"note": "Certificate matched"},
    )
    assert approved.status_code == 200, approved.text
    assert approved.json()["status"] == "approved"
    assert approved.json()["reviewed_by"] is not None
    assert approved.json()["reviewed_at"] is not None

    # Side effect: claim is now evidenced.
    claim_resp = await client.get(
        f"/api/v1/profiles/{profile['id']}/skills", headers={"Authorization": f"Bearer {owner_token}"}
    )
    assert claim_resp.json()[0]["claim_type"] == "evidenced"

    # And the audit trail says so.
    actions = {
        (a.action, a.entity_type)
        for a in (await db.execute(select(AuditLog))).scalars()
    }
    assert ("verification_request.approved", "verification_request") in actions


async def test_approve_identity_doc_marks_evidence_verified(client, db, monkeypatch):
    owner_token = await activated_user_token(client, "v-doc@example.com", "Doc Owner")
    _profile, evidence = await _identity_doc(client, monkeypatch, owner_token, "v-doc@example.com")
    admin_token = await _bootstrap_platform_admin(client, db, "v-doc-admin@example.com")

    created = await client.post(
        "/api/v1/verification-requests",
        headers={"Authorization": f"Bearer {owner_token}"},
        json={"target_type": "identity_doc", "target_id": evidence["id"]},
    )
    assert created.status_code == 201, created.text

    approved = await client.post(
        f"/api/v1/verification-requests/{created.json()['id']}/approve",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={},
    )
    assert approved.status_code == 200, approved.text

    detail = await client.get(
        f"/api/v1/profiles/{_profile['id']}/evidence/{evidence['id']}",
        headers={"Authorization": f"Bearer {owner_token}"},
    )
    assert detail.json()["verification_status"] == "verified"


async def test_reject_identity_doc_marks_rejected_and_allows_resubmit(client, db, monkeypatch):
    owner_token = await activated_user_token(client, "v-rej@example.com", "Rej Owner")
    _profile, evidence = await _identity_doc(client, monkeypatch, owner_token, "v-rej@example.com")
    admin_token = await _bootstrap_platform_admin(client, db, "v-rej-admin@example.com")
    headers = {"Authorization": f"Bearer {owner_token}"}

    created = await client.post(
        "/api/v1/verification-requests",
        headers=headers,
        json={"target_type": "identity_doc", "target_id": evidence["id"]},
    )
    vr_id = created.json()["id"]

    rejected = await client.post(
        f"/api/v1/verification-requests/{vr_id}/reject",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={"note": "Document unreadable"},
    )
    assert rejected.status_code == 200, rejected.text
    assert rejected.json()["status"] == "rejected"

    # Evidence row shows rejected.
    detail = await client.get(
        f"/api/v1/profiles/{_profile['id']}/evidence/{evidence['id']}", headers=headers
    )
    assert detail.json()["verification_status"] == "rejected"

    # Re-deciding is blocked.
    again = await client.post(
        f"/api/v1/verification-requests/{vr_id}/approve",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={},
    )
    assert again.status_code == 409
    assert again.json()["error"]["code"] == "already_decided"

    # Resubmission after rejection is allowed (new request for the same target).
    resubmitted = await client.post(
        "/api/v1/verification-requests",
        headers=headers,
        json={"target_type": "identity_doc", "target_id": evidence["id"]},
    )
    assert resubmitted.status_code == 201, resubmitted.text


async def test_create_guards_duplicate_and_verified(client, db):
    owner_token = await activated_user_token(client, "v-guard@example.com", "Guard Owner")
    profile, claim = await _profile_with_claim(client, owner_token, "v-guard@example.com")
    admin_token = await _bootstrap_platform_admin(client, db, "v-guard-admin@example.com")
    headers = {"Authorization": f"Bearer {owner_token}"}
    body = {"target_type": "profile_skill", "target_id": claim["id"]}

    first = await client.post("/api/v1/verification-requests", headers=headers, json=body)
    assert first.status_code == 201

    dup = await client.post("/api/v1/verification-requests", headers=headers, json=body)
    assert dup.status_code == 409
    assert dup.json()["error"]["code"] == "request_exists"

    vr_id = first.json()["id"]
    approved = await client.post(
        f"/api/v1/verification-requests/{vr_id}/approve",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={},
    )
    assert approved.status_code == 200

    # Already-evidenced claim can't be requested again.
    verified = await client.post("/api/v1/verification-requests", headers=headers, json=body)
    assert verified.status_code == 409
    assert verified.json()["error"]["code"] == "already_verified"


async def test_queue_permission_split(client, db):
    from app.services import rbac as rbac_service

    owner_token = await activated_user_token(client, "v-split@example.com", "Split Owner")
    _profile, claim = await _profile_with_claim(client, owner_token, "v-split@example.com")
    await client.post(
        "/api/v1/verification-requests",
        headers={"Authorization": f"Bearer {owner_token}"},
        json={"target_type": "profile_skill", "target_id": claim["id"]},
    )

    # Reviewer-only user: can list, cannot decide.
    reviewer_token = await activated_user_token(client, "v-reviewer@example.com", "Reviewer")
    me = await client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {reviewer_token}"})
    reviewer_id = uuid.UUID(me.json()["user"]["id"])

    # Grant a custom role holding only verification:review (permission already
    # exists from the seed — reuse it).
    from sqlalchemy import select

    from app.models.identity import Permission, Role, RolePermission, UserRole

    perm = (
        await db.execute(select(Permission).where(Permission.code == "verification:review"))
    ).scalar_one()
    role = Role(name="verification_reviewer", description="review-only role")
    db.add(role)
    await db.flush()
    db.add(RolePermission(role_id=role.id, permission_id=perm.id))
    db.add(UserRole(user_id=reviewer_id, role_id=role.id))
    await db.commit()

    listed = await client.get(
        "/api/v1/verification-requests", headers={"Authorization": f"Bearer {reviewer_token}"}
    )
    assert listed.status_code == 200, listed.text
    assert listed.json()["total"] == 1

    denied = await client.post(
        f"/api/v1/verification-requests/{listed.json()['data'][0]['id']}/approve",
        headers={"Authorization": f"Bearer {reviewer_token}"},
        json={},
    )
    assert denied.status_code == 403

    # Plain professional cannot even list.
    pro_token = await activated_user_token(client, "v-pro@example.com", "Plain Pro")
    forbidden = await client.get(
        "/api/v1/verification-requests", headers={"Authorization": f"Bearer {pro_token}"}
    )
    assert forbidden.status_code == 403
    assert forbidden.json()["error"]["code"] == "permission_denied"


async def test_queue_filters_and_pagination(client, db):
    admin_token = await _bootstrap_platform_admin(client, db, "v-queue-admin@example.com")
    owner_token = await activated_user_token(client, "v-queue@example.com", "Queue Owner")
    profile, claim = await _profile_with_claim(client, owner_token, "v-queue@example.com")
    headers = {"Authorization": f"Bearer {owner_token}"}

    # Two claims → two requests; approve one, leave one pending.
    claim2 = await client.post(
        f"/api/v1/profiles/{profile['id']}/skills",
        headers=headers,
        json={"skill_name": "Go"},
    )
    assert claim2.status_code == 201
    vr1 = (
        await client.post(
            "/api/v1/verification-requests",
            headers=headers,
            json={"target_type": "profile_skill", "target_id": claim["id"]},
        )
    ).json()
    vr2 = (
        await client.post(
            "/api/v1/verification-requests",
            headers=headers,
            json={"target_type": "profile_skill", "target_id": claim2.json()["id"]},
        )
    ).json()

    await client.post(
        f"/api/v1/verification-requests/{vr1['id']}/approve",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={},
    )

    pending = await client.get(
        "/api/v1/verification-requests", headers={"Authorization": f"Bearer {admin_token}"}
    )
    assert pending.json()["total"] == 1
    assert [r["id"] for r in pending.json()["data"]] == [vr2["id"]]

    everything = await client.get(
        "/api/v1/verification-requests?status=all&page=1&page_size=1",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert everything.json()["total"] == 2
    assert len(everything.json()["data"]) == 1  # page_size=1

    bad = await client.get(
        "/api/v1/verification-requests?status=weird",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert bad.status_code == 422


async def test_request_target_ownership_guard(client, db):
    stranger_token = await activated_user_token(client, "v-stranger@example.com", "Stranger")
    owner_token = await activated_user_token(client, "v-own@example.com", "Owner")
    _profile, claim = await _profile_with_claim(client, owner_token, "v-own@example.com")

    hijack = await client.post(
        "/api/v1/verification-requests",
        headers={"Authorization": f"Bearer {stranger_token}"},
        json={"target_type": "profile_skill", "target_id": claim["id"]},
    )
    assert hijack.status_code == 403
    assert hijack.json()["error"]["code"] == "permission_denied"

    missing = await client.post(
        "/api/v1/verification-requests",
        headers={"Authorization": f"Bearer {owner_token}"},
        json={"target_type": "profile_skill", "target_id": str(uuid.uuid4())},
    )
    assert missing.status_code == 404
    assert missing.json()["error"]["code"] == "skill_claim_not_found"

    bad_type = await client.post(
        "/api/v1/verification-requests",
        headers={"Authorization": f"Bearer {owner_token}"},
        json={"target_type": "organization", "target_id": str(uuid.uuid4())},
    )
    assert bad_type.status_code == 422
