"""Dogfood transcript — exercises the new endpoints over real HTTP.

Usage: .venv/bin/python scripts/dogfood.py
Boots `uvicorn app.main:app` on a free port in-process, runs the flow below, prints
a transcript, exits non-zero on any step failure.

Flow: signup x4 → verify → login → profile CRUD → skills → services → org + PATCH
→ member invite/consent → aggregation → remove → re-invite.
"""

import json
import os
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.request

os.environ.setdefault("ENV", "local")

BASE = None  # set after server boot


def req(method: str, path: str, token: str | None = None, body: dict | None = None):
    """HTTP request; returns (status, parsed_json_or_none) including non-2xx responses."""
    url = BASE + path
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(url, data=data, method=method)
    r.add_header("Content-Type", "application/json")
    if token:
        r.add_header("Authorization", f"Bearer {token}")
    try:
        with urllib.request.urlopen(r, timeout=15) as resp:
            payload = resp.read().decode()
            return resp.status, (json.loads(payload) if payload else None)
    except urllib.error.HTTPError as e:
        payload = e.read().decode()
        return e.code, (json.loads(payload) if payload else None)


def expect(step: str, got: int, want: int, payload=None, want_code: str | None = None):
    ok = got == want and (want_code is None or (payload or {}).get("error", {}).get("code") == want_code)
    mark = "OK " if ok else "FAIL"
    extra = f" code={payload['error']['code']}" if payload and "error" in (payload or {}) else ""
    print(f"[{mark}] {step}: {got} (want {want}){extra}")
    if not ok:
        print(f"       payload: {json.dumps(payload)[:400] if payload is not None else None}")
        raise SystemExit(1)


def signup_login(email: str, name: str) -> str:
    s, p = req("POST", "/api/v1/auth/signup", body={"email": email, "password": "password123", "full_name": name})
    expect(f"signup {email}", s, 201, p)
    s, p = req("POST", "/api/v1/auth/verify-email", body={"token": p["verification_token"]})
    expect(f"verify {email}", s, 200, p)
    s, p = req("POST", "/api/v1/auth/login", body={"email": email, "password": "password123"})
    expect(f"login {email}", s, 200, p)
    return p["access_token"]


def wait_ready(base: str, deadline_s: float = 30.0) -> None:
    end = time.time() + deadline_s
    while time.time() < end:
        try:
            with urllib.request.urlopen(base + "/health", timeout=2) as resp:
                if resp.status == 200:
                    return
        except Exception:
            time.sleep(0.3)
    print("FAIL server never became healthy")
    raise SystemExit(1)


