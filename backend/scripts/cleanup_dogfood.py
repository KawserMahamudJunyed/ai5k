"""Remove dogfood rows (scripts/dogfood.py) from the dev database.

Dogfood rows are identified by prefix: users `df-%@example.com`, organizations
slug `df-%`. Deleting the users cascades their profiles, skill claims, services,
organization_members and user_roles. audit_logs rows are deleted explicitly
*before* the users, because their actor_id FK is SET NULL and would otherwise
linger orphaned. Orphaned taxonomy rows in `skills` (created by create-or-get
during dogfood claims) are swept last.

Usage:
  .venv/bin/python scripts/cleanup_dogfood.py            # dry run (default): counts only
  .venv/bin/python scripts/cleanup_dogfood.py --apply    # delete in one transaction

Adjust the prefixes below if you ever use `df-` emails/slugs for real data.
"""

import argparse
import asyncio
import sys
from pathlib import Path

# Allow running as a plain script (python scripts/cleanup_dogfood.py) by putting
# the backend root on sys.path so `app` is importable.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

from app.core.config import get_settings

USER_FILTER = "email LIKE 'df-%@example.com'"
ORG_FILTER = "slug LIKE 'df-%'"

COUNTS = [
    ("users", f"SELECT count(*) FROM users WHERE {USER_FILTER}"),
    ("organizations", f"SELECT count(*) FROM organizations WHERE {ORG_FILTER}"),
    (
        "audit_logs",
        f"SELECT count(*) FROM audit_logs WHERE actor_id IN (SELECT id FROM users WHERE {USER_FILTER})",
    ),
    (
        "orphaned skills",
        "SELECT count(*) FROM skills AS s WHERE NOT EXISTS (SELECT 1 FROM profile_skills ps WHERE ps.skill_id = s.id)",
    ),
]

DELETES = [
    # audit first: actor_id is SET NULL on user delete, so capture rows while we can still match them
    ("audit_logs", f"DELETE FROM audit_logs WHERE actor_id IN (SELECT id FROM users WHERE {USER_FILTER})"),
    ("organizations", f"DELETE FROM organizations WHERE {ORG_FILTER}"),
    # cascades: profiles -> profile_skills/services, organization_members, user_roles
    ("users", f"DELETE FROM users WHERE {USER_FILTER}"),
    (
        "orphaned skills",
        "DELETE FROM skills AS s WHERE NOT EXISTS (SELECT 1 FROM profile_skills ps WHERE ps.skill_id = s.id)",
    ),
]


async def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="actually delete (default: dry run)")
    args = parser.parse_args()

    engine = create_async_engine(get_settings().database_url)
    try:
        async with engine.connect() as conn:
            print("Dogfood rows currently in DB:")
            for label, sql in COUNTS:
                n = (await conn.execute(text(sql))).scalar_one()
                print(f"  {label:<16} {n}")

            if not args.apply:
                print("\nDry run — nothing deleted. Re-run with --apply to delete.")
                return

            async with engine.begin() as conn:
                for label, sql in DELETES:
                    result = await conn.execute(text(sql))
                    print(f"deleted {result.rowcount:>4} {label}")
            print("\nCleanup complete.")
    finally:
        await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
