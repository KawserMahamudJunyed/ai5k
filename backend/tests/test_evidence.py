"""Evidence upload, source-type tagging & skill-claim link tests (Task 2.3 precursor).

Storage isn't configured in tests, so: link/testimonial evidence is exercised
end-to-end for real, and the file-type path is exercised via a fake storage
injected by monkeypatching `app.api.v1.evidence._storage`.
"""

import uuid

import pytest

import app.api.v1.evidence as evidence_api
from helpers import activated_user_token, create_org


class FakeStorage:
    """Stands in for S3Storage in tests — deterministic keys/URLs, real validation rules."""

    bucket = "fake-bucket"
    upload_ttl_seconds = 900
    download_ttl_seconds = 300

    def build_key(self, profile_id, content_type):
        ext = {"application/pdf": ".pdf", "image/png": ".png"}[content_type]
        return f"evidence/{profile_id}/00000000-0000-0000-0000-00000000dead{ext}"

    def validate_key(self, profile_id, key):
        prefix = f"evidence/{profile_id}/"
        return key.startswith(prefix) and ".." not in key and len(key) <= 512

    def file_url(self, key):
        return f"s3://fake-bucket/{key}"

    def presign_put(self, key, content_type):
        return f"https://s3.example/fake-bucket/{key}?signature=put"

    def presign_get(self, key):
        return f"https://s3.example/fake-bucket/{key}?signature=get"


