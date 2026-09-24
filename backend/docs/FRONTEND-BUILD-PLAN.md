# Frontend Build Plan — Pages & Instructions

**Audience:** Next.js frontend team (starting from zero) · **Date:** 2026-09-20
**Companion docs:** `FRONTEND-GUIDE.md` (API/auth reference) · `BACKEND-MANUAL.md` §9 (full endpoint reference)

The backend already supports **auth, profiles, skills, services, organizations, evidence, and the
verification queue** (61 tests passing). Opportunities, matching, proposals, engagements, reviews,
and search have **no backend yet** — build those screens last, or stub them.

Build in 4 phases. Each phase is shippable on its own.

---

## Phase 0 — App skeleton (before any feature work)

1. **Next.js (App Router) + TypeScript + Tailwind.** API client in `lib/api.ts`:
   fetch wrapper that attaches `Authorization: Bearer <token>`, parses the standard error
   envelope (`{ error: { code, message, details } }`), throws typed errors on `code`, and
   transparently retries once after refresh on `401 invalid_token`.
2. **Auth storage:** access token in memory, refresh token in an httpOnly cookie (local path) or
   Cognito SDK session (prod). Access tokens last **15 min**.
3. **Session bootstrap:** on load, resolve the current user via `GET /api/v1/auth/me` (local) or
   Cognito + first API call (prod, ID token only — not the access token).
4. **RBAC hook:** `usePermissions()` derived from `/auth/me` → `roles: [{name, organization_id}]`.
   `organization_id: null` = platform-wide. Gate UI with it, but remember the backend enforces
   everything server-side.
5. **Global error handling:** map `403 permission_denied` → "no access" page, `403
   email_not_verified` / `account_suspended` → account-state screens, `422` → inline field errors
   from `details`.
6. **Routing guard:** redirect unauthenticated users to `/login`; route admins by
   checking for a `platform_admin` role.

## Phase 0 pages

| Page | Route | API | Notes |
|---|---|---|---|
| Login | `/login` | `POST /auth/login` (local) / Cognito hosted UI (prod) | Handle `403 email_not_verified` with a "verify your email" state |
| Signup | `/signup` | `POST /auth/signup` + `POST /auth/verify-email` | **Local only** — signup response contains `verification_token` when `ENV=local`. In prod, signup is Cognito's hosted UI; never call `/auth/signup` |
| Verify email | `/verify-email` | `POST /auth/verify-email` | Local path: reads token from URL/query |
| App shell | `/*` | `GET /auth/me` | Nav + role-based menu items, `/health` ping for status page |

---

## Phase 1 — Profiles, skills, services (core marketplace value)

| Page | Route | API | Key requirements |
|---|---|---|---|
| Onboarding: create profile | `/onboarding/profile` | `POST /profiles`, `GET /profiles/me` | First-stop after login. 409 `profile_exists` → redirect to `/profile/me` |
| My profile (view + edit) | `/profile/me` | `GET /profiles/me`, `PATCH /profiles/{id}` | Editable: `display_name`, `headline`, `job_roles` (≤10), `portfolio_links` (≤20, https URLs), `visibility` (`public`/`private`). Owner fields immutable |
| Public profile | `/profiles/[id]` | `GET /profiles/{id}` | Marketplace view. 403 `permission_denied` for private profiles → show "private profile" |
| Skills editor | `/profile/me/skills` | `GET /skills?category=&page=`, `POST/PATCH/DELETE /profiles/{id}/skills` | Autocomplete against the catalog; free-text creates the skill (name lowercased server-side). Set `proficiency_level` via PATCH. **`claim_type` is server-set — always renders `self_declared` until an admin approves. Don't offer a control for it.** Show a "Get verified" CTA per claim → submits a verification request (Phase 3) |
| Services editor | `/profile/me/services` | `POST/GET/PATCH/DELETE /profiles/{id}/services` | `rate_type`: hourly/fixed/retainer; `rate_amount` > 0; `availability_status` toggle: available/booked/unavailable |

## Phase 2 — Organizations

| Page | Route | API | Key requirements |
|---|---|---|---|
| Create organization | `/orgs/new` | `POST /organizations` | Creator becomes `org_admin`. Optional slug (auto-generated, `[a-z0-9-]`, 409 `slug_taken`) |
| Org profile (view/edit) | `/orgs/[id]` | `GET /organizations/{id}`, `PATCH /organizations/{id}` | Admins only for edit. **Slug is immutable** — don't render an editable field for it |
| Members admin | `/orgs/[id]/members` | `GET/POST/DELETE /organizations/{id}/members` | Invite by **email of an existing user only** (404 `user_not_found` — the backend has no invite-email; copy the org URL for the invitee). Guard the self-removal case: 409 `cannot_remove_self` |
| Invitations inbox | `/invitations` | `GET /organizations/invitations`, `POST /organizations/{id}/members/me/consent` | Poll or refresh on login; Accept → consent (grants org-scoped `professional`, **not** `org_admin`). 409 `not_pending` → refresh list |
| Org skills (aggregate) | `/orgs/[id]/skills` | `GET /organizations/{id}/skills` | Read-only: per-skill `member_count`, `evidenced_count`, `self_declared_count`; sorted by member_count desc. Only consenting active members count |

