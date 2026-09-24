"""Profile-checks (UF-7 readiness pipeline) — API + pipeline tests.

The web-search tool and GitHub are stubbed so tests are hermetic: no network.
"""

from unittest.mock import patch

from helpers import activated_user_token


def _ok_websearch(url: str, limit: int = 10) -> dict:
    """The shape ai-backend/test.py `search_everywhere` returns on success."""
    return {
        "target": {"input_url": url, "normalized_url": url, "platform": "upwork", "domain": "upwork.com", "identifier": "someone"},
        "queries": [f'"{url}"'],
        "provider_status": {"duckduckgo": {"enabled": True, "reason": "ddgs installed", "requests": 2, "results": 3, "errors": []}},
        "summary": {"raw_results": 5, "unique_results": 3, "strong_matches": 1, "elapsed_seconds": 0.5, "parallel_workers": 2},
        "strong_matches": [{"title": "Upwork profile — someone", "url": url, "snippet": "s", "provider": "duckduckgo", "query": "q", "score": 175.0, "sources": ["duckduckgo"], "queries": ["q"]}],
        "all_results": [],
    }


async def _headers(client) -> dict[str, str]:
    token = await activated_user_token(client, email="checker@example.com", full_name="Check Er")
    return {"Authorization": f"Bearer {token}"}


async def _run_pipeline_to_completion(check_id: str):
    """Run the pipeline inline against the app's (overridden) test session.

    Production uses pc.execute_check (BackgroundTasks + SessionLocal); tests
    replace the DB via dependency override, so run through that session.
    """
    import uuid as uuid_mod

    from app.core.db import get_db
    from app.main import app
    from app.models.profile_check import ProfileCheck
    from app.services import profile_check as pc

    override = app.dependency_overrides[get_db]
    agen = override()
    db = await agen.__anext__()
    try:
        check = await db.get(ProfileCheck, uuid_mod.UUID(check_id))
        assert check is not None
        await pc.run_check(db, check)
    finally:
        await agen.aclose()


async def test_create_requires_auth(client):
    resp = await client.post(
        "/api/v1/profile-checks",
        json={"github_url": "https://github.com/octocat"},
    )
    assert resp.status_code == 401


async def test_create_rejects_empty_submission(client):
    headers = await _headers(client)
    resp = await client.post("/api/v1/profile-checks", json={}, headers=headers)
    assert resp.status_code == 422
    assert resp.json()["error"]["code"] == "no_sources"


async def test_create_rejects_unparseable_url(client):
    headers = await _headers(client)
    resp = await client.post(
        "/api/v1/profile-checks",
        json={"github_url": "https://gitlab.com/someone"},
        headers=headers,
    )
    assert resp.status_code == 422
    assert resp.json()["error"]["code"] == "invalid_url"


async def test_full_pipeline_github_only(client):
    """GitHub-only run: sources honest, profile+claims scored, cap applied."""
    headers = await _headers(client)

    github_payload = {
        "user": {"login": "octocat", "name": "Octo Cat", "bio": "hi", "public_repos": 8, "followers": 10, "created_at": "2015-01-01"},
        "repos": [
            {"name": f"repo{i}", "description": "d", "language": "Python" if i % 2 else "TS", "stars": 2, "forks": 1, "updated_at": "2026-01-0%d" % (i + 1)}
            for i in range(6)
        ],
        "package_deps": {"repo0": ["next"]},
    }

    async def fake_github(username):
        return github_payload

    with patch("app.services.profile_check._fetch_github", side_effect=fake_github):
        resp = await client.post(
            "/api/v1/profile-checks",
            json={"github_url": "https://github.com/octocat"},
            headers=headers,
        )
        assert resp.status_code == 202, resp.text
        check_id = resp.json()["id"]

        # Run the background task inline while the patch is active.
        await _run_pipeline_to_completion(check_id)
    poll = await client.get(f"/api/v1/profile-checks/{check_id}", headers=headers)
    assert poll.status_code == 200
    data = poll.json()
    assert data["status"] == "completed"
    assert data["result"] is not None
    assert 0 <= data["result"]["readiness"] <= 95  # uncapped: honest dimension sum
    assert data["result"]["capped"] is False
    assert data["result"]["partial"] is True  # upwork/fiverr/cv skipped
    src = {s["source"]: s for s in data["sources"]}
    assert src["github"]["status"] == "ok"
    assert src["upwork"]["status"] == "skipped"
    assert src["fiverr"]["status"] == "skipped"
    assert src["cv"]["status"] == "skipped"
    dims = {d["key"]: d for d in data["result"]["result"]["dimensions"]}
    assert dims["github"]["points"] > 0
    assert dims["profile"]["points"] == 0  # no AI5K profile in this test user


