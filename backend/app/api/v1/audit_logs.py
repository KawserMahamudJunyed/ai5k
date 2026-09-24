"""Audit log listing — platform_admin only (permission `audit:read`).

Capped, newest-first listing. Full cursor pagination is a later-task concern
(opportunities/audit_logs grow unbounded); keep it simple for the pilot.
"""

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.core.deps import require_permission
from app.models.audit import AuditLog
from app.models.identity import User
from app.schemas.auth import AuditLogRead

router = APIRouter(prefix="/audit-logs", tags=["audit-logs"])


@router.get("", response_model=list[AuditLogRead])
async def list_audit_logs(
    limit: int = Query(default=50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(require_permission("audit:read")),
) -> list[AuditLog]:
    result = await db.execute(select(AuditLog).order_by(AuditLog.created_at.desc()).limit(limit))
    return list(result.scalars().all())
