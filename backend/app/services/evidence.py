"""Evidence business logic — uploads, source-type tagging, skill-claim links.

Permission model mirrors services/profiles.py: manage rights on the owning profile
(owner / that org's org_admin / platform_admin) for all writes; view rights per
profile visibility for reads. `verification_status` is server-managed (always
`pending` here — the verification queue owns transitions).
"""

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.errors import AppError
from app.models.evidence import (
    FILE_SOURCE_TYPES,
    SOURCE_LINK,
    SOURCE_TYPES,
    Evidence,
    EvidenceSkillLink,
)
from app.models.identity import User
from app.models.profile import Profile, ProfileSkill
from app.services.audit import write_audit_log
from app.services.profiles import can_manage_profile, can_view_profile, get_profile_by_id
from app.services.storage import S3Storage


async def get_evidence(db: AsyncSession, evidence_id: uuid.UUID) -> Evidence | None:
    """Fetch one evidence row with skill links eagerly loaded (async-safe serialization)."""
    result = await db.execute(
        select(Evidence)
        .options(selectinload(Evidence.skill_links))
        .where(Evidence.id == evidence_id)
    )
    return result.scalar_one_or_none()


async def list_profile_evidence(db: AsyncSession, profile_id: uuid.UUID) -> list[Evidence]:
    result = await db.execute(
        select(Evidence)
        .options(selectinload(Evidence.skill_links))
        .where(Evidence.profile_id == profile_id)
        .order_by(Evidence.uploaded_at.desc(), Evidence.id)
    )
    return list(result.scalars().all())


async def create_evidence(
    db: AsyncSession,
    *,
    actor: User,
    profile: Profile,
    source_type: str,
    title: str,
    description: str | None,
    url: str | None = None,
    file_key: str | None = None,
    storage: S3Storage | None = None,
    ip_address: str | None = None,
) -> Evidence:
    """Create an evidence row.

    - link/testimonial: `url` required (https?://), no storage involved.
    - file types: `file_key` required, must be a key this profile was issued
      (prefix + traversal guard); file_url = s3://{bucket}/{key}.
    """
    if source_type not in SOURCE_TYPES:
        raise AppError(422, "invalid_source_type", f"source_type must be one of: {', '.join(SOURCE_TYPES)}.")

    if source_type in FILE_SOURCE_TYPES:
        if storage is None:
            raise AppError(503, "storage_not_configured", "File uploads require S3_EVIDENCE_BUCKET to be configured.")
        if not file_key:
            raise AppError(422, "file_key_required", f"{source_type} evidence requires a presigned file_key.")
        if not storage.validate_key(profile.id, file_key):
            raise AppError(422, "invalid_file_key", "file_key does not match a presigned upload for this profile.")
        file_url: str | None = storage.file_url(file_key)
    else:
        if file_key:
            raise AppError(422, "file_key_not_allowed", f"{source_type} evidence takes a url, not a file_key.")
        if not url or not (url.startswith("http://") or url.startswith("https://")):
            raise AppError(422, "invalid_url", "A http(s) url is required for link/testimonial evidence.")
        file_url = url

    evidence = Evidence(
        profile_id=profile.id,
        uploader_id=actor.id,
        source_type=source_type,
        file_url=file_url,
        title=title.strip(),
        description=description,
        verification_status="pending",
    )
    db.add(evidence)
    await db.flush()

    await write_audit_log(
        db,
        actor_id=actor.id,
        action="evidence.created",
        entity_type="evidence",
        entity_id=evidence.id,
        metadata={
            "profile_id": str(profile.id),
            "source_type": source_type,
            "verification_status": "pending",
        },
        ip_address=ip_address,
    )
    await db.commit()
    await db.refresh(evidence)
    return evidence


