"""Auth & onboarding business logic (docs/auth.md).

Covers the local fallback path (signup / email verification / login / refresh) plus
the Cognito sync-on-first-authenticated-call path. The backend never stores raw
passwords for Cognito-managed accounts; `users.password_hash` is only populated by
the local fallback flow.
"""

import uuid
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import AppError
from app.core.security import (
    TYPE_EMAIL_VERIFICATION,
    TYPE_REFRESH,
    TokenManager,
    hash_password,
    verify_password,
)
from app.models.identity import Role, User, UserRole
from app.services.audit import write_audit_log
from app.services.rbac import ensure_role, grant_role

ROLE_PROFESSIONAL = "professional"

# Pre-computed dummy hash used to equalize bcrypt timing for unknown emails on login.
_DUMMY_PASSWORD_HASH = hash_password("ai5k-timing-equalizer-not-a-real-password")


async def get_user_by_email(db: AsyncSession, email: str) -> User | None:
    result = await db.execute(select(User).where(User.email == email.lower()))
    return result.scalar_one_or_none()


async def get_user_by_id(db: AsyncSession, user_id: uuid.UUID) -> User | None:
    result = await db.execute(select(User).where(User.id == user_id))
    return result.scalar_one_or_none()


async def get_user_by_cognito_sub(db: AsyncSession, cognito_sub: str) -> User | None:
    result = await db.execute(select(User).where(User.cognito_sub == cognito_sub))
    return result.scalar_one_or_none()


def _normalize_email(email: str) -> str:
    return email.strip().lower()


async def signup(
    db: AsyncSession,
    *,
    email: str,
    password: str,
    full_name: str,
    token_manager: TokenManager,
    ip_address: str | None = None,
) -> tuple[User, str]:
    """Create a pending user in the local fallback path and return (user, verification_token)."""
    normalized = _normalize_email(email)
    if await get_user_by_email(db, normalized):
        raise AppError(409, "email_already_registered", "An account with that email already exists.")
    if len(password) < 8:
        raise AppError(422, "weak_password", "Password must be at least 8 characters.")

    user = User(
        email=normalized,
        password_hash=hash_password(password),
        full_name=full_name.strip(),
        status="pending",
    )
    db.add(user)
    await db.flush()

    # Entity-created audit first so audit_logs reads chronologically (grant_role
    # commits internally, flushing whatever is pending at that point).
    await write_audit_log(
        db,
        actor_id=user.id,
        action="user.created",
        entity_type="user",
        entity_id=user.id,
        metadata={"email": normalized, "auth_provider": "local"},
        ip_address=ip_address,
    )
    # Signup always grants `professional` (docs/auth.md "Role-based access").
    await ensure_role(db, ROLE_PROFESSIONAL)
    await grant_role(db, actor_id=user.id, target_user_id=user.id, role_name=ROLE_PROFESSIONAL)

    await db.commit()
    await db.refresh(user)

    verification_token = token_manager.create_email_verification_token(user.id)
    return user, verification_token


async def verify_email(db: AsyncSession, token: str, token_manager: TokenManager) -> User:
    """Validate the email-verification token and activate the account."""
    claims = await _decode_required_type(token, TYPE_EMAIL_VERIFICATION, token_manager)
    try:
        user = await get_user_by_id(db, uuid.UUID(claims["sub"]))
    except (KeyError, ValueError):
        raise AppError(401, "invalid_token", "Invalid or expired token.") from None
    if user is None:
        raise AppError(404, "user_not_found", "No account matches that verification token.")

    if user.status != "active":
        user.status = "active"
        await write_audit_log(
            db,
            actor_id=user.id,
            action="user.email_verified",
            entity_type="user",
            entity_id=user.id,
        )
        await db.commit()
        await db.refresh(user)
    return user


