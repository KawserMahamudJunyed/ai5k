"""Pydantic schemas for the verification queue."""

import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

from app.schemas.profile import ORMModelMixin


class VerificationRequestCreate(BaseModel):
    target_type: Literal["profile_skill", "identity_doc"]
    target_id: uuid.UUID


class VerificationRequestRead(ORMModelMixin):
    id: uuid.UUID
    requestor_id: uuid.UUID
    target_type: str
    target_id: uuid.UUID
    status: str
    reviewed_by: uuid.UUID | None = None
    reviewed_at: datetime | None = None
    created_at: datetime


class VerificationQueueResponse(BaseModel):
    data: list[VerificationRequestRead]
    total: int
    page: int
    page_size: int


class DecideRequest(BaseModel):
    note: str | None = Field(default=None, max_length=1000)
