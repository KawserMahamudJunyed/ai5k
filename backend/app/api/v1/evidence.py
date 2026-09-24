"""Evidence endpoints — presigned uploads, source-type tagging, skill-claim links.

Per specs/2026-09-20-evidence-uploads-design.md. Manage rights on the owning
profile gate writes; view rights gate reads. File-type evidence requires a
configured bucket (503 otherwise); links/testimonials need no storage.
"""

import uuid

from fastapi import APIRouter, Depends, Request
from sqlalchemy import inspect as sa_inspect
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.db import get_db
from app.core.deps import get_current_user
from app.core.errors import AppError
from app.models.evidence import ALLOWED_CONTENT_TYPES
from app.models.identity import User
from app.schemas.evidence import (
    EvidenceCreate,
    EvidenceRead,
    PresignRequest,
    PresignResponse,
    SkillLinkCreate,
    SkillLinkRead,
)
from app.services import evidence as evidence_service
from app.services.profile_check import CV_STORAGE_ROOT
from app.services.storage import S3Storage, get_storage, presign_get_for_file_url

router = APIRouter(prefix="/profiles/{profile_id}/evidence", tags=["evidence"])


def _ip(request: Request) -> str | None:
    return request.client.host if request.client else None


def _storage() -> S3Storage | None:
    return get_storage(get_settings())


def _download_url_for(evidence) -> str | None:
    """Presigned S3 URL for s3:// rows; a backend download route for local:// rows."""
    if not evidence.file_url:
        return None
    if evidence.file_url.startswith("local://"):
        rel = evidence.file_url[len("local://"):]
        return f"/api/v1/profiles/{evidence.profile_id}/evidence/{evidence.id}/file"
    storage = _storage()
    return presign_get_for_file_url(storage, evidence.file_url) if storage is not None else None


def _evidence_read(evidence, download_url: str | None = None) -> EvidenceRead:
    # skill_links may be unloaded (fresh create / refresh) — treat as empty, never lazy-load.
    links = [] if "skill_links" in sa_inspect(evidence).unloaded else list(evidence.skill_links)
    return EvidenceRead(
        id=evidence.id,
        profile_id=evidence.profile_id,
        uploader_id=evidence.uploader_id,
        source_type=evidence.source_type,
        file_url=evidence.file_url,
        download_url=download_url,
        title=evidence.title,
        description=evidence.description,
        verification_status=evidence.verification_status,
        uploaded_at=evidence.uploaded_at,
        skill_links=[SkillLinkRead.model_validate(link) for link in links],
    )


