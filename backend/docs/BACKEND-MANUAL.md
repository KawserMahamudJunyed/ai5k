# AI5K Backend — Team Manual

**Service:** `ai5k/backend` — the relational core of the AI5K skills & evidence marketplace pilot
**Entry point:** `app/main.py` (uvicorn `app.main:app`)
**Audience:** Infrastructure team · Frontend team · Documentation team
**Status:** pilot build (4 weeks, Jul 27 – Aug 23, 2026)

This manual is the single entry point to the backend for teams that don't own it. It tells you
**what the backend is, how to run and deploy it, what it exposes over the network, and where to
find deeper detail.** Detailed per-topic docs live in [`docs/`](./) — every section here points to
them.

---

## 1. About this manual

| Team | What to read |
|---|---|
| **Infrastructure** | §2, §3, §4 (run), §5 (config), §13 (deploy/ops), §14 (observability) |
| **Frontend** | §8 (auth flows), §9 (API reference), §10 (conventions), §11 (RBAC for UI gating) |
| **Documentation** | §2, §3 (layout), §15 (doc map), §16 (keeping docs in sync) |

---

## 2. Service overview & stack

The backend owns the relational core of AI5K: identity/RBAC, profiles, skills & evidence,
opportunities, matching records, proposals, engagements, reviews, verification, audit logging,
and platform-rule checking. It exposes a REST API consumed by the **Next.js frontend** and by
internal **AI/LLM services** (matching engine, proposal assistant, semantic search).

| Layer | Choice |
|---|---|
| API framework | FastAPI (auto-generated OpenAPI at `/docs`) |
| ORM | SQLAlchemy 2.x (async) |
| Migrations | Alembic |
| Database | PostgreSQL 16 locally; Aurora Postgres in AWS |
| Identity | AWS Cognito (ID-token verification); local fallback for dev/tests |
| Logging | stdlib logging → JSON lines to stdout |
| Tests | pytest + pytest-asyncio (in-memory SQLite) |

What the backend does **not** own: LLM inference, search indexing (OpenSearch), vector store,
frontend rendering.

---

## 3. Repository layout

```
backend/
├── app/                          # Application package (the service)
│   ├── main.py                   # FastAPI app, CORS, exception handlers, router registration, /health
│   ├── core/                     # Cross-cutting infrastructure
│   │   ├── config.py             # Settings from .env / env vars (pydantic-settings)
│   │   ├── db.py                 # Async engine + session factory + get_db dependency
│   │   ├── security.py           # TokenManager: issue local JWTs, verify local + Cognito tokens
│   │   ├── deps.py               # get_current_user (token → users.id) + require_permission
│   │   ├── errors.py             # AppError + JSON error envelope + exception handlers
│   │   └── logging.py            # JSON formatter + request correlation-id middleware
│   ├── api/v1/                   # HTTP layer — thin routers, one module per resource
│   │   ├── auth.py               #   /auth  (signup, verify-email, login, refresh, me)
│   │   ├── organizations.py      #   /organizations (+ members, consent, aggregate skills, PATCH)
│   │   ├── profiles.py           #   /profiles (+ nested /profiles/{id}/services)
│   │   ├── skills.py             #   /skills catalog + /profiles/{id}/skills claims
│   │   ├── evidence.py           #   /profiles/{id}/evidence (presign, rows, skill links)
│   │   ├── verification.py       #   /verification-requests (admin queue: approve/reject)
│   │   ├── roles.py              #   /roles
│   │   ├── admin.py              #   /admin/users/{id}/roles
│   │   └── audit_logs.py         #   /audit-logs
│   ├── services/                 # Business logic — one module per domain
│   │   ├── auth.py               # signup/login/verify/refresh + Cognito sync
│   │   ├── organization.py       # org creation, PATCH, member mgmt, consent, aggregate skills
│   │   ├── profiles.py           # profile/skill-claim/service logic + permission checks
│   │   ├── evidence.py           # evidence rows, skill-claim links, permission checks
│   │   ├── verification.py       # verification queue: request, list, decide + target side effects
│   │   ├── storage.py            # S3 presigned PUT/GET (no file proxying); None when unconfigured
│   │   ├── rbac.py               # roles, permissions, grant/revoke, has_permission, has_role
│   │   └── audit.py              # write_audit_log (append-only)
│   ├── models/                   # SQLAlchemy ORM models
│   │   ├── base.py               # DeclarativeBase, UUID/Timestamp mixins, JSONB variant
│   │   ├── identity.py           # users, organizations, organization_members, roles, permissions, role_permissions, user_roles
│   │   ├── profile.py            # profiles, skills, profile_skills, services
│   │   ├── evidence.py           # evidence, evidence_skill_links
│   │   ├── verification.py       # verification_requests
│   │   └── audit.py              # audit_logs
│   └── schemas/                  # Pydantic request/response models
│       ├── auth.py               # (auth, org, role, admin, audit-log schemas)
│       ├── profile.py            # (profile, skill claim, service schemas)
│       ├── organization.py       # (member, invitation, aggregate skill, org update schemas)
│       ├── evidence.py           # (evidence, presign, skill-link schemas)
│       └── verification.py       # (verification request, queue, decide schemas)
├── alembic/                      # Migrations (see §7)
│   ├── env.py                    # Async env wired to app's DATABASE_URL
│   └── versions/                 # 0001 (identity/rbac/audit), 0002 (profiles/skills/services), 0003 (evidence), 0004 (verification_requests)
├── scripts/
│   ├── seed_roles_permissions.py # Idempotent RBAC seed
│   ├── dogfood.py                # End-to-end endpoint smoke test over real HTTP (self-contained)
│   └── cleanup_dogfood.py        # Remove dogfood rows from the dev DB (dry run by default)
├── tests/                        # pytest suite (SQLite in-memory, see §15)
│   ├── conftest.py               # app + DB fixtures
│   ├── helpers.py                # signup/verify/login/create_org helpers
│   └── test_*.py                 # auth flow, orgs, members, profiles, skills, services, rbac, cognito sync, audit
├── docs/                         # All documentation (see §16)
├── docker-compose.yml            # Local PostgreSQL 16
├── alembic.ini
├── pyproject.toml / pytest.ini   # ruff (line-length 100), mypy, pytest (asyncio auto)
├── requirements.txt              # Runtime deps
├── requirements-dev.txt          # + pytest, pytest-asyncio
└── .env.example                  # Template for .env (never commit .env)
```

