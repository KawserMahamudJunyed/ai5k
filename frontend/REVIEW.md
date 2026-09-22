# Frontend Gap Report — Delivered Work vs `FRONTEND-BUILD-PLAN.md`

**Date:** 2026-09-22 · **Reviewed by:** backend team · **Verdict:** ~25% of plan complete — auth + profile creation only

This review audits the delivered frontend against `backend/docs/FRONTEND-BUILD-PLAN.md`.
It also documents **integration bugs we found and already fixed** (Section 6) so they don't get
re-introduced, and the verified-working parts you should build on (Section 7).

**What "done" requires:** page exists, calls the real backend endpoints listed, handles the
documented error codes, and works end-to-end (verified in a browser).

---

## 1. Phase 0 — App skeleton (5 of 9 ❌)

| # | Requirement | Status | Detail |
|---|---|---|---|
| 0.1 | API client with refresh-retry + error envelope | ✅ | `lib/api.ts` — browser-verified; fixed during review (§6.3) |
| 0.2 | Env config for API base URL | ✅ | `.env.local.example` (`NEXT_PUBLIC_API_BASE_URL`) |
| 0.3 | Login page | ✅ | handles `email_not_verified` / `account_suspended` |
| 0.4 | Signup page | ✅ | `full_name` + local verification-token handoff |
| 0.5 | Verify-email page | ✅ | auto-activate in local env; fixed during review (§6.1) |
| 0.6 | **Session bootstrap via `GET /auth/me`** | ❌ | `getMe()` exists in `api-helpers.ts` but **no page/hook calls it** |
| 0.7 | **`usePermissions()` RBAC hook** | ❌ | missing entirely |
| 0.8 | **Route guards** | ❌ | `/onboarding/profile` is reachable logged-out; API returns 401 → silent token-clear only |
| 0.9 | Global 403 / account-state / shared error UI | ❌ | per-page only |
| 0.10 | Authed app shell with role-based nav | ❌ | nav is still the landing-page marketing nav |

**Do first:** 0.6–0.8. Every later phase depends on knowing who's logged in. Suggested shape:

```ts
// src/lib/auth-context.tsx
"use client";
const AuthContext = createContext<{ user: UserRead | null; roles: MeResponse["roles"]; loading: boolean } | null>(null);
// Provider: on mount → getMe(); 404-safe; expose hasRole(name, orgId?) + hasPermission via GET /roles
// Guard component: if (!loading && !user) redirect("/login")
```

## 2. Phase 1 — Profiles, skills, services (1.5 of 5)

| # | Page / route | Endpoints | Status | Detail |
|---|---|---|---|---|
| 1.1 | Onboarding create profile | `POST /profiles`, `GET /profiles/me` | ✅ | browser-e2e verified; URLs auto-schemed client-side |
| 1.2 | **My profile view+edit `/profile/me`** | `GET /profiles/me`, `PATCH /profiles/{id}` | ❌ | only path to edit is re-submitting the onboarding form |
| 1.3 | **Public profile `/profiles/[id]`** | `GET /profiles/{id}` | ❌ | `/builder/[id]` renders hardcoded `DUMMY_BUILDER` — no API call |
| 1.4 | **Skills editor `/profile/me/skills`** | `GET /skills`, `POST/PATCH/DELETE /profiles/{id}/skills` | ❌ | no skills calls anywhere in `src/` |
| 1.5 | **Services editor `/profile/me/services`** | `POST/GET/PATCH/DELETE /profiles/{id}/services` | ❌ | none |

Notes for 1.2/1.3:
- Reuse the onboarding form component (make it create **or** update: `PATCH` when `/profiles/me` returns 200, `POST` on 404 `profile_not_found`).
- Public profile: keep the existing dark design system; replace `DUMMY_BUILDER` with the fetch; `403 permission_denied` → "private profile" state; 404 → "profile not found".
- Skills editor gotchas: `claim_type` is **server-set** (`self_declared`) — no control for it; PATCH allows only `proficiency_level`; skill create-or-get by name (server lowercases).
- Services gotchas: `rate_type` hourly/fixed/retainer; `rate_amount > 0`; `availability_status` toggle.

