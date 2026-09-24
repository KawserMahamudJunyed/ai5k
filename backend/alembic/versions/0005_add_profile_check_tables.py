"""add profile_check tables

Revision ID: 0005
Revises: 0004
Create Date: 2026-09-22

Three tables mirroring backend/app/models/profile_check.py: the submission,
its per-source fetch records, and the evaluator's verdict. The evaluator that
produces `profile_check_results` runs locally in-process (services/profile_check.py);
the external ai-backend evaluator can adopt the same tables later.
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "profile_checks",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("status", sa.String(length=32), server_default="pending", nullable=False),
        sa.Column("github_url", sa.String(length=2048), nullable=True),
        sa.Column("upwork_url", sa.String(length=2048), nullable=True),
        sa.Column("fiverr_url", sa.String(length=2048), nullable=True),
        sa.Column("github_username", sa.String(length=255), nullable=True),
        sa.Column("upwork_profile_id", sa.String(length=64), nullable=True),
        sa.Column("fiverr_username", sa.String(length=255), nullable=True),
        sa.Column("cv_filename", sa.String(length=512), nullable=True),
        sa.Column("cv_content_type", sa.String(length=128), nullable=True),
        sa.Column("cv_size_bytes", sa.Integer(), nullable=True),
        sa.Column("cv_storage_path", sa.String(length=1024), nullable=True),
        sa.Column("stated_rate", sa.Numeric(10, 2), nullable=True),
        sa.Column("error_code", sa.String(length=64), nullable=True),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("attempts", sa.Integer(), server_default="0", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_profile_checks_user", "profile_checks", ["user_id"])

    op.create_table(
        "profile_check_sources",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "check_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("profile_checks.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("source", sa.String(length=16), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False),
        sa.Column("raw", postgresql.JSONB(), nullable=True),
        sa.Column("from_cache", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("quota_remaining", sa.String(length=32), nullable=True),
        sa.Column("error_code", sa.String(length=64), nullable=True),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("duration_ms", sa.Integer(), nullable=True),
        sa.Column("fetched_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.UniqueConstraint("check_id", "source", name="uq_check_source"),
    )
    op.create_index("ix_profile_check_sources_check", "profile_check_sources", ["check_id"])

    op.create_table(
        "profile_check_results",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "check_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("profile_checks.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("readiness", sa.Integer(), nullable=False),
        sa.Column("capped", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("result", postgresql.JSONB(), nullable=False),
        sa.Column("claims", postgresql.JSONB(), nullable=False),
        sa.Column("skill_audit", postgresql.JSONB(), nullable=True),
        sa.Column("partial", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("sources_used", postgresql.JSONB(), nullable=False),
        sa.Column("generation_skipped", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("duration_ms", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index(
        "ix_profile_check_results_check", "profile_check_results", ["check_id"], unique=True
    )


def downgrade() -> None:
    op.drop_table("profile_check_results")
    op.drop_table("profile_check_sources")
    op.drop_table("profile_checks")