---

## 4. Getting started (run locally)

**Prerequisites:** Python 3.11+, Docker + Docker Compose, pip.

```bash
git clone git@github.com:CloudCampBD/ai5k.git
cd ai5k/backend

# 1. Python env + deps
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt          # add -r requirements-dev.txt for tests

# 2. Environment
cp .env.example .env                     # fill in values (see §5)

# 3. Database (local PostgreSQL)
docker compose up -d db                  # postgres:16-alpine on localhost:5432
alembic upgrade head                     # apply migrations

# 4. Seed RBAC (idempotent — safe to run repeatedly)
python -m scripts.seed_roles_permissions

# 5. Run the API
uvicorn app.main:app --reload --port 8000
```

**Verify it's up:**

- `GET http://localhost:8000/health` → `{"status": "ok"}`
- Swagger UI: `http://localhost:8000/docs` (auto-generated OpenAPI — the live API reference)
- Raw spec: `http://localhost:8000/openapi.json`

> **Tip:** with `ENV=local` (the default), the signup response includes a `verification_token`
> so the full auth flow can be exercised without Cognito/SMTP. This token is **never** returned
> when `ENV != local`.

---

## 5. Configuration reference (infrastructure team)

Configuration lives in `app/core/config.py` (`Settings`, pydantic-settings). It reads from
environment variables and a `.env` file at the backend root. **`.env` is never committed** —
`.env.example` is the source of truth for the key list.

| Env var | Default | Purpose |
|---|---|---|
| `ENV` | `local` | `local` / `staging` / `prod`. Controls whether signup returns `verification_token` |
| `SECRET_KEY` | `change-me-in-prod` | HS256 signing secret for locally-issued tokens. **Must change in prod** (recommend ≥ 32 bytes) |
| `LOCAL_TOKEN_ISSUER` | `ai5k-local` | `iss` claim for locally-issued JWTs |
| `LOCAL_TOKEN_AUDIENCE` | `ai5k-api` | `aud` claim for locally-issued JWTs |
| `ACCESS_TOKEN_TTL_SECONDS` | `900` | Access token lifetime (15 min) |
| `REFRESH_TOKEN_TTL_SECONDS` | `2592000` | Refresh token lifetime (30 days) |
| `EMAIL_VERIFICATION_TTL_SECONDS` | `86400` | Email-verification token lifetime (24 h) |
| `DATABASE_URL` | `postgresql+asyncpg://postgres:postgres@localhost:5432/ai5k` | Async SQLAlchemy connection string |
| `COGNITO_USER_POOL_ID` | *(empty)* | AWS Cognito pool id. Empty → Cognito path disabled |
| `COGNITO_CLIENT_ID` | *(empty)* | Cognito app client id |
| `COGNITO_REGION` | `us-east-1` | AWS region for the pool |
| `COGNITO_JWKS_CACHE_TTL_SECONDS` | `3600` | How long Cognito public keys are cached |
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` | *(empty)* | Local dev only — staging/prod use IAM roles |
| `S3_EVIDENCE_BUCKET` | *(empty)* | Evidence file uploads (presigned S3). Empty → file-type evidence returns 503; links/testimonials still work |
| `EVIDENCE_UPLOAD_TTL_SECONDS` | `900` | Presigned upload URL lifetime (15 min) |
| `EVIDENCE_DOWNLOAD_TTL_SECONDS` | `300` | Presigned download URL lifetime (5 min) |
| `OPENSEARCH_ENDPOINT` | *(empty)* | Search (later task) |
| `LLM_PROVIDER_BASE_URL` | *(empty)* | LLM provider layer (later task) |
| `CORS_ORIGINS` | `["*"]` | JSON list of allowed origins for CORS |

Notes for infra:

- `CORS_ORIGINS` is a JSON array, e.g. `CORS_ORIGINS=["https://app.example.com"]`. The CORS
  middleware currently sets `allow_credentials=False` and allows all methods/headers.
- `DATABASE_URL` is the **single source of truth** for both the app and Alembic (`alembic/env.py`
  overrides `sqlalchemy.url` from it).
- Tests override `DATABASE_URL` to `sqlite+aiosqlite://` — see §15.

