"""Profiles, Skills & Services models — mirrors docs/data-dictionary.md Domain 2.

Party pattern (ADR 0001): `profiles` is the marketplace-facing "party" entity.
Exactly one of `user_id` / `organization_id` is set, enforced by a CHECK constraint.
`headline`, `job_roles`, `portfolio_links` are pilot additions documented in
docs/specs/2026-09-19-profile-crud-org-members-design.md (pending schema-freeze sign-off).
"""

import uuid
from datetime import datetime
from typing import Any, Optional

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    Numeric,
    String,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, JSONBType, TimestampMixin, UUIDMixin

OWNER_INDIVIDUAL = "individual"
OWNER_ORGANIZATION = "organization"

CLAIM_SELF_DECLARED = "self_declared"
CLAIM_EVIDENCED = "evidenced"

RATE_HOURLY = "hourly"
RATE_FIXED = "fixed"
RATE_RETAINER = "retainer"

AVAILABILITY_AVAILABLE = "available"
AVAILABILITY_BOOKED = "booked"
AVAILABILITY_UNAVAILABLE = "unavailable"

VISIBILITY_PRIVATE = "private"
VISIBILITY_PUBLIC = "public"

MAX_JOB_ROLES = 10
MAX_PORTFOLIO_LINKS = 20


class Profile(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "profiles"
    __table_args__ = (
        CheckConstraint(
            "(user_id IS NOT NULL AND organization_id IS NULL)"
            " OR (user_id IS NULL AND organization_id IS NOT NULL)",
            name="ck_profiles_exactly_one_owner",
        ),
    )

    owner_type: Mapped[str] = mapped_column(String(32), nullable=False)
    user_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), unique=True, nullable=True
    )
    organization_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        ForeignKey("organizations.id", ondelete="CASCADE"), unique=True, nullable=True
    )
    display_name: Mapped[str] = mapped_column(String(255), nullable=False)
    headline: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    # jsonb list[str] (≤10) — validated at the application layer.
    job_roles: Mapped[list[Any]] = mapped_column(JSONBType, nullable=False, server_default="[]")
    # jsonb list[{label, url}] (≤20) — validated at the application layer.
    portfolio_links: Mapped[list[Any]] = mapped_column(
        JSONBType, nullable=False, server_default="[]"
    )
    visibility: Mapped[str] = mapped_column(String(32), nullable=False, server_default="private")

    skill_claims: Mapped[list["ProfileSkill"]] = relationship(back_populates="profile")
    services: Mapped[list["Service"]] = relationship(back_populates="profile")


class Skill(UUIDMixin, Base):
    __tablename__ = "skills"

    name: Mapped[str] = mapped_column(String(128), unique=True, nullable=False)
    category: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)


class ProfileSkill(UUIDMixin, Base):
    """A skill claim by a profile (docs/glossary.md "Skill claim")."""

    __tablename__ = "profile_skills"
    __table_args__ = (UniqueConstraint("profile_id", "skill_id", name="uq_profile_skill"),)

    profile_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("profiles.id", ondelete="CASCADE"), nullable=False
    )
    skill_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("skills.id", ondelete="CASCADE"), nullable=False
    )
    claim_type: Mapped[str] = mapped_column(String(32), nullable=False, server_default=CLAIM_SELF_DECLARED)
    proficiency_level: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    profile: Mapped[Profile] = relationship(back_populates="skill_claims")
    skill: Mapped[Skill] = relationship()


class Service(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "services"

    profile_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("profiles.id", ondelete="CASCADE"), nullable=False
    )
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str] = mapped_column(nullable=False)
    rate_type: Mapped[str] = mapped_column(String(32), nullable=False)
    rate_amount: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)
    availability_status: Mapped[str] = mapped_column(
        String(32), nullable=False, server_default=AVAILABILITY_AVAILABLE
    )

    profile: Mapped[Profile] = relationship(back_populates="services")
