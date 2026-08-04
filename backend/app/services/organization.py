"""Organization onboarding service.

Per docs/auth.md: `org_admin` is granted when a user creates an organization. The
creator is added as an active `organization_members` row with consent, and an
org-scoped `user_roles` row is created. Full org CRUD / member management belongs
to later tasks (Kawser, 2.1/2.3); this covers the onboarding path only.
"""

import re
import uuid
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import AppError
from app.models.identity import Organization, OrganizationMember, UserRole
from app.services.audit import write_audit_log
from app.services.rbac import ROLE_ORG_ADMIN, ROLE_PROFESSIONAL, ensure_role, grant_role


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
        select(UserRole)
        .where(UserRole.user_id == user_id, UserRole.organization_id == org_id)
    )
    return [ur.role.name for ur in result.scalars().all()]
