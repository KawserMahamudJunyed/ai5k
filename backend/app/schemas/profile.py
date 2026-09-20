"""Pydantic request/response schemas for the profiles, skills & services domain."""

import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.models.profile import MAX_JOB_ROLES, MAX_PORTFOLIO_LINKS


class ORMModelMixin(BaseModel):
    model_config = ConfigDict(from_attributes=True)


# ---------------------------------------------------------------------------
# Profile
# ---------------------------------------------------------------------------


class PortfolioLinkIn(BaseModel):
    label: str = Field(min_length=1, max_length=100)
    url: str = Field(min_length=1, max_length=2048, pattern=r"^https?://")


class ProfileCreate(BaseModel):
    # For organization profiles; ignored/forbidden on the self-serve path.
    organization_id: uuid.UUID | None = None
    display_name: str = Field(min_length=1, max_length=255)
    headline: str | None = Field(default=None, max_length=255)
    job_roles: list[str] = Field(default_factory=list, max_length=MAX_JOB_ROLES)
    portfolio_links: list[PortfolioLinkIn] = Field(
        default_factory=list, max_length=MAX_PORTFOLIO_LINKS
    )
    visibility: Literal["private", "public"] = "private"


class ProfileUpdate(BaseModel):
    display_name: str | None = Field(default=None, min_length=1, max_length=255)
    headline: str | None = Field(default=None, max_length=255)
    job_roles: list[str] | None = Field(default=None, max_length=MAX_JOB_ROLES)
    portfolio_links: list[PortfolioLinkIn] | None = Field(
        default=None, max_length=MAX_PORTFOLIO_LINKS
    )
    visibility: Literal["private", "public"] | None = None


class ProfileRead(ORMModelMixin):
    id: uuid.UUID
    owner_type: str
    user_id: uuid.UUID | None = None
    organization_id: uuid.UUID | None = None
    display_name: str
    headline: str | None = None
    job_roles: list[str] = Field(default_factory=list)
    portfolio_links: list[PortfolioLinkIn] = Field(default_factory=list)
    visibility: str
    created_at: datetime
    updated_at: datetime


# ---------------------------------------------------------------------------
# Skills
# ---------------------------------------------------------------------------


class SkillRead(ORMModelMixin):
    id: uuid.UUID
    name: str
    category: str | None = None


class SkillCatalogResponse(BaseModel):
    data: list[SkillRead]
    total: int
    page: int
    page_size: int


class SkillClaimCreate(BaseModel):
    skill_id: uuid.UUID | None = None
    skill_name: str | None = Field(default=None, min_length=1, max_length=128)
    category: str | None = Field(default=None, max_length=128)
    proficiency_level: Literal["beginner", "intermediate", "advanced", "expert"] | None = None

    @model_validator(mode="after")
    def _require_skill_reference(self) -> "SkillClaimCreate":
        if self.skill_id is None and not self.skill_name:
            raise ValueError("Provide skill_id or skill_name.")
        return self


class SkillClaimUpdate(BaseModel):
    proficiency_level: Literal["beginner", "intermediate", "advanced", "expert"] | None = None


class SkillClaimRead(ORMModelMixin):
    id: uuid.UUID
    profile_id: uuid.UUID
    skill_id: uuid.UUID
    skill_name: str
    claim_type: str
    proficiency_level: str | None = None
    created_at: datetime


# ---------------------------------------------------------------------------
# Services
# ---------------------------------------------------------------------------


class ServiceCreate(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    description: str = Field(min_length=1)
    rate_type: Literal["hourly", "fixed", "retainer"]
    rate_amount: float = Field(gt=0)
    availability_status: Literal["available", "booked", "unavailable"] = "available"


class ServiceUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = Field(default=None, min_length=1)
    rate_type: Literal["hourly", "fixed", "retainer"] | None = None
    rate_amount: float | None = Field(default=None, gt=0)
    availability_status: Literal["available", "booked", "unavailable"] | None = None


class ServiceRead(ORMModelMixin):
    id: uuid.UUID
    profile_id: uuid.UUID
    title: str
    description: str
    rate_type: str
    rate_amount: float
    availability_status: str
    created_at: datetime
    updated_at: datetime
