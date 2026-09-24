"""Organization endpoints: onboarding, PATCH, member management & aggregated skills.

- POST /organizations — creator onboarded as `org_admin` (docs/auth.md).
- PATCH /organizations/{org_id} — org profile fields (that org's org_admin or platform_admin).
- Members (workstream 2): list/invite/remove + self-consent + invitations.
- GET /organizations/{org_id}/skills — aggregated skill view (consenting members only).
"""

import uuid

from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.core.deps import get_current_user
from app.core.errors import AppError
from app.models.identity import User
from app.schemas.auth import OrganizationCreate, OrganizationRead
from app.schemas.organization import (
    AggregateSkillRow,
    InvitationRead,
    MemberCreate,
    MemberRead,
    MemberUserRead,
    OrganizationUpdate,
)
from app.services import organization as org_service
from app.services import rbac as rbac_service

router = APIRouter(prefix="/organizations", tags=["organizations"])


def _ip(request: Request) -> str | None:
    return request.client.host if request.client else None


@router.post("", response_model=OrganizationRead, status_code=201)
async def create_organization(
    body: OrganizationCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> OrganizationRead:
    org = await org_service.create_organization(
        db,
        creator_id=user.id,
        name=body.name,
        slug=body.slug,
        description=body.description,
        website_url=body.website_url,
        ip_address=_ip(request),
    )
    return OrganizationRead.model_validate(org)


@router.get("", response_model=list[OrganizationRead])
async def list_my_organizations(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[OrganizationRead]:
    orgs = await org_service.list_user_organizations(db, user.id)
    return [OrganizationRead.model_validate(o) for o in orgs]


@router.get("/invitations", response_model=list[InvitationRead])
async def list_my_invitations(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[InvitationRead]:
    rows = await org_service.list_user_invitations(db, user.id)
    return [InvitationRead(**row) for row in rows]


async def _load_org_or_404(db: AsyncSession, org_id: uuid.UUID):
    org = await org_service.get_organization_by_id(db, org_id)
    if org is None:
        raise AppError(404, "organization_not_found", "No organization with that id.")
    return org


@router.get("/{org_id}", response_model=OrganizationRead)
async def get_organization(
    org_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> OrganizationRead:
    org = await _load_org_or_404(db, org_id)
    is_member = await org_service.is_org_member(db, org_id, user.id)
    is_platform_admin = await rbac_service.has_permission(db, user.id, "organization:manage")
    if not is_member and not is_platform_admin:
        raise AppError(403, "permission_denied", "You don't have permission to view this organization.")
    return OrganizationRead.model_validate(org)


@router.patch("/{org_id}", response_model=OrganizationRead)
async def update_organization(
    org_id: uuid.UUID,
    body: OrganizationUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> OrganizationRead:
    await org_service.ensure_can_manage_organization(db, user.id, org_id)
    org = await _load_org_or_404(db, org_id)
    org = await org_service.update_organization(
        db, actor_id=user.id, org=org, changes=body.model_dump(exclude_unset=True), ip_address=_ip(request)
    )
    return OrganizationRead.model_validate(org)


@router.get("/{org_id}/members", response_model=list[MemberRead])
async def list_members(
    org_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[MemberRead]:
    await org_service.ensure_can_manage_organization(db, user.id, org_id)
    pairs = await org_service.list_members_with_users(db, org_id)
    return [
        MemberRead(
            id=m.id,
            organization_id=m.organization_id,
            user=MemberUserRead.model_validate(u),
            status=m.status,
            consent_given=m.consent_given,
            joined_at=m.joined_at,
        )
        for m, u in pairs
    ]


def _member_read(member, user) -> MemberRead:
    return MemberRead(
        id=member.id,
        organization_id=member.organization_id,
        user=MemberUserRead.model_validate(user),
        status=member.status,
        consent_given=member.consent_given,
        joined_at=member.joined_at,
    )


@router.post("/{org_id}/members", response_model=MemberRead, status_code=201)
async def invite_member(
    org_id: uuid.UUID,
    body: MemberCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> MemberRead:
    await org_service.ensure_can_manage_organization(db, user.id, org_id)
    member = await org_service.invite_member(
        db, actor_id=user.id, org_id=org_id, email=body.email, ip_address=_ip(request)
    )
    pair = await org_service.get_member_with_user(db, member.id)
    assert pair is not None
    return _member_read(*pair)


@router.post("/{org_id}/members/me/consent", response_model=MemberRead)
async def give_consent(
    org_id: uuid.UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> MemberRead:
    await _load_org_or_404(db, org_id)
    member = await org_service.give_consent(
        db, actor_id=user.id, org_id=org_id, ip_address=_ip(request)
    )
    pair = await org_service.get_member_with_user(db, member.id)
    assert pair is not None
    return _member_read(*pair)


@router.delete("/{org_id}/members/{member_id}", status_code=204)
async def remove_member(
    org_id: uuid.UUID,
    member_id: uuid.UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> None:
    await org_service.ensure_can_manage_organization(db, user.id, org_id)
    member = await org_service.get_member(db, org_id, member_id)
    if member is None:
        raise AppError(404, "member_not_found", "No member with that id in this organization.")
    org = await org_service.get_organization_by_id(db, org_id)
    await org_service.remove_member(db, actor_id=user.id, org=org, member=member, ip_address=_ip(request))


@router.get("/{org_id}/skills", response_model=list[AggregateSkillRow])
async def aggregate_org_skills(
    org_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[AggregateSkillRow]:
    await _load_org_or_404(db, org_id)
    is_member = await org_service.is_org_member(db, org_id, user.id)
    can_manage = await rbac_service.has_permission(
        db, user.id, "organization:manage", organization_id=org_id
    )
    if not is_member and not can_manage:
        raise AppError(403, "permission_denied", "You don't have permission to view this organization's skills.")
    rows = await org_service.aggregate_org_skills(db, org_id)
    return [AggregateSkillRow(**row) for row in rows]