@router.post("/presign", response_model=PresignResponse)
async def presign_upload(
    profile_id: uuid.UUID,
    body: PresignRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> PresignResponse:
    """Issue a presigned PUT for a file-type evidence upload (profile-scoped key)."""
    await evidence_service.require_evidence_manage(db, user, profile_id)
    storage = _storage()
    if storage is None:
        raise AppError(
            503, "storage_not_configured", "File uploads require S3_EVIDENCE_BUCKET to be configured."
        )
    if body.content_type not in ALLOWED_CONTENT_TYPES:
        allowed = ", ".join(sorted(ALLOWED_CONTENT_TYPES))
        raise AppError(422, "unsupported_content_type", f"content_type must be one of: {allowed}.")

    key = storage.build_key(profile_id, body.content_type)
    return PresignResponse(
        file_key=key,
        upload_url=storage.presign_put(key, body.content_type),
        expires_in=storage.upload_ttl_seconds,
    )


@router.post("", response_model=EvidenceRead, status_code=201)
async def create_evidence(
    profile_id: uuid.UUID,
    body: EvidenceCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> EvidenceRead:
    profile = await evidence_service.require_evidence_manage(db, user, profile_id)
    evidence = await evidence_service.create_evidence(
        db,
        actor=user,
        profile=profile,
        source_type=body.source_type,
        title=body.title,
        description=body.description,
        url=body.url,
        file_key=body.file_key,
        storage=_storage(),
        ip_address=_ip(request),
    )
    return _evidence_read(evidence)


async def _load_evidence_or_404(db: AsyncSession, profile_id: uuid.UUID, evidence_id: uuid.UUID):
    evidence = await evidence_service.get_evidence(db, evidence_id)
    if evidence is None or evidence.profile_id != profile_id:
        raise AppError(404, "evidence_not_found", "No evidence with that id on this profile.")
    return evidence


@router.get("", response_model=list[EvidenceRead])
async def list_evidence(
    profile_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[EvidenceRead]:
    profile = await evidence_service.require_evidence_view(db, user, profile_id)
    storage = _storage()
    rows = await evidence_service.list_profile_evidence(db, profile.id)
    return [_evidence_read(evidence, _download_url_for(evidence)) for evidence in rows]


@router.get("/{evidence_id}", response_model=EvidenceRead)
async def get_evidence(
    profile_id: uuid.UUID,
    evidence_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> EvidenceRead:
    profile = await evidence_service.require_evidence_view(db, user, profile_id)
    evidence = await _load_evidence_or_404(db, profile.id, evidence_id)
    return _evidence_read(evidence, _download_url_for(evidence))


@router.get("/{evidence_id}/file")
async def download_local_file(
    profile_id: uuid.UUID,
    evidence_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Stream a locally-stored evidence file (local:// rows; no S3 configured)."""
    from fastapi.responses import FileResponse

    from app.services.profile_check import resolve_local_evidence_path

    profile = await evidence_service.require_evidence_view(db, user, profile_id)
    evidence = await _load_evidence_or_404(db, profile.id, evidence_id)
    if not evidence.file_url or not evidence.file_url.startswith("local://"):
        raise AppError(422, "not_local_file", "This evidence is not stored locally.")
    rel = evidence.file_url[len("local://"):]
    path = resolve_local_evidence_path(profile.user_id, rel)
    if path is None:
        raise AppError(404, "file_missing", "The stored file is gone.")
    filename = evidence.title or rel.split("/")[-1]
    return FileResponse(path, filename=filename)


@router.delete("/{evidence_id}", status_code=204)
async def delete_evidence(
    profile_id: uuid.UUID,
    evidence_id: uuid.UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> None:
    profile = await evidence_service.require_evidence_manage(db, user, profile_id)
    evidence = await _load_evidence_or_404(db, profile.id, evidence_id)
    await evidence_service.delete_evidence(db, actor=user, evidence=evidence, ip_address=_ip(request))


@router.post("/{evidence_id}/skill-links", response_model=SkillLinkRead, status_code=201)
async def link_skill_claim(
    profile_id: uuid.UUID,
    evidence_id: uuid.UUID,
    body: SkillLinkCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> SkillLinkRead:
    profile = await evidence_service.require_evidence_manage(db, user, profile_id)
    evidence = await _load_evidence_or_404(db, profile.id, evidence_id)
    link = await evidence_service.link_skill_claim(
        db,
        actor=user,
        evidence=evidence,
        profile_skill_id=body.profile_skill_id,
        ip_address=_ip(request),
    )
    return SkillLinkRead.model_validate(link)


@router.get("/{evidence_id}/skill-links", response_model=list[SkillLinkRead])
async def list_skill_links(
    profile_id: uuid.UUID,
    evidence_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[SkillLinkRead]:
    profile = await evidence_service.require_evidence_view(db, user, profile_id)
    evidence = await _load_evidence_or_404(db, profile.id, evidence_id)
    links = await evidence_service.list_evidence_skill_links(db, evidence.id)
    return [SkillLinkRead.model_validate(link) for link in links]


@router.delete("/{evidence_id}/skill-links/{link_id}", status_code=204)
async def unlink_skill_claim(
    profile_id: uuid.UUID,
    evidence_id: uuid.UUID,
    link_id: uuid.UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> None:
    profile = await evidence_service.require_evidence_manage(db, user, profile_id)
    evidence = await _load_evidence_or_404(db, profile.id, evidence_id)
    await evidence_service.unlink_skill_claim(
        db, actor=user, evidence=evidence, link_id=link_id, ip_address=_ip(request)
    )
