"""add evidence tables

Revision ID: 0003
Revises: 0002
Create Date: 2026-09-20
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "evidence",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "profile_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("profiles.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "uploader_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("source_type", sa.String(length=32), nullable=False),
        sa.Column("file_url", sa.String(length=2048), nullable=True),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("verification_status", sa.String(length=32), server_default="pending", nullable=False),
        sa.Column("uploaded_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_evidence_profile_id", "evidence", ["profile_id"])

    op.create_table(
        "evidence_skill_links",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "evidence_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("evidence.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "profile_skill_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("profile_skills.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.UniqueConstraint("evidence_id", "profile_skill_id", name="uq_evidence_skill_link"),
    )
    op.create_index("ix_evidence_skill_links_evidence_id", "evidence_skill_links", ["evidence_id"])
    op.create_index("ix_evidence_skill_links_profile_skill_id", "evidence_skill_links", ["profile_skill_id"])


def downgrade() -> None:
    op.drop_table("evidence_skill_links")
    op.drop_table("evidence")
