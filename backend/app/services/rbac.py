"""RBAC business logic — roles, permissions, role assignment (docs/rbac.md)."""

import uuid

from sqlalchemy import and_, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import AppError
from app.models.identity import (
    Organization,
    Permission,
    Role,
    RolePermission,
    UserRole,
)
from app.services.audit import write_audit_log

ROLE_PROFESSIONAL = "professional"
ROLE_ORG_ADMIN = "org_admin"
ROLE_PLATFORM_ADMIN = "platform_admin"

# Suggested starting mapping from docs/rbac.md.
DEFAULT_ROLES: dict[str, list[str]] = {
    ROLE_PROFESSIONAL: ["profile:write", "opportunity:read", "opportunity:write"],
    ROLE_ORG_ADMIN: [
        "profile:write",
        "opportunity:read",
        "opportunity:write",
        "organization:manage",
    ],
    ROLE_PLATFORM_ADMIN: [
        "profile:read",
        "profile:write",
        "organization:manage",
        "opportunity:read",
        "opportunity:write",
        "opportunity:assign",
        "proposal:approve",
        "verification:review",
        "verification:approve",
        "audit:read",
        "rbac:manage",
        "rule:manage",
    ],
}


async def get_role_by_name(db: AsyncSession, name: str) -> Role | None:
    result = await db.execute(select(Role).where(Role.name == name))
    return result.scalar_one_or_none()


async def get_permission_by_code(db: AsyncSession, code: str) -> Permission | None:
    result = await db.execute(select(Permission).where(Permission.code == code))
    return result.scalar_one_or_none()


async def ensure_role(db: AsyncSession, name: str) -> Role:
    """Create the role (and its permission set) if it doesn't exist yet."""
    role = await get_role_by_name(db, name)
    if role is not None:
        return role
    role = Role(name=name, description=f"{name} role")
    db.add(role)
    await db.flush()
    for code in DEFAULT_ROLES.get(name, []):
        perm = await get_permission_by_code(db, code)
        if perm is None:
            perm = Permission(code=code, description=code)
            db.add(perm)
            await db.flush()
        db.add(RolePermission(role_id=role.id, permission_id=perm.id))
    await db.flush()
    return role


async def seed_default_rbac(db: AsyncSession) -> None:
    """Idempotent seed of roles + permissions (used by migration data path / script)."""
    for name in DEFAULT_ROLES:
        await ensure_role(db, name)
    await db.commit()


async def grant_role(
    db: AsyncSession,
    *,
    actor_id: uuid.UUID | None,
    target_user_id: uuid.UUID,
    role_name: str,
    organization_id: uuid.UUID | None = None,
    ip_address: str | None = None,
) -> UserRole:
    """Assign a role to a user; audit-log the grant. Idempotent per (user, role, org)."""
    role = await get_role_by_name(db, role_name)
    if role is None:
        raise AppError(404, "role_not_found", f"No role named '{role_name}'.")
    if organization_id is not None:
        org = await db.get(Organization, organization_id)
        if org is None:
            raise AppError(404, "organization_not_found", "No organization with that id.")

    existing = await db.execute(
        select(UserRole).where(
            and_(
                UserRole.user_id == target_user_id,
                UserRole.role_id == role.id,
                UserRole.organization_id.is_(None)
                if organization_id is None
                else UserRole.organization_id == organization_id,
            )
        )
    )
    if existing.scalar_one_or_none() is not None:
        raise AppError(409, "role_already_granted", "User already has this role.")

    user_role = UserRole(
        user_id=target_user_id,
        role_id=role.id,
        organization_id=organization_id,
    )
    db.add(user_role)
    await db.flush()

    await write_audit_log(
        db,
        actor_id=actor_id,
        action="user_role.granted",
        entity_type="user_role",
        entity_id=user_role.id,
        metadata={
            "user_id": str(target_user_id),
            "role": role_name,
            "organization_id": str(organization_id) if organization_id else None,
        },
        ip_address=ip_address,
    )
    await db.commit()
    return user_role


async def revoke_role(
    db: AsyncSession,
    *,
    actor_id: uuid.UUID | None,
    target_user_id: uuid.UUID,
    role_name: str,
    organization_id: uuid.UUID | None = None,
    ip_address: str | None = None,
) -> None:
    """Remove a role assignment; audit-log the revocation."""
    role = await get_role_by_name(db, role_name)
    if role is None:
        raise AppError(404, "role_not_found", f"No role named '{role_name}'.")

    org_filter = (
        UserRole.organization_id.is_(None)
        if organization_id is None
        else UserRole.organization_id == organization_id
    )
    existing = await db.execute(
        select(UserRole).where(
            and_(
                UserRole.user_id == target_user_id,
                UserRole.role_id == role.id,
                org_filter,
            )
        )
    )
    user_role = existing.scalar_one_or_none()
    if user_role is None:
        raise AppError(404, "role_not_granted", "User does not have this role.")

    await write_audit_log(
        db,
        actor_id=actor_id,
        action="user_role.revoked",
        entity_type="user_role",
        entity_id=user_role.id,
        metadata={
            "user_id": str(target_user_id),
            "role": role_name,
            "organization_id": str(organization_id) if organization_id else None,
        },
        ip_address=ip_address,
    )
    await db.delete(user_role)
    await db.commit()


async def has_permission(
    db: AsyncSession,
    user_id: uuid.UUID,
    permission_code: str,
    organization_id: uuid.UUID | None = None,
) -> bool:
    """Per docs/rbac.md: role applies if org-scoped roles match the org, or the role
    is platform-wide (organization_id is null)."""
    org_scope = (
        or_(UserRole.organization_id.is_(None), UserRole.organization_id == organization_id)
        if organization_id is not None
        else UserRole.organization_id.is_(None)
    )
    result = await db.execute(
        select(Permission.code)
        .join(RolePermission, RolePermission.permission_id == Permission.id)
        .join(Role, Role.id == RolePermission.role_id)
        .join(UserRole, UserRole.role_id == Role.id)
        .where(UserRole.user_id == user_id, org_scope, Permission.code == permission_code)
    )
    return result.scalar_one_or_none() is not None


async def list_roles_with_permissions(db: AsyncSession) -> list[dict]:
    """All roles with their permission codes (for the bounded `roles` endpoint)."""
    result = await db.execute(
        select(Role, Permission.code)
        .join(RolePermission, RolePermission.role_id == Role.id)
        .join(Permission, Permission.id == RolePermission.permission_id)
        .order_by(Role.name, Permission.code)
    )
    grouped: dict[str, dict] = {}
    for role, code in result.all():
        entry = grouped.setdefault(role.name, {"name": role.name, "permissions": []})
        entry["permissions"].append(code)
    return list(grouped.values())
