"""Pydantic schemas for organization members & aggregated skills (workstream 2)."""

import uuid
from datetime import datetime

from pydantic import BaseModel, EmailStr, Field

from app.schemas.profile import ORMModelMixin


class MemberUserRead(ORMModelMixin):
    id: uuid.UUID
    email: EmailStr
    full_name: str


class MemberRead(BaseModel):
    id: uuid.UUID
    organization_id: uuid.UUID
    user: MemberUserRead
    status: str
    consent_given: bool
    joined_at: datetime | None = None


class MemberCreate(BaseModel):
    email: EmailStr


class InvitationRead(BaseModel):
    member_id: uuid.UUID
    organization_id: uuid.UUID
    organization_name: str
    # None while pending — the schema sets joined_at only on consent.
    invited_at: datetime | None = None


class AggregateSkillRow(BaseModel):
    skill_id: uuid.UUID
    name: str
    category: str | None = None
    member_count: int
    evidenced_count: int
    self_declared_count: int


class OrganizationUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = None
    website_url: str | None = Field(default=None, max_length=2048)
    logo_url: str | None = Field(default=None, max_length=2048)
