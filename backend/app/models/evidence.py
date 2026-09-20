"""Evidence models — uploads, source-type tagging, skill-claim links.

Mirrors docs/data-dictionary.md Domain 2 (`evidence`, `evidence_skill_links`).
`file_url` holds `s3://{bucket}/{key}` for file-type evidence and a plain
https?:// URL for `source_type = link` (specs/2026-09-20-evidence-uploads-design.md).
`verification_status` is server-managed: rows start `pending`; only the
verification queue (Tasks 2.4/2.5) moves them to `verified`/`rejected`.
"""

import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, ForeignKey, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, UUIDMixin

SOURCE_DOCUMENT = "document"
SOURCE_SCREENSHOT = "screenshot"
SOURCE_CERTIFICATE = "certificate"
SOURCE_LINK = "link"
SOURCE_TESTIMONIAL = "testimonial"

SOURCE_TYPES = (SOURCE_DOCUMENT, SOURCE_SCREENSHOT, SOURCE_CERTIFICATE, SOURCE_LINK, SOURCE_TESTIMONIAL)
FILE_SOURCE_TYPES = (SOURCE_DOCUMENT, SOURCE_SCREENSHOT, SOURCE_CERTIFICATE)

STATUS_PENDING = "pending"
STATUS_VERIFIED = "verified"
STATUS_REJECTED = "rejected"

# Content types accepted for file uploads; drives the S3 key extension.
ALLOWED_CONTENT_TYPES: dict[str, str] = {
    "application/pdf": ".pdf",
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/webp": ".webp",
}


class Evidence(UUIDMixin, Base):
    __tablename__ = "evidence"

    profile_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("profiles.id", ondelete="CASCADE"), nullable=False, index=True
    )
    uploader_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    source_type: Mapped[str] = mapped_column(String(32), nullable=False)
    file_url: Mapped[Optional[str]] = mapped_column(String(2048), nullable=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    verification_status: Mapped[str] = mapped_column(
        String(32), nullable=False, server_default=STATUS_PENDING
    )
    uploaded_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    skill_links: Mapped[list["EvidenceSkillLink"]] = relationship(back_populates="evidence")


class EvidenceSkillLink(UUIDMixin, Base):
    """Join table: which evidence backs which skill claim (docs/data-dictionary.md)."""

    __tablename__ = "evidence_skill_links"
    __table_args__ = (UniqueConstraint("evidence_id", "profile_skill_id", name="uq_evidence_skill_link"),)

    evidence_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("evidence.id", ondelete="CASCADE"), nullable=False, index=True
    )
    profile_skill_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("profile_skills.id", ondelete="CASCADE"), nullable=False, index=True
    )

    evidence: Mapped[Evidence] = relationship(back_populates="skill_links")
