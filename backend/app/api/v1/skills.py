"""Skills catalog & skill-claim endpoints (workstream 1).

- GET /skills — bounded catalog, offset pagination (api-conventions.md).
- /profiles/{profile_id}/skills — claim lifecycle; `claim_type` is always
  server-set to `self_declared` (the `evidenced` flip belongs to the
  verification queue, Tasks 2.4/2.5).
"""

import uuid

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.core.deps import get_current_user
from app.core.errors import AppError
from app.models.identity import User
from app.schemas.profile import (
    SkillCatalogResponse,
    SkillClaimCreate,
    SkillClaimRead,
    SkillClaimUpdate,
    SkillRead,
)
from app.services import profiles as profile_service

router = APIRouter(prefix="/skills", tags=["skills"])
claims_router = APIRouter(prefix="/profiles/{profile_id}/skills", tags=["skills"])


def _ip(request: Request) -> str | None:
    return request.client.host if request.client else None


@router.get("")
async def list_skills(
    category: str | None = None,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(get_current_user),
) -> SkillCatalogResponse:
    skills, total = await profile_service.list_skills(db, category=category, page=page, page_size=page_size)
    return SkillCatalogResponse(
        data=[SkillRead.model_validate(s) for s in skills],
        total=total,
        page=page,
        page_size=page_size,
    )


def _claim_read(claim, skill) -> SkillClaimRead:
    return SkillClaimRead(
        id=claim.id,
        profile_id=claim.profile_id,
        skill_id=claim.skill_id,
        skill_name=skill.name,
        claim_type=claim.claim_type,
        proficiency_level=claim.proficiency_level,
        created_at=claim.created_at,
    )


async def _load_claim(db: AsyncSession, profile_id: uuid.UUID, claim_id: uuid.UUID):
    pair = await profile_service.get_skill_claim_with_skill(db, profile_id, claim_id)
    if pair is None:
        raise AppError(404, "skill_claim_not_found", "No skill claim with that id on this profile.")
    return pair  # (claim, skill)


@claims_router.post("", response_model=SkillClaimRead, status_code=201)
async def add_skill_claim(
    profile_id: uuid.UUID,
    body: SkillClaimCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> SkillClaimRead:
    profile = await profile_service.get_profile_by_id(db, profile_id)
    if profile is None:
        raise AppError(404, "profile_not_found", "No profile with that id.")
    if not await profile_service.can_manage_profile(db, user, profile):
        raise AppError(403, "permission_denied", "You don't have permission to edit this profile.")

    if body.skill_id is not None:
        skill = await profile_service.get_skill_by_id(db, body.skill_id)
        if skill is None:
            raise AppError(404, "skill_not_found", "No skill with that id.")
    else:
        skill = await profile_service.create_or_get_skill(
            db, name=body.skill_name or "", category=body.category
        )

    claim = await profile_service.add_skill_claim(
        db,
        actor=user,
        profile=profile,
        skill=skill,
        proficiency_level=body.proficiency_level,
        ip_address=_ip(request),
    )
    return _claim_read(claim, skill)


@claims_router.get("", response_model=list[SkillClaimRead])
async def list_skill_claims(
    profile_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[SkillClaimRead]:
    profile = await profile_service.get_profile_by_id(db, profile_id)
    if profile is None:
        raise AppError(404, "profile_not_found", "No profile with that id.")
    if not await profile_service.can_view_profile(db, user, profile):
        raise AppError(403, "permission_denied", "You don't have permission to view this profile.")
    claims = await profile_service.list_profile_skills(db, profile.id)
    return [_claim_read(c, s) for c, s in claims]


@claims_router.patch("/{claim_id}", response_model=SkillClaimRead)
async def update_skill_claim(
    profile_id: uuid.UUID,
    claim_id: uuid.UUID,
    body: SkillClaimUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> SkillClaimRead:
    profile = await profile_service.get_profile_by_id(db, profile_id)
    if profile is None:
        raise AppError(404, "profile_not_found", "No profile with that id.")
    if not await profile_service.can_manage_profile(db, user, profile):
        raise AppError(403, "permission_denied", "You don't have permission to edit this profile.")
    claim, skill = await _load_claim(db, profile.id, claim_id)
    claim = await profile_service.update_skill_claim(
        db,
        actor=user,
        claim=claim,
        proficiency_level=body.proficiency_level,
        ip_address=_ip(request),
    )
    return _claim_read(claim, skill)


@claims_router.delete("/{claim_id}", status_code=204)
async def delete_skill_claim(
    profile_id: uuid.UUID,
    claim_id: uuid.UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> None:
    profile = await profile_service.get_profile_by_id(db, profile_id)
    if profile is None:
        raise AppError(404, "profile_not_found", "No profile with that id.")
    if not await profile_service.can_manage_profile(db, user, profile):
        raise AppError(403, "permission_denied", "You don't have permission to edit this profile.")
    claim, _skill = await _load_claim(db, profile.id, claim_id)
    await profile_service.delete_skill_claim(db, actor=user, claim=claim, ip_address=_ip(request))
