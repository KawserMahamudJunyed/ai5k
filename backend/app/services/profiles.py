"""Profiles, skills & services business logic (workstream 1 of the approved design).

Permission model:
- Individual profiles: the owning user (and `platform_admin`) reads/edits.
- Organization profiles: org-scoped `organization:manage` (that org's org_admin)
  and `platform_admin` read/edits.
- `claim_type` is server-asserted: claims are always created `self_declared`; the
  `evidenced` flip belongs to the verification queue (Tasks 2.4/2.5).
"""

import uuid
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import AppError
from app.models.identity import Organization, User
from app.models.profile import (
    AVAILABILITY_AVAILABLE,
    CLAIM_SELF_DECLARED,
    OWNER_INDIVIDUAL,
    OWNER_ORGANIZATION,
    VISIBILITY_PRIVATE,
    Profile,
    ProfileSkill,
    Service,
    Skill,
)
from app.services.audit import write_audit_log
from app.services.rbac import has_permission, has_role


async def get_profile_by_id(db: AsyncSession, profile_id: uuid.UUID) -> Profile | None:
    return await db.get(Profile, profile_id)


async def get_individual_profile_by_user(db: AsyncSession, user_id: uuid.UUID) -> Profile | None:
    result = await db.execute(select(Profile).where(Profile.user_id == user_id))
    return result.scalar_one_or_none()


async def get_org_profile_by_org(db: AsyncSession, org_id: uuid.UUID) -> Profile | None:
    result = await db.execute(select(Profile).where(Profile.organization_id == org_id))
    return result.scalar_one_or_none()


async def can_view_profile(db: AsyncSession, user: User, profile: Profile) -> bool:
    if profile.visibility == "public":
        return True
    if profile.user_id is not None:
        return profile.user_id == user.id or await has_role(db, user.id, "platform_admin")
    # Organization profile: members can view; org-scoped manage or platform_admin too.
    from app.services import organization as org_service

    if await org_service.is_org_member(db, profile.organization_id, user.id):
        return True
    return await has_permission(
        db, user.id, "organization:manage", organization_id=profile.organization_id
    ) or await has_role(db, user.id, "platform_admin")


async def can_manage_profile(db: AsyncSession, user: User, profile: Profile) -> bool:
    if profile.user_id is not None:
        return profile.user_id == user.id or await has_role(db, user.id, "platform_admin")
    return await has_permission(
        db, user.id, "organization:manage", organization_id=profile.organization_id
    ) or await has_role(db, user.id, "platform_admin")


async def create_profile(
    db: AsyncSession,
    *,
    actor: User,
    organization_id: uuid.UUID | None,
    display_name: str,
    headline: str | None,
    job_roles: list[str],
    portfolio_links: list[dict],
    visibility: str,
    ip_address: str | None = None,
) -> Profile:
    """Create an individual profile for the caller, or an org profile with manage rights."""
    if organization_id is not None:
        org = await db.get(Organization, organization_id)
        if org is None:
            raise AppError(404, "organization_not_found", "No organization with that id.")
        if not await has_permission(
            db, actor.id, "organization:manage", organization_id=organization_id
        ):
            raise AppError(403, "permission_denied", "You don't manage that organization.")
        if await get_org_profile_by_org(db, organization_id):
            raise AppError(409, "profile_exists", "That organization already has a profile.")
        owner_type = OWNER_ORGANIZATION
    else:
        if await get_individual_profile_by_user(db, actor.id):
            raise AppError(409, "profile_exists", "You already have a profile.")
        owner_type = OWNER_INDIVIDUAL

    profile = Profile(
        owner_type=owner_type,
        user_id=actor.id if owner_type == OWNER_INDIVIDUAL else None,
        organization_id=organization_id,
        display_name=display_name,
        headline=headline,
        job_roles=job_roles,
        portfolio_links=portfolio_links,
        visibility=visibility or VISIBILITY_PRIVATE,
    )
    db.add(profile)
    await db.flush()

    await write_audit_log(
        db,
        actor_id=actor.id,
        action="profile.created",
        entity_type="profile",
        entity_id=profile.id,
        metadata={"owner_type": owner_type, "display_name": display_name},
        ip_address=ip_address,
    )
    await db.commit()
    await db.refresh(profile)
    return profile


