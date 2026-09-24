"""Profile-readiness pipeline (UF-7 / PRD §10).

Architecture: the **backend owns the data**; `ai-backend` is invoked as a *tool*.

    POST /profile-checks  → row in profile_checks (backend DB) → 202
                          → background task runs the pipeline below
    ai-backend/test.py    → web-search tool: given an Upwork/Fiverr profile URL
                            it returns merged, scored search results
                            (`search_everywhere`); the backend stores the raw
                            payload in profile_check_sources and scores it.

Stages (mirroring the model vocabulary):
    pending → fetching → evaluating → completed | failed

Per-source honesty — a source is one of:
    ok        payload fetched (or corroborated via the search tool)
    failed    we tried and it errored (error_code says why)
    skipped   not supplied by the user

The score is the honest sum of its dimensions — no artificial ceiling. Skill
claims contribute whether they are self-declared or evidenced; verification
raises quality, it does not gate the score.
"""

import asyncio
import base64
import importlib.util
import json
import os
import re
import time
import uuid
from pathlib import Path
from typing import Any

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.db import SessionLocal
from app.core.errors import AppError
from app.models.profile import Profile, ProfileSkill
from app.models.profile_check import (
    ALL_SOURCES,
    CHECK_COMPLETED,
    CHECK_EVALUATING,
    CHECK_FAILED,
    CHECK_FETCHING,
    CHECK_PENDING,
    SOURCE_FAILED,
    SOURCE_OK,
    SOURCE_SKIPPED,
    ProfileCheck,
    ProfileCheckResult,
    ProfileCheckSource,
)

GITHUB_API = "https://api.github.com"
# NOTE: the evidence cap (score held at 30 without evidenced claims) was
# removed by product decision — the readiness score is now the honest sum of
# its dimensions regardless of verification state.

# Score dimensions (total 100).
MAX_GITHUB = 25
MAX_EXTERNAL = 20   # upwork 10 + fiverr 10, corroborated via the search tool
MAX_PROFILE = 20
MAX_CLAIMS = 30     # evidenced 10 each (cap 20) + self-declared 2 each (cap 10)
MAX_CV = 5

# CV uploads: PDF / DOCX / text-markdown, capped size (stored under storage_root).
CV_ALLOWED_TYPES = {
    "application/pdf": ".pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
    "text/plain": ".txt",
    "text/markdown": ".md",
}
# Reverse map for the fallback path: browsers don't always send a MIME we know
# (e.g. application/octet-stream when the OS hasn't mapped the type, or the
# alternate application/x-pdf). Declared type → filename extension → magic bytes.
CV_ALLOWED_EXTS = {ext: ct for ct, ext in CV_ALLOWED_TYPES.items()}
CV_MAX_BYTES = 10 * 1024 * 1024


def _resolve_cv_kind(filename: str, content_type: str, data: bytes) -> str | None:
    """Canonical content type for an upload: declared MIME → extension → magic bytes.

    Returns None when the file is not a supported CV format under any signal.
    """
    if content_type in CV_ALLOWED_TYPES:
        return content_type
    ext = Path(filename or "").suffix.lower()
    if ext in CV_ALLOWED_EXTS:
        return CV_ALLOWED_EXTS[ext]
    if data[:5] == b"%PDF-":
        return "application/pdf"
    if data[:4] == b"PK\x03\x04":  # DOCX is a zip container
        return "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    # Plain-text fallback: fully decodable UTF-8 with no NULs. Markdown vs txt
    # is cosmetic — both extract with utf-8. Extension decides the label.
    if b"\x00" not in data[:4096]:
        try:
            data[:4096].decode("utf-8")
            return "text/markdown" if ext == ".md" else "text/plain"
        except UnicodeDecodeError:
            pass
    return None

# Where uploaded CVs live. Local dev: a repo-ignored directory; production points
# CV_STORAGE_ROOT at a real volume. Created lazily on first upload.
# CV storage root resolution order: CV_STORAGE_ROOT env (tests/deployments) →
# CV_STORAGE_DIR from Settings/.env (may be relative → backend root) → default
# backend/storage/cvs. Created lazily on first upload.
def _resolve_cv_storage_root() -> Path:
    env_val = os.environ.get("CV_STORAGE_ROOT")
    if env_val:
        return Path(env_val)
    try:
        from app.core.config import get_settings as _gs

        cv_dir = _gs().cv_storage_dir
        if cv_dir:
            p = Path(cv_dir)
            return p if p.is_absolute() else Path(__file__).resolve().parents[2] / p
    except Exception:  # config not initialized (rare, e.g. tooling) — fall through
        pass
    return Path(__file__).resolve().parents[2] / "storage" / "cvs"