## Phase 3 — Evidence + verification

**Evidence upload page** — `/profile/me/evidence`

Three flows, one page:

1. **File upload (PDF/PNG/JPEG/WebP only):**
   `POST …/evidence/presign` → **`PUT` the raw bytes to `upload_url` from the browser (direct to
   S3)** → `POST …/evidence` with `{source_type, title, file_key}`. Show upload progress on the
   PUT; `expires_in: 900` — don't cache presign responses.
2. **Link:** `POST …/evidence` with `{source_type: "link", title, url}`.
3. **Testimonial:** same with `source_type: "testimonial"`.

Rules: `file_key` must be a key this profile was issued (mismatch → 422). Rows always start
`verification_status: pending` — **never client-settable**; don't render a control for it.
`download_url` on file rows is short-TTL — fetch on view, never persist. If presign returns
**503 `storage_not_configured`**, hide file upload and show link/testimonial only.

**Verification request flow** (profile owner): button on skill claims ("get verified") and
identity-doc evidence rows → `POST /verification-requests` with
`{target_type: "profile_skill" | "identity_doc", target_id}`. Handle 409 `request_exists`
(already pending) and 409 `already_verified`. Rejected targets can be resubmitted.

**Admin: verification queue** — `/admin/verification`

- Access: role `platform_admin` (permission split exists: `verification:review` to list,
  `verification:approve` to decide).
- Table of `GET /verification-requests?status=pending|all&page=&page_size=` (newest first), with
  detail view that opens linked evidence (presigned download) or the skill claim.
- Approve / Reject buttons → `POST …/{id}/approve` / `POST …/{id}/reject` (optional `{note}`).
  **Decision-once:** on 409 `already_decided`, reload the row instead of retrying.
- Show the side effect so admins know what they're doing: approve claim → `evidenced`;
  approve identity doc → `verified`; reject identity doc → `rejected`.

**Admin: misc** — `/admin/roles` (`GET /roles`, `POST/DELETE /admin/users/{id}/roles` — `rbac:manage`),
`/admin/audit-logs` (`GET /audit-logs?limit=`, read-only, newest first).

---

## Phase 4 — Later / stub pages (no backend yet)

| Screen | Status |
|---|---|
| Opportunities CRM (kanban: new → qualified → proposal_sent → won/lost) | Backend not built |
| Buyer intake form (public) | Backend not built |
| Matches shortlist (score + reasoning) | Backend not built |
| Proposals (LLM draft → review → approve → sent) | Backend not built |
| Engagements + milestones | Backend not built |
| Reviews | Backend not built |
| Search | Backend not built (OpenSearch/pgvector undecided) |
| Profile scores display (`profile_scores`) | Backend not built (Task 2.8) |

Put these behind a "coming soon" route or feature flag now so IA/nav can ship in Phase 1.

---

## Build-order checklist

```
[ ] Phase 0: API client + auth + RBAC hook + error handling + shell pages
[ ] Phase 1: profile CRUD, skills editor, services editor
[ ] Phase 2: org create/edit, members, invitations, aggregate skills
[ ] Phase 3: evidence upload (3 flows), verification request CTA, admin queue
[ ] Phase 4: stubs for future modules
```

## Cross-cutting instructions

1. **snake_case everywhere** — responses and request bodies; no camelCase translation.
2. **Timestamps:** ISO 8601 UTC `Z` — render in user's locale/timezone client-side.
3. **Errors:** branch on `error.code` (stable), not `message`; surface `details` for `422`.
4. **Every request:** `Authorization: Bearer <token>`; send/keep `X-Request-ID` from responses
   and include it in bug reports.
5. **Pagination:** offset style — `{data, total, page, page_size}`; build a reusable
   `<PaginatedTable>`.
6. **Auth prod/local divergence:** one API-client code path with a token source adapter
   (Cognito SDK in prod, backend tokens in local dev). The **ID token** is the bearer in prod.
7. **Never trust the client:** hide what users can't do (RBAC hook), but treat the backend's
   403s as the source of truth.
8. **Live reference:** `GET /docs` on the running backend is the exact source of truth for
   request/response shapes; this plan lists behavior and gotchas, not field-by-field schemas.
