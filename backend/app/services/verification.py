"""Verification queue business logic (Tasks 2.4/2.5).

Admin review of identity docs (evidence rows) and skill claims (`profile_skills`).
Decision-once: the outcome lands on the request row AND the target row in the same
transaction. Approving a claim flips it to `evidenced` (the only such path);
approving identity-doc evidence flips it to `verified`; rejecting evidence marks it
`rejected` while claims stay `self_declared` (editable/resubmittable).

Permissions (rbac.md): listing the queue needs `verification:review`; deciding needs
`verification:approve`. Request creation requires manage rights on the target's profile.
"""

import uuid

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import AppError
from app.models.evidence import Evidence
from app.models.identity import User
from app.models.profile import Profile, ProfileSkill
from app.models.verification import (
    STATUS_APPROVED,
    STATUS_PENDING,
    STATUS_REJECTED,
    TARGET_IDENTITY_DOC,
    TARGET_PROFILE_SKILL,
    TARGET_TYPES,
    VerificationRequest,
)
from app.services.audit import write_audit_log
from app.services.profiles import can_manage_profile


async def get_request(db: AsyncSession, request_id: uuid.UUID) -> VerificationRequest | None:
    return await db.get(VerificationRequest, request_id)


async def _owning_profile_for_target(
    db: AsyncSession, target_type: str, target_id: uuid.UUID
) -> Profile:
    """Resolve the profile a target belongs to; 404 if the target doesn't exist."""
    if target_type == TARGET_PROFILE_SKILL:
        claim = await db.get(ProfileSkill, target_id)
        if claim is None:
            raise AppError(404, "skill_claim_not_found", "No skill claim with that id.")
        profile = await db.get(Profile, claim.profile_id)
    elif target_type == TARGET_IDENTITY_DOC:
        evidence = await db.get(Evidence, target_id)
        if evidence is None:
            raise AppError(404, "evidence_not_found", "No evidence with that id.")
        profile = await db.get(Profile, evidence.profile_id)
    else:
        raise AppError(
            422, "invalid_target_type", f"target_type must be one of: {', '.join(TARGET_TYPES)}."
        )
    assert profile is not None  # FK-guaranteed
    return profile


async def create_request(
    db: AsyncSession,
    *,
    actor: User,
    target_type: str,
    target_id: uuid.UUID,
    ip_address: str | None = None,
) -> VerificationRequest:
    """File a verification request for a skill claim or identity doc."""
    if target_type not in TARGET_TYPES:
        raise AppError(
            422, "invalid_target_type", f"target_type must be one of: {', '.join(TARGET_TYPES)}."
        )

    profile = await _owning_profile_for_target(db, target_type, target_id)
    if not await can_manage_profile(db, actor, profile):
        raise AppError(403, "permission_denied", "You don't manage the profile this target belongs to.")

    # Already decided on the target itself?
    if target_type == TARGET_PROFILE_SKILL:
        claim = await db.get(ProfileSkill, target_id)
        if claim is not None and claim.claim_type == "evidenced":
            raise AppError(409, "already_verified", "That skill claim is already evidenced.")
    else:
        evidence = await db.get(Evidence, target_id)
        if evidence is not None and evidence.verification_status == "verified":
            raise AppError(409, "already_verified", "That evidence is already verified.")

    # One pending request per target.
    existing = await db.execute(
        select(VerificationRequest.id).where(
            VerificationRequest.target_type == target_type,
            VerificationRequest.target_id == target_id,
            VerificationRequest.status == STATUS_PENDING,
        )
    )
    if existing.scalar_one_or_none() is not None:
        raise AppError(409, "request_exists", "A pending verification request already exists for this target.")

    request = VerificationRequest(
        requestor_id=actor.id,
        target_type=target_type,
        target_id=target_id,
        status=STATUS_PENDING,
    )
    db.add(request)
    await db.flush()
    await db.commit()
    await db.refresh(request)
    return request


async def list_requests(
    db: AsyncSession, *, status: str | None, page: int, page_size: int
) -> tuple[list[VerificationRequest], int]:
    """The queue: newest first, optional status filter (`all` disables it)."""
    base = select(VerificationRequest)
    if status and status != "all":
        if status not in (STATUS_PENDING, STATUS_APPROVED, STATUS_REJECTED):
            raise AppError(
                422,
                "invalid_status",
                f"status must be one of: {STATUS_PENDING}, {STATUS_APPROVED}, {STATUS_REJECTED}, all.",
            )
        base = base.where(VerificationRequest.status == status)
    total = (await db.execute(select(func.count()).select_from(base.subquery()))).scalar_one()
    rows = await db.execute(
        base.order_by(VerificationRequest.created_at.desc(), VerificationRequest.id)
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    return list(rows.scalars().all()), total


async def decide(
    db: AsyncSession,
    *,
    reviewer: User,
    request: VerificationRequest,
    approved: bool,
    note: str | None = None,
    ip_address: str | None = None,
) -> VerificationRequest:
    """Decide a pending request; apply the side effect to the target row; audit both.

    Decision-once: deciding an already-decided request is a 409.
    """
    if request.status != STATUS_PENDING:
        raise AppError(409, "already_decided", "This verification request has already been decided.")

    request.status = STATUS_APPROVED if approved else STATUS_REJECTED
    request.reviewed_by = reviewer.id
    request.reviewed_at = func.now()

    # Side effect on the target row (same transaction).
    if request.target_type == TARGET_PROFILE_SKILL:
        claim = await db.get(ProfileSkill, request.target_id)
        if claim is None:
            raise AppError(404, "skill_claim_not_found", "The skill claim for this request no longer exists.")
        if approved:
            claim.claim_type = "evidenced"
        # Rejected claims stay `self_declared` — editable/resubmittable.
    else:
        evidence = await db.get(Evidence, request.target_id)
        if evidence is None:
            raise AppError(404, "evidence_not_found", "The evidence for this request no longer exists.")
        evidence.verification_status = "verified" if approved else "rejected"

    await write_audit_log(
        db,
        actor_id=reviewer.id,
        action="verification_request.approved" if approved else "verification_request.rejected",
        entity_type="verification_request",
        entity_id=request.id,
        metadata={
            "target_type": request.target_type,
            "target_id": str(request.target_id),
            "reviewer_id": str(reviewer.id),
            **({"note": note} if note else {}),
        },
        ip_address=ip_address,
    )
    await db.commit()
    await db.refresh(request)
    return request