async def test_websearch_tool_corroborates_upwork(client):
    """When the tool returns strong matches the upwork source is ok and scores."""
    headers = await _headers(client)

    tool = type("T", (), {"search_everywhere": staticmethod(_ok_websearch)})()
    with patch("app.services.profile_check._load_websearch_tool", return_value=tool):
        resp = await client.post(
            "/api/v1/profile-checks",
            json={"upwork_url": "https://www.upwork.com/freelancers/~01abc222"},
            headers=headers,
        )
        assert resp.status_code == 202
        check_id = resp.json()["id"]
        await _run_pipeline_to_completion(check_id)

    poll = await client.get(f"/api/v1/profile-checks/{check_id}", headers=headers)
    data = poll.json()
    src = {s["source"]: s for s in data["sources"]}
    assert src["upwork"]["status"] == "ok"
    dims = {d["key"]: d for d in data["result"]["result"]["dimensions"]}
    assert dims["external"]["points"] == 10


async def test_websearch_tool_no_match_marks_failed(client):
    headers = await _headers(client)

    def no_match(url, limit=10):
        data = _ok_websearch(url)
        data["strong_matches"] = []
        data["summary"]["strong_matches"] = 0
        return data

    tool = type("T", (), {"search_everywhere": staticmethod(no_match)})()
    with patch("app.services.profile_check._load_websearch_tool", return_value=tool):
        resp = await client.post(
            "/api/v1/profile-checks",
            json={"fiverr_url": "https://www.fiverr.com/nosuch"},
            headers=headers,
        )
        assert resp.status_code == 202
        check_id = resp.json()["id"]
        await _run_pipeline_to_completion(check_id)

    poll = await client.get(f"/api/v1/profile-checks/{check_id}", headers=headers)
    data = poll.json()
    src = {s["source"]: s for s in data["sources"]}
    assert src["fiverr"]["status"] == "failed"
    assert src["fiverr"]["error_code"] == "no_strong_match"


async def test_github_user_not_found_is_failed_not_check_failed(client):
    headers = await _headers(client)

    from app.services.profile_check import SourceFetchError

    async def not_found(username):
        raise SourceFetchError("github_user_not_found", "nope")

    with patch("app.services.profile_check._fetch_github", side_effect=not_found):
        resp = await client.post(
            "/api/v1/profile-checks",
            json={"github_url": "https://github.com/ghost404"},
            headers=headers,
        )
        check_id = resp.json()["id"]
        await _run_pipeline_to_completion(check_id)

    poll = await client.get(f"/api/v1/profile-checks/{check_id}", headers=headers)
    data = poll.json()
    assert data["status"] == "completed"  # check itself succeeded
    src = {s["source"]: s for s in data["sources"]}
    assert src["github"]["status"] == "failed"
    assert src["github"]["error_code"] == "github_user_not_found"