async def update_profile(
    db: AsyncSession,
    *,
    actor: User,
    profile: Profile,
    changes: dict,
    ip_address: str | None = None,
) -> Profile:
    """Apply non-null `changes` to the profile; audit before/after."""
    before = {
        "display_name": profile.display_name,
        "headline": profile.headline,
        "job_roles": profile.job_roles,
        "portfolio_links": profile.portfolio_links,
        "visibility": profile.visibility,
    }
    for field, value in changes.items():
        if value is None:
            continue
        setattr(profile, field, value)

    after = {
        "display_name": profile.display_name,
        "headline": profile.headline,
        "job_roles": profile.job_roles,
        "portfolio_links": profile.portfolio_links,
        "visibility": profile.visibility,
        "id": str(profile.id),
    }
    await write_audit_log(
        db,
        actor_id=actor.id,
        action="profile.updated",
        entity_type="profile",
        entity_id=profile.id,
        metadata={"before": before, "after": after},
        ip_address=ip_address,
    )
    await db.commit()
    await db.refresh(profile)
    return profile


async def get_skill_by_id(db: AsyncSession, skill_id: uuid.UUID) -> Skill | None:
    return await db.get(Skill, skill_id)


async def get_skill_by_name(db: AsyncSession, name: str) -> Skill | None:
    result = await db.execute(select(Skill).where(Skill.name == name.strip().lower()))
    return result.scalar_one_or_none()


async def create_or_get_skill(
    db: AsyncSession, *, name: str, category: str | None = None
) -> Skill:
    name = name.strip().lower()
    skill = await get_skill_by_name(db, name)
    if skill is None:
        skill = Skill(name=name, category=category)
        db.add(skill)
        await db.flush()
    return skill


async def list_skills(
    db: AsyncSession, *, category: str | None, page: int, page_size: int
) -> tuple[list[Skill], int]:
    base = select(Skill)
    if category:
        base = base.where(Skill.category == category)
    total = (await db.execute(select(func.count()).select_from(base.subquery()))).scalar_one()
    rows = await db.execute(
        base.order_by(Skill.name).offset((page - 1) * page_size).limit(page_size)
    )
    return list(rows.scalars().all()), total


async def get_skill_claim(db: AsyncSession, claim_id: uuid.UUID) -> ProfileSkill | None:
    return await db.get(ProfileSkill, claim_id)


async def get_skill_claim_by_unique(db: AsyncSession, profile_id: uuid.UUID, skill_id: uuid.UUID) -> ProfileSkill | None:
    result = await db.execute(
        select(ProfileSkill).where(
            ProfileSkill.profile_id == profile_id, ProfileSkill.skill_id == skill_id
        )
    )
    return result.scalar_one_or_none()


async def list_profile_skills(db: AsyncSession, profile_id: uuid.UUID) -> list[tuple[ProfileSkill, Skill]]:
    """(claim, skill) tuples — eager, no lazy loads (async-unsafe)."""
    result = await db.execute(
        select(ProfileSkill, Skill)
        .join(Skill, Skill.id == ProfileSkill.skill_id)
        .where(ProfileSkill.profile_id == profile_id)
        .order_by(Skill.name)
    )
    return [(claim, skill) for claim, skill in result.all()]


async def get_skill_claim_with_skill(
    db: AsyncSession, profile_id: uuid.UUID, claim_id: uuid.UUID
) -> tuple[ProfileSkill, Skill] | None:
    result = await db.execute(
        select(ProfileSkill, Skill)
        .join(Skill, Skill.id == ProfileSkill.skill_id)
        .where(ProfileSkill.id == claim_id, ProfileSkill.profile_id == profile_id)
    )
    row = result.first()
    return (row[0], row[1]) if row else None