def main() -> None:
    global BASE
    import socket

    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        port = s.getsockname()[1]
    BASE = f"http://127.0.0.1:{port}"

    proc = subprocess.Popen(
        [sys.executable, "-m", "uvicorn", "app.main:app", "--port", str(port), "--log-level", "warning"],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    t = threading.Thread(target=lambda: proc.wait(), daemon=True)
    t.start()
    try:
        wait_ready(BASE)
        print(f"# server up at {BASE}")

        # --- Auth: four personas (unique per run — the dev DB persists) -----
        stamp = str(int(time.time()))
        admin_email = f"df-admin-{stamp}@example.com"
        member_email = f"df-member-{stamp}@example.com"
        out_email = f"df-out-{stamp}@example.com"
        late_email = f"df-late-{stamp}@example.com"
        admin = signup_login(admin_email, "DF Admin")
        member = signup_login(member_email, "DF Member")
        outsider = signup_login(out_email, "DF Outsider")
        late = signup_login(late_email, "DF Late")
        print()

        # --- Profile CRUD ---------------------------------------------------
        s, p = req("POST", "/api/v1/profiles", admin, {
            "display_name": "DF Admin", "headline": "Platform engineer",
            "job_roles": ["Backend Engineer", "Data Analyst"],
            "portfolio_links": [{"label": "GitHub", "url": "https://github.com/dfadmin"}],
            "visibility": "public",
        })
        expect("create profile (individual)", s, 201, p)
        profile_id = p["id"]
        assert p["owner_type"] == "individual"

        s, p = req("POST", "/api/v1/profiles", admin, {"display_name": "Dup"})
        expect("duplicate profile rejected", s, 409, p, "profile_exists")

        s, p = req("GET", "/api/v1/profiles/me", admin)
        expect("GET /profiles/me", s, 200, p)
        assert p["headline"] == "Platform engineer"

        s, p = req("PATCH", f"/api/v1/profiles/{profile_id}", admin, {"headline": "Sr. Platform Engineer"})
        expect("PATCH profile", s, 200, p)

        s, p = req("GET", f"/api/v1/profiles/{profile_id}", outsider)
        expect("public profile readable by stranger", s, 200, p)
        print()

        # --- Skills ----------------------------------------------------------
        s, p = req("POST", f"/api/v1/profiles/{profile_id}/skills", admin,
                   {"skill_name": "Python", "category": "languages", "proficiency_level": "expert"})
        expect("claim skill (create-or-get)", s, 201, p)
        claim_id = p["id"]
        assert p["claim_type"] == "self_declared", "claim_type must be server-asserted"

        s, p = req("POST", f"/api/v1/profiles/{profile_id}/skills", admin,
                   {"skill_name": "Python", "claim_type": "evidenced"})
        expect("duplicate claim rejected", s, 409, p, "skill_already_claimed")

        s, p = req("POST", f"/api/v1/profiles/{profile_id}/skills", outsider, {"skill_name": "Go"})
        expect("stranger cannot claim on others' profile", s, 403, p, "permission_denied")

        s, p = req("PATCH", f"/api/v1/profiles/{profile_id}/skills/{claim_id}", admin,
                   {"proficiency_level": "advanced"})
        expect("PATCH claim proficiency", s, 200, p)

        s, p = req("GET", "/api/v1/skills?category=languages", admin)
        expect("GET /skills catalog", s, 200, p)
        assert p["total"] == 1 and p["data"][0]["name"] == "python"
        print()

        # --- Services --------------------------------------------------------
        s, p = req("POST", f"/api/v1/profiles/{profile_id}/services", admin, {
            "title": "API integration", "description": "Build and integrate REST APIs.",
            "rate_type": "hourly", "rate_amount": 45.5,
        })
        expect("create service (default availability)", s, 201, p)
        service_id = p["id"]
        assert p["availability_status"] == "available"

        s, p = req("PATCH", f"/api/v1/profiles/{profile_id}/services/{service_id}", admin,
                   {"availability_status": "booked", "rate_amount": 50})
        expect("PATCH service (booked, new rate)", s, 200, p)

        s, p = req("GET", f"/api/v1/profiles/{profile_id}/services", outsider)
        expect("services visible on public profile", s, 200, p)

        s, p = req("DELETE", f"/api/v1/profiles/{profile_id}/services/{service_id}", admin)
        expect("DELETE service", s, 204, p)
        print()

        # --- Organization + PATCH -------------------------------------------
        s, p = req("POST", "/api/v1/organizations", admin, {"name": "DF Studio"})
        expect("create organization", s, 201, p)
        org_id, slug = p["id"], p["slug"]

        s, p = req("PATCH", f"/api/v1/organizations/{org_id}", admin,
                   {"description": "Dogfood studio", "website_url": "https://df.example"})
        expect("PATCH organization", s, 200, p)

        s, p = req("PATCH", f"/api/v1/organizations/{org_id}", outsider, {"name": "Hijack"})
        expect("outsider cannot PATCH organization", s, 403, p, "permission_denied")
        print()

        # --- Members: invite → consent → aggregate ---------------------------
        s, p = req("POST", f"/api/v1/organizations/{org_id}/members", admin, {"email": member_email})
        expect("invite existing user", s, 201, p)
        member_row = p
        assert p["status"] == "invited" and p["consent_given"] is False

        s, p = req("POST", f"/api/v1/organizations/{org_id}/members", admin, {"email": member_email})
        expect("duplicate invite rejected", s, 409, p, "member_exists")

        s, p = req("POST", f"/api/v1/organizations/{org_id}/members", admin, {"email": "ghost@example.com"})
        expect("unknown email rejected", s, 404, p, "user_not_found")

        s, p = req("GET", "/api/v1/organizations/invitations", member)
        expect("member sees pending invitation", s, 200, p)
        assert [i["organization_name"] for i in p] == ["DF Studio"]

        s, p = req("GET", f"/api/v1/organizations/{org_id}/members", outsider)
        expect("outsider cannot list members", s, 403, p, "permission_denied")

        s, p = req("POST", f"/api/v1/organizations/{org_id}/members/me/consent", member)
        expect("member consents (invited→active)", s, 200, p)
        assert p["status"] == "active" and p["consent_given"] is True

        s, p = req("GET", "/api/v1/auth/me", member)
        roles = {(r["name"], r["organization_id"]) for r in p["roles"]}
        assert ("professional", org_id) in roles, f"org-scoped professional missing: {roles}"

        s, p = req("POST", f"/api/v1/organizations/{org_id}/members/me/consent", member)
        expect("second consent rejected", s, 409, p, "not_pending")
        print()

        # --- Aggregation (consent gating + dedup) -----------------------------
        s, p = req("POST", "/api/v1/profiles", member, {"display_name": "DF Member"})
        expect("member creates profile", s, 201, p)
        member_profile = p["id"]
        for skill in ("Python", "Go"):
            s, p = req("POST", f"/api/v1/profiles/{member_profile}/skills", member, {"skill_name": skill})
            expect(f"member claims {skill}", s, 201, p)

        s, p = req("GET", f"/api/v1/organizations/{org_id}/skills", member)
        expect("aggregated skill view (member)", s, 200, p)
        rows = {r["name"]: r for r in p}
        assert rows["python"]["member_count"] == 2, rows
        assert rows["python"]["self_declared_count"] == 2
        assert rows["go"]["member_count"] == 1

        s, p = req("GET", f"/api/v1/organizations/{org_id}/skills", outsider)
        expect("aggregated skill view blocked for stranger", s, 403, p, "permission_denied")

        # Late invitee: claims a skill BEFORE consenting — must not be counted.
        s, p = req("POST", f"/api/v1/organizations/{org_id}/members", admin, {"email": late_email})
        expect("invite late member", s, 201, p)
        s, p = req("POST", "/api/v1/profiles", late, {"display_name": "DF Late"})
        expect("late member profile", s, 201, p)
        s, p = req("POST", f"/api/v1/profiles/{p['id']}/skills", late, {"skill_name": "Rust"})
        expect("late member claims Rust pre-consent", s, 201, p)

        s, p = req("GET", f"/api/v1/organizations/{org_id}/skills", admin)
        rows = {r["name"]: r for r in p}
        expect("aggregate excludes pre-consent claims", s, 200, p)
        assert "rust" not in rows, rows

        s, p = req("POST", f"/api/v1/organizations/{org_id}/members/me/consent", late)
        expect("late member consents", s, 200, p)
        s, p = req("GET", f"/api/v1/organizations/{org_id}/skills", admin)
        rows = {r["name"]: r for r in p}
        expect("aggregate includes post-consent claims", s, 200, p)
        assert rows["rust"]["member_count"] == 1, rows
        print()

        # --- Evidence: link flow + claim links (no storage needed) ------------
        # The dev DB has no S3 bucket configured, so this section proves the
        # no-storage contract: link/testimonial evidence works end to end, file
        # types answer 503 storage_not_configured. With a bucket set, the presign
        # step would return a real upload_url instead of the 503.
        ev_base = f"/api/v1/profiles/{profile_id}/evidence"

        s, p = req("POST", ev_base, admin, {
            "source_type": "link", "title": "GitHub — df-admin",
            "url": "https://github.com/df-admin", "description": "Public code",
        })
        expect("create link evidence (no storage needed)", s, 201, p)
        evidence_id = p["id"]
        assert p["verification_status"] == "pending", "rows must start pending (server-managed)"
        assert p["file_url"] == "https://github.com/df-admin"
        assert p["download_url"] is None

        s, p = req("POST", f"{ev_base}/presign", admin,
                   {"source_type": "document", "content_type": "application/pdf"})
        expect("presign without bucket → 503", s, 503, p, "storage_not_configured")

        s, p = req("POST", ev_base, admin,
                   {"source_type": "document", "title": "No bucket", "file_key": f"evidence/{profile_id}/x.pdf"})
        expect("file evidence without bucket → 503", s, 503, p, "storage_not_configured")

        s, p = req("POST", ev_base, admin,
                   {"source_type": "link", "title": "Bad scheme", "url": "ftp://nope.example"})
        expect("link with non-http url rejected", s, 422, p, "invalid_url")

        s, p = req("GET", ev_base, admin)
        expect("list evidence", s, 200, p)
        assert [e["id"] for e in p] == [evidence_id]

        # Link the admin's Python skill claim as evidence-backed.
        s, p = req("GET", f"/api/v1/profiles/{profile_id}/skills", admin)
        python_claim = next(c for c in p if c["skill_name"] == "python")

        s, p = req("POST", f"{ev_base}/{evidence_id}/skill-links", admin,
                   {"profile_skill_id": python_claim["id"]})
        expect("link evidence to skill claim", s, 201, p)
        link_id = p["id"]

        s, p = req("POST", f"{ev_base}/{evidence_id}/skill-links", admin,
                   {"profile_skill_id": python_claim["id"]})
        expect("duplicate link rejected", s, 409, p, "link_exists")

        # Cross-profile claim link must be rejected (late member's Rust claim).
        s, p = req("GET", "/api/v1/profiles/me", late)
        late_profile_id = p["id"]
        s, p = req("GET", f"/api/v1/profiles/{late_profile_id}/skills", late)
        rust_claim = next(c for c in p if c["skill_name"] == "rust")
        s, p = req("POST", f"{ev_base}/{evidence_id}/skill-links", admin,
                   {"profile_skill_id": rust_claim["id"]})
        expect("cross-profile claim link rejected", s, 404, p, "skill_claim_not_found")

        # Stranger can't touch the admin's evidence.
        s, p = req("POST", f"{ev_base}/{evidence_id}/skill-links", outsider,
                   {"profile_skill_id": python_claim["id"]})
        expect("stranger cannot link on others' evidence", s, 403, p, "permission_denied")

        s, p = req("GET", f"{ev_base}/{evidence_id}", admin)
        expect("evidence detail embeds skill links", s, 200, p)
        assert [l["profile_skill_id"] for l in p["skill_links"]] == [python_claim["id"]]

        s, p = req("DELETE", f"{ev_base}/{evidence_id}/skill-links/{link_id}", admin)
        expect("unlink skill claim", s, 204, p)

        s, p = req("DELETE", f"{ev_base}/{evidence_id}", admin)
        expect("delete evidence row", s, 204, p)

        s, p = req("GET", f"{ev_base}/{evidence_id}", admin)
        expect("deleted evidence is gone", s, 404, p, "evidence_not_found")
        print()

        # --- Remove → revoke → re-invite --------------------------------------
        s, p = req("GET", f"/api/v1/organizations/{org_id}/members", admin)
        admin_row = next(m for m in p if m["user"]["email"] == admin_email)

        s, p = req("DELETE", f"/api/v1/organizations/{org_id}/members/{admin_row['id']}", admin)
        expect("admin cannot remove self", s, 409, p, "cannot_remove_self")

        s, p = req("DELETE", f"/api/v1/organizations/{org_id}/members/{member_row['id']}", admin)
        expect("remove member", s, 204, p)

        s, p = req("GET", "/api/v1/auth/me", member)
        roles = {(r["name"], r["organization_id"]) for r in p["roles"]}
        assert ("professional", org_id) not in roles, f"role not revoked: {roles}"
        assert ("professional", None) in roles, "platform-wide professional must remain"

        s, p = req("GET", f"/api/v1/organizations/{org_id}/skills", member)
        expect("removed member loses aggregate access", s, 403, p, "permission_denied")

        s, p = req("POST", f"/api/v1/organizations/{org_id}/members", admin, {"email": member_email})
        expect("re-invite removed member (consent reset)", s, 201, p)
        assert p["status"] == "invited" and p["consent_given"] is False
        print()

        print("DOGFOOD PASSED — all endpoint checks green over real HTTP")


    finally:
        proc.terminate()
        try:
            proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            proc.kill()


if __name__ == "__main__":
    main()
