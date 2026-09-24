"""Pydantic request/response schemas for the auth & onboarding domain."""

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field

# ---------------------------------------------------------------------------
# Common
# ---------------------------------------------------------------------------


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------


class SignupRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    full_name: str = Field(min_length=1, max_length=255)


class SignupResponse(BaseModel):
    id: uuid.UUID
    email: EmailStr
    full_name: str
    status: str
    # Local dev only: returned so the email-verification flow can be exercised
    # without an SMTP/Cognito provider. Never returned when ENV != local.
    verification_token: str | None = None


class VerifyEmailRequest(BaseModel):
    token: str


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str = Field(min_length=8, max_length=128)


class ChangeEmailRequest(BaseModel):
    new_email: EmailStr
    current_password: str


class ChangeEmailResponse(BaseModel):
    id: uuid.UUID
    email: EmailStr
    status: str


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int


class RefreshRequest(BaseModel):
    refresh_token: str


class RefreshResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int


# ---------------------------------------------------------------------------
# User / roles
# ---------------------------------------------------------------------------


class UserRead(ORMModel):
    id: uuid.UUID
    email: EmailStr
    full_name: str
    avatar_url: str | None = None
    status: str
    created_at: datetime


class RoleAssignmentRead(BaseModel):
    name: str
    organization_id: uuid.UUID | None = None


class MeResponse(BaseModel):
    user: UserRead
    roles: list[RoleAssignmentRead]


class RoleRead(BaseModel):
    name: str
    permissions: list[str] = Field(default_factory=list)


class GrantRoleRequest(BaseModel):
    role_name: str
    organization_id: uuid.UUID | None = None


class RevokeRoleRequest(BaseModel):
    role_name: str
    organization_id: uuid.UUID | None = None


class GrantRoleResponse(BaseModel):
    user_id: uuid.UUID
    role: str
    organization_id: uuid.UUID | None = None


# ---------------------------------------------------------------------------
# Organizations (onboarding)
# ---------------------------------------------------------------------------


class OrganizationCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    slug: str | None = Field(default=None, max_length=128)
    description: str | None = None
    website_url: str | None = None


class OrganizationRead(ORMModel):
    id: uuid.UUID
    name: str
    slug: str
    description: str | None = None
    website_url: str | None = None
    status: str
    created_at: datetime


class AuditLogRead(ORMModel):
    id: uuid.UUID
    actor_id: uuid.UUID | None = None
    action: str
    entity_type: str
    entity_id: uuid.UUID | None = None
    # ORM attribute is `metadata_` (reserved name); JSON key stays "metadata".
    metadata: dict | None = Field(default=None, validation_alias="metadata_")
    ip_address: str | None = None
    created_at: datetime
