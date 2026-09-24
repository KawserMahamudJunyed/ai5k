"""Roles endpoint — read-only catalog of roles and their permissions.

Small bounded list: offset pagination per docs/api-conventions.md.
"""

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.core.deps import get_current_user
from app.models.identity import User
from app.schemas.auth import RoleRead
from app.services import rbac as rbac_service

router = APIRouter(prefix="/roles", tags=["roles"])


@router.get("", response_model=list[RoleRead])
async def list_roles(
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(get_current_user),
) -> list[dict]:
    return await rbac_service.list_roles_with_permissions(db)