async def login(
    db: AsyncSession,
    *,
    email: str,
    password: str,
    token_manager: TokenManager,
    ip_address: str | None = None,
) -> tuple[str, str, int]:
    """Local credential login; returns (access_token, refresh_token, expires_in)."""
    user = await get_user_by_email(db, _normalize_email(email))
    if user is None:
        # Close the timing gap between "no such account" and "wrong password" by
        # still running a bcrypt compare against a dummy hash.
        verify_password(password, _DUMMY_PASSWORD_HASH)
        raise AppError(401, "invalid_credentials", "Incorrect email or password.")
    if not verify_password(password, user.password_hash):
        raise AppError(401, "invalid_credentials", "Incorrect email or password.")

    if user.status == "pending":
        raise AppError(403, "email_not_verified", "Please verify your email before logging in.")
    if user.status == "suspended":
        raise AppError(403, "account_suspended", "This account has been suspended.")

    await write_audit_log(
        db,
        actor_id=user.id,
        action="auth.login",
        entity_type="user",
        entity_id=user.id,
        metadata={"method": "local"},
        ip_address=ip_address,
    )
    await db.commit()

    access_token = token_manager.create_access_token(user.id)
    refresh_token = token_manager.create_refresh_token(user.id)
    return access_token, refresh_token, token_manager.settings.access_token_ttl_seconds


async def refresh_access_token(
    db: AsyncSession, refresh_token: str, token_manager: TokenManager
) -> tuple[str, int]:
    """Exchange a valid refresh token for a fresh access token."""
    claims = await _decode_required_type(refresh_token, TYPE_REFRESH, token_manager)
    try:
        user = await get_user_by_id(db, uuid.UUID(claims["sub"]))
    except (KeyError, ValueError):
        raise AppError(401, "invalid_token", "Invalid or expired refresh token.") from None
    if user is None or user.status != "active":
        raise AppError(401, "invalid_token", "Invalid or expired refresh token.")
    return token_manager.create_access_token(user.id), token_manager.settings.access_token_ttl_seconds


async def sync_cognito_user(
    db: AsyncSession,
    claims: dict[str, Any],
    token_manager: TokenManager,
    ip_address: str | None = None,
) -> User:
    """Backend sync on first authenticated call (docs/auth.md flow step 4).

    Creates a `users` row from Cognito token claims and assigns the default
    `professional` role. `sub` in a Cognito ID token is the `cognito_sub`.
    """
    cognito_sub = claims["sub"]
    user = await get_user_by_cognito_sub(db, cognito_sub)
    if user is not None:
        return user

    email = (claims.get("email") or "").strip().lower()
    if not email:
        raise AppError(401, "token_missing_email", "Cognito token has no email claim.")
    # Unlikely during onboarding: a local account may already exist for the email.
    existing = await get_user_by_email(db, email)
    if existing is not None:
        raise AppError(409, "email_already_registered", "An account with that email already exists.")

    full_name = claims.get("name") or " ".join(
        filter(None, (claims.get("given_name"), claims.get("family_name")))
    ) or email.split("@")[0]

    user = User(
        email=email,
        cognito_sub=cognito_sub,
        full_name=full_name.strip(),
        avatar_url=claims.get("picture"),
        status="active",  # Cognito already confirmed the email on its side.
    )
    db.add(user)
    await db.flush()

    await write_audit_log(
        db,
        actor_id=user.id,
        action="user.created",
        entity_type="user",
        entity_id=user.id,
        metadata={"email": email, "auth_provider": "cognito", "cognito_sub": cognito_sub},
        ip_address=ip_address,
    )
    # Default `professional` role on first sync (docs/auth.md "Role-based access").
    await ensure_role(db, ROLE_PROFESSIONAL)
    await grant_role(db, actor_id=user.id, target_user_id=user.id, role_name=ROLE_PROFESSIONAL)

    await db.commit()
    await db.refresh(user)
    return user


async def _decode_required_type(
    token: str, token_type: str, token_manager: TokenManager
) -> dict[str, Any]:
    """Verify the token and confirm it carries the expected `type` claim."""
    claims = await token_manager.verify(token)
    if claims.get("type") != token_type:
        raise AppError(401, "invalid_token", "Invalid or expired token.")
    return claims


async def get_user_roles(db: AsyncSession, user_id: uuid.UUID) -> list[tuple[str, uuid.UUID | None]]:
    result = await db.execute(
        select(Role.name, UserRole.organization_id)
        .join(UserRole, UserRole.role_id == Role.id)
        .where(UserRole.user_id == user_id)
    )
    return [(name, org_id) for name, org_id in result.all()]
