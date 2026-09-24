# Migrations (Alembic)

## Naming

Auto-generated revision files get a hash id — rename the `slug` portion to be descriptive and
present-tense:

```
alembic revision --autogenerate -m "add profiles table"
alembic revision --autogenerate -m "add external_ref to opportunities"
```

Resulting filename: `<hash>_add_profiles_table.py`. Don't hand-edit the hash.

## Workflow

1. Change the SQLAlchemy models.
2. `alembic revision --autogenerate -m "<description>"`.
3. **Read the generated migration before committing it.** Autogenerate misses some things
   (renamed columns show as drop+add, some index/constraint changes aren't detected) — fix by
   hand where needed.
4. Test locally: `alembic upgrade head` then `alembic downgrade -1` then `alembic upgrade head`
   again, to confirm the downgrade path actually works.
5. Commit the migration file in the same PR as the model change.

## Rules

- **One logical schema change per migration.** Don't bundle "add profiles table" with "add
  external_ref to opportunities" — separate PRs, separate migrations, easier to bisect if
  something breaks.
- **Never edit a migration that's already been applied to staging or prod.** If it's wrong, write
  a new migration that fixes it forward.
- **No data migrations mixed with schema migrations** unless trivial (e.g. backfilling a new
  non-null column with a default). Larger data backfills get their own script under
  `scripts/migrations/`, run manually, documented in the PR.
- **Foreign keys and indexes are part of the schema, not an afterthought** — add them in the same
  migration as the table, not a follow-up.

## During the pilot's Week 2 schema freeze

Per the ERD review: no new tables or column changes to core entities (`profiles`, `users`,
`organizations`) after Wednesday of Week 2 without sign-off from Habibullah — downstream
AI/LLM and frontend work depends on the shape staying stable.

## Rollback in staging/prod

`alembic downgrade -1` is the standard path. If a migration can't be safely downgraded (e.g. it
dropped a column with data), that must be called out explicitly in the migration's docstring.

## Local reset

```bash
alembic downgrade base
alembic upgrade head
```

Use `scripts/seed_dev_data.py` (once it exists) to repopulate.