async def _profile(client, token: str, email: str, **overrides) -> dict:
    body = {"display_name": f"Evidencer {email.split('@')[0]}"}
    body.update(overrides)
    resp = await client.post(
        "/api/v1/profiles", headers={"Authorization": f"Bearer {token}"}, json=body
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


async def _base(client, token: str, email: str, monkeypatch=None, visibility="public"):
    """Profile + claim + evidence scaffolding; fake storage injected when monkeypatch given."""
    profile = await _profile(client, token, email, visibility=visibility)
    claim = await client.post(
        f"/api/v1/profiles/{profile['id']}/skills",
        headers={"Authorization": f"Bearer {token}"},
        json={"skill_name": "Python"},
    )
    assert claim.status_code == 201, claim.text
    if monkeypatch is not None:
        monkeypatch.setattr(evidence_api, "_storage", lambda: FakeStorage())
    return profile, claim.json()


async def test_link_evidence_end_to_end_no_storage(client, db):
    from sqlalchemy import select

    from app.models.audit import AuditLog

    token = await activated_user_token(client, "ev1@example.com", "E1")
    profile, _claim = await _base(client, token, "ev1@example.com")
    base = f"/api/v1/profiles/{profile['id']}/evidence"
    headers = {"Authorization": f"Bearer {token}"}

    created = await client.post(
        base,
        headers=headers,
        json={
            "source_type": "link",
            "title": "GitHub profile",
            "url": "https://github.com/alice",
            "description": "Public code",
        },
    )
    assert created.status_code == 201, created.text
    evidence = created.json()
    assert evidence["verification_status"] == "pending"  # server-managed
    assert evidence["file_url"] == "https://github.com/alice"
    assert evidence["download_url"] is None  # no storage configured

    listed = await client.get(base, headers=headers)
    assert listed.status_code == 200
    assert [e["id"] for e in listed.json()] == [evidence["id"]]

    detail = await client.get(f"{base}/{evidence['id']}", headers=headers)
    assert detail.status_code == 200
    assert detail.json()["title"] == "GitHub profile"

    # Link the skill claim.
    linked = await client.post(
        f"{base}/{evidence['id']}/skill-links",
        headers=headers,
        json={"profile_skill_id": _claim["id"]},
    )
    assert linked.status_code == 201, linked.text
    link_id = linked.json()["id"]

    dup = await client.post(
        f"{base}/{evidence['id']}/skill-links",
        headers=headers,
        json={"profile_skill_id": _claim["id"]},
    )
    assert dup.status_code == 409
    assert dup.json()["error"]["code"] == "link_exists"

    links = await client.get(f"{base}/{evidence['id']}/skill-links", headers=headers)
    assert [l["profile_skill_id"] for l in links.json()] == [_claim["id"]]

    # EvidenceRead embeds the links.
    detail = await client.get(f"{base}/{evidence['id']}", headers=headers)
    assert [l["id"] for l in detail.json()["skill_links"]] == [link_id]

    # Unlink, then delete.
    unlinked = await client.delete(f"{base}/{evidence['id']}/skill-links/{link_id}", headers=headers)
    assert unlinked.status_code == 204
    deleted = await client.delete(f"{base}/{evidence['id']}", headers=headers)
    assert deleted.status_code == 204

    gone = await client.get(f"{base}/{evidence['id']}", headers=headers)
    assert gone.status_code == 404

    actions = set((await db.execute(select(AuditLog.action))).scalars())
    assert {"evidence.created", "evidence.deleted", "evidence_skill_link.created", "evidence_skill_link.deleted"} <= actions


async def test_file_evidence_flow_with_fake_storage(client, monkeypatch):
    token = await activated_user_token(client, "ev2@example.com", "E2")
    profile, _claim = await _base(client, token, "ev2@example.com", monkeypatch)
    base = f"/api/v1/profiles/{profile['id']}/evidence"
    headers = {"Authorization": f"Bearer {token}"}

    presigned = await client.post(
        f"{base}/presign",
        headers=headers,
        json={"source_type": "document", "content_type": "application/pdf"},
    )
    assert presigned.status_code == 200, presigned.text
    presign = presigned.json()
    assert presign["file_key"].startswith(f"evidence/{profile['id']}/")
    assert presign["file_key"].endswith(".pdf")
    assert "signature=put" in presign["upload_url"]
    assert presign["expires_in"] == 900

    created = await client.post(
        base,
        headers=headers,
        json={
            "source_type": "document",
            "title": "Degree certificate",
            "file_key": presign["file_key"],
        },
    )
    assert created.status_code == 201, created.text
    evidence = created.json()
    assert evidence["file_url"] == f"s3://fake-bucket/{presign['file_key']}"

    listed = await client.get(base, headers=headers)
    assert listed.json()[0]["download_url"] == f"https://s3.example/fake-bucket/{presign['file_key']}?signature=get"


async def test_file_evidence_rejects_foreign_and_bad_keys(client, monkeypatch):
    token = await activated_user_token(client, "ev3@example.com", "E3")
    profile, _claim = await _base(client, token, "ev3@example.com", monkeypatch)
    base = f"/api/v1/profiles/{profile['id']}/evidence"
    headers = {"Authorization": f"Bearer {token}"}

    other_profile_id = str(uuid.uuid4())
    bad_prefix = await client.post(
        base,
        headers=headers,
        json={
            "source_type": "screenshot",
            "title": "Stolen key",
            "file_key": f"evidence/{other_profile_id}/x.png",
        },
    )
    assert bad_prefix.status_code == 422
    assert bad_prefix.json()["error"]["code"] == "invalid_file_key"

    traversal = await client.post(
        base,
        headers=headers,
        json={
            "source_type": "screenshot",
            "title": "Traversal",
            "file_key": f"evidence/{profile['id']}../../secret.png",
        },
    )
    assert traversal.status_code == 422
    assert traversal.json()["error"]["code"] == "invalid_file_key"

    missing = await client.post(
        base,
        headers=headers,
        json={"source_type": "certificate", "title": "No key"},
    )
    assert missing.status_code == 422
    assert missing.json()["error"]["code"] == "file_key_required"


async def test_source_type_validation(client, monkeypatch):
    token = await activated_user_token(client, "ev4@example.com", "E4")
    profile, _claim = await _base(client, token, "ev4@example.com", monkeypatch)
    base = f"/api/v1/profiles/{profile['id']}/evidence"
    headers = {"Authorization": f"Bearer {token}"}

    # link with file_key → 422.
    link_with_key = await client.post(
        base,
        headers=headers,
        json={"source_type": "link", "title": "X", "url": "https://x.example", "file_key": "evidence/y"},
    )
    assert link_with_key.status_code == 422
    assert link_with_key.json()["error"]["code"] == "file_key_not_allowed"

    # link without url → 422.
    link_no_url = await client.post(
        base, headers=headers, json={"source_type": "link", "title": "X"}
    )
    assert link_no_url.status_code == 422
    assert link_no_url.json()["error"]["code"] == "invalid_url"

    # link with non-http url → 422.
    bad_scheme = await client.post(
        base,
        headers=headers,
        json={"source_type": "link", "title": "X", "url": "ftp://x.example"},
    )
    assert bad_scheme.status_code == 422

    # unknown source_type → 422 (enum).
    bad_type = await client.post(
        base, headers=headers, json={"source_type": "weird", "title": "X"}
    )
    assert bad_type.status_code == 422


async def test_file_evidence_503_without_storage(client):
    """File types need a bucket; with storage unset the API answers 503, links still work."""
    token = await activated_user_token(client, "ev5@example.com", "E5")
    profile, _claim = await _base(client, token, "ev5@example.com")
    base = f"/api/v1/profiles/{profile['id']}/evidence"
    headers = {"Authorization": f"Bearer {token}"}

    presign = await client.post(
        f"{base}/presign",
        headers=headers,
        json={"source_type": "document", "content_type": "application/pdf"},
    )
    assert presign.status_code == 503
    assert presign.json()["error"]["code"] == "storage_not_configured"

    file_row = await client.post(
        base,
        headers=headers,
        json={"source_type": "document", "title": "X", "file_key": f"evidence/{profile['id']}/a.pdf"},
    )
    assert file_row.status_code == 503
    assert file_row.json()["error"]["code"] == "storage_not_configured"

    link_row = await client.post(
        base,
        headers=headers,
        json={"source_type": "link", "title": "Still works", "url": "https://x.example"},
    )
    assert link_row.status_code == 201


async def test_cross_profile_skill_link_blocked(client, monkeypatch):
    owner_token = await activated_user_token(client, "ev6@example.com", "E6")
    profile, claim = await _base(client, owner_token, "ev6@example.com", monkeypatch)

    # Second user + profile + claim.
    other_token = await activated_user_token(client, "ev7@example.com", "E7")
    other_profile, other_claim = await _base(client, other_token, "ev7@example.com", monkeypatch)

    headers = {"Authorization": f"Bearer {owner_token}"}
    evidence = await client.post(
        f"/api/v1/profiles/{profile['id']}/evidence",
        headers=headers,
        json={"source_type": "link", "title": "Repo", "url": "https://github.com/x"},
    )
    evidence_id = evidence.json()["id"]

    # Linking someone else's claim → 404 (claim not on this evidence's profile).
    cross = await client.post(
        f"/api/v1/profiles/{profile['id']}/evidence/{evidence_id}/skill-links",
        headers=headers,
        json={"profile_skill_id": other_claim["id"]},
    )
    assert cross.status_code == 404
    assert cross.json()["error"]["code"] == "skill_claim_not_found"

    # Stranger cannot touch the owner's evidence at all.
    stranger = await client.post(
        f"/api/v1/profiles/{profile['id']}/evidence/{evidence_id}/skill-links",
        headers={"Authorization": f"Bearer {other_token}"},
        json={"profile_skill_id": claim["id"]},
    )
    assert stranger.status_code == 403


async def test_evidence_permissions(client, monkeypatch):
    owner_token = await activated_user_token(client, "ev8@example.com", "E8")
    profile, _claim = await _base(
        client, owner_token, "ev8@example.com", monkeypatch, visibility="private"
    )
    base = f"/api/v1/profiles/{profile['id']}/evidence"
    owner_headers = {"Authorization": f"Bearer {owner_token}"}

    created = await client.post(
        base,
        headers=owner_headers,
        json={"source_type": "link", "title": "Private", "url": "https://x.example"},
    )
    evidence_id = created.json()["id"]

    stranger_token = await activated_user_token(client, "ev9@example.com", "E9")
    stranger_headers = {"Authorization": f"Bearer {stranger_token}"}

    # Private profile: stranger can't list or read.
    assert (await client.get(base, headers=stranger_headers)).status_code == 403
    assert (
        await client.get(f"{base}/{evidence_id}", headers=stranger_headers)
    ).status_code == 403
    # …or create/delete.
    denied_create = await client.post(
        base,
        headers=stranger_headers,
        json={"source_type": "link", "title": "Nope", "url": "https://x.example"},
    )
    assert denied_create.status_code == 403
    denied_delete = await client.delete(f"{base}/{evidence_id}", headers=stranger_headers)
    assert denied_delete.status_code == 403


async def test_org_profile_evidence_managed_by_org_admin(client, monkeypatch):
    founder_token = await activated_user_token(client, "ev10@example.com", "Founder")
    org = await create_org(client, founder_token, "Evidence Org")
    profile = await client.post(
        "/api/v1/profiles",
        headers={"Authorization": f"Bearer {founder_token}"},
        json={"organization_id": org["id"], "display_name": "Evidence Org"},
    )
    assert profile.status_code == 201, profile.text
    profile_id = profile.json()["id"]

    member_token = await activated_user_token(client, "ev11@example.com", "Member")
    member_headers = {"Authorization": f"Bearer {member_token}"}
    member_profile = await _profile(client, member_token, "ev11@example.com")
    # Member claims a skill on their own profile (independent of the org profile).
    claim = await client.post(
        f"/api/v1/profiles/{member_profile['id']}/skills",
        headers=member_headers,
        json={"skill_name": "Go"},
    )
    assert claim.status_code == 201

    # Org admin can add evidence to the org profile.
    admin_headers = {"Authorization": f"Bearer {founder_token}"}
    evidence = await client.post(
        f"/api/v1/profiles/{profile_id}/evidence",
        headers=admin_headers,
        json={"source_type": "link", "title": "Company site", "url": "https://org.example"},
    )
    assert evidence.status_code == 201, evidence.text

    # A plain member (not org admin) cannot add evidence to the org profile.
    denied = await client.post(
        f"/api/v1/profiles/{profile_id}/evidence",
        headers=member_headers,
        json={"source_type": "link", "title": "Nope", "url": "https://x.example"},
    )
    assert denied.status_code == 403