async def test_evidenced_skill_raises_claims_dimension(client):
    """Evidenced claims score 10 each in the claims dimension (10 vs 2 for self-declared)."""
    headers = await _headers(client)

    # Create a profile + skill claim, then flip it to evidenced directly in the DB.
    prof = await client.post(
        "/api/v1/profiles",
        json={"display_name": "Cap Lifter", "visibility": "public", "job_roles": ["dev"], "portfolio_links": []},
        headers=headers,
    )
    assert prof.status_code == 201, prof.text
    profile_id = prof.json()["id"]

    claim_resp = await client.post(
        f"/api/v1/profiles/{profile_id}/skills",
        json={"skill_name": "python", "proficiency_level": "advanced"},
        headers=headers,
    )
    assert claim_resp.status_code == 201, claim_resp.text

    # Flip claim_type through the app's dependency-overridden session.
    import uuid as uuid_mod

    from app.core.db import get_db
    from app.main import app
    from app.models.profile import ProfileSkill

    override = app.dependency_overrides[get_db]
    agen = override()
    session = await agen.__anext__()
    try:
        claim_id = uuid_mod.UUID(claim_resp.json()["id"])
        claim = await session.get(ProfileSkill, claim_id)
        assert claim is not None
        claim.claim_type = "evidenced"
        await session.commit()
    finally:
        await agen.aclose()

    async def fake_github(username):
        return {"user": {"login": "x", "name": None, "bio": None, "public_repos": 3, "followers": 1, "created_at": None}, "repos": [], "package_deps": {}}

    with patch("app.services.profile_check._fetch_github", side_effect=fake_github):
        resp = await client.post(
            "/api/v1/profile-checks",
            json={"github_url": "https://github.com/x"},
            headers=headers,
        )
    check_id = resp.json()["id"]
    await _run_pipeline_to_completion(check_id)

    poll = await client.get(f"/api/v1/profile-checks/{check_id}", headers=headers)
    data = poll.json()
    assert data["result"]["capped"] is False  # cap removed — always False now
    dims = {d["key"]: d for d in data["result"]["result"]["dimensions"]}
    assert dims["claims"]["points"] >= 10


async def test_concurrent_check_rejected(client):
    headers = await _headers(client)
    resp = await client.post(
        "/api/v1/profile-checks",
        json={"github_url": "https://github.com/octo"},
        headers=headers,
    )
    check_id = resp.json()["id"]
    # While still pending (we haven't executed the background task), a second POST → 409.
    second = await client.post(
        "/api/v1/profile-checks",
        json={"github_url": "https://github.com/octo"},
        headers=headers,
    )
    assert second.status_code == 409
    assert second.json()["error"]["code"] == "check_in_progress"
    await _run_pipeline_to_completion(check_id)


async def test_latest_endpoint(client):
    headers = await _headers(client)
    empty = await client.get("/api/v1/profile-checks/latest", headers=headers)
    assert empty.status_code == 404

    resp = await client.post(
        "/api/v1/profile-checks",
        json={"github_url": "https://github.com/octo"},
        headers=headers,
    )
    check_id = resp.json()["id"]
    await _run_pipeline_to_completion(check_id)

    latest = await client.get("/api/v1/profile-checks/latest", headers=headers)
    assert latest.status_code == 200
    assert latest.json()["id"] == check_id


async def test_cv_upload_and_scoring(client):
    """Upload a CV (md), attach via token, check scores the CV dimension."""
    headers = await _headers(client)

    cv_text = (
        "# Jane Doe — AI Engineer\n\n"
        "Skills: python, pytorch, langchain, aws, docker, kubernetes, rag, llm.\n"
        "Built production RAG pipelines and machine learning systems.\n" * 8
    )
    upload = await client.post(
        "/api/v1/profile-checks/cv",
        files={"file": ("cv.md", cv_text.encode(), "text/markdown")},
        headers=headers,
    )
    assert upload.status_code == 200, upload.text
    token = upload.json()["cv_token"]
    assert upload.json()["filename"] == "cv.md"

    resp = await client.post(
        "/api/v1/profile-checks",
        json={"cv_token": token},
        headers=headers,
    )
    assert resp.status_code == 202, resp.text
    check_id = resp.json()["id"]
    await _run_pipeline_to_completion(check_id)

    poll = await client.get(f"/api/v1/profile-checks/{check_id}", headers=headers)
    data = poll.json()
    src = {s["source"]: s for s in data["sources"]}
    assert src["cv"]["status"] == "ok"
    assert src["cv"]["raw"]["chars"] > 500
    dims = {d["key"]: d for d in data["result"]["result"]["dimensions"]}
    assert dims["cv"]["points"] == 5  # present + keywords found