---

## 6. Architecture & request lifecycle

### 6.1 Layering

Thin routers → fat services:

```
HTTP request
  → api/v1 router (parses path/query/body via Pydantic schemas)
  → core/deps.get_current_user   (Bearer token → users.id; Cognito sync on first call)
  → core/deps.require_permission (RBAC permission check, where needed)
  → services/ business logic     (may call other services + write audit logs)
  → SQLAlchemy async session     (via core/deps.get_db)
  → Pydantic response model
```

Key rules:

- **Routers never contain business logic** — they validate, call a service, and serialize.
- **Commits happen in services**, not routers. `get_db` yields a session per request without
  auto-committing.
- **Audit writes are flushed inside services** using `services/audit.write_audit_log`; the
  caller commits. Order matters: entity-creation audit rows are written *before* actions that
  commit internally (e.g. `grant_role`), so `audit_logs` reads chronologically.
- **Auth + RBAC:** every write endpoint is behind `get_current_user` and, where relevant,
  `require_permission("<permission_code>")` (see §11).

### 6.2 Startup (lifespan)

On startup the app warms the Cognito JWKS cache (if Cognito is configured) so the first request
doesn't pay a network round-trip. This is best-effort; failure logs `cognito_jwks_warmup_failed`
and does not crash the app.

### 6.3 Error model

Every non-2xx response uses a stable envelope (see also §10):

```json
{
  "error": {
    "code": "snake_case_machine_readable",
    "message": "human readable",
    "details": {}
  }
}
```

- Business failures raise `AppError(status, code, message, details)` (`core/errors.py`).
- Validation failures (Pydantic) → `422` with field-level entries in `details`.
- Unhandled exceptions → `500` with generic message to the client; full traceback goes to logs only.

---

## 7. Data layer & migrations

### 7.1 Models

All models inherit from `models/base.py` (`Base` + `UUIDMixin` + `TimestampMixin`):
UUID primary keys, `created_at`/`updated_at` timestamps. JSON columns use a portable type that
is `JSONB` on Postgres and `JSON` on SQLite (tests).

| Table | Purpose | Model |
|---|---|---|
| `users` | Accounts; `cognito_sub` for Cognito users, `password_hash` for the local fallback | `User` |
| `organizations` | Tenant-like orgs | `Organization` |
| `organization_members` | Membership + consent (`consent_given`, `status`) | `OrganizationMember` |
| `roles` | Named roles (`professional`, `org_admin`, `platform_admin`) | `Role` |
| `permissions` | Fine-grained permission codes | `Permission` |
| `role_permissions` | Role → permission mapping | `RolePermission` |
| `user_roles` | User → role (optionally org-scoped) | `UserRole` |
| `profiles` | Marketplace-facing "party" entity (ADR 0001); exactly one owner | `Profile` |
| `skills` | Flat taxonomy (name + category) | `Skill` |
| `profile_skills` | Skill claims (`claim_type` server-asserted to `self_declared`) | `ProfileSkill` |
| `services` | Rates & availability per profile | `Service` |
| `evidence` | Uploads/links with `source_type`; `verification_status` server-managed | `Evidence` |
| `evidence_skill_links` | Which evidence backs which skill claim | `EvidenceSkillLink` |
| `verification_requests` | Admin queue (identity docs & skill claims); polymorphic target | `VerificationRequest` |
| `audit_logs` | Append-only audit trail (see §12) | `AuditLog` |

Full column-by-column detail: `docs/data-dictionary.md`; relationships: `docs/erd.md`.

### 7.2 Migrations (Alembic)

