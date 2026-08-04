"""Auth endpoints — signup, email verification, login, refresh, me.

Local fallback path (no AWS): the backend issues tokens directly. When Cognito is
configured, the frontend talks to Cognito and this API's authenticated routes accept
Cognito ID tokens (see docs/auth.md); `/auth/signup` remains the local-dev path.
"""

from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.db import get_db
from app.core.deps import get_current_user
from app.core.errors import AppError
from app.core.security import TokenManager, get_token_manager
from app.models.identity import User
from app.schemas.auth import (
    LoginRequest,
    MeResponse,
    RefreshRequest,
    RefreshResponse,
    RoleAssignmentRead,
    SignupRequest,
    SignupResponse,
    TokenResponse,
    UserRead,
    VerifyEmailRequest,
)
from app.services import auth as auth_service

router = APIRouter(prefix="/auth", tags=["auth"])


def _ip(request: Request) -> str | None:
    return request.client.host if request.client else None


@router.post("/signup", response_model=SignupResponse, status_code=201)
async def signup(
    body: SignupRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    token_manager: TokenManager = Depends(get_token_manager),
) -> SignupResponse:
    user, verification_token = await auth_service.signup(
        db,
        email=body.email,
        password=body.password,
        full_name=body.full_name,
        token_manager=token_manager,
        ip_address=_ip(request),
    )
    return SignupResponse(
        id=user.id,
        email=user.email,
        full_name=user.full_name,
        status=user.status,
        # Dev-only convenience; never expose the token outside local.
        verification_token=verification_token if get_settings().is_local else None,
    )


@router.post("/verify-email", response_model=UserRead)
async def verify_email(
    body: VerifyEmailRequest,
    db: AsyncSession = Depends(get_db),
    token_manager: TokenManager = Depends(get_token_manager),
) -> User:
    return await auth_service.verify_email(db, body.token, token_manager)


@router.post("/login", response_model=TokenResponse)
async def login(
    body: LoginRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    token_manager: TokenManager = Depends(get_token_manager),
) -> TokenResponse:
    access, refresh, expires_in = await auth_service.login(
        db,
        email=body.email,
        password=body.password,
        token_manager=token_manager,
        ip_address=_ip(request),
    )
    return TokenResponse(access_token=access, refresh_token=refresh, expires_in=expires_in)


@router.post("/refresh", response_model=RefreshResponse)
async def refresh(
    body: RefreshRequest,
    db: AsyncSession = Depends(get_db),
    token_manager: TokenManager = Depends(get_token_manager),
) -> RefreshResponse:
    access, expires_in = await auth_service.refresh_access_token(db, body.refresh_token, token_manager)
    return RefreshResponse(access_token=access, expires_in=expires_in)


@router.get("/me", response_model=MeResponse)
async def me(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> MeResponse:
    roles = await auth_service.get_user_roles(db, user.id)
    return MeResponse(
        user=UserRead.model_validate(user),
        roles=[RoleAssignmentRead(name=name, organization_id=org_id) for name, org_id in roles],
    )
