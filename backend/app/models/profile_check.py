"""Profile-check domain: a freelancer submits four sources, we fetch them, an
external evaluator scores them, and the verdict is stored.

Deliberately namespaced `profile_check_*` rather than reusing the `profiles` /
`profile_scores` names in docs/data-dictionary.md. Those belong to the planned
marketplace profile domain (Task 2.x) and are not built yet; a readiness check
is a point-in-time snapshot of four EXTERNAL profiles, not the platform's own
profile record. Colliding the two now would force an awkward migration the day
that domain lands.

Three tables, matching the three stages of one check:

    profile_checks          the submission + its inputs + overall status
    profile_check_sources   one row per source: raw payload OR the failure
    profile_check_results   what the evaluator returned

`profile_check_sources` is what makes partial results honest. A check where
Fiverr's API ran out of quota stores the three payloads that worked, the one
error that didn't, and a result marked `partial` -- rather than discarding a CV
parse that already cost minutes of compute because one unrelated call failed.
"""

import uuid
from datetime import datetime
from typing import Any, Optional

from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, JSONBType, TimestampMixin, UUIDMixin

# --- Status vocabularies -----------------------------------------------------
# Plain strings rather than a PG ENUM: the existing tables (users.status,
# organizations.status) already use varchar + server_default, and adding values
# to a PG enum needs a migration where adding one here does not.

CHECK_PENDING = "pending"
CHECK_FETCHING = "fetching"
CHECK_EVALUATING = "evaluating"
CHECK_COMPLETED = "completed"
CHECK_FAILED = "failed"

SOURCE_CV = "cv"
SOURCE_GITHUB = "github"
SOURCE_UPWORK = "upwork"
SOURCE_FIVERR = "fiverr"
ALL_SOURCES = (SOURCE_CV, SOURCE_GITHUB, SOURCE_UPWORK, SOURCE_FIVERR)

# ok = payload stored. failed = we tried and it errored. skipped = not supplied.
# The three are kept distinct because they mean different things to a reader of
# the result: "your Fiverr profile couldn't be read" is not "you didn't give us
# a Fiverr profile", and neither is "your Fiverr profile is empty".
SOURCE_OK = "ok"
SOURCE_FAILED = "failed"
SOURCE_SKIPPED = "skipped"


class ProfileCheck(UUIDMixin, TimestampMixin, Base):
    """One readiness check: the four submitted inputs and where the run got to."""

    __tablename__ = "profile_checks"

    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    status: Mapped[str] = mapped_column(String(32), nullable=False, server_default=CHECK_PENDING)

    # What the caller submitted, verbatim -- kept alongside the parsed
    # identifiers below so a malformed URL can be shown back to the user as
    # they typed it, and so a later parser fix can be re-run over old rows.
    github_url: Mapped[Optional[str]] = mapped_column(String(2048), nullable=True)
    upwork_url: Mapped[Optional[str]] = mapped_column(String(2048), nullable=True)
    fiverr_url: Mapped[Optional[str]] = mapped_column(String(2048), nullable=True)

    # Canonical identifiers extracted from those URLs. Stored because they are
    # the real cache and quota keys: three spellings of one Upwork profile must
    # not each spend a call from a ~50-a-month budget.
    github_username: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    upwork_profile_id: Mapped[Optional[str]] = mapped_column(String(64), nullable=True, index=True)
    fiverr_username: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)

    cv_filename: Mapped[Optional[str]] = mapped_column(String(512), nullable=True)
    cv_content_type: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    cv_size_bytes: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    # Where the original file lives. The evaluator's claim spans point back at
    # this path, so the file is retained after parsing, not deleted -- grounding
    # means the source stays re-readable, not just readable once.
    cv_storage_path: Mapped[Optional[str]] = mapped_column(String(1024), nullable=True)

    # Feeds the scorer's pricing_strategy dimension. Numeric, not float: a rate
    # is money, and this column is read back for display.
    stated_rate: Mapped[Optional[float]] = mapped_column(Numeric(10, 2), nullable=True)

    # Set only when status == failed, i.e. the whole check could not produce a
    # result. A single source failing is recorded on its own row instead.
    error_code: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    error_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # How many times a run has been STARTED for this check. Incremented at the
    # top of run_check, before any work, so a run that dies without ever
    # finishing still counts. This is what stops startup recovery from
    # resurrecting a check that crashes the process every time it runs: after
    # MAX_ATTEMPTS the check is failed permanently instead of re-queued.
    attempts: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")

    sources: Mapped[list["ProfileCheckSource"]] = relationship(
        back_populates="check", cascade="all, delete-orphan", lazy="selectin"
    )
    result: Mapped[Optional["ProfileCheckResult"]] = relationship(
        back_populates="check", cascade="all, delete-orphan", lazy="selectin", uselist=False
    )


