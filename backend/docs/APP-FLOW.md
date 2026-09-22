# Application Flow — AI5K Frontend

**Date:** 2026-09-22 · **Status:** matches implementation (browser-verified)
**Companion:** `USER-FLOWS.md` (step-by-step narratives), `frontend/REVIEW.md` (gap audit)

Route map, data dependencies, and per-screen behavior for the Next.js App Router frontend
(`frontend/src`), wired to the FastAPI backend (`/api/v1`).

---

## 1. Route map

```
Public (no guard)
  /                      Landing (marketing)
  /login                 Login            → smart redirect after auth
  /signup                Signup           → /verify-email
  /verify-email          Activation       → /login (local: auto-activate)

Authed (AppShell: RequireAuth guard + AppHeader)
  /profile/me            My profile (view + edit)
  /profile/me/skills     Skills editor
  /profile/me/services   Services editor
  /profiles/[id]         Public profile (any authed user)
  /onboarding/profile    First-profile form (authed, pre-profile)
  /analyze               Mock analysis + next-step links (Phase 4 stub)

Redirects
  /builder/[id]  ──►  /profiles/[id]      (legacy dummy page retired)
```

## 2. Data layer (single direction of truth)

```
lib/api.ts          fetchApi / fetchWithAuth · token storage · 401→refresh→retry
                    ApiError{status, code, details} parsed from the backend envelope
lib/api-helpers.ts  typed domain calls: auth, profiles, skills, services, evidence
lib/auth-context.tsx  AuthProvider (GET /auth/me bootstrap) · useAuth ·
                      usePermissions (hasRole/isPlatformAdmin) · RequireAuth
lib/post-login.ts   smart destination: profile? → /profile/me : /onboarding/profile
```

Rules: snake_case bodies; errors branch on `code`; 422 `details` render field-by-field;
`X-Request-ID` echoed for bug reports.

## 3. Screen behavior

| Screen | Reads | Writes | Error states |
|---|---|---|---|
| `/login` | `?next=` | `POST /auth/login` | `invalid_credentials`, `email_not_verified`, `account_suspended` |
| `/signup` | — | `POST /auth/signup` | `email_already_registered`, weak password, 422 fields |
| `/verify-email` | stashed token (`sessionStorage`) | `POST /auth/verify-email` | `invalid_token` → paste-token form |
| `/onboarding/profile` | `GET /profiles/me` (prefill; 404 = first run) | `POST`/`PATCH /profiles`, evidence trio | 422 field map, 503 `storage_not_configured` → skip CV |
| `/profile/me` | profile, user email | `PATCH /profiles/{id}` | 422 field map, no-profile CTA |
| `/profile/me/skills` | `GET /skills`, `GET …/skills` | `POST/PATCH/DELETE …/skills` | `skill_already_claimed`, optimistic rollback |
| `/profile/me/services` | `GET …/services` | `POST/PATCH/DELETE …/services` | 422 field map, optimistic rollback |
| `/profiles/[id]` | `GET /profiles/{id}` | — | `profile_not_found`, `permission_denied` (private) |

## 4. Cross-cutting mechanics

- **Bootstrap:** `AuthProvider` runs once per load; guard treats token-present-but-unresolved
  as "checking" (spinner) — never an instant redirect (just-logged-in race fix).
- **Optimistic updates** on skills/services with silent refetch rollback.
- **URL normalization** (`github.com/x` → `https://github.com/x`) before any portfolio submit.
- **Native `type="url"` validation is avoided** (blocks scheme-less input before JS runs).
- **`claim_type` / `verification_status`** are never client-settable — rendered read-only.

## 5. Deliberate gaps (not built yet)

Evidence management page, verification-request CTA, admin queue/roles/audit UI, organizations
suite, real analysis. Backend endpoints for all of these already exist — see `REVIEW.md` §3–4
and the P2/P3 priority list.
