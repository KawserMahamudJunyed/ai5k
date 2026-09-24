"""FastAPI dependencies: resolve the authenticated user, enforce permissions.

Request lifecycle per docs/backend-system-architecture.md section 3:
  route -> auth dependency (token -> users.id) -> RBAC dependency (permission) -> ...
"""

import uuid
from typing import Callable

from fastapi import Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.core.errors import AppError
from app.core.security import TYPE_ACCESS, TokenManager, get_token_manager
from app.models.identity import User
from app.services import auth as auth_service
from app.services import rbac as rbac_service


async def get_current_user(
    request: Request,
    db: AsyncSession = Depends(get_db),
    token_manager: TokenManager = Depends(get_token_manager),
) -> User:
    """Resolve the bearer token to a `users` row (docs/auth.md flow steps 4-5).

    - Cognito token (iss == pool): resolve by `cognito_sub`; sync-create the user on
      first authenticated call (default `professional` role).
    - Local token (issued by this backend): resolve by `sub` == users.id.
    """
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        raise AppError(401, "missing_token", "Missing bearer token.")
    token = auth_header[len("Bearer ") :].strip()

    try:
        claims = await token_manager.verify(token)
    except AppError:
        raise
    except Exception:  # pragma: no cover - defensive
        raise AppError(401, "invalid_token", "Invalid or expired token.") from None

    is_cognito = claims.get("iss") == token_manager.cognito_issuer

    user: User | None = None
    if is_cognito:
        user = await auth_service.get_user_by_cognito_sub(db, claims["sub"])
        if user is None:
            user = await auth_service.sync_cognito_user(
                db,
                claims,
                token_manager=token_manager,
                ip_address=request.client.host if request.client else None,
            )
    else:
        if claims.get("type") != TYPE_ACCESS:
            raise AppError(401, "invalid_token", "Invalid or expired token.")
        try:
            user = await auth_service.get_user_by_id(db, uuid.UUID(claims["sub"]))
        except (KeyError, ValueError):
            raise AppError(401, "invalid_token", "Invalid or expired token.") from None

    if user is None:
        raise AppError(401, "invalid_token", "Invalid or expired token.")
    if user.status != "active":
        raise AppError(403, "account_not_active", "Account is not active.")

    request.state.user = user
    return user


def require_permission(permission_code: str) -> Callable:
    """Dependency factory: enforce a platform-wide permission code for the current user.

    Org-scoped checks (e.g. `org_admin` acting within their org) are handled in the
    routes/services with an explicit `organization_id`, since the scope is often a
    path/body value rather than derivable from the route signature alone.
    """

    async def _dependency(
        db: AsyncSession = Depends(get_db),
        user: User = Depends(get_current_user),
    ) -> User:
        if not await rbac_service.has_permission(db, user.id, permission_code):
            raise AppError(403, "permission_denied", "You don't have permission to do that.")
        return user

    return _dependency