async def test_cv_token_is_single_use(client):
    headers = await _headers(client)
    upload = await client.post(
        "/api/v1/profile-checks/cv",
        files={"file": ("cv.txt", b"hello world " * 200, "text/plain")},
        headers=headers,
    )
    token = upload.json()["cv_token"]

    first = await client.post("/api/v1/profile-checks", json={"cv_token": token}, headers=headers)
    assert first.status_code == 202
    await _run_pipeline_to_completion(first.json()["id"])

    second = await client.post("/api/v1/profile-checks", json={"cv_token": token}, headers=headers)
    assert second.status_code == 404
    assert second.json()["error"]["code"] == "cv_token_not_found"


async def test_cv_rejects_bad_type_and_attaches_wrong_owner(client):
    headers = await _headers(client)

    # .exe rejected
    bad = await client.post(
        "/api/v1/profile-checks/cv",
        files={"file": ("evil.exe", b"MZ\x90\x00", "application/x-msdownload")},
        headers=headers,
    )
    assert bad.status_code == 422
    assert bad.json()["error"]["code"] == "unsupported_content_type"

    # token minted by another user cannot be attached
    other_token = await activated_user_token(client, email="cvthief@example.com", full_name="CV Thief")
    upload = await client.post(
        "/api/v1/profile-checks/cv",
        files={"file": ("cv.txt", b"mine " * 100, "text/plain")},
        headers={"Authorization": f"Bearer {other_token}"},
    )
    stolen = upload.json()["cv_token"]
    use = await client.post("/api/v1/profile-checks", json={"cv_token": stolen}, headers=headers)
    assert use.status_code == 403
    assert use.json()["error"]["code"] == "permission_denied"


async def test_cv_alone_satisfies_the_one_source_rule(client):
    headers = await _headers(client)
    upload = await client.post(
        "/api/v1/profile-checks/cv",
        files={"file": ("cv.md", ("python pytorch rag " * 100).encode(), "text/markdown")},
        headers=headers,
    )
    token = upload.json()["cv_token"]
    resp = await client.post("/api/v1/profile-checks", json={"cv_token": token}, headers=headers)
    assert resp.status_code == 202  # no no_sources error


async def test_cv_attach_as_certificate_evidence(client):
    """Upload a CV → attach as certificate evidence → row exists, downloadable."""
    headers = await _headers(client)

    # Profile is required before evidence can attach.
    prof = await client.post(
        "/api/v1/profiles",
        json={"display_name": "CV Ev", "visibility": "public", "job_roles": [], "portfolio_links": []},
        headers=headers,
    )
    assert prof.status_code == 201, prof.text

    upload = await client.post(
        "/api/v1/profile-checks/cv",
        files={"file": ("my-cv.md", ("python pytorch rag " * 50).encode(), "text/markdown")},
        headers=headers,
    )
    assert upload.status_code == 200, upload.text
    token = upload.json()["cv_token"]

    attach = await client.post(
        "/api/v1/profile-checks/cv/attach-evidence",
        json={"cv_token": token, "source_type": "certificate", "title": "My CV"},
        headers=headers,
    )
    assert attach.status_code == 201, attach.text
    body = attach.json()
    assert body["source_type"] == "certificate"
    assert body["title"] == "My CV"
    assert body["verification_status"] == "pending"
    evidence_id = body["id"]

    # The row appears in the evidence list with a working local download route.
    listing = await client.get(f"/api/v1/profiles/{body['profile_id']}/evidence", headers=headers)
    rows = listing.json()
    row = next(r for r in rows if r["id"] == evidence_id)
    assert row["download_url"], "local evidence must expose a download route"

    file_resp = await client.get(row["download_url"], headers=headers)
    assert file_resp.status_code == 200
    assert b"pytorch" in file_resp.content


async def test_cv_attach_requires_profile_and_valid_token(client):
    headers = await _headers(client)

    # No profile yet → 404 profile_not_found.
    upload = await client.post(
        "/api/v1/profile-checks/cv",
        files={"file": ("cv.txt", b"hello " * 100, "text/plain")},
        headers=headers,
    )
    token = upload.json()["cv_token"]
    no_profile = await client.post(
        "/api/v1/profile-checks/cv/attach-evidence",
        json={"cv_token": token},
        headers=headers,
    )
    assert no_profile.status_code == 404
    assert no_profile.json()["error"]["code"] == "profile_not_found"

    # Create the profile; the token from before was NOT consumed by the failed call? It WAS (pop happens first).
    prof = await client.post(
        "/api/v1/profiles",
        json={"display_name": "Second", "visibility": "public", "job_roles": [], "portfolio_links": []},
        headers=headers,
    )
    assert prof.status_code == 201
    replay = await client.post(
        "/api/v1/profile-checks/cv/attach-evidence",
        json={"cv_token": token},
        headers=headers,
    )
    assert replay.status_code == 404
    assert replay.json()["error"]["code"] == "cv_token_not_found"


