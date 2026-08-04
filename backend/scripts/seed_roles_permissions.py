"""Seed default roles + permissions (idempotent).

Run from backend/:  python -m scripts.seed_roles_permissions
or:                 python scripts/seed_roles_permissions.py
"""

import asyncio

from app.core.config import get_settings
from app.core.db import engine, SessionLocal
from app.services import rbac as rbac_service


async def main() -> None:
    settings = get_settings()
    print(f"Seeding RBAC into {settings.database_url}")
    async with SessionLocal() as db:
        await rbac_service.seed_default_rbac(db)
        print("Done: professional, org_admin, platform_admin roles + permission mappings.")
    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