## 3. Phase 2 — Organizations (0 of 5) ❌

No `/organizations` endpoint is referenced anywhere in `src/`. All 5 pages missing:

| # | Page | Endpoints | Key error codes to handle |
|---|---| FE-shared |---|
| 2.1 | Create org `/orgs/new` | `POST /organizations` | 409 `slug_taken`, 422 `invalid_slug` |
| 2.2 | Org profile `/orgs/[id]` | `GET/PATCH /organizations/{id}` | 403 `permission_denied` |
| 2.3 | Members admin `/orgs/[id]/members` | `GET/POST/DELETE /organizations/{id}/members` | 404 `user_not_found` (no backend email — surface "share org URL" hint), 409 `member_exists`, **409 `cannot_remove_self`** |
| 2.4 | Invitations inbox `/invitations` | `GET /organizations/invitations`, `POST /organizations/{id}/members/me/consent` | 409 `not_pending` |
| 2.5 | Org aggregate skills `/orgs/[id]/skills` | `GET /organizations/{id}/skills` | — |

Reminder: consent grants org-scoped **`professional`**, not `org_admin`. Slug is immutable.

## 4. Phase 3 — Evidence + verification (1 of 6, partial)

| # | Page / feature | Endpoints | Status | Detail |
|---|---|---|---|---|
| 3.1 | CV upload inside onboarding | presign → PUT → `POST …/evidence` | ✅ | graceful 503 `storage_not_configured` path works |
| 3.2 | **Evidence page `/profile/me/evidence`** | full evidence API | ❌ | needs file (PDF/PNG/JPEG/WebP), link, testimonial flows |
| 3.3 | **"Get verified" CTA** | `POST /verification-requests` | ❌ | on skill claims + identity-doc evidence rows |
| 3.4 | **Admin verification queue `/admin/verification`** | `GET /verification-requests`, approve/reject | ❌ | decision-once: 409 `already_decided` → reload row |
| 3.5 | **Admin roles `/admin/roles`** | `GET /roles`, `POST/DELETE /admin/users/{id}/roles` | ❌ | `rbac:manage` only |
| 3.6 | **Admin audit logs `/admin/audit-logs`** | `GET /audit-logs` | ❌ | `audit:read` only |

## 5. Priority order & effort

```
P0  0.6–0.8 auth context + guards        (~0.5d) — unblocks everything
P0  1.2 my profile page                  (~1d)
P0  1.3 public profile real data         (~0.5d)
P1  1.4 skills editor                    (~1.5d)
P1  1.5 services editor                  (~1d)
P1  3.2 evidence page                    (~1.5d)
P1  3.3 get-verified CTA                 (~0.5d)
P2  2.1–2.5 organizations                (~3d)
P2  3.4–3.6 admin surface                (~2d)
P3  0.9–0.10 shared error UI + app shell (~1d, can parallel P1)
```

## 6. Integration bugs found during review — FIXED, do not regress

1. **verify-email side effect** — auto-activate ran in a render-phase `useState`; moved to `useEffect`.
2. **Native URL validation blocked submit** — `type="url"` silently rejected scheme-less input; now `type="text" inputMode="url"` + client-side scheme normalization (backend requires `^https?://`).
3. **Missing Content-Type on `fetchWithAuth`** — FastAPI 422 `body: Input should be a valid dictionary`; fixed centrally in `api.ts`.
4. **Error envelope handling** — pages now branch on `error.code`, 422 `details` are rendered field-by-field (this is what made bug 3 a 2-minute diagnosis).

## 7. Verified working (build on these)

- `lib/api.ts` / `lib/api-helpers.ts` — typed helpers for auth + profiles + evidence; refresh-retry on 401
- Auth flow e2e: signup → auto-verify → login → token storage → onboarding create profile → `/analyze`
- Onboarding page with graceful CV-upload degradation (503 `storage_not_configured`)
- Dark design system, error/404 boundaries, framer-motion polish — genuinely good, keep it

## 8. Known deviations from the plan (accepted for pilot, note in README)

- Tokens in `localStorage` (plan said memory + httpOnly cookie). XSS-readable — revisit before prod.
- `/analyze` mock report — matches plan Phase 4 (backend doesn't exist yet).