async def test_cv_skill_suggestions_flow(client):
    """Upload CV → suggestions list unclaimed keywords → claim one → diff shrinks."""
    headers = await _headers(client)

    prof = await client.post(
        "/api/v1/profiles",
        json={"display_name": "Sugg U", "visibility": "public", "job_roles": [], "portfolio_links": []},
        headers=headers,
    )
    assert prof.status_code == 201, prof.text

    # CV mentioning python (3×, already claimed below), kubernetes (2×), langchain (1×).
    cv_text = "python kubernetes python langchain kubernetes python rag"
    upload = await client.post(
        "/api/v1/profile-checks/cv",
        files={"file": ("cv.md", cv_text.encode(), "text/markdown")},
        headers=headers,
    )
    assert upload.status_code == 200

    # 404 when there is no check carrying a CV yet (upload alone doesn't create one).
    none = await client.get("/api/v1/profile-checks/cv/suggestions", headers=headers)
    assert none.status_code == 404
    assert none.json()["error"]["code"] == "cv_not_found"

    # Run a CV-only check so a check row carries the CV.
    token = upload.json()["cv_token"]
    created = await client.post("/api/v1/profile-checks", json={"cv_token": token}, headers=headers)
    assert created.status_code == 202
    await _run_pipeline_to_completion(created.json()["id"])

    sug = await client.get("/api/v1/profile-checks/cv/suggestions", headers=headers)
    assert sug.status_code == 200, sug.text
    body = sug.json()
    # Ranked by frequency: python(3) > kubernetes(2) > langchain(1) > rag(1, alpha tie-break)
    assert body["suggested"][:2] == ["python", "kubernetes"]
    assert "langchain" in body["suggested"]
    assert body["already_claimed"] == []
    assert body["filename"] == "cv.md"

    # Claim python → it moves from suggested to already_claimed.
    import uuid as uuid_mod

    from app.core.db import get_db
    from app.main import app
    from app.models.profile import Profile
    from app.services.profiles import create_or_get_skill

    override = app.dependency_overrides[get_db]
    agen = override()
    session = await agen.__anext__()
    try:
        prow = await session.execute(
            __import__("sqlalchemy").select(Profile).where(Profile.user_id != None)  # noqa: E711
        )
        profile = prow.scalars().first()
        skill = await create_or_get_skill(session, name="python")
        from app.models.profile import ProfileSkill

        session.add(
            ProfileSkill(
                profile_id=profile.id,
                skill_id=skill.id,
                claim_type="self_declared",
                proficiency_level="advanced",
            )
        )
        await session.commit()
        profile_id = str(profile.id)
    finally:
        await agen.aclose()

    sug2 = await client.get("/api/v1/profile-checks/cv/suggestions", headers=headers)
    body2 = sug2.json()
    assert "python" not in body2["suggested"]
    assert body2["already_claimed"] == ["python"]

    # And the claim API accepts the suggestion directly (frontend will POST these).
    skill_claim = await client.post(
        f"/api/v1/profiles/{profile_id}/skills",
        json={"skill_name": "kubernetes", "proficiency_level": "intermediate"},
        headers=headers,
    )
    assert skill_claim.status_code == 201, skill_claim.text


async def test_cannot_read_someone_elses_check(client):
    token_a = await activated_user_token(client, email="aowner@example.com", full_name="A Owner")
    token_b = await activated_user_token(client, email="bowner@example.com", full_name="B Owner")

    resp = await client.post(
        "/api/v1/profile-checks",
        json={"github_url": "https://github.com/octo"},
        headers={"Authorization": f"Bearer {token_a}"},
    )
    check_id = resp.json()["id"]

    forbidden = await client.get(
        f"/api/v1/profile-checks/{check_id}", headers={"Authorization": f"Bearer {token_b}"}
    )
    assert forbidden.status_code == 404
    await _run_pipeline_to_completion(check_id)


