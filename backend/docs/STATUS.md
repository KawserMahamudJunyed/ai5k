# Backend Status — AI5K

**Branch:** `feature/week1-backend-setup` · **Date:** 2026-09-20 · **Test suite:** 61 passed (pytest, SQLite in-memory)

The backend is the FastAPI relational core of the AI5K skills & evidence marketplace pilot (4-week build, Jul 27 – Aug 23, 2026). Work has progressed well past "Week 1 scaffold": identity/RBAC, profiles, skills, evidence, and the verification queue are implemented and tested. Much of this is **uncommitted** on the feature branch.

---

## What's done

### Foundation
- FastAPI app (`app/main.py`) with CORS, JSON logging + correlation-id middleware, error envelope, `/health`, JWKS warmup on startup.
- Core infra: pydantic-settings config, async SQLAlchemy engine/session, `TokenManager` (local JWT issuance + Cognito token verification with local dev fallback), `get_current_user` + `require_permission` dependencies.
- Local stack via `docker-compose.yml` (PostgreSQL 16); Alembic async migrations wired to `DATABASE_URL`.
- Tooling: pytest + pytest-asyncio, ruff (line-length 100), mypy configured in `pyproject.toml`.

### Database (4 migrations, all implemented)
| Migration | Tables |
|---|---|
| `0001` | users, organizations, organization_members, roles, permissions, role_permissions, user_roles, audit_logs |
| `0002` | profiles (party pattern), skills, profile_skills, services |
| `0003` | evidence, evidence_skill_links |
| `0004` | verification_requests |

### API surface (`/api/v1`) — all routers registered
| Domain | Endpoints | Notes |
|---|---|---|
| Auth | `/auth` | signup, verify-email, login, refresh, me |
| RBAC | `/roles`, `/admin/users/{id}/roles` | roles catalog, grant/revoke (platform_admin only) |
| Organizations | `/organizations` | CRUD/PATCH, members, consent, aggregate skills |
| Profiles | `/profiles` | individual + org profiles, nested `/services` |
| Skills | `/skills`, `/profiles/{id}/skills` | catalog + skill claims (create-or-get skills) |
| Evidence | `/profiles/{id}/evidence` | S3 presigned PUT/GET (no byte proxying), rows, skill links |
| Verification | `/verification-requests` | admin queue: create, list w/ filters + pagination, approve/reject |
| Audit | `/audit-logs` | platform_admin only |

### Domain logic (services layer)
- Auth flow + Cognito user sync; RBAC (roles, permissions, `has_permission`/`has_role`); append-only audit logging on state changes.
- Profiles: permission checks (owner / org admin / platform_admin), party-pattern validation, audit rows.
- Evidence: presign flow, same-profile skill-link guard, server-managed `verification_status`.
- Verification: decision-once (409 `already_decided`), target ownership guard, side effects on approve/reject (claim → `evidenced`, identity doc → `verified`/`rejected`), permission split (`verification:review` vs `verification:approve`).
- Storage: S3 presigned URLs, returns None when unconfigured.

### Tests — 61 passed, 0 failed
Auth flow, organizations, org members, profiles, profile services, profile skills, RBAC, Cognito sync, evidence, verification queue.

### Ops / scripts
- `scripts/seed_roles_permissions.py` — idempotent RBAC seed.
- `scripts/dogfood.py` / `cleanup_dogfood.py` — end-to-end HTTP smoke test + cleanup.

### Documentation (backend/docs/)
TRD, ERD, data dictionary, glossary, backend manual, API conventions, RBAC, auth, audit-logging, migrations, environment setup, backend architecture. Three approved design specs (profile CRUD & org members, S3 evidence uploads, verification queue) plus an ADR on the profiles party pattern.

---

## Not started (per TRD roadmap)

- **Opportunities / CRM** (Task 3.1): `opportunities`, `opportunity_status_history`, `buyer_intake_briefs`.
- **Matching & proposals** (Tasks 3.3 / 3.5): `matches`, `proposals`, `proposal_evidence_links`; LLM provider layer (Task 1.7).
- **Search / vector store** (Task 1.8 / 2.7): pgvector vs OpenSearch — still an open decision.
- **Scoring** (Task 2.8): `profile_scores` + nightly job.
- **Engagements, milestones, reviews** (Task 3.4+).
- **Platform rules** (Task 4.x): `platform_rules`, `rule_check_logs`.
- **Production hardening** (Weeks 3–4): deployment, rate limiting, observability.

## Open items

- **Uncommitted work:** migrations 0002–0004, all profile/skill/evidence/verification code, and 6 new test files are untracked/modified on this branch — commit is needed.
- `__pycache__` directories are being tracked by git — add to `.gitignore`.
- Pilot additions (`headline`, `job_roles`, `portfolio_links` on profiles) are pending schema-freeze sign-off.
- Eraser ERD needs a re-sync to match migrations 0002–0004.
- Open decisions from TRD §14: vector store choice, LLM provider, compute target, rate limiting, audit write pattern.

---

## Summary

Identity/RBAC, profiles, skills & services, evidence uploads, verification queue, and audit logging are **implemented and fully tested** (61/61 passing). The next milestones are the CRM/opportunities module, matching + LLM proposals, and search/scoring infrastructure.