```bash
alembic revision --autogenerate -m "add_foo_table"   # generate a new migration
alembic upgrade head                                  # apply
alembic downgrade -1                                  # roll back one step (dev only)
```

Conventions (see `docs/migrations.md`):

- One migration per logical change; review autogenerated output before committing.
- `alembic/env.py` reads the URL from the app's `DATABASE_URL`, so migrations always run against
  the same database the app uses. `compare_type=True` keeps column types in sync.
- Import every model through `app/models/__init__.py` so autogenerate sees the full metadata.

### 7.3 Seeding

`python -m scripts.seed_roles_permissions` idempotently creates the default roles/permissions
(see §11). It's safe to run at any time, including in fresh environments.

---

## 8. Authentication & token flows (frontend team)

There are **two auth paths**. The backend never stores raw passwords for Cognito-managed
accounts; `users.password_hash` exists only for the local fallback.

### 8.1 Local fallback path (dev/tests, `ENV=local`)

```
1. POST /api/v1/auth/signup        → 201 {user…, verification_token}   (local only)
2. POST /api/v1/auth/verify-email  → activates the account
3. POST /api/v1/auth/login         → {access_token, refresh_token, expires_in}
4. GET  /api/v1/auth/me            → current user + role assignments   (Bearer access_token)
5. POST /api/v1/auth/refresh       → new access_token                  (Bearer refresh_token)
```

Tokens are HS256 JWTs signed with `SECRET_KEY`, carrying `iss`, `aud`, `iat`, `exp`, `sub`
(user id) and a `type` claim (`access` / `refresh` / `email_verification`).

| Token | Lifetime (default) |
|---|---|
| access | 15 min |
| refresh | 30 days |
| email verification | 24 h |

### 8.2 Cognito path (production)

1. **Signup / email confirmation / login happen against Cognito directly** (hosted UI or SDK) —
   the frontend never calls `/auth/signup` in production.
2. Frontend receives a Cognito **ID token** (JWT, RS256) and sends it as the bearer token.
3. On the first authenticated call, the backend verifies the token against the pool's **public
   JWKS** (cached, refreshed per `COGNITO_JWKS_CACHE_TTL_SECONDS`), finds no `users` row for the
   token's `sub`, and **sync-creates** one from claims (`email`, `name`/`given_name`+`family_name`,
   `picture`) with status `active`, assigning the default `professional` role.
4. Subsequent calls resolve `cognito_sub` → `users.id` from the DB.

> **Frontend:** keep your existing Cognito flow. The only backend-facing change is the bearer
> token you send — it must be the Cognito **ID token** (not the access token). Refresh stays a
> Cognito-side concern; the backend doesn't handle it in this path.

### 8.3 Headers & CORS

- Every authenticated route: `Authorization: Bearer <token>`.
- Every response echoes `X-Request-ID` (incoming value or one generated by the backend) — use it
  when filing bugs.
- CORS is permissive by default (`*`); the infra team narrows `CORS_ORIGINS` per environment.

Full flow detail: `docs/auth.md`.

---

## 9. API reference (frontend team)

Base URL: `/api/v1`. All times ISO 8601 UTC. All responses snake_case.

### 9.1 `POST /auth/signup` — create account (local path)

Auth: none · Status: **201**

Request:
```json
{ "email": "alice@example.com", "password": "secret1234", "full_name": "Alice Example" }
```
- `password`: 8–128 chars · `full_name`: 1–255 chars

Response:
```json
{
  "id": "…uuid…", "email": "alice@example.com", "full_name": "Alice Example",
  "status": "pending", "verification_token": "… (local only, null otherwise)"
}
```
Errors: `409 email_already_registered` · `422 validation_error` (Pydantic — fires first for a short password) / `weak_password` (service-level safety net)

### 9.2 `POST /auth/verify-email` — activate account (local path)

Auth: none · Status: **200**

Request: `{ "token": "…" }` → Response: `UserRead`
Errors: `401 invalid_token` · `404 user_not_found`

### 9.3 `POST /auth/login` — local credential login

Auth: none · Status: **200**

Request: `{ "email": "…", "password": "…" }`

Response:
```json
{ "access_token": "…", "refresh_token": "…", "token_type": "bearer", "expires_in": 900 }
```
Errors: `401 invalid_credentials` · `403 email_not_verified` · `403 account_suspended`

### 9.4 `POST /auth/refresh` — exchange refresh token for a new access token

Auth: none · Status: **200**

Request: `{ "refresh_token": "…" }`
Response: `{ "access_token": "…", "token_type": "bearer", "expires_in": 900 }`
Errors: `401 invalid_token`

### 9.5 `GET /auth/me` — current user + role assignments

Auth: **Bearer** · Status: **200**

