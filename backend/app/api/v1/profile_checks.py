"""Profile-checks API (UF-7 — the /analyze readiness pipeline).

    POST /profile-checks        → 202 + {id, poll_url}; pipeline runs in background
    POST /profile-checks/cv     → multipart CV upload (PDF/DOCX/TXT/MD) → {cv_token}
    GET  /profile-checks/{id}   → poll: pending → fetching → evaluating → completed
    GET  /profile-checks/latest → most recent check for the caller

Ownership: users see only their own checks (individual readiness is private data).
The backend owns all data; `ai-backend` is invoked inside the pipeline as a tool.

CV handling: the pipeline scores the CV's *text*, so the bytes must reach the
backend (presigned S3 would not) — hence multipart, validated and stored by the
backend. The upload mints a single-use, 15-minute token that carries the storage
facts; attaching it to POST /profile-checks links that CV into the new check.
"""

import time
import uuid

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, Request, UploadFile
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.core.deps import get_current_user
from app.core.errors import AppError
from app.models.identity import User
from app.models.profile import Profile
from app.schemas.profile_check import (
    AttachCvEvidenceRequest,
    CvUploadResponse,
    ProfileCheckCreated,
    ProfileCheckCreate,
    ProfileCheckRead,
)
from app.services import profile_check as pc

router = APIRouter(prefix="/profile-checks", tags=["profile-checks"])

# Single-use CV tokens: token → (user_id, storage_path, filename, content_type, size, minted_at).
# In-process by design: upload and check creation happen in the same browser
# session; a restart simply asks the user to re-upload.
CvFacts = tuple[uuid.UUID, str, str, str, int, float]
_cv_tokens: dict[str, CvFacts] = {}
CV_TOKEN_TTL = 900.0


def _mint_cv_token(
    user_id: uuid.UUID, path: str, filename: str, content_type: str, size: int
) -> str:
    now = time.monotonic()
    for tok, facts in list(_cv_tokens.items()):
        if facts[0] == user_id or now - facts[5] > CV_TOKEN_TTL:
            _cv_tokens.pop(tok, None)  # one live CV per user; drop stale tokens
    token = uuid.uuid4().hex
    _cv_tokens[token] = (user_id, path, filename, content_type, size, now)
    return token


def _pop_cv_facts(token: str, user_id: uuid.UUID) -> tuple[str, str, str, int]:
    entry = _cv_tokens.pop(token, None)
    if entry is None:
        raise AppError(
            404, "cv_token_not_found", "CV upload expired or was already used — upload the file again."
        )
    owner, path, filename, content_type, size, minted = entry
    if owner != user_id:
        raise AppError(403, "permission_denied", "That CV upload belongs to another account.")
    if time.monotonic() - minted > CV_TOKEN_TTL:
        raise AppError(404, "cv_token_not_found", "CV upload expired — upload the file again.")
    return path, filename, content_type, size


@router.post("/cv", response_model=CvUploadResponse)
async def upload_cv(
    file: UploadFile = File(...),
    content_type_override: str | None = Form(default=None),
    user: User = Depends(get_current_user),
) -> CvUploadResponse:
    """Store a CV (PDF/DOCX/TXT/MD, ≤10 MB) for the caller → single-use cv_token."""
    data = await file.read()
    content_type = content_type_override or file.content_type or ""
    # Some browsers send generic octet-stream for .md/.txt; recover via filename.
    if content_type in ("", "application/octet-stream"):
        name = (file.filename or "").lower()
        if name.endswith(".md"):
            content_type = "text/markdown"
        elif name.endswith(".txt"):
            content_type = "text/plain"
    path, fname, ctype, size = pc.store_cv(user.id, file.filename or "cv", content_type, data)
    return CvUploadResponse(
        cv_token=_mint_cv_token(user.id, path, fname, ctype, size),
        filename=fname,
        content_type=ctype,
        size_bytes=size,
    )


@router.post("/cv/attach-evidence", response_model=dict, status_code=201)
async def attach_cv_as_evidence(
    body: AttachCvEvidenceRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict:
    """Attach a stored CV as certificate/document evidence on the caller's profile.

    Consumes the single-use cv_token (same rules as check creation). Works with
    no S3: the row points at the local CV store via a `local://` URL, downloaded
    through the evidence /file route. The evidence starts `pending` like any row.
    """
    from app.services import evidence as evidence_service

    facts = _pop_cv_facts(body.cv_token, user.id)
    rel_path, fname, ctype, size = facts

    profile = await db.execute(select(Profile).where(Profile.user_id == user.id))
    db_profile = profile.scalar_one_or_none()
    if db_profile is None:
        raise AppError(404, "profile_not_found", "Create your profile before attaching evidence.")

    evidence = await evidence_service.create_evidence(
        db,
        actor=user,
        profile=db_profile,
        source_type=body.source_type,
        title=body.title or fname,
        description=body.description,
        file_key=rel_path,
        storage=None,  # force the local-storage branch
        ip_address=request.client.host if request.client else None,
    )
    return {
        "id": str(evidence.id),
        "profile_id": str(evidence.profile_id),
        "title": evidence.title,
        "source_type": evidence.source_type,
        "verification_status": evidence.verification_status,
        "filename": fname,
        "size_bytes": size,
    }


@router.post("", response_model=ProfileCheckCreated, status_code=202)
async def create_check(
    body: ProfileCheckCreate,
    background: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> ProfileCheckCreated:
    """Submit sources and kick off the readiness pipeline (202, runs in background)."""
    cv_facts = _pop_cv_facts(body.cv_token, user.id) if body.cv_token else None
    check = await pc.create_check(
        db,
        user_id=user.id,
        github_url=str(body.github_url) if body.github_url else None,
        upwork_url=str(body.upwork_url) if body.upwork_url else None,
        fiverr_url=str(body.fiverr_url) if body.fiverr_url else None,
        cv_path=cv_facts[0] if cv_facts else None,
        cv_filename=cv_facts[1] if cv_facts else None,
        cv_content_type=cv_facts[2] if cv_facts else None,
        cv_size_bytes=cv_facts[3] if cv_facts else None,
        reuse_cv=body.reuse_cv,
    )
    background.add_task(pc.execute_check, check.id)
    return ProfileCheckCreated(
        id=check.id,
        status=check.status,
        poll_url=f"/api/v1/profile-checks/{check.id}",
    )


@router.get("/cv/suggestions")
async def cv_skill_suggestions(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict:
    """Skill suggestions detected in the caller's most recent stored CV.

    Diffs recognized CV keywords against existing skill claims; empty `suggested`
    means everything found is already claimed (or the CV had no matches).
    """
    result = await pc.suggest_skills_from_cv(db, user.id)
    if result is None:
        raise AppError(404, "cv_not_found", "No CV on file — upload one with your readiness check.")
    return result


@router.get("/latest", response_model=ProfileCheckRead)
async def latest_check(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> ProfileCheckRead:
    check = await pc.get_latest_check(db, user.id)
    if check is None:
        raise AppError(404, "check_not_found", "No readiness check yet.")
    return ProfileCheckRead.model_validate(check)


@router.get("/{check_id}", response_model=ProfileCheckRead)
async def get_check(
    check_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> ProfileCheckRead:
    check = await pc.get_owned_check(db, check_id, user.id)
    if check is None:
        raise AppError(404, "check_not_found", "No readiness check with that id.")
    return ProfileCheckRead.model_validate(check)
