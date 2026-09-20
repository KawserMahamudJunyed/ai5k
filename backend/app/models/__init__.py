"""Import all models so Base.metadata is complete (Alembic autogenerate, create_all)."""

from app.models.audit import AuditLog
from app.models.evidence import Evidence, EvidenceSkillLink
from app.models.verification import VerificationRequest

from app.models.identity import (
    Organization,
    OrganizationMember,
    Permission,
    Role,
    RolePermission,
    User,
    UserRole,
)

from app.models.profile import Profile, ProfileSkill, Service, Skill

__all__ = [
    "AuditLog",
    "Evidence",
    "EvidenceSkillLink",
    "VerificationRequest",
    "Profile",
    "ProfileSkill",
    "Service",
    "Skill",
    "User",
    "Organization",
    "OrganizationMember",
    "Role",
    "Permission",
    "RolePermission",
    "UserRole",
]