async def delete_evidence(
    db: AsyncSession,
    *,
    actor: User,
    evidence: Evidence,
    ip_address: str | None = None,
) -> None:
    """Delete the row only; the S3 object stays (presigned URLs expire; orphan reaping later)."""
    await write_audit_log(
        db,
        actor_id=actor.id,
        action="evidence.deleted",
        entity_type="evidence",
        entity_id=evidence.id,
        metadata={"profile_id": str(evidence.profile_id), "source_type": evidence.source_type},
        ip_address=ip_address,
    )
    await db.delete(evidence)
    await db.commit()


# ---------------------------------------------------------------------------
# Skill-claim links
# ---------------------------------------------------------------------------


async def list_evidence_skill_links(db: AsyncSession, evidence_id: uuid.UUID) -> list[EvidenceSkillLink]:
    result = await db.execute(
        select(EvidenceSkillLink).where(EvidenceSkillLink.evidence_id == evidence_id)
    )
    return list(result.scalars().all())


async def link_skill_claim(
    db: AsyncSession,
    *,
    actor: User,
    evidence: Evidence,
    profile_skill_id: uuid.UUID,
    ip_address: str | None = None,
) -> EvidenceSkillLink:
    """Link evidence to a skill claim; the claim must belong to the same profile."""
    claim = await db.get(ProfileSkill, profile_skill_id)
    if claim is None or claim.profile_id != evidence.profile_id:
        raise AppError(404, "skill_claim_not_found", "No such skill claim on this evidence's profile.")

    existing = await db.execute(
        select(EvidenceSkillLink).where(
            EvidenceSkillLink.evidence_id == evidence.id,
            EvidenceSkillLink.profile_skill_id == profile_skill_id,
        )
    )
    if existing.scalar_one_or_none() is not None:
        raise AppError(409, "link_exists", "That evidence is already linked to this skill claim.")

    link = EvidenceSkillLink(evidence_id=evidence.id, profile_skill_id=profile_skill_id)
    db.add(link)
    await db.flush()

    await write_audit_log(
        db,
        actor_id=actor.id,
        action="evidence_skill_link.created",
        entity_type="evidence_skill_link",
        entity_id=link.id,
        metadata={
            "evidence_id": str(evidence.id),
            "profile_skill_id": str(profile_skill_id),
            "profile_id": str(evidence.profile_id),
        },
        ip_address=ip_address,
    )
    await db.commit()
    await db.refresh(link)
    return link


async def unlink_skill_claim(
    db: AsyncSession,
    *,
    actor: User,
    evidence: Evidence,
    link_id: uuid.UUID,
    ip_address: str | None = None,
) -> None:
    link = await db.get(EvidenceSkillLink, link_id)
    if link is None or link.evidence_id != evidence.id:
        raise AppError(404, "link_not_found", "No such link on this evidence.")
    await write_audit_log(
        db,
        actor_id=actor.id,
        action="evidence_skill_link.deleted",
        entity_type="evidence_skill_link",
        entity_id=link.id,
        metadata={
            "evidence_id": str(evidence.id),
            "profile_skill_id": str(link.profile_skill_id),
        },
        ip_address=ip_address,
    )
    await db.delete(link)
    await db.commit()


# ---------------------------------------------------------------------------
# Shared permission helpers (profile-scoped)
# ---------------------------------------------------------------------------


async def require_evidence_view(db: AsyncSession, user: User, profile_id: uuid.UUID) -> Profile:
    profile = await get_profile_by_id(db, profile_id)
    if profile is None:
        raise AppError(404, "profile_not_found", "No profile with that id.")
    if not await can_view_profile(db, user, profile):
        raise AppError(403, "permission_denied", "You don't have permission to view this profile.")
    return profile


async def require_evidence_manage(db: AsyncSession, user: User, profile_id: uuid.UUID) -> Profile:
    profile = await get_profile_by_id(db, profile_id)
    if profile is None:
        raise AppError(404, "profile_not_found", "No profile with that id.")
    if not await can_manage_profile(db, user, profile):
        raise AppError(403, "permission_denied", "You don't have permission to edit this profile.")
    return profile