async def test_rerun_reuses_stored_cv(client):
    """reuse_cv=True re-links the latest check's stored CV — no new upload needed.

    Regression for the single-use token gap: a re-run of a CV-only check used to
    fail with 422 no_sources because tokens are consumed on first use.
    """
    headers = await _headers(client)
    cv_text = "Skills: python, pytorch, langchain.\nBuilt RAG pipelines with llm.\n" * 4
    upload = await client.post(
        "/api/v1/profile-checks/cv",
        files={"file": ("cv.md", cv_text.encode(), "text/markdown")},
        headers=headers,
    )
    token = upload.json()["cv_token"]
    resp = await client.post("/api/v1/profile-checks", json={"cv_token": token}, headers=headers)
    check_id = resp.json()["id"]
    await _run_pipeline_to_completion(check_id)

    # Re-run with reuse_cv and NO cv_token: must be accepted (202), not 422.
    rerun = await client.post("/api/v1/profile-checks", json={"reuse_cv": True}, headers=headers)
    assert rerun.status_code == 202, rerun.text
    rerun_id = rerun.json()["id"]
    await _run_pipeline_to_completion(rerun_id)

    poll = await client.get(f"/api/v1/profile-checks/{rerun_id}", headers=headers)
    data = poll.json()
    cv_src = next(s for s in data["sources"] if s["source"] == "cv")
    assert cv_src["status"] == "ok"
    assert cv_src["raw"]["filename"] == "cv.md"

    # Without reuse_cv the empty body still fails honestly.
    empty = await client.post("/api/v1/profile-checks", json={}, headers=headers)
    assert empty.status_code == 422
    assert empty.json()["error"]["code"] == "no_sources"


async def test_cv_upload_browser_mime_variants(client):
    """Browsers don't always send the canonical MIME.

    application/octet-stream (unmapped OS type), application/x-pdf (alternate
    PDF type), and an empty declared type must still upload — resolved via
    filename extension, then magic bytes.
    """
    headers = await _headers(client)
    cv_bytes = b"Skills: python, pytorch, langchain, kubernetes.\nRAG pipelines with llm.\n" * 6
    for declared, fname in [
        ("application/octet-stream", "cv.txt"),   # extension fallback
        ("application/octet-stream", "cv.md"),    # extension picks md
        ("application/x-pdf", "cv.txt"),           # alt MIME + extension
        ("", "cv.md"),                             # empty declared type
    ]:
        resp = await client.post(
            "/api/v1/profile-checks/cv",
            files={"file": (fname, cv_bytes, declared)},
            headers=headers,
        )
        assert resp.status_code == 200, f"{declared}/{fname}: {resp.text}"
        token = resp.json()["cv_token"]
        # And the token must actually work end-to-end.
        check = await client.post("/api/v1/profile-checks", json={"cv_token": token}, headers=headers)
        assert check.status_code == 202, check.text
        check_id = check.json()["id"]
        await _run_pipeline_to_completion(check_id)
        poll = await client.get(f"/api/v1/profile-checks/{check_id}", headers=headers)
        src = next(s for s in poll.json()["sources"] if s["source"] == "cv")
        assert src["status"] == "ok", f"{declared}/{fname}: cv source {src}"

    # Real PDF magic under a wrong declared type must pass via magic bytes.
    pdf = await client.post(
        "/api/v1/profile-checks/cv",
        files={"file": ("cv.bin", b"%PDF-1.4\n..." + cv_bytes, "application/octet-stream")},
        headers=headers,
    )
    assert pdf.status_code == 200, pdf.text

    # Garbage bytes with no extension and no usable magic stay rejected.
    junk = await client.post(
        "/api/v1/profile-checks/cv",
        files={"file": ("blob", b"\x00\x01\x02\xff\xfe", "application/octet-stream")},
        headers=headers,
    )
    assert junk.status_code == 422
    assert junk.json()["error"]["code"] == "unsupported_content_type"