Response:
```json
{
  "user": { "id": "…", "email": "…", "full_name": "…", "avatar_url": null, "status": "active", "created_at": "…" },
  "roles": [ { "name": "professional", "organization_id": null } ]
}
```
Errors: `401 missing_token` / `invalid_token` · `403 account_not_active`

### 9.6 `POST /organizations` — create an org (creator becomes `org_admin`)

Auth: **Bearer** · Status: **201**

Request:
```json
{ "name": "Acme", "slug": "acme", "description": "…", "website_url": "https://…" }
```
(`slug` optional — auto-generated from `name` if omitted, made unique with `-2`, `-3`…)

Response: `OrganizationRead` (`id`, `name`, `slug`, `description`, `website_url`, `status`, `created_at`)
Errors: `422 invalid_slug` (slug must match `[a-z0-9-]+`) · `409 slug_taken`

### 9.7 `GET /organizations` — list orgs the caller belongs to

Auth: **Bearer** · Status: **200** → `[OrganizationRead, …]`

### 9.8 `GET /organizations/{org_id}` — org detail

Auth: **Bearer** · Status: **200**
Errors: `404 organization_not_found` · `403 permission_denied` (caller must be an active member or hold `organization:manage`)

### 9.9 `GET /roles` — catalog of roles with their permission codes

Auth: **Bearer** · Status: **200**

Response:
```json
[ { "name": "professional", "permissions": ["opportunity:read", "opportunity:write", "profile:write"] } ]
```

### 9.10 `POST /admin/users/{user_id}/roles` — grant a role (platform admin)

Auth: **Bearer** + permission `rbac:manage` · Status: **201**

Request: `{ "role_name": "platform_admin", "organization_id": null }`
Response: `{ "user_id": "…", "role": "platform_admin", "organization_id": null }`
Errors: `403 permission_denied` · `404 role_not_found` / `organization_not_found` · `409 role_already_granted`

### 9.11 `DELETE /admin/users/{user_id}/roles` — revoke a role (platform admin)

Auth: **Bearer** + permission `rbac:manage` · Status: **204** (no body)

Request: `{ "role_name": "…", "organization_id": null }`
Errors: `403 permission_denied` · `404 role_not_found` / `role_not_granted`

### 9.12 `GET /audit-logs` — audit trail (platform admin)

Auth: **Bearer** + permission `audit:read` · Status: **200**

Query: `limit` (int, 1–200, default 50). Newest first.

Response: `[AuditLogRead, …]`:
```json
{
  "id": "…", "actor_id": "…", "action": "user_role.granted",
  "entity_type": "user_role", "entity_id": "…",
  "metadata": { "user_id": "…", "role": "platform_admin", "organization_id": null },
  "ip_address": "…", "created_at": "…"
}
```

### 9.13 `GET /health` (outside `/api/v1`)

Auth: none · Status: **200** → `{ "status": "ok" }`

### 9.14 Profiles, skills & services *(added 2026-09-20 — Task 2.1/2.2 workstreams)*

Full request/response shapes live in the auto-generated OpenAPI (`/docs`); flows and permission
rules below. Spec: `docs/specs/2026-09-19-profile-crud-org-members-design.md`.

| Endpoint | Auth / permission | Notes |
|---|---|---|
| `POST /profiles` | Bearer | Individual profile for self (409 `profile_exists` on second). With `organization_id` in the body: requires that org's `organization:manage` (409 if the org already has one) |
| `GET /profiles/me` | Bearer | Caller's individual profile; 404 `profile_not_found` before creation |
| `GET /profiles/{id}` | Bearer | Public profiles → any authed user; private → owner, org members (org profiles), org admin, `platform_admin` |
| `PATCH /profiles/{id}` | Bearer + manage rights | `display_name`, `headline`, `job_roles` (≤10), `portfolio_links` (≤20, `https?://` URLs), `visibility`. Owner FKs immutable |
| `GET /skills?category=&page=&page_size=` | Bearer | Flat catalog, offset pagination, `{data, total, page, page_size}` |
| `POST /profiles/{id}/skills` | Bearer + manage rights | Body `{skill_id}` or `{skill_name, category}` (create-or-get, name normalized lowercase). **`claim_type` is always server-set to `self_declared`** — client-sent values are ignored; only the verification queue (Task 2.4/2.5) flips to `evidenced`. 409 `skill_already_claimed` |
| `PATCH /profiles/{id}/skills/{claim_id}` | Bearer + manage rights | `proficiency_level` only |
| `DELETE /profiles/{id}/skills/{claim_id}` | Bearer + manage rights | 204 |
| `POST /profiles/{id}/services` | Bearer + manage rights | `rate_type` `hourly\|fixed\|retainer`, `rate_amount` > 0, `availability_status` defaults `available` |
| `GET /profiles/{id}/services` | Bearer + view rights | List for a profile |
| `PATCH /profiles/{id}/services/{service_id}` | Bearer + manage rights | Partial; typical use is flipping `availability_status` |
| `DELETE /profiles/{id}/services/{service_id}` | Bearer + manage rights | 204 |

