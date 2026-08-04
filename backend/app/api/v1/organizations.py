"""Organization onboarding endpoints.

POST /organizations — an authenticated user creates an org and is onboarded as
`org_admin` scoped to that org (docs/auth.md). Full org CRUD / member management
belongs to later tasks (Kawser, 2.1/2.3).
"""

import uuid

from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.core.deps import get_current_user
from app.core.errors import AppError
from app.models.identity import User
from app.schemas.auth import OrganizationCreate, OrganizationRead
from app.services import rbac as rbac_service
from app.services import organization as org_service

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


@router.get("/{org_id}", response_model=OrganizationRead)
async def get_organization(
    org_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> OrganizationRead:
    org = await org_service.get_organization_by_id(db, org_id)
    if org is None:
        raise AppError(404, "organization_not_found", "No organization with that id.")
    is_member = await org_service.is_org_member(db, org_id, user.id)
    is_platform_admin = await rbac_service.has_permission(db, user.id, "organization:manage")
    if not is_member and not is_platform_admin:
        raise AppError(403, "permission_denied", "You don't have permission to view this organization.")
    return OrganizationRead.model_validate(org)
