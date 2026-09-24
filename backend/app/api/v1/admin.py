"""Platform-admin RBAC endpoints — grant/revoke roles (permission `rbac:manage`).

`platform_admin` is granted manually by an existing platform_admin via these
endpoints — no self-serve path (docs/auth.md).
"""

import uuid

from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.core.deps import require_permission
from app.models.identity import User
from app.schemas.auth import GrantRoleRequest, GrantRoleResponse, RevokeRoleRequest
from app.services import rbac as rbac_service

router = APIRouter(prefix="/admin/users", tags=["admin"])


def _ip(request: Request) -> str | None:
    return request.client.host if request.client else None


@router.post("/{user_id}/roles", response_model=GrantRoleResponse, status_code=201)
async def grant_user_role(
    user_id: uuid.UUID,
    body: GrantRoleRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    _actor: User = Depends(require_permission("rbac:manage")),
) -> GrantRoleResponse:
    await rbac_service.grant_role(
        db,
        actor_id=_actor.id,
        target_user_id=user_id,
        role_name=body.role_name,
        organization_id=body.organization_id,
        ip_address=_ip(request),
    )
    return GrantRoleResponse(user_id=user_id, role=body.role_name, organization_id=body.organization_id)


@router.delete("/{user_id}/roles", status_code=204)
async def revoke_user_role(
    user_id: uuid.UUID,
    body: RevokeRoleRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    _actor: User = Depends(require_permission("rbac:manage")),
) -> None:
    await rbac_service.revoke_role(
        db,
        actor_id=_actor.id,
        target_user_id=user_id,
        role_name=body.role_name,
        organization_id=body.organization_id,
        ip_address=_ip(request),
    )