### 9.15 Organizations: PATCH, members, consent, aggregated skills *(added 2026-09-20 — Task 2.2)*
| Endpoint | Auth / permission | Notes |
|---|---|---|
| `PATCH /organizations/{org_id}` | That org's `org_admin` or `platform_admin` | `name`, `description`, `website_url`, `logo_url`. **`slug` is immutable** (public URL) |
| `GET /organizations/{org_id}/members` | Same | id, user (id/email/full_name), status, `consent_given`, `joined_at` |
| `POST /organizations/{org_id}/members` | Same | Body `{email}` — **existing users only** (404 `user_not_found`; no email infra in the backend). Row starts `invited`/`consent_given=false`. 409 `member_exists` if invited/active; re-inviting a `removed` member resets to a fresh invitation |
| `GET /organizations/invitations` | Bearer (any user) | Caller's pending invitations (`invited_at` is null while pending — the schema sets `joined_at` only on consent) |
| `POST /organizations/{org_id}/members/me/consent` | The invited member | Flips `consent_given=true`, `invited→active`, sets `joined_at`, **grants an org-scoped `professional` role** (not `org_admin` — elevation is a `platform_admin` action via §9.10). 409 `not_pending` if already active |
| `DELETE /organizations/{org_id}/members/{member_id}` | That org's `org_admin` or `platform_admin` | `status→removed`, revokes the member's org-scoped roles (platform-wide roles untouched). **409 `cannot_remove_self`** (last-admin lockout guard) |
| `GET /organizations/{org_id}/skills` | Active members, that org's `org_admin`, `platform_admin` | Aggregated skill view over **consenting active members'** individual profiles. Per skill: `member_count` (distinct users — no double counting), `evidenced_count`, `self_declared_count`. Sorted `member_count` desc, then name. Claims made before consent are not counted |

### 9.16 Evidence: uploads, source-type tagging, skill-claim links *(added 2026-09-20 — Task 2.3 precursor)*

Spec: `docs/specs/2026-09-20-evidence-uploads-design.md`. All routes live under
`/profiles/{profile_id}/evidence`; writes need manage rights on the profile, reads follow the
profile's visibility. The backend **never proxies file bytes**: it issues presigned S3 PUTs, the
frontend uploads directly, and the `s3://{bucket}/{key}` URL is stored on the row.