CV_STORAGE_ROOT = _resolve_cv_storage_root()

# GitHub username / profile-id URL forms we accept.
_GITHUB_RE = re.compile(r"github\.com/([A-Za-z0-9-]{1,39})/?$")
_UPWORK_RE = re.compile(r"upwork\.com/(?:freelancers/|~)([A-Za-z0-9~]+)")
_FIVERR_RE = re.compile(r"fiverr\.com/([A-Za-z0-9_]+)")

# GitHub responses are cached per username so re-running a check inside an hour
# does not burn the 60-requests-per-hour unauthenticated budget.
_GH_CACHE: dict[str, tuple[float, dict[str, Any]]] = {}
_GH_CACHE_TTL = 3600.0

# The ai-backend web-search tool (ai-backend/test.py). Loaded once by path —
# the directory name has a hyphen so it is not a regular importable package.
_TOOL_PATH = Path(__file__).resolve().parents[3] / "ai-backend" / "test.py"
_tool_module: Any = None
_tool_load_error: str | None = None


def _load_websearch_tool() -> Any:
    global _tool_module, _tool_load_error
    if _tool_module is not None or _tool_load_error is not None:
        return _tool_module
    if not _TOOL_PATH.exists():
        _tool_load_error = "tool_missing"
        return None
    try:
        spec = importlib.util.spec_from_file_location("ai5k_websearch", _TOOL_PATH)
        module = importlib.util.module_from_spec(spec)
        # Register before exec: the tool's @dataclass classes resolve their
        # module through sys.modules during class creation (dataclasses._is_type).
        import sys

        sys.modules[spec.name] = module
        spec.loader.exec_module(module)  # module-level code only defines helpers / reads env
        _tool_module = module
    except Exception as exc:  # ImportError for `requests`, syntax, anything
        _tool_load_error = f"tool_unavailable: {exc}"
    return _tool_module


class SourceFetchError(Exception):
    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code
        self.message = message


def parse_github_username(url: str | None) -> str | None:
    if not url:
        return None
    m = _GITHUB_RE.search(url.strip())
    return m.group(1) if m else None


def parse_upwork_id(url: str | None) -> str | None:
    if not url:
        return None
    m = _UPWORK_RE.search(url.strip())
    return m.group(1) if m else None


def parse_fiverr_username(url: str | None) -> str | None:
    if not url:
        return None
    m = _FIVERR_RE.search(url.strip())
    return m.group(1) if m else None


def invalid_urls(github_url: str | None, upwork_url: str | None, fiverr_url: str | None) -> list[str]:
    """Supplied-but-unparseable URLs — rejected up front with 422 details."""
    fields = []
    if github_url and not parse_github_username(github_url):
        fields.append("github_url")
    if upwork_url and not parse_upwork_id(upwork_url):
        fields.append("upwork_url")
    if fiverr_url and not parse_fiverr_username(fiverr_url):
        fields.append("fiverr_url")
    return fields


# ---------------------------------------------------------------------------
# Fetch stage
# ---------------------------------------------------------------------------


