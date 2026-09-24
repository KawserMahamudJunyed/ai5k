"""Verification queue endpoints (Tasks 2.4/2.5).

- POST /verification-requests — target's owner files a request.
- GET /verification-requests — the queue (`verification:review`).
- POST /verification-requests/{id}/approve|reject — decide (`verification:approve`).

See specs/2026-09-20-verification-queue-design.md.
"""

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.core.deps import get_current_user, require_permission
from app.models.identity import User
from app.schemas.verification import (
    DecideRequest,
    VerificationQueueResponse,
    VerificationRequestCreate,
    VerificationRequestRead,
)
from app.services import verification as verification_service

router = APIRouter(prefix="/verification-requests", tags=["verification"])


def _ip(request: Request) -> str | None:
    return request.client.host if request.client else None


@router.post("", response_model=VerificationRequestRead, status_code=201)
async def create_request(
    body: VerificationRequestCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> VerificationRequestRead:
    vr = await verification_service.create_request(
        db,
        actor=user,
        target_type=body.target_type,
        target_id=body.target_id,
        ip_address=_ip(request),
    )
    return VerificationRequestRead.model_validate(vr)


@router.get("", response_model=VerificationQueueResponse)
async def list_requests(
    _reviewer: Annotated[User, Depends(require_permission("verification:review"))],
    db: AsyncSession = Depends(get_db),
    status: str | None = Query(default="pending"),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=100),
) -> VerificationQueueResponse:
    rows, total = await verification_service.list_requests(
        db, status=status, page=page, page_size=page_size
    )
    return VerificationQueueResponse(
        data=[VerificationRequestRead.model_validate(r) for r in rows],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.post("/{request_id}/approve", response_model=VerificationRequestRead)
async def approve_request(
    request_id: uuid.UUID,
    reviewer: Annotated[User, Depends(require_permission("verification:approve"))],
    body: DecideRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> VerificationRequestRead:
    vr = await verification_service.get_request(db, request_id)
    if vr is None:
        from app.core.errors import AppError

        raise AppError(404, "verification_request_not_found", "No verification request with that id.")
    vr = await verification_service.decide(
        db, reviewer=reviewer, request=vr, approved=True, note=body.note, ip_address=_ip(request)
    )
    return VerificationRequestRead.model_validate(vr)


@router.post("/{request_id}/reject", response_model=VerificationRequestRead)
async def reject_request(
    request_id: uuid.UUID,
    reviewer: Annotated[User, Depends(require_permission("verification:approve"))],
    body: DecideRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> VerificationRequestRead:
    vr = await verification_service.get_request(db, request_id)
    if vr is None:
        from app.core.errors import AppError

        raise AppError(404, "verification_request_not_found", "No verification request with that id.")
    vr = await verification_service.decide(
        db, reviewer=reviewer, request=vr, approved=False, note=body.note, ip_address=_ip(request)
    )
    return VerificationRequestRead.model_validate(vr)
