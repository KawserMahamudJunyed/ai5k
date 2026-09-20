"""Organization onboarding, member management & aggregated skill view.

Per docs/auth.md: `org_admin` is granted when a user creates an organization. The
creator is added as an active `organization_members` row with consent, and an
org-scoped `user_roles` row is created.

Member management (workstream 2 of docs/specs/2026-09-19-profile-crud-org-members-design.md):
- Members are invited by email (existing users only — no email infra).
- `consent_given=true` flips the member to active and grants an org-scoped
  `professional` role (NOT org_admin — elevation is a platform_admin action).
- The aggregated skill view counts distinct members per skill across consenting
  active members' individual profiles (no double counting).
"""

import re
import uuid
from datetime import datetime, timezone

from sqlalchemy import case, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import AppError
from app.models.identity import Organization, OrganizationMember, Role, User, UserRole
from app.models.profile import Profile, ProfileSkill, Skill
from app.services.audit import write_audit_log
from app.services.rbac import ROLE_PROFESSIONAL, ROLE_ORG_ADMIN, ensure_role, grant_role, has_permission, revoke_role


def slugify(name: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", name.strip().lower()).strip("-")
    return slug or "org"


async def unique_slug(db: AsyncSession, base: str) -> str:
    candidate = base
    n = 1
    while True:
        result = await db.execute(select(Organization.id).where(Organization.slug == candidate))
        if result.scalar_one_or_none() is None:
            return candidate
        n += 1
        candidate = f"{base}-{n}"


async def get_organization_by_id(db: AsyncSession, org_id: uuid.UUID) -> Organization | None:
    return await db.get(Organization, org_id)


async def is_org_member(db: AsyncSession, org_id: uuid.UUID, user_id: uuid.UUID) -> bool:
    result = await db.execute(
        select(OrganizationMember.id).where(
            OrganizationMember.organization_id == org_id,
            OrganizationMember.user_id == user_id,
            OrganizationMember.status == "active",
        )
    )
    return result.scalar_one_or_none() is not None


async def create_organization(
    db: AsyncSession,
    *,
    creator_id: uuid.UUID,
    name: str,
    slug: str | None = None,
    description: str | None = None,
    website_url: str | None = None,
    ip_address: str | None = None,
) -> Organization:
    """Create an org and onboard the creator as `org_admin` (docs/auth.md)."""
    org = Organization(
        name=name.strip(),
        slug=slug.strip().lower() if slug else await unique_slug(db, slugify(name)),
        description=description,
        website_url=website_url,
        status="active",
    )
    if not org.slug or not re.fullmatch(r"[a-z0-9-]+", org.slug):
        raise AppError(422, "invalid_slug", "Slug may only contain lowercase letters, digits, and dashes.")

    existing = await db.execute(select(Organization.id).where(Organization.slug == org.slug))
    if existing.scalar_one_or_none() is not None:
        raise AppError(409, "slug_taken", "An organization with that slug already exists.")

    db.add(org)
    await db.flush()

    member = OrganizationMember(
        organization_id=org.id,
        user_id=creator_id,
        consent_given=True,
        status="active",
        joined_at=datetime.now(timezone.utc),
    )
    db.add(member)

    await write_audit_log(
        db,
        actor_id=creator_id,
        action="organization.created",
        entity_type="organization",
        entity_id=org.id,
        metadata={"name": org.name, "slug": org.slug},
        ip_address=ip_address,
    )

    # Grant `org_admin` after the creation audit so audit_logs reads chronologically
    # (grant_role commits internally).
    await ensure_role(db, ROLE_PROFESSIONAL)
    await ensure_role(db, ROLE_ORG_ADMIN)
    await grant_role(
        db,
        actor_id=creator_id,
        target_user_id=creator_id,
        role_name=ROLE_ORG_ADMIN,
        organization_id=org.id,
        ip_address=ip_address,
    )

    await db.commit()
    await db.refresh(org)
    return org


async def update_organization(
    db: AsyncSession,
    *,
    actor_id: uuid.UUID,
    org: Organization,
    changes: dict,
    ip_address: str | None = None,
) -> Organization:
    """Apply PATCH changes to org profile fields (never slug); audit before/after."""
    tracked = ("name", "description", "website_url", "logo_url")
    before = {f: getattr(org, f) for f in tracked}
    for field, value in changes.items():
        if value is None:
            continue
        if field == "name":
            value = value.strip()
        setattr(org, field, value)
    after = {f: getattr(org, f) for f in tracked}

    await write_audit_log(
        db,
        actor_id=actor_id,
        action="organization.updated",
        entity_type="organization",
        entity_id=org.id,
        metadata={"before": before, "after": after},
        ip_address=ip_address,
    )
    await db.commit()
    await db.refresh(org)
    return org


async def list_user_organizations(db: AsyncSession, user_id: uuid.UUID) -> list[Organization]:
    result = await db.execute(
        select(Organization)
        .join(OrganizationMember, OrganizationMember.organization_id == Organization.id)
        .where(OrganizationMember.user_id == user_id, OrganizationMember.status == "active")
        .order_by(Organization.created_at)
    )
    return list(result.scalars().all())


async def user_org_roles(db: AsyncSession, user_id: uuid.UUID, org_id: uuid.UUID) -> list[str]:
    result = await db.execute(
        select(UserRole).where(UserRole.user_id == user_id, UserRole.organization_id == org_id)
    )
    return [ur.role.name for ur in result.scalars().all()]


# ---------------------------------------------------------------------------
# Member management (workstream 2)
# ---------------------------------------------------------------------------


async def ensure_can_manage_organization(db: AsyncSession, user_id: uuid.UUID, org_id: uuid.UUID) -> None:
    """404 if the org doesn't exist; 403 unless that org's org_admin or platform_admin."""
    org = await get_organization_by_id(db, org_id)
    if org is None:
        raise AppError(404, "organization_not_found", "No organization with that id.")
    if not await has_permission(db, user_id, "organization:manage", organization_id=org_id):
        raise AppError(403, "permission_denied", "You don't have permission to manage this organization.")


async def get_member_with_user(
    db: AsyncSession, member_id: uuid.UUID
) -> tuple[OrganizationMember, User] | None:
    """(member, user) pair — eager join, avoids async lazy-load on serialization."""
    result = await db.execute(
        select(OrganizationMember, User)
        .join(User, User.id == OrganizationMember.user_id)
        .where(OrganizationMember.id == member_id)
    )
    row = result.first()
    return (row[0], row[1]) if row else None


async def get_member(db: AsyncSession, org_id: uuid.UUID, member_id: uuid.UUID) -> OrganizationMember | None:
    result = await db.execute(
        select(OrganizationMember).where(
            OrganizationMember.id == member_id, OrganizationMember.organization_id == org_id
        )
    )
    return result.scalar_one_or_none()


async def get_member_by_user(db: AsyncSession, org_id: uuid.UUID, user_id: uuid.UUID) -> OrganizationMember | None:
    result = await db.execute(
        select(OrganizationMember).where(
            OrganizationMember.organization_id == org_id, OrganizationMember.user_id == user_id
        )
    )
    return result.scalar_one_or_none()


async def list_members_with_users(db: AsyncSession, org_id: uuid.UUID) -> list[tuple[OrganizationMember, User]]:
    """Members joined with their user rows (avoids async lazy-load on serialization)."""
    result = await db.execute(
        select(OrganizationMember, User)
        .join(User, User.id == OrganizationMember.user_id)
        .where(OrganizationMember.organization_id == org_id)
        .order_by(OrganizationMember.joined_at.nulls_first(), OrganizationMember.id)
    )
    return [(member, user) for member, user in result.all()]


async def invite_member(
    db: AsyncSession,
    *,
    actor_id: uuid.UUID,
    org_id: uuid.UUID,
    email: str,
    ip_address: str | None = None,
) -> OrganizationMember:
    """Invite an existing user by email; re-invite of a removed member resets consent."""
    from app.services import auth as auth_service

    user = await auth_service.get_user_by_email(db, email.strip().lower())
    if user is None:
        raise AppError(404, "user_not_found", "No user with that email has signed up yet.")

    existing = await get_member_by_user(db, org_id, user.id)
    if existing is not None and existing.status in ("invited", "active"):
        raise AppError(409, "member_exists", "That user is already invited or a member of this organization.")

    if existing is not None:
        # Removed member being re-invited: reset to a fresh invitation.
        before = {"status": existing.status, "consent_given": existing.consent_given}
        existing.status = "invited"
        existing.consent_given = False
        existing.joined_at = None
        await write_audit_log(
            db,
            actor_id=actor_id,
            action="organization_member.updated",
            entity_type="organization_member",
            entity_id=existing.id,
            metadata={
                "before": before,
                "after": {"status": "invited", "consent_given": False},
                "user_id": str(user.id),
            },
            ip_address=ip_address,
        )
        await db.commit()
        await db.refresh(existing)
        return existing

    member = OrganizationMember(
        organization_id=org_id,
        user_id=user.id,
        consent_given=False,
        status="invited",
    )
    db.add(member)
    await db.flush()

    await write_audit_log(
        db,
        actor_id=actor_id,
        action="organization_member.updated",
        entity_type="organization_member",
        entity_id=member.id,
        metadata={
            "before": None,
            "after": {"status": "invited", "consent_given": False},
            "user_id": str(user.id),
        },
        ip_address=ip_address,
    )
    await db.commit()
    await db.refresh(member)
    return member


async def list_user_invitations(db: AsyncSession, user_id: uuid.UUID) -> list[dict]:
    """Pending (invited) memberships for the caller, with org names.

    The schema has no invited_at timestamp (joined_at is set only on consent),
    so `invited_at` is None for pending rows; ordering falls back to row id.
    """
    result = await db.execute(
        select(OrganizationMember, Organization.id, Organization.name)
        .join(Organization, Organization.id == OrganizationMember.organization_id)
        .where(OrganizationMember.user_id == user_id, OrganizationMember.status == "invited")
        .order_by(OrganizationMember.id)
    )
    return [
        {
            "member_id": member.id,
            "organization_id": org_id,
            "organization_name": org_name,
            "invited_at": member.joined_at,
        }
        for member, org_id, org_name in result.all()
    ]


async def give_consent(
    db: AsyncSession,
    *,
    actor_id: uuid.UUID,
    org_id: uuid.UUID,
    ip_address: str | None = None,
) -> OrganizationMember:
    """The invited member accepts: consent=true, invited→active, org-scoped professional role."""
    member = await get_member_by_user(db, org_id, actor_id)
    if member is None:
        raise AppError(404, "member_not_found", "You have no membership record in this organization.")
    if member.status != "invited":
        raise AppError(409, "not_pending", "Only pending invitations can be accepted.")

    member.consent_given = True
    member.status = "active"
    member.joined_at = datetime.now(timezone.utc)
    await db.flush()

    await write_audit_log(
        db,
        actor_id=actor_id,
        action="organization_member.updated",
        entity_type="organization_member",
        entity_id=member.id,
        metadata={
            "before": {"status": "invited", "consent_given": False},
            "after": {"status": "active", "consent_given": True},
            "user_id": str(actor_id),
        },
        ip_address=ip_address,
    )

    # auth.md: consent triggers an org-scoped user_roles row. Members get the
    # org-scoped `professional` role; org_admin elevation is a platform_admin action.
    await ensure_role(db, ROLE_PROFESSIONAL)
    await grant_role(
        db,
        actor_id=actor_id,
        target_user_id=actor_id,
        role_name=ROLE_PROFESSIONAL,
        organization_id=org_id,
        ip_address=ip_address,
    )
    await db.commit()
    await db.refresh(member)
    return member


async def remove_member(
    db: AsyncSession,
    *,
    actor_id: uuid.UUID,
    org: Organization,
    member: OrganizationMember,
    ip_address: str | None = None,
) -> None:
    """Remove a member: status→removed + revoke their org-scoped roles."""
    if member.user_id == actor_id:
        raise AppError(409, "cannot_remove_self", "You cannot remove your own membership.")

    before = {"status": member.status, "consent_given": member.consent_given}
    member.status = "removed"
    member.consent_given = False
    await db.flush()

    await write_audit_log(
        db,
        actor_id=actor_id,
        action="organization_member.updated",
        entity_type="organization_member",
        entity_id=member.id,
        metadata={
            "before": before,
            "after": {"status": "removed", "consent_given": False},
            "user_id": str(member.user_id),
        },
        ip_address=ip_address,
    )

    # Revoke every org-scoped role the member holds for this org.
    role_rows = await db.execute(
        select(UserRole).where(UserRole.user_id == member.user_id, UserRole.organization_id == org.id)
    )
    for user_role in role_rows.scalars().all():
        role_name = await db.scalar(select(Role.name).where(Role.id == user_role.role_id))
        if role_name:
            await revoke_role(
                db,
                actor_id=actor_id,
                target_user_id=member.user_id,
                role_name=role_name,
                organization_id=org.id,
                ip_address=ip_address,
            )

    await db.commit()


async def aggregate_org_skills(db: AsyncSession, org_id: uuid.UUID) -> list[dict]:
    """Skills across consenting active members' individual profiles, deduped by member.

    No double counting: COUNT(DISTINCT profiles.user_id) per skill — one profile per
    user (unique user_id) and one claim per (profile, skill) (uq_profile_skill).
    """
    consenting = (
        select(OrganizationMember.user_id)
        .where(
            OrganizationMember.organization_id == org_id,
            OrganizationMember.status == "active",
            OrganizationMember.consent_given.is_(True),
        )
        .subquery()
    )

    evidenced_count = func.sum(
        case((ProfileSkill.claim_type == "evidenced", 1), else_=0)
    ).label("evidenced_count")
    self_declared_count = func.sum(
        case((ProfileSkill.claim_type == "self_declared", 1), else_=0)
    ).label("self_declared_count")

    result = await db.execute(
        select(
            Skill.id,
            Skill.name,
            Skill.category,
            func.count(func.distinct(Profile.user_id)).label("member_count"),
            evidenced_count,
            self_declared_count,
        )
        .join(ProfileSkill, ProfileSkill.skill_id == Skill.id)
        .join(Profile, Profile.id == ProfileSkill.profile_id)
        .join(consenting, Profile.user_id == consenting.c.user_id)
        .where(Profile.owner_type == "individual")
        .group_by(Skill.id, Skill.name, Skill.category)
        .order_by(func.count(func.distinct(Profile.user_id)).desc(), Skill.name.asc())
    )
    return [
        {
            "skill_id": skill_id,
            "name": name,
            "category": category,
            "member_count": member_count,
            "evidenced_count": int(evidenced_count or 0),
            "self_declared_count": int(self_declared_count or 0),
        }
        for skill_id, name, category, member_count, evidenced_count, self_declared_count in result.all()
    ]