async def _fetch_github(username: str) -> dict[str, Any]:
    """Public GitHub API (60 req/h unauthenticated — cached per username)."""
    cached = _GH_CACHE.get(username)
    if cached and time.monotonic() - cached[0] < _GH_CACHE_TTL:
        return cached[1]

    # GITHUB_TOKEN lifts the rate limit 60 req/h → 5000 (classic PAT, no scopes).
    headers = {"Accept": "application/vnd.github+json", "User-Agent": "ai5k-readiness"}
    gh_token = (os.environ.get("GITHUB_TOKEN") or get_settings().github_token).strip()
    if gh_token:
        headers["Authorization"] = f"Bearer {gh_token}"
    async with httpx.AsyncClient(timeout=10.0) as client:
        user_resp = await client.get(f"{GITHUB_API}/users/{username}", headers=headers)
        if user_resp.status_code == 404:
            raise SourceFetchError("github_user_not_found", f"GitHub user '{username}' does not exist.")
        if user_resp.status_code == 403:
            raise SourceFetchError("github_rate_limited", "GitHub API rate limit reached; try again later.")
        user_resp.raise_for_status()
        user = user_resp.json()

        repos_resp = await client.get(
            f"{GITHUB_API}/users/{username}/repos",
            params={"sort": "updated", "per_page": 30},
            headers=headers,
        )
        repos_resp.raise_for_status()
        repos = repos_resp.json()

    # Package-dependency slice per repo (the same shape the external evaluator's
    # ProfileCheckSource.raw contract documents: {"repo": [dep, ...]}).
    package_deps: dict[str, list[str]] = {}
    for repo in repos[:10]:
        deps: list[str] = []
        async with httpx.AsyncClient(timeout=10.0) as client:
            for key in ("dependencies", "devDependencies"):
                resp = await client.get(
                    f"{GITHUB_API}/repos/{username}/{repo['name']}/contents/package.json",
                    headers=headers,
                )
                if resp.status_code != 200:
                    continue
                try:
                    content = json.loads(
                        base64.b64decode(resp.json()["content"]).decode("utf-8")
                    )
                    deps.extend((content.get(key) or {}).keys())
                except Exception:
                    continue
        if deps:
            package_deps[repo["name"]] = sorted(set(deps))[:50]

    payload = {
        "user": {
            "login": user.get("login"),
            "name": user.get("name"),
            "bio": user.get("bio"),
            "public_repos": user.get("public_repos"),
            "followers": user.get("followers"),
            "created_at": user.get("created_at"),
        },
        "repos": [
            {
                "name": r.get("name"),
                "description": r.get("description"),
                "language": r.get("language"),
                "stars": r.get("stargazers_count"),
                "forks": r.get("forks_count"),
                "updated_at": r.get("updated_at"),
            }
            for r in repos
        ],
        "package_deps": package_deps,
    }
    _GH_CACHE[username] = (time.monotonic(), payload)
    return payload


async def _fetch_via_websearch_tool(
    source: str, url: str
) -> tuple[str, dict[str, Any] | None, str | None, str | None]:
    """Verify an Upwork/Fiverr profile's public presence with the ai-backend tool.

    Returns (status, raw, error_code, error_message).
    """
    tool = _load_websearch_tool()
    if tool is None:
        return SOURCE_FAILED, None, "websearch_tool_unavailable", _tool_load_error

    try:
        # search_everywhere is synchronous (requests + thread pool) — keep the
        # event loop free by running it in a worker thread.
        data = await asyncio.to_thread(tool.search_everywhere, url, 10)
    except Exception as exc:
        return SOURCE_FAILED, None, "websearch_error", f"{type(exc).__name__}: {exc}"[:300]

    provider_status = data.get("provider_status", {})
    any_enabled = any(p.get("enabled") for p in provider_status.values())
    raw = {
        "target": data.get("target"),
        "queries": data.get("queries"),
        "provider_status": provider_status,
        "summary": data.get("summary"),
        # Keep the evidence, trimmed: strong matches are the corroboration.
        "strong_matches": (data.get("strong_matches") or [])[:10],
    }
    if not any_enabled:
        return (
            SOURCE_FAILED, raw, "websearch_not_configured",
            "No search provider is configured (see ai-backend/.env) and the keyless "
            "DuckDuckGo fallback is not installed.",
        )
    if len(data.get("strong_matches") or []) > 0:
        return SOURCE_OK, raw, None, None
    return (
        SOURCE_FAILED, raw, "no_strong_match",
        "Search ran but could not corroborate a public profile at or above the strong-match threshold.",
    )


