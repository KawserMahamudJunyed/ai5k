"""Pydantic request/response schemas for the profile-check domain (UF-7)."""

import uuid
from datetime import datetime
from typing import Any  # noqa: F401  (kept for result/claims payloads)

from pydantic import BaseModel, ConfigDict, Field, HttpUrl
from typing import Literal

# ---------------------------------------------------------------------------
# Requests
# ---------------------------------------------------------------------------


class ProfileCheckCreate(BaseModel):
    """All sources optional; at least one required (enforced in the service).

    `cv_token` comes from POST /profile-checks/cv and links a stored CV
    into this check (single-use, 15-minute TTL).
    """

    github_url: HttpUrl | None = None
    upwork_url: HttpUrl | None = None
    fiverr_url: HttpUrl | None = None
    cv_token: str | None = None
    # Re-run convenience: reuse the latest check's stored CV (if still on disk)
    # when no cv_token is provided. Only meaningful for the re-run path.
    reuse_cv: bool = False


# ---------------------------------------------------------------------------
# Responses
# ---------------------------------------------------------------------------


class CvUploadResponse(BaseModel):
    cv_token: str
    filename: str
    content_type: str
    size_bytes: int


class AttachCvEvidenceRequest(BaseModel):
    """Attach a stored CV as file evidence (works without S3 via local storage)."""

    cv_token: str
    source_type: Literal["certificate", "document"] = "certificate"
    title: str | None = Field(default=None, max_length=255)
    description: str | None = None


class CheckSourceRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    source: str
    status: str
    error_code: str | None = None
    error_message: str | None = None
    from_cache: bool
    duration_ms: int | None = None
    fetched_at: datetime
    # Only the CV source carries a bounded raw payload (text trimmed to 8 KB at
    # write time); GitHub/websearch payloads stay DB-only.
    raw: dict[str, Any] | None = None


class CheckResultRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    readiness: int
    capped: bool
    partial: bool
    result: dict[str, Any]
    claims: list[Any]
    skill_audit: dict[str, Any] | None = None
    sources_used: list[Any]
    generation_skipped: bool
    duration_ms: int | None = None
    created_at: datetime


class ProfileCheckRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    status: str
    github_url: str | None = None
    upwork_url: str | None = None
    fiverr_url: str | None = None
    attempts: int
    error_code: str | None = None
    error_message: str | None = None
    created_at: datetime
    updated_at: datetime
    sources: list[CheckSourceRead] = Field(default_factory=list)
    result: CheckResultRead | None = None


class ProfileCheckCreated(BaseModel):
    """202 body — the check runs in the background; poll the status URL."""

    id: uuid.UUID
    status: str
    poll_url: str
