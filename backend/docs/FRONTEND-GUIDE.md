# Frontend Guide — AI5K Backend

**Audience:** Next.js frontend team · **Date:** 2026-09-20 · **API status:** all domains below are live and tested (61/61)

Everything the frontend needs to integrate with the backend in one place. The live, always-correct
reference is the auto-generated OpenAPI: **`GET /docs`** (Swagger UI) or `/openapi.json` on the
running backend.

---

## 1. The basics

| Thing | Value |
|---|---|
| Base URL | `/api/v1` (version in the path; breaking changes → `/api/v2`) |
| Auth header | `Authorization: Bearer <token>` on every authenticated route |
| Local run | `uvicorn app.main:app --reload --port 8000` → `http://localhost:8000` |
| Health check | `GET /health` → `{"status": "ok"}` (no auth) |
| Response fields | **snake_case** everywhere — no camelCase layer |
| Timestamps | ISO 8601 UTC with `Z` suffix, e.g. `2026-07-27T09:00:00Z` |
| IDs | UUID strings |
| Request tracing | Every response echoes **`X-Request-ID`** — include it in bug reports |
| CORS | Permissive by default; infra narrows `CORS_ORIGINS` per environment |

### Error envelope (every non-2xx)

```json
{
  "error": {
    "code": "snake_case_machine_readable",
    "message": "human readable",
    "details": {}
  }
}
```

Branch UI logic on **`code`**, not `message`. Validation failures → `422` with field entries in
`details`. A generic `500 internal_error` means the backend logged the real cause — send the
`X-Request-ID`.

### Pagination

Offset style on current list endpoints:

```
GET /skills?category=ml&page=2&page_size=20   →  { "data": [...], "total": 87, "page": 2, "page_size": 20 }
```

---

## 2. Authentication — read this first

There are **two auth paths**, and the frontend behaves differently in each.

### Local dev (`ENV=local`) — backend handles everything

```
POST /api/v1/auth/signup         → 201 {user…, verification_token}   ← token only in local!
POST /api/v1/auth/verify-email   → 200 {token}                       ← activates the account
POST /api/v1/auth/login          → 200 {access_token, refresh_token, token_type, expires_in: 900}
GET  /api/v1/auth/me             → 200 {user, roles: [{name, organization_id}]}
POST /api/v1/auth/refresh        → 200 {access_token, token_type, expires_in: 900}
```

### Production (Cognito) — backend does NOT issue tokens

1. Signup / email confirm / login / **refresh all happen against Cognito directly** (hosted UI or
   SDK). Never call `/auth/signup` in prod.
2. Send the Cognito **ID token** as the bearer — **not the access token**. This is the #1
   integration gotcha.
3. On the first authenticated call the backend auto-creates the `users` row from token claims and
   assigns the `professional` role — no "create profile in backend" step for accounts.
4. Logout = discard tokens client-side (+ optional Cognito global sign-out). Stateless backend.

### Token lifetimes (defaults)

| Token | TTL | Frontend behavior |
|---|---|---|
| Access | 15 min | Attach to every request; on `401 invalid_token` → refresh → retry once |
| Refresh | 30 days | On refresh failure → redirect to login |
| Email verification | 24 h | Local path only |

### Error codes to handle globally

| Code | Meaning / UX |
|---|---|
| `401 missing_token` / `invalid_token` | No/expired/bad token → refresh flow |
| `403 account_not_active` / `email_not_verified` / `account_suspended` | Show account-state screen |
| `403 permission_denied` | Authenticated but not allowed — hide the UI path (see §3) |

---

## 3. RBAC — for UI gating

Use `GET /auth/me` for the caller's role assignments. `organization_id: null` = platform-wide;
non-null = scoped to that org. `GET /roles` returns the full catalog with permission codes.

| Role | How it's obtained | Key permissions |
|---|---|---|
| `professional` | Every signup | `profile:write`, `opportunity:read/write` |
| `org_admin` | Creating an org (creator auto-becomes admin) | + `organization:manage` |
| `platform_admin` | Manual grant only (no self-serve) | everything incl. `verification:*`, `audit:read`, `rbac:manage` |

**Hide UI for actions the user can't take, but never trust the client** — the backend enforces
permissions on every route regardless of what the UI shows.

Notable distinction: consent (§5) grants an org-scoped **`professional`** role — it does **not**
make someone `org_admin`.

---

## 4. Profiles, skills & services

- `POST /profiles` — create your individual profile (one per user, 409 `profile_exists` on
  repeat). Orgs get one via `organization_id` in the body (needs `organization:manage`).
- `GET /profiles/me` — your profile; 404 `profile_not_found` before first creation.
- `GET /profiles/{id}` — public profiles visible to any authed user; private ones only to owner /
  org members / `platform_admin`.
- `PATCH /profiles/{id}` — `display_name`, `headline`, `job_roles` (≤10), `portfolio_links`
  (≤20, `http(s)://`), `visibility`. Owner FKs are immutable.
- Skills: `GET /skills?category=&page=` (catalog) · `POST /profiles/{id}/skills`
  (`{skill_id}` or `{skill_name, category}` — skills are create-or-get, names lowercased) ·
  `PATCH /profiles/{id}/skills/{claim_id}` (proficiency only) · `DELETE …/{claim_id}`.