async def _fetch_source(
    check: ProfileCheck, source: str
) -> tuple[str, dict[str, Any] | None, str | None, str | None]:
    """Fetch one source → (status, raw, error_code, error_message)."""
    if source == "github":
        username = check.github_username
        if not username:
            return SOURCE_SKIPPED, None, None, None
        try:
            raw = await _fetch_github(username)
            return SOURCE_OK, raw, None, None
        except SourceFetchError as exc:
            return SOURCE_FAILED, None, exc.code, exc.message
        except Exception:
            return SOURCE_FAILED, None, "github_unreachable", "Could not reach the GitHub API."

    if source == "upwork":
        if not check.upwork_url:
            return SOURCE_SKIPPED, None, None, None
        return await _fetch_via_websearch_tool("upwork", check.upwork_url)

    if source == "fiverr":
        if not check.fiverr_url:
            return SOURCE_SKIPPED, None, None, None
        return await _fetch_via_websearch_tool("fiverr", check.fiverr_url)

    if source == "cv":
        if not check.cv_storage_path:
            return SOURCE_SKIPPED, None, None, None
        text = extract_cv_text(check.cv_storage_path, check.cv_content_type or "")
        if text is None:
            return (
                SOURCE_FAILED, None, "cv_unreadable",
                "The CV file could not be read (corrupt or unsupported format).",
            )
        return SOURCE_OK, {"filename": check.cv_filename, "content_type": check.cv_content_type,
                           "size_bytes": check.cv_size_bytes, "chars": len(text), "text": text[:8000]}, None, None


async def _fetch_all(check: ProfileCheck) -> dict[str, dict[str, Any]]:
    """Fetch every supplied source concurrently; return per-source fetch facts."""
    results = await asyncio.gather(*(_fetch_source(check, s) for s in ALL_SOURCES))
    return {
        source: {"status": st, "raw": raw, "error_code": ec, "error_message": em}
        for source, (st, raw, ec, em) in zip(ALL_SOURCES, results)
    }


# ---------------------------------------------------------------------------
# Evaluate stage
# ---------------------------------------------------------------------------


# ---------------------------------------------------------------------------
# CV handling
# ---------------------------------------------------------------------------


def resolve_local_evidence_path(user_id: uuid.UUID | None, rel_path: str) -> Path | None:
    """Guard for local-storage evidence: rel_path must be `{user_id}/{uuid}.{ext}`.

    Returns the resolved absolute path when the file exists and sits inside the
    CV store with no traversal; None otherwise. Shared with the evidence domain
    so a locally-stored CV can be attached as file evidence without S3.
    """
    if user_id is None or not rel_path:
        return None
    if rel_path.startswith("/") or ".." in rel_path or len(rel_path) > 512:
        return None
    if not rel_path.startswith(f"{user_id}/"):
        return None
    path = (CV_STORAGE_ROOT / rel_path).resolve()
    try:
        path.relative_to(CV_STORAGE_ROOT.resolve())
    except ValueError:
        return None
    return path if path.is_file() else None


def extract_cv_text(storage_path: str, content_type: str) -> str | None:
    """Best-effort text extraction from a stored CV. None = unreadable."""
    path = CV_STORAGE_ROOT / storage_path
    if not path.is_file():
        return None
    try:
        if content_type == "application/pdf" or path.suffix == ".pdf":
            from pypdf import PdfReader

            reader = PdfReader(str(path))
            return "\n".join((page.extract_text() or "") for page in reader.pages)
        if content_type.endswith("wordprocessingml.document") or path.suffix == ".docx":
            import docx2txt

            return docx2txt.process(str(path))
        # txt / md — decode with a tolerant strategy.
        return path.read_bytes().decode("utf-8", errors="replace")
    except Exception:
        return None


# Skills/tech keywords we can recognize in free CV text (lowercased).
_CV_KW = {
    "python", "typescript", "javascript", "java", "go", "rust", "react", "next.js",
    "node", "fastapi", "django", "postgresql", "mysql", "mongodb", "redis", "aws",
    "gcp", "azure", "docker", "kubernetes", "terraform", "llm", "nlp", "pytorch",
    "tensorflow", "langchain", "openai", "machine learning", "deep learning",
    "prompt engineering", "rag", "vector database", "devops", "ci/cd", "rest", "graphql",
}


def detect_cv_skills(text: str) -> list[str]:
    """Recognized skill keywords present in CV text, most frequent first.

    Frequency (not just presence) ranks the suggestions: a CV that says "python"
    nine times is a stronger claim than one that name-drops it once. Ties break
    alphabetically so the order is stable.
    """
    lowered = text.lower()
    counts: list[tuple[int, str]] = []
    for kw in _CV_KW:
        n = lowered.count(kw)
        if n > 0:
            counts.append((-n, kw))  # negative for descending sort
    counts.sort()
    return [kw for _, kw in counts]