async def add_skill_claim(
    db: AsyncSession,
    *,
    actor: User,
    profile: Profile,
    skill: Skill,
    proficiency_level: str | None,
    ip_address: str | None = None,
) -> ProfileSkill:
    """Create a skill claim; always `self_declared` (server-asserted)."""
    if await get_skill_claim_by_unique(db, profile.id, skill.id):
        raise AppError(409, "skill_already_claimed", "That skill is already claimed on this profile.")

    claim = ProfileSkill(
        profile_id=profile.id,
        skill_id=skill.id,
        claim_type=CLAIM_SELF_DECLARED,
        proficiency_level=proficiency_level,
    )
    db.add(claim)
    await db.flush()

    await write_audit_log(
        db,
        actor_id=actor.id,
        action="profile_skill.created",
        entity_type="profile_skill",
        entity_id=claim.id,
        metadata={
            "profile_id": str(profile.id),
            "skill_id": str(skill.id),
            "skill_name": skill.name,
            "claim_type": CLAIM_SELF_DECLARED,
        },
        ip_address=ip_address,
    )
    await db.commit()
    await db.refresh(claim)
    return claim


async def update_skill_claim(
    db: AsyncSession,
    *,
    actor: User,
    claim: ProfileSkill,
    proficiency_level: str | None,
    ip_address: str | None = None,
) -> ProfileSkill:
    before = {"proficiency_level": claim.proficiency_level}
    claim.proficiency_level = proficiency_level
    await write_audit_log(
        db,
        actor_id=actor.id,
        action="profile_skill.updated",
        entity_type="profile_skill",
        entity_id=claim.id,
        metadata={
            "before": before,
            "after": {"proficiency_level": claim.proficiency_level},
        },
        ip_address=ip_address,
    )
    await db.commit()
    await db.refresh(claim)
    return claim


async def delete_skill_claim(
    db: AsyncSession,
    *,
    actor: User,
    claim: ProfileSkill,
    ip_address: str | None = None,
) -> None:
    await write_audit_log(
        db,
        actor_id=actor.id,
        action="profile_skill.deleted",
        entity_type="profile_skill",
        entity_id=claim.id,
        metadata={"profile_id": str(claim.profile_id), "skill_id": str(claim.skill_id)},
        ip_address=ip_address,
    )
    await db.delete(claim)
    await db.commit()


async def get_service(db: AsyncSession, service_id: uuid.UUID) -> Service | None:
    return await db.get(Service, service_id)


async def list_profile_services(db: AsyncSession, profile_id: uuid.UUID) -> list[Service]:
    result = await db.execute(
        select(Service).where(Service.profile_id == profile_id).order_by(Service.created_at)
    )
    return list(result.scalars().all())


async def create_service(
    db: AsyncSession,
    *,
    actor: User,
    profile: Profile,
    title: str,
    description: str,
    rate_type: str,
    rate_amount: float,
    availability_status: str,
    ip_address: str | None = None,
) -> Service:
    service = Service(
        profile_id=profile.id,
        title=title,
        description=description,
        rate_type=rate_type,
        rate_amount=rate_amount,
        availability_status=availability_status or AVAILABILITY_AVAILABLE,
    )
    db.add(service)
    await db.flush()

    await write_audit_log(
        db,
        actor_id=actor.id,
        action="service.created",
        entity_type="service",
        entity_id=service.id,
        metadata={"profile_id": str(profile.id), "title": title, "rate_type": rate_type},
        ip_address=ip_address,
    )
    await db.commit()
    await db.refresh(service)
    return service


async def update_service(
    db: AsyncSession,
    *,
    actor: User,
    service: Service,
    changes: dict,
    ip_address: str | None = None,
) -> Service:
    tracked = ("title", "description", "rate_type", "rate_amount", "availability_status")

    def _jsonable(value):
        return float(value) if isinstance(value, Decimal) else value

    before = {f: _jsonable(getattr(service, f)) for f in tracked}
    for field, value in changes.items():
        if value is None:
            continue
        setattr(service, field, value)
    after = {f: _jsonable(getattr(service, f)) for f in tracked}

    await write_audit_log(
        db,
        actor_id=actor.id,
        action="service.updated",
        entity_type="service",
        entity_id=service.id,
        metadata={"before": before, "after": after},
        ip_address=ip_address,
    )
    await db.commit()
    await db.refresh(service)
    return service


async def delete_service(
    db: AsyncSession,
    *,
    actor: User,
    service: Service,
    ip_address: str | None = None,
) -> None:
    await write_audit_log(
        db,
        actor_id=actor.id,
        action="service.deleted",
        entity_type="service",
        entity_id=service.id,
        metadata={"profile_id": str(service.profile_id), "title": service.title},
        ip_address=ip_address,
    )
    await db.delete(service)
    await db.commit()
