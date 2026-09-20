"""Pydantic schemas for the evidence domain."""

import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

from app.models.evidence import SOURCE_TYPES
from app.schemas.profile import ORMModelMixin


class PresignRequest(BaseModel):
    source_type: Literal["document", "screenshot", "certificate"]
    content_type: str = Field(max_length=100)


class PresignResponse(BaseModel):
    file_key: str
    upload_url: str
    expires_in: int


class EvidenceCreate(BaseModel):
    source_type: Literal["document", "screenshot", "certificate", "link", "testimonial"]
    title: str = Field(min_length=1, max_length=255)
    description: str | None = None
    # Link/testimonial evidence.
    url: str | None = Field(default=None, max_length=2048)
    # File-type evidence: key returned by /presign.
    file_key: str | None = Field(default=None, max_length=512)


class SkillLinkCreate(BaseModel):
    profile_skill_id: uuid.UUID


class SkillLinkRead(ORMModelMixin):
    id: uuid.UUID
    evidence_id: uuid.UUID
    profile_skill_id: uuid.UUID


def _source_type_values() -> str:
    return ", ".join(SOURCE_TYPES)


class EvidenceRead(BaseModel):
    id: uuid.UUID
    profile_id: uuid.UUID
    uploader_id: uuid.UUID
    source_type: str
    # File types: s3:// URL (storage form). Link/testimonial: the public URL.
    file_url: str | None = None
    # Short-TTL presigned download URL for file-type rows (only when storage is configured).
    download_url: str | None = None
    title: str
    description: str | None = None
    verification_status: str
    uploaded_at: datetime
    skill_links: list[SkillLinkRead] = Field(default_factory=list)