def _score_cv(raw: dict[str, Any] | None) -> dict[str, Any]:
    """0–5: CV present (2) + structure keywords (3). Signals list what was seen."""
    if not raw:
        return {"points": 0, "max": MAX_CV, "signals": []}
    points, signals = 2, [f"CV on file ({raw.get('filename')})"]
    text = (raw.get("text") or "").lower()
    if text:
        found = sorted(kw for kw in _CV_KW if kw in text)
        if found:
            points += 3
            signals.append(f"mentions {len(found)} recognized skill(s): {', '.join(found[:8])}")
        if len(text) > 1200:
            signals.append(f"substantial content ({len(text):,} chars extracted)")
    return {"points": min(points, MAX_CV), "max": MAX_CV, "signals": signals}


def _score_github(raw: dict[str, Any] | None) -> dict[str, Any]:
    """0–25: footprint, recency, breadth."""
    if not raw:
        return {"points": 0, "max": MAX_GITHUB, "signals": []}
    user, repos = raw.get("user") or {}, raw.get("repos") or []
    n_repos = len(repos)
    langs = {r.get("language") for r in repos if r.get("language")}
    recent = [r for r in repos if (r.get("updated_at") or "") >= "2025-01-01"]
    stars = sum(r.get("stars") or 0 for r in repos)

    points, signals = 0, []
    if n_repos >= 5:
        points += 8
        signals.append(f"{n_repos} public repos")
    elif n_repos >= 1:
        points += 4
        signals.append(f"{n_repos} public repo(s)")
    if recent:
        points += 8
        signals.append(f"{len(recent)} repo(s) updated in the last year")
    if len(langs) >= 2:
        points += 4
        signals.append(f"works across {len(langs)} languages")
    if user.get("bio"):
        points += 1
    if stars >= 10:
        points += 3
        signals.append(f"{stars} stars earned")
    return {"points": min(points, MAX_GITHUB), "max": MAX_GITHUB, "signals": signals}


def _score_external(sources: dict[str, dict[str, Any]]) -> dict[str, Any]:
    """0–20: Upwork/Fiverr public presence corroborated by the search tool."""
    points, signals = 0, []
    for source, weight, label in (
        ("upwork", 10, "Upwork"),
        ("fiverr", 10, "Fiverr"),
    ):
        row = sources.get(source) or {}
        if row.get("status") == SOURCE_OK:
            points += weight
            matches = len(((row.get("raw") or {}).get("strong_matches")) or [])
            signals.append(f"{label} presence corroborated ({matches} strong match(es))")
    return {"points": min(points, MAX_EXTERNAL), "max": MAX_EXTERNAL, "signals": signals}


def _score_profile(db_profile: Profile | None) -> dict[str, Any]:
    """0–20: the AI5K profile itself — headline, roles, links, visibility."""
    if db_profile is None:
        return {"points": 0, "max": MAX_PROFILE, "signals": []}
    points, signals = 0, []
    if db_profile.headline:
        points += 6
        signals.append("headline set")
    if db_profile.job_roles:
        points += min(5, len(db_profile.job_roles) * 2)
        signals.append(f"{len(db_profile.job_roles)} job role(s)")
    links = db_profile.portfolio_links or []
    if links:
        points += min(5, len(links) * 2)
        signals.append(f"{len(links)} portfolio link(s)")
    if db_profile.visibility == "public":
        points += 4
        signals.append("profile is public")
    return {"points": min(points, MAX_PROFILE), "max": MAX_PROFILE, "signals": signals}


async def _score_claims(db: AsyncSession, profile: Profile | None) -> dict[str, Any]:
    """0–30: skill claims. Verification raises the tier, not a gate on the score."""
    claims: list[ProfileSkill] = []
    if profile is not None:
        rows = await db.execute(select(ProfileSkill).where(ProfileSkill.profile_id == profile.id))
        claims = list(rows.scalars().all())
    evidenced = [c for c in claims if c.claim_type == "evidenced"]
    self_declared = [c for c in claims if c.claim_type == "self_declared"]

    points = min(20, 10 * len(evidenced)) + min(10, 2 * len(self_declared))
    return {
        "points": points,
        "max": MAX_CLAIMS,
        "evidenced_count": len(evidenced),
        "self_declared_count": len(self_declared),
        "signals": [
            f"{len(evidenced)} evidenced skill(s)" if evidenced else None,
            f"{len(self_declared)} self-declared skill(s)" if self_declared else None,
        ],
        "claim_ids": [str(c.id) for c in claims],
        "evidenced_ids": {str(c.id) for c in evidenced},
    }