| Endpoint | Notes |
|---|---|
| `POST …/evidence/presign` | Body `{source_type, content_type}` (file types only; content types: `application/pdf`, `image/png`, `image/jpeg`, `image/webp`) → `{file_key, upload_url, expires_in}`. **503 `storage_not_configured`** when `S3_EVIDENCE_BUCKET` is unset |
| `POST …/evidence` | File types: `{source_type, title, file_key}` (key must be one this profile was issued — prefix + traversal guard, 422 otherwise). `link`/`testimonial`: `{source_type, title, url}` (https?://). Rows start `verification_status: pending` — **never client-settable** |
| `GET …/evidence`, `GET …/evidence/{id}` | List/detail; file rows include a short-TTL presigned `download_url` when storage is configured |
| `DELETE …/evidence/{id}` | Removes the row only — the S3 object stays (URLs expire; orphan reaping later) |
| `POST …/evidence/{id}/skill-links` | `{profile_skill_id}`; the claim must belong to the **same profile** (404 otherwise), 409 on duplicate |
| `GET …/evidence/{id}/skill-links` | List links |
| `DELETE …/evidence/{id}/skill-links/{link_id}` | Unlink (204) |

Known limitation: presigned PUT can't enforce max file size — revisit via presigned POST policies
or gateway limits if abuse shows up.

### 9.17 Verification queue *(added 2026-09-20 — Tasks 2.4/2.5)*

Spec: `docs/specs/2026-09-20-verification-queue-design.md`. Admin review of identity docs
(evidence rows) and skill claims. Permission split per §11: **listing the queue needs
`verification:review`; deciding needs `verification:approve`** (platform_admin holds both).
Request creation requires manage rights on the target's profile.

| Endpoint | Notes |
|---|---|
| `POST /verification-requests` | Body `{target_type, target_id}` — `profile_skill` \| `identity_doc`. 409 `request_exists` (pending dup), 409 `already_verified` (target already verified/evidenced); rejected targets may be resubmitted |
| `GET /verification-requests?status=&page=&page_size=` | The queue; default `status=pending`, `all` allowed; `{data, total, page, page_size}` envelope, newest first |
| `POST /verification-requests/{id}/approve` | Decision-once (409 `already_decided` on re-decide). **Side effects:** claim → `claim_type=evidenced` (the only path); identity doc → `verification_status=verified`. Optional `{note}` → audit metadata |
| `POST /verification-requests/{id}/reject` | Side effect: evidence → `verification_status=rejected`; claims stay `self_declared` (editable/resubmittable) |

Approving a claim automatically feeds the org aggregate's `evidenced_count` (§9.15).

---

## 10. API conventions

- **Base URL & versioning:** `/api/v1/…` — version in the path. Breaking changes → `/api/v2`.
- **Methods:** GET read/list · POST create/action · PATCH partial update · DELETE remove.
- **Error envelope:** always `{ "error": { "code", "message", "details" } }` (see §6.3).
- **Auth header:** `Authorization: Bearer <token>` on every authenticated route.
- **Pagination:** offset (`?page=&page_size=`) acceptable for small bounded lists (roles today);
  cursor pagination for unbounded lists (audit logs) is a later-task concern.
- **Field naming:** snake_case everywhere, matching DB columns.
- **Timestamps:** ISO 8601 UTC (`Z` suffix).
- **Idempotency:** retryable automation endpoints should accept `Idempotency-Key` (planned).

Full detail: `docs/api-conventions.md`.

---

## 11. RBAC: roles & permissions (frontend + infra)

Roles are global; **org-scoped roles** (`user_roles.organization_id` set) only apply within that
org, while platform-wide roles (`organization_id = null`) apply everywhere. A user can hold the
same role in several orgs.

| Role | Permissions |
|---|---|
| `professional` *(granted at signup)* | `profile:write`, `opportunity:read`, `opportunity:write` |
| `org_admin` *(granted on org creation)* | + `organization:manage` |
| `platform_admin` *(granted manually via `rbac:manage`)* | `profile:read`, `profile:write`, `organization:manage`, `opportunity:read`, `opportunity:write`, `opportunity:assign`, `proposal:approve`, `verification:review`, `verification:approve`, `audit:read`, `rbac:manage`, `rule:manage` |

Rules for frontend UI gating:

- Use **`GET /roles`** for the catalog, and **`GET /auth/me`** for the caller's assignments.
- `organization_id: null` in a role assignment = platform-wide; non-null = org-scoped.
- `platform_admin` has **no self-serve path** — it's granted by an existing platform admin
  through `POST /admin/users/{user_id}/roles`.

Enforcement model: `docs/rbac.md`.

---

## 12. Audit logging

Append-only `audit_logs` table, written from services on sensitive state changes (see §6.1 for
ordering rules). Current actions:

| Action | When |
|---|---|
| `user.created` | Signup (local or Cognito sync) |
| `user.email_verified` | Email verification (first time) |
| `auth.login` | Successful local login |
| `organization.created` | Org creation |
| `organization.updated` | Org profile PATCH (before/after metadata) |
| `organization_member.updated` | Member invited / consent accepted / removed (before/after metadata) |
| `user_role.granted` / `user_role.revoked` | Role assignment changes (incl. org-scoped professional granted on consent, revoked on removal) |
| `profile.created` / `profile.updated` | Profile create/PATCH (before/after metadata) |
| `profile_skill.created` / `profile_skill.updated` / `profile_skill.deleted` | Skill-claim lifecycle |
| `service.created` / `service.updated` / `service.deleted` | Service lifecycle (before/after metadata) |
| `evidence.created` / `evidence.deleted` | Evidence row lifecycle |
| `evidence_skill_link.created` / `evidence_skill_link.deleted` | Evidence ↔ skill-claim links |
| `verification_request.approved` / `verification_request.rejected` | Verification queue decisions (metadata: target, reviewer, note) |

Conventions: `docs/audit-logging.md`.

---

## 13. Deployment & infrastructure notes (infrastructure team)

Current state (pilot):

- **Compute:** containerized FastAPI (uvicorn) — target ECS/Fargate vs. EC2 is decided in
  AWS provisioning tasks. No job queue is scoped for the pilot.
- **Database:** Aurora Postgres in AWS; `docker-compose.yml` provides Postgres 16 locally
  (port 5432, user/pass `postgres/postgres`, db `ai5k`, named volume `ai5k_pgdata`, healthcheck
  `pg_isready`).
- **Secrets:** `.env` for local dev only; staging/prod should use AWS Secrets Manager or SSM
  Parameter Store.
- **CI/CD:** GitHub Actions → staging on merge to main (per repo plan); prod deploy is manual/gated.
- **Observability:** JSON structured logs to stdout; aggregate in CloudWatch. Every line carries
  `ts`, `level`, `logger`, `message`, plus (when available) `correlation_id`, `user_id`, `path`,
  `method`, `status`, `duration_ms`, `ip`. `X-Request-ID` is echoed on responses — this is the
  join key for request tracing.
- **Health checks:** use `GET /health` (returns `{"status": "ok"}`) for load-balancer/container
  health checks.
- **Security:** all write endpoints are auth + RBAC gated; TLS in transit via ALB/CloudFront;
  encryption at rest via Aurora defaults; rate limiting is planned at the gateway layer, not in-app.

System architecture: `docs/backend-system-architecture.md`.

---

## 14. Observability quick reference (infrastructure team)

| Need | Where |
|---|---|
| Liveness/readiness | `GET /health` |
| Request tracing | `X-Request-ID` header (echoed on every response) |
| Request logs | JSON lines: `http_request` with method/path/status/duration_ms/ip |
| Error context | Exception logs include `exc_info`; clients get a generic `500 internal_error` |
| App logs | Logger name `ai5k` |

---

## 15. Testing

```bash
pip install -r requirements-dev.txt
pytest                      # runs tests/ (asyncio auto mode)
ruff check .                # lint (line-length 100, py311)
mypy app                    # type check (py311)
```

How it works (see `tests/conftest.py`):

- Tests use an **in-memory SQLite** DB (`sqlite+aiosqlite://` with `StaticPool`) — no Postgres
  needed; the app's `get_db` dependency is overridden per test.
- `Base.metadata.create_all` runs per test; roles/permissions are seeded for each test (autouse fixture in `conftest.py`).
- `tests/helpers.py` provides `signup` / `verify_email` / `login` / `activated_user_token`
  helpers for auth-flow tests.
- Existing suites: auth flow, organizations, org members/consent/aggregation, profiles, skill claims, services, RBAC, Cognito sync, audit.

Two self-contained scripts exercise the stack against a real database (not part of pytest):

```bash
python scripts/dogfood.py          # boots the app on a free port, runs ~46 endpoint checks, prints PASS/FAIL transcript
python scripts/cleanup_dogfood.py  # counts the `df-*` rows it leaves (dry run); add --apply to delete
```

---

## 16. For the documentation team

### 16.1 Doc map

| File | Covers |
|---|---|
| **`docs/BACKEND-MANUAL.md` (this file)** | Cross-team entry point |
| `docs/README.md` | Backend overview, stack, team, doc index |
| `docs/backend-system-architecture.md` | Module layout, request lifecycle, integrations, deployment shape |
| `docs/environment-setup.md` | Local setup, troubleshooting |
| `docs/api-conventions.md` | REST naming, pagination, error shape, headers |
| `docs/auth.md` | Cognito vs local auth flows, token verification |
| `docs/rbac.md` | Roles, permissions, scoping |
| `docs/audit-logging.md` | What's logged, naming, retention |
| `docs/data-dictionary.md` | Every table/column |
| `docs/erd.md` | ER diagram + narrative |
| `docs/migrations.md` | Alembic conventions |
| `docs/specs/` | Approved feature designs (e.g. profile CRUD + org members) |
| `docs/glossary.md` | Domain terms |
| `docs/decisions/` | ADRs (schema/architecture decisions) |

### 16.2 Keeping docs in sync

- **The code is the source of truth.** If a doc contradicts the code, flag it — don't silently
  trust either one.
- The **live API reference** is generated by FastAPI at `/docs` (Swagger UI) and
  `/openapi.json`. Don't hand-maintain endpoint signatures in markdown; keep markdown focused on
  flows, conventions, and rationale.
- When models change: update `data-dictionary.md`/`erd.md` alongside the migration.
- When new routers are added: register them in `app/main.py`, update §9 of this manual, and add
  them to the doc map above.
- New architecture decisions go in `docs/decisions/` as short ADRs.

---

## 17. Troubleshooting

| Symptom | Likely cause |
|---|---|
| `alembic upgrade head` fails on a fresh DB | Docker Postgres not ready — wait a few seconds, retry |
| Cognito verification fails locally | Missing/wrong `COGNITO_*` vars — or leave them empty to use the local fallback path |
| `401 invalid_token` on every call | Wrong token (Cognito **ID** token required in prod), expired token, or `SECRET_KEY` changed since issuance |
| Signup returns `verification_token: null` | `ENV` is not `local` — expected outside dev |
| Import errors at startup | venv not activated, or deps not re-installed after a change to `requirements.txt` |
| Tests fail with DB errors | Tests use SQLite; ensure `DATABASE_URL` isn't forcing Postgres in the test environment (`conftest.py` sets it) |

Full local-setup walkthrough: `docs/environment-setup.md`.