- Services: `POST|GET /profiles/{id}/services`, `PATCH|DELETE …/services/{service_id}`.
  `rate_type`: `hourly | fixed | retainer`, `rate_amount` > 0, `availability_status`:
  `available | booked | unavailable`.

⚠️ **`claim_type` is server-asserted.** Claims are always created `self_declared`; any
client-sent value is ignored. Only an admin approval (§6) flips one to `evidenced`. Don't build
UI that claims to set it.

---

## 5. Organizations, members & consent

| Endpoint | Notes |
|---|---|
| `POST /organizations` | Creator becomes `org_admin`. `slug` optional (auto-generated, unique) |
| `PATCH /organizations/{org_id}` | `name`, `description`, `website_url`, `logo_url` — **`slug` is immutable** (it's the public URL) |
| `GET /organizations` / `/{org_id}` | List = orgs you belong to; detail needs membership or `organization:manage` |
| `GET /organizations/{org_id}/members` | `org_admin` only |
| `POST /organizations/{org_id}/members` | Body `{email}` — **existing users only** (404 `user_not_found`; backend has no email infra, so the frontend must surface pending invitations) |
| `GET /organizations/invitations` | Caller's pending invitations — poll this for the "you've been invited" banner |
| `POST /organizations/{org_id}/members/me/consent` | The invited member accepts → `active`, sets `joined_at`, grants org-scoped `professional` |
| `DELETE /organizations/{org_id}/members/{member_id}` | `org_admin` only; 409 `cannot_remove_self` — **guard this in UI** |
| `GET /organizations/{org_id}/skills` | Aggregated view over **consenting** members' individual profiles: `member_count`, `evidenced_count`, `self_declared_count` |

Member lifecycle: `invited` → (consent) → `active` → `removed`. Re-inviting a `removed` member
works; re-inviting an invited/active one → 409 `member_exists`.

---

## 6. Evidence uploads — presigned S3, two-step

The backend **never proxies file bytes**. For file evidence:

```
1. POST /profiles/{id}/evidence/presign     {source_type, content_type}
   → {file_key, upload_url, expires_in: 900}
2. PUT the raw bytes to upload_url (direct to S3, from the browser)
3. POST /profiles/{id}/evidence             {source_type, title, file_key}
```

- Allowed content types: `application/pdf`, `image/png`, `image/jpeg`, `image/webp`.
- `source_type`: file types vs `link` / `testimonial` (those skip presign — send `{source_type, title, url}`).
- `file_key` must be one this profile was issued (traversal guard → 422).
- Rows start `verification_status: pending` — **never client-settable**; only the admin queue flips it.
- `GET …/evidence` returns short-TTL `download_url` on file rows — treat as ephemeral, refetch; don't persist.
- `DELETE …/evidence/{id}` removes the row only (S3 object stays).
- Skill links: `POST|GET …/evidence/{id}/skill-links` (`{profile_skill_id}`, same profile only), `DELETE …/skill-links/{link_id}`.
- If storage isn't configured, presign → **503 `storage_not_configured`**; link/testimonial types still work.

---

## 7. Verification queue (admin UI)

| Endpoint | Who | Notes |
|---|---|---|
| `POST /verification-requests` | Profile owner (or org admin) | `{target_type: "profile_skill" | "identity_doc", target_id}`. 409 `request_exists` (pending dup) · 409 `already_verified` |
| `GET /verification-requests?status=&page=&page_size=` | `verification:review` | Queue; default `pending`, `all` allowed, newest first |
| `POST /verification-requests/{id}/approve` | `verification:approve` | Decision-once — 409 `already_decided` on retry. Side effects: claim → `evidenced`, identity doc → `verified` |
| `POST /verification-requests/{id}/reject` | `verification:approve` | Evidence → `rejected`; rejected targets may be resubmitted by the owner |

Note the **permission split**: listing (`verification:review`) and deciding
(`verification:approve`) are separate — build the admin UI to allow view-only reviewers.

---

## 8. Misc endpoints

- `GET /roles` — role catalog with permission codes.
- `POST|DELETE /admin/users/{user_id}/roles` — grant/revoke roles, `rbac:manage` only
  (body `{role_name, organization_id}`). This is the only path to `platform_admin` / `org_admin`.
- `GET /audit-logs?limit=` — `audit:read` only, newest first.

---

## 9. Not built yet — don't wait on these

The following TRD modules have **no endpoints yet**; any UI assuming them will have nothing to
call: opportunities/CRM pipeline, buyer intake briefs, matching, proposals, engagements,
milestones, reviews, search, `profile_scores`.

---

## 10. Where to dig deeper

| Doc | Covers |
|---|---|
| `backend/docs/BACKEND-MANUAL.md` | Full API reference with request/response examples (§9) |
| `backend/docs/auth.md` | Auth flows in detail |
| `backend/docs/api-conventions.md` | REST conventions, pagination, error shape |
| `backend/docs/rbac.md` | Permission model |
| `backend/docs/data-dictionary.md` | Every field, column by column |
| `backend/docs/STATUS.md` | What's done / not done overall |
| `/docs` on a running backend | Live OpenAPI — source of truth for exact shapes |