async def evaluate(
    db: AsyncSession,
    check: ProfileCheck,
    sources: dict[str, dict[str, Any]],
) -> tuple[dict[str, Any], list[dict[str, Any]], dict[str, Any], bool, bool, list[str]]:
    """Score the check → (result, claims, skill_audit, capped, partial, sources_used)."""
    profile_row = await db.execute(select(Profile).where(Profile.user_id == check.user_id))
    db_profile = profile_row.scalar_one_or_none()

    sources_used, partial = [], False
    for s in ALL_SOURCES:
        row = sources.get(s) or {}
        if row.get("status") in (SOURCE_OK, SOURCE_FAILED):
            sources_used.append(s)
        if row.get("status") in (SOURCE_FAILED, SOURCE_SKIPPED):
            partial = True

    github_score = _score_github(sources["github"]["raw"] if sources["github"]["status"] == SOURCE_OK else None)
    external_score = _score_external(sources)
    profile_score = _score_profile(db_profile)
    claims_score = await _score_claims(db, db_profile)
    cv_score = _score_cv(sources["cv"]["raw"] if sources["cv"]["status"] == SOURCE_OK else None)

    readiness_raw = (
        github_score["points"] + external_score["points"]
        + profile_score["points"] + claims_score["points"] + cv_score["points"]
    )
    capped = False
    readiness = readiness_raw

    result = {
        "evaluator": "local-v1+websearch",
        "readiness_raw": readiness_raw,
        "cap": {
            "capped": False,
            "at": None,
            "reason": None,
        },
        "dimensions": [
            {"key": "github", "label": "GitHub footprint", **github_score},
            {"key": "external", "label": "Upwork / Fiverr presence", **external_score},
            {"key": "profile", "label": "AI5K profile completeness", **profile_score},
            {"key": "claims", "label": "Skill claims & verification", **{
                k: v for k, v in claims_score.items() if k not in ("claim_ids", "evidenced_ids")
            }},
            {"key": "cv", "label": "CV", **cv_score},
        ],
    }

    claims_out = [
        {"id": cid, "evidenced": cid in claims_score["evidenced_ids"]}
        for cid in claims_score["claim_ids"]
    ]

    skill_audit = {
        "evidenced": claims_score["evidenced_count"],
        "self_declared": claims_score["self_declared_count"],
        "note": "Claim skills and get them verified to move this score.",
    }

    return result, claims_out, skill_audit, capped, partial, sources_used


# ---------------------------------------------------------------------------
# Orchestration
# ---------------------------------------------------------------------------


async def run_check(db: AsyncSession, check: ProfileCheck) -> None:
    """pending → fetching → evaluating → completed | failed. Self-contained: owns its commits."""
    check.attempts += 1
    check.status = CHECK_FETCHING
    await db.commit()

    started = time.monotonic()
    try:
        sources = await _fetch_all(check)
        for source, facts in sources.items():
            existing = await db.execute(
                select(ProfileCheckSource).where(
                    ProfileCheckSource.check_id == check.id,
                    ProfileCheckSource.source == source,
                )
            )
            row = existing.scalar_one_or_none()
            if row is None:
                row = ProfileCheckSource(check_id=check.id, source=source)
                db.add(row)
            row.status = facts["status"]
            row.raw = facts["raw"]
            row.error_code = facts["error_code"]
            row.error_message = facts["error_message"]
        await db.flush()

        check.status = CHECK_EVALUATING
        await db.commit()

        result, claims, skill_audit, capped, partial, sources_used = await evaluate(
            db, check, sources
        )
        existing = await db.execute(
            select(ProfileCheckResult).where(ProfileCheckResult.check_id == check.id)
        )
        row = existing.scalar_one_or_none()
        if row is None:
            row = ProfileCheckResult(check_id=check.id)
            db.add(row)
        row.readiness = int(result["readiness_raw"])
        row.capped = capped
        row.result = result
        row.claims = claims
        row.skill_audit = skill_audit
        row.partial = partial
        row.sources_used = sources_used
        row.generation_skipped = False
        row.duration_ms = int((time.monotonic() - started) * 1000)

        check.status = CHECK_COMPLETED
        check.error_code = None
        check.error_message = None
        await db.commit()
    except Exception as exc:  # noqa: BLE001 — the check records its own failure
        check.status = CHECK_FAILED
        check.error_code = "check_failed"
        check.error_message = str(exc)[:500]
        await db.commit()