class ProfileCheckSource(UUIDMixin, Base):
    """One source of one check: the raw payload we fetched, or why we couldn't."""

    __tablename__ = "profile_check_sources"
    # One row per source per check. The fetch stage upserts on this, so a retry
    # overwrites the previous attempt instead of stacking duplicates.
    __table_args__ = (UniqueConstraint("check_id", "source", name="uq_check_source"),)

    check_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("profile_checks.id", ondelete="CASCADE"), nullable=False, index=True
    )
    source: Mapped[str] = mapped_column(String(16), nullable=False)
    status: Mapped[str] = mapped_column(String(16), nullable=False)

    # Exactly what the upstream returned, untransformed, keyed per source:
    #   cv      {"blocks": [{"index","start","end","text"}, ...]}
    #   github  {"repos": [...], "package_deps": {"repo": ["next", ...]}}
    #   upwork  the RapidAPI `response` object
    #   fiverr  the RapidAPI `data` object
    # Untransformed on purpose: these are the exact shapes the evaluator's
    # existing UpworkProfile.from_response / FiverrProfile.from_response
    # constructors already take, so no evaluation code had to change to read
    # them, and a field nobody parses today can be read tomorrow without
    # re-fetching at quota cost.
    raw: Mapped[Optional[dict[str, Any]]] = mapped_column(JSONBType, nullable=True)

    from_cache: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")
    # Read off the RapidAPI response headers. Persisted so the remaining budget
    # can be checked without spending a call to find out what it is.
    quota_remaining: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)

    # Set when status == failed. The code is machine-readable so a frontend can
    # say "quota, try tomorrow" differently from "that username doesn't exist";
    # see integrations/errors.py for the vocabulary.
    error_code: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    error_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    duration_ms: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    fetched_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    check: Mapped[ProfileCheck] = relationship(back_populates="sources")


class ProfileCheckResult(UUIDMixin, Base):
    """The evaluator's verdict for one check.

    `result`, `claims` and `skill_audit` are JSONB rather than normalized
    tables. They are the evaluator's own pydantic models (Result, Claim,
    SkillStatus) serialized whole, and those models are the contract this
    service was told to leave alone. Re-modelling them in SQL would mean
    maintaining a second, silently-drifting copy of a schema owned by another
    repo. `readiness` and `capped` are lifted out as real columns because
    listing a user's history should not have to parse JSON to sort or filter.
    """

    __tablename__ = "profile_check_results"

    check_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("profile_checks.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
        index=True,
    )

    readiness: Mapped[int] = mapped_column(Integer, nullable=False)
    # True when the evidence cap fired: the score is held at 30 because nothing
    # in the profile carries corroborated skill evidence. Surfaced as a column
    # because "why is my score 30" is the first question a user asks.
    capped: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")

    result: Mapped[dict[str, Any]] = mapped_column(JSONBType, nullable=False)
    claims: Mapped[list[Any]] = mapped_column(JSONBType, nullable=False)
    skill_audit: Mapped[Optional[dict[str, Any]]] = mapped_column(JSONBType, nullable=True)

    # True when at least one supplied source failed or was skipped. Paired with
    # sources_used so a reader can tell a low score from a thin one -- without
    # this, a Fiverr timeout and a genuinely empty profile look identical.
    partial: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")
    sources_used: Mapped[list[Any]] = mapped_column(JSONBType, nullable=False)
    # The evaluator skipped title/overview generation (a transient model
    # failure). Additive, not load-bearing: scoring still ran, but positioning
    # and conversion scored 0, which would otherwise look like a real gap.
    generation_skipped: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")

    duration_ms: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    check: Mapped[ProfileCheck] = relationship(back_populates="result")
