"""Profile endpoints — individual & organization profiles (workstream 1).

Per docs/specs/2026-09-19-profile-crud-org-members-design.md:
  POST /profiles, GET /profiles/me, GET /profiles/{id}, PATCH /profiles/{id}.
Skill claims and services are mounted by skills.py / services routes below via
nested routers (see main.py wiring comment).
"""

import uuid

from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.core.deps import get_current_user
from app.core.errors import AppError
from app.models.identity import User
from app.schemas.profile import (
    ProfileCreate,
    ProfileRead,
    ProfileUpdate,
    ServiceCreate,
    ServiceRead,
    ServiceUpdate,
)
from app.services import organization as org_service
from app.services import profiles as profile_service

router = APIRouter(prefix="/profiles", tags=["profiles"])


def _ip(request: Request) -> str | None:
    return request.client.host if request.client else None


@router.post("", response_model=ProfileRead, status_code=201)
async def create_profile(
    body: ProfileCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> ProfileRead:
    profile = await profile_service.create_profile(
        db,
        actor=user,
        organization_id=body.organization_id,
        display_name=body.display_name,
        headline=body.headline,
        job_roles=list(body.job_roles),
        portfolio_links=[link.model_dump() for link in body.portfolio_links],
        visibility=body.visibility,
        ip_address=_ip(request),
    )
    return ProfileRead.model_validate(profile)


@router.get("/me", response_model=ProfileRead)
async def get_my_profile(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> ProfileRead:
    profile = await profile_service.get_individual_profile_by_user(db, user.id)
    if profile is None:
        raise AppError(404, "profile_not_found", "You haven't created a profile yet.")
    return ProfileRead.model_validate(profile)


async def _load_profile_or_404(db: AsyncSession, profile_id: uuid.UUID):
    profile = await profile_service.get_profile_by_id(db, profile_id)
    if profile is None:
        raise AppError(404, "profile_not_found", "No profile with that id.")
    return profile


@router.get("/{profile_id}", response_model=ProfileRead)
async def get_profile(
    profile_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> ProfileRead:
    profile = await _load_profile_or_404(db, profile_id)
    if not await profile_service.can_view_profile(db, user, profile):
        raise AppError(403, "permission_denied", "You don't have permission to view this profile.")
    return ProfileRead.model_validate(profile)


@router.patch("/{profile_id}", response_model=ProfileRead)
async def update_profile(
    profile_id: uuid.UUID,
    body: ProfileUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> ProfileRead:
    profile = await _load_profile_or_404(db, profile_id)
    if not await profile_service.can_manage_profile(db, user, profile):
        raise AppError(403, "permission_denied", "You don't have permission to edit this profile.")
    changes = body.model_dump(exclude_unset=True)
    profile = await profile_service.update_profile(
        db, actor=user, profile=profile, changes=changes, ip_address=_ip(request)
    )
    return ProfileRead.model_validate(profile)


# ---------------------------------------------------------------------------
# Services (rates & availability) — nested under /profiles/{profile_id}/services
# ---------------------------------------------------------------------------

services_router = APIRouter(prefix="/profiles/{profile_id}/services", tags=["services"])


async def _load_profile_for_manage(db: AsyncSession, profile_id: uuid.UUID, user: User):
    profile = await _load_profile_or_404(db, profile_id)
    if not await profile_service.can_manage_profile(db, user, profile):
        raise AppError(403, "permission_denied", "You don't have permission to edit this profile.")
    return profile


@services_router.post("", response_model=ServiceRead, status_code=201)
async def create_service(
    profile_id: uuid.UUID,
    body: ServiceCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> ServiceRead:
    profile = await _load_profile_for_manage(db, profile_id, user)
    service = await profile_service.create_service(
        db,
        actor=user,
        profile=profile,
        title=body.title,
        description=body.description,
        rate_type=body.rate_type,
        rate_amount=body.rate_amount,
        availability_status=body.availability_status,
        ip_address=_ip(request),
    )
    return ServiceRead.model_validate(service)


@services_router.get("", response_model=list[ServiceRead])
async def list_services(
    profile_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[ServiceRead]:
    profile = await _load_profile_or_404(db, profile_id)
    if not await profile_service.can_view_profile(db, user, profile):
        raise AppError(403, "permission_denied", "You don't have permission to view this profile.")
    services = await profile_service.list_profile_services(db, profile.id)
    return [ServiceRead.model_validate(s) for s in services]


@services_router.patch("/{service_id}", response_model=ServiceRead)
async def update_service(
    profile_id: uuid.UUID,
    service_id: uuid.UUID,
    body: ServiceUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> ServiceRead:
    profile = await _load_profile_for_manage(db, profile_id, user)
    service = await profile_service.get_service(db, service_id)
    if service is None or service.profile_id != profile.id:
        raise AppError(404, "service_not_found", "No service with that id on this profile.")
    service = await profile_service.update_service(
        db, actor=user, service=service, changes=body.model_dump(exclude_unset=True), ip_address=_ip(request)
    )
    return ServiceRead.model_validate(service)


@services_router.delete("/{service_id}", status_code=204)
async def delete_service(
    profile_id: uuid.UUID,
    service_id: uuid.UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> None:
    profile = await _load_profile_for_manage(db, profile_id, user)
    service = await profile_service.get_service(db, service_id)
    if service is None or service.profile_id != profile.id:
        raise AppError(404, "service_not_found", "No service with that id on this profile.")
    await profile_service.delete_service(db, actor=user, service=service, ip_address=_ip(request))