async def execute_check(check_id: uuid.UUID) -> None:
    """Production background entry point: opens its own DB session and runs the pipeline."""
    try:
        async with SessionLocal() as db:
            check = await db.get(ProfileCheck, check_id)
            if check is None:
                return
            await run_check(db, check)
    except Exception:  # noqa: BLE001 — background task must never crash the app loop
        import logging

        logging.getLogger("ai5k").exception("profile_check_background_run_failed", extra={"check_id": str(check_id)})


# ---------------------------------------------------------------------------
# CRUD helpers used by the router
# ---------------------------------------------------------------------------


async def suggest_skills_from_cv(
    db: AsyncSession, user_id: uuid.UUID
) -> dict[str, Any] | None:
    """Skill suggestions from the user's most recent stored CV.

    Reads the latest check that carries a CV source (the CV store is per-user,
    latest wins), extracts recognized keywords, and diffs them against the
    user's existing skill claims. Returns None when there is no CV on file.
    """
    from app.models.profile import Profile, ProfileSkill, Skill

    # Latest check with a CV on file (any terminal status — the file is what matters).
    row = await db.execute(
        select(ProfileCheck)
        .where(ProfileCheck.user_id == user_id, ProfileCheck.cv_storage_path.is_not(None))
        .order_by(ProfileCheck.created_at.desc())
        .limit(1)
    )
    check = row.scalar_one_or_none()
    if check is None:
        return None

    text = extract_cv_text(check.cv_storage_path, check.cv_content_type or "")
    if not text:
        return {
            "check_id": str(check.id),
            "filename": check.cv_filename,
            "suggested": [],
            "already_claimed": [],
            "error": "cv_unreadable",
        }

    found = detect_cv_skills(text)

    # Already-claimed skill names for this user's individual profile.
    claimed_names: set[str] = set()
    profile_row = await db.execute(select(Profile).where(Profile.user_id == user_id))
    profile = profile_row.scalar_one_or_none()
    if profile is not None:
        rows = await db.execute(
            select(Skill.name)
            .join(ProfileSkill, ProfileSkill.skill_id == Skill.id)
            .where(ProfileSkill.profile_id == profile.id)
        )
        claimed_names = {name for (name,) in rows.all()}

    suggested = [s for s in found if s not in claimed_names]
    return {
        "check_id": str(check.id),
        "filename": check.cv_filename,
        "suggested": suggested,
        "already_claimed": [s for s in found if s in claimed_names],
    }


async def get_owned_check(db: AsyncSession, check_id: uuid.UUID, user_id: uuid.UUID) -> ProfileCheck | None:
    result = await db.execute(
        select(ProfileCheck).where(ProfileCheck.id == check_id, ProfileCheck.user_id == user_id)
    )
    return result.scalar_one_or_none()


async def get_latest_check(db: AsyncSession, user_id: uuid.UUID) -> ProfileCheck | None:
    result = await db.execute(
        select(ProfileCheck)
        .where(ProfileCheck.user_id == user_id)
        .order_by(ProfileCheck.created_at.desc())
        .limit(1)
    )
    return result.scalar_one_or_none()


async def list_checks(db: AsyncSession, user_id: uuid.UUID) -> list[ProfileCheck]:
    result = await db.execute(
        select(ProfileCheck)
        .where(ProfileCheck.user_id == user_id)
        .order_by(ProfileCheck.created_at.desc())
        .limit(20)
    )
    return list(result.scalars().all())


IN_FLIGHT = (CHECK_PENDING, CHECK_FETCHING, CHECK_EVALUATING)


