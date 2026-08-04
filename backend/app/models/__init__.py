"""Import all models so Base.metadata is complete (Alembic autogenerate, create_all)."""

from app.models.audit import AuditLog
from app.models.identity import (
    Organization,
    OrganizationMember,
    Permission,
    Role,
    RolePermission,
    User,
    UserRole,
)

__all__ = [
    "AuditLog",
    "User",
    "Organization",
    "OrganizationMember",
    "Role",
    "Permission",
    "RolePermission",
    "UserRole",
]
