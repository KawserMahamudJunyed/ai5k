"""Verification request model — admin queue for identity docs & skill claims.

Mirrors docs/data-dictionary.md `verification_requests`. `target_type` +
`target_id` is an intentional soft/polymorphic reference (not FK-enforced),
validated at the application layer (erd.md). `status` is decided exactly once:
`pending` → `approved` | `rejected`; the decision also lands on the target row
(specs/2026-09-20-verification-queue-design.md).
"""

import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, ForeignKey, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, UUIDMixin

TARGET_PROFILE_SKILL = "profile_skill"
TARGET_IDENTITY_DOC = "identity_doc"
TARGET_TYPES = (TARGET_PROFILE_SKILL, TARGET_IDENTITY_DOC)  # `organization` reserved

STATUS_PENDING = "pending"
STATUS_APPROVED = "approved"
STATUS_REJECTED = "rejected"


class VerificationRequest(UUIDMixin, Base):
    __tablename__ = "verification_requests"

    requestor_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    target_type: Mapped[str] = mapped_column(String(32), nullable=False)
    target_id: Mapped[uuid.UUID] = mapped_column(nullable=False)
    status: Mapped[str] = mapped_column(String(32), nullable=False, server_default=STATUS_PENDING)
    reviewed_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    reviewed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