def store_cv(user_id: uuid.UUID, filename: str, content_type: str, data: bytes) -> tuple[str, str, str, int]:
    """Persist an uploaded CV under CV_STORAGE_ROOT/{user_id}/.

    Returns (relative_storage_path, original_filename, content_type, size_bytes).
    Raises AppError(422 unsupported_content_type) for non-CV types.
    """
    if len(data) == 0:
        raise AppError(422, "empty_file", "The uploaded CV file is empty.")
    resolved = _resolve_cv_kind(filename, content_type, data)
    ext = CV_ALLOWED_TYPES.get(resolved) if resolved else None
    if ext is None:
        allowed = ", ".join(sorted({e for e in CV_ALLOWED_TYPES.values()}))
        raise AppError(
            422,
            "unsupported_content_type",
            f"CV must be one of: {allowed}. If your file is one of those, make sure the filename keeps its extension (e.g. cv.pdf).",
        )
    if len(data) > CV_MAX_BYTES:
        raise AppError(422, "file_too_large", f"CV must be at most {CV_MAX_BYTES // (1024 * 1024)} MB.")

    # Never trust the client filename for the on-disk path; keep the original for display.
    safe_rel = f"{user_id}/{uuid.uuid4()}{ext}"
    dest = CV_STORAGE_ROOT / safe_rel
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_bytes(data)
    # Store the *resolved* canonical type — the declared one may be a browser
    # guess (application/octet-stream) and drives text extraction later.
    return safe_rel, (filename or f"cv{ext}"), resolved, len(data)


async def create_check(
    db: AsyncSession,
    *,
    user_id: uuid.UUID,
    github_url: str | None,
    upwork_url: str | None,
    fiverr_url: str | None,
    cv_path: str | None = None,
    cv_filename: str | None = None,
    cv_content_type: str | None = None,
    cv_size_bytes: int | None = None,
    reuse_cv: bool = False,
) -> ProfileCheck:
    """Validate input, reject concurrent runs, persist the submission (status=pending).

    With ``reuse_cv=True`` (the re-run path), a missing CV source is satisfied by
    the latest check's stored CV — when that file is still on disk. CV tokens are
    single-use, so a plain re-run could otherwise never include the CV again.
    """
    if reuse_cv and not cv_path:
        latest_cv = (
            (await db.execute(
                select(ProfileCheck)
                .where(
                    ProfileCheck.user_id == user_id,
                    ProfileCheck.cv_storage_path.is_not(None),
                )
                .order_by(ProfileCheck.created_at.desc())
                .limit(1)
            ))
            .scalars()
            .first()
        )
        if latest_cv is not None and (CV_STORAGE_ROOT / latest_cv.cv_storage_path).is_file():
            cv_path = latest_cv.cv_storage_path
            cv_filename = latest_cv.cv_filename
            cv_content_type = latest_cv.cv_content_type
            cv_size_bytes = latest_cv.cv_size_bytes

    has_url = bool(github_url or upwork_url or fiverr_url)
    if not (has_url or cv_path):
        raise AppError(
            422,
            "no_sources",
            "Supply at least one source: a profile URL or a CV.",
        )

    bad = invalid_urls(github_url, upwork_url, fiverr_url)
    if bad:
        raise AppError(
            422, "invalid_url", f"Unrecognized profile URL format for: {', '.join(bad)}.",
            details=[{"field": f, "msg": "not a recognizable profile URL"} for f in bad],
        )

    latest = await get_latest_check(db, user_id)
    if latest is not None and latest.status in IN_FLIGHT:
        raise AppError(409, "check_in_progress", "A readiness check is already running; wait for it to finish.")

    check = ProfileCheck(
        user_id=user_id,
        github_url=(github_url or None),
        upwork_url=(upwork_url or None),
        fiverr_url=(fiverr_url or None),
        github_username=parse_github_username(github_url),
        upwork_profile_id=parse_upwork_id(upwork_url),
        fiverr_username=parse_fiverr_username(fiverr_url),
        cv_storage_path=cv_path,
        cv_filename=cv_filename,
        cv_content_type=cv_content_type,
        cv_size_bytes=cv_size_bytes,
    )
    db.add(check)
    await db.commit()
    await db.refresh(check)
    return check
