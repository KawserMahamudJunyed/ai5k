# ApplicationFlow.md — AI5K Routes, API & Data Architecture

**Purpose:** the technical companion to [`Userflow.md`](./Userflow.md) for rebuilding the frontend from scratch. Routes → API endpoints → data shapes → state mechanics.

**Stack:** Next.js 14 (App Router) · TypeScript · Tailwind · FastAPI (`backend/`, port 8000) · PostgreSQL · async SQLAlchemy · Alembic · evaluation service `ai-backend/` (port 8001, planned — not committed yet).

---

## 1. Repository & runtime map

```
repo/
├── frontend/                 Next.js 14 App Router (this doc's subject)
├── backend/                  FastAPI — all I/O, persistence, auth. Scores nothing.
│   ├── app/api/v1/           auth, roles, organizations, profiles, skills,
│   │                         evidence, verification, admin, audit_logs
│   ├── app/models/           identity, audit, profile, evidence, verification, profile_check
│   └── alembic/              0001 identity/rbac/audit · 0002 profiles/skills/services
│                             0003 evidence · 0004 verification_requests
├── ai-backend/               Evaluation service (port 8001) — CV parse + LLM scoring.
│                             Documented in README; currently only test.py (a standalone
│                             multi-provider search CLI) is committed. The main backend
│                             calls it; it never touches the backend's DB.
└── fiverr/, upwork/          Written marketplace playbooks (docs, not code).
```

**Ports:** frontend 3000 · backend 8000 · evaluator 8001 (when it exists).

**Evaluator design (contract to build against):** stateless — same request body, same verdict, every time. The backend fetches/caches all external data (GitHub, Upwork via RapidAPI, Fiverr, CV parse via docling), stores raw payloads, then hands the evaluator whatever subset succeeded. A check where Fiverr ran out of quota still returns a result, marked `partial`, built from the sources that worked. `ai-backend/test.py` is **not** part of the API — it's a separate search utility with its own provider keys.

---

## 2. Environments & runtime requirements

| Service | Env file | Key variables |
|---|---|---|
| Frontend | `frontend/.env.local` | `NEXT_PUBLIC_API_BASE_URL` (default `http://localhost:8000/api/v1`) |
| Backend | `backend/.env` | `ENV=local` · `SECRET_KEY` · `DATABASE_URL` · `LLM_BACKEND_URL` (default `http://127.0.0.1:8001`) · `RAPID_API_KEY` · `GITHUB_TOKEN` |
| Evaluator | `ai-backend/.env` | `GEMINI_API_KEY` (or `LLM_PROVIDER=ollama`) · `RAPID_API_KEY` · `GITHUB_TOKEN` |

**Gotchas that cost us real time:**
- `backend/.env` is **untracked** — a fresh clone or an aggressive cleanup silently breaks the backend with Postgres auth errors. Restore from history or recreate before starting.
- **Upwork API quota is ~50 calls/month.** Responses cache per profile under `backend/var/upwork_api_cache/`; set `UPWORK_API_OFFLINE=true` in dev so a cache miss errors instead of burning quota. Fiverr allows 10,000/month.
- **Python 3.12, not 3.14** (`docling` has no 3.14 wheels). Node ≥ 18.17.
- **Dev loop:** `bash scripts/dev-start.sh` starts backend + frontend fully detached (logs in `/tmp/ai5k-api.log`, `/tmp/ai5k-web.log`).

---

## 3. Auth & token lifecycle

**Local dev** (`ENV=local`): signup returns `verification_token` in the response body — the verify-email page auto-activates the account. In production Cognito issues JWTs; the frontend must send the **ID token**, not the access token.

| Method + path | Body | Response | Errors |
|---|---|---|---|
| `POST /auth/signup` | `{email, password, full_name}` | 201 `{id, email, full_name, status, verification_token?}` | `409 email_already_registered` · `422 weak_password` |
| `POST /auth/verify-email` | `{token}` | 200 user | `401 invalid_token` · `404 user_not_found` |
| `POST /auth/login` | `{email, password}` | 200 `{access_token, refresh_token, token_type, expires_in}` | `401 invalid_credentials` · `403 email_not_verified` · `403 account_suspended` |
| `POST /auth/refresh` | `{refresh_token}` | 200 `{access_token, token_type, expires_in}` | `401 invalid_token` |
| `GET /auth/me` | — | 200 `{user, roles: [{name, organization_id}]}` | 401 |

**Frontend mechanics:**
- Tokens in `localStorage` (`ai5k_token`, `ai5k_refresh_token`). Accepted pilot deviation from the httpOnly-cookie plan — revisit before production.
- `fetchWithAuth` wrapper: bearer header + `Content-Type: application/json` on every body-carrying request (missing it causes a 422 "body: Input should be a valid dictionary").
- 401 → **one silent refresh** → retry the original request; if refresh fails, clear tokens and hard-redirect to `/login`.
- Session bootstrap: `AuthProvider` runs `GET /auth/me` on mount. Route guards wait for resolution; a stored token with unresolved user re-triggers bootstrap instead of redirecting (fixes the just-logged-in race).
- `usePermissions().hasRole(name, orgId?)` — org-scoped roles carry `organization_id`; platform roles have `null`.

---

## 4. Route map

### Public (no guard)
| Route | Page | User flow |
|---|---|---|
| `/` | Landing (marketing, claims-policy-compliant copy) | UF-1 |
| `/login` | Login + smart post-login routing | UF-3 |
| `/signup` | Signup → verification-token handoff | UF-2 |
| `/verify-email` | Auto-verify (dev) / token paste (prod) | UF-2 |
| `/onboarding/profile` | Create individual profile (guarded in practice) | UF-4 |

### Authed (wrapped in AppShell = guard + header)
| Route | Page | User flow |
|---|---|---|
| `/profile/me` | Profile view + edit | UF-5 |
| `/profile/me/skills` | Skills editor + get-verified CTA | UF-6a, 6c |
| `/profile/me/services` | Services editor | UF-6 |
| `/profile/me/evidence` | Evidence: 3 upload flows + CTA | UF-6b, 6c |
| `/organizations` | Org hub: my orgs + create | UF-8a |
| `/organizations/[id]` | Org overview + edit (org_admin) | UF-8b |
| `/organizations/[id]/members` | Members admin (org_admin) | UF-8c |
| `/organizations/[id]/skills` | Aggregate skills (members) | UF-8e |
| `/organizations/invitations` | Invitations inbox + consent | UF-8d |
| `/analyze` | Readiness check (mock today → real later) | UF-7 |
| `/profiles/[id]` | Public profile | UF-6d |
| `/admin/verification` | Verification queue (`verification:review`/`approve`) | UF-9a — UI to build |
| `/admin/roles` | Roles admin (`rbac:manage`) | UF-9b — UI to build |
| `/admin/audit-logs` | Audit logs (`audit:read`) | UF-9c — UI to build |

### Redirects & routing rules
| From | To | Rule |
|---|---|---|
| `/builder/[id]` | `/profiles/[id]` | legacy route |
| any guarded route (anonymous) | `/login?next=<current>` | RequireAuth guard |
| post-login | `/profile/me` or `/onboarding/profile` | `?next=` wins → else `GET /profiles/me` 200 → `/profile/me`, 404 → onboarding |

Static routing note: `/organizations/invitations` must be defined so it is not captured by `/organizations/[id]` (Next.js resolves static segments first).

---

## 5. Per-domain API reference (live backend, base `/api/v1`)

### Profiles & skills
| Method + path | Purpose | Errors |
|---|---|---|
| `POST /profiles` | create profile | `409 profile_exists` |
| `GET /profiles/me` | my profile — drives smart routing | `404 profile_not_found` |
| `GET /profiles/{id}` | public profile | `403 permission_denied` ("private") · 404 |
| `PATCH /profiles/{id}` | edit (display_name, headline, job_roles ≤10, portfolio_links ≤20, visibility) | 422 field details |
| `GET /skills?page=&page_size=&category=` | skill catalog `{data,total,page,page_size}` | — |
| `POST /profiles/{id}/skills` | claim via `skill_id` (catalog) or `skill_name` (free-text; server lowercases) + optional `proficiency_level`, `category` | `409 skill_already_claimed` |
| `GET /profiles/{id}/skills` | list my claims | — |
| `PATCH /profiles/{id}/skills/{claim_id}` | **proficiency_level only** | — |
| `DELETE /profiles/{id}/skills/{claim_id}` | unclaim | — |

**Claim shape:** `{id, profile_id, skill_id, skill_name, claim_type: "self_declared"|"evidenced", proficiency_level, created_at}`. `claim_type` is server-asserted — starts `self_declared`, flips to `evidenced` only via verification approval. No UI control for it.

### Services
`POST/GET /profiles/{id}/services`, `PATCH/DELETE /profiles/{id}/services/{id}` — `{title, description, rate_type: hourly|fixed|retainer, rate_amount (>0), availability_status: available|booked|unavailable}`.

### Evidence
| Method + path | Purpose | Errors |
|---|---|---|
| `POST /profiles/{id}/evidence/presign` | `{source_type: document|screenshot|certificate, content_type}` → `{file_key, upload_url, expires_in}` | `503 storage_not_configured` · `422 unsupported_content_type` |
| `PUT <upload_url>` | browser → S3 direct, with `Content-Type` header | non-2xx abort |
| `POST /profiles/{id}/evidence` | create row — file: `{source_type, title, description?, file_key}`; link/testimonial: `{source_type, title, description?, url}` | `422 file_key_required` · `422 invalid_url` · `422 file_key_not_allowed` |
| `GET /profiles/{id}/evidence` | list; file rows carry short-TTL `download_url` only when storage configured | — |
| `DELETE /profiles/{id}/evidence/{id}` | delete | `404 evidence_not_found` |
| `POST /profiles/{id}/evidence/{id}/skill-links` | `{profile_skill_id}` | `409 link_exists` · `404 skill_claim_not_found` |
| `GET/DELETE /profiles/{id}/evidence/{id}/skill-links/{link_id}` | manage links | `404 link_not_found` |

**Evidence shape:** `{id, profile_id, uploader_id, source_type, file_url, download_url, title, description, verification_status: pending|verified|rejected, uploaded_at, skill_links: [{id, evidence_id, profile_skill_id}]}`. `verification_status` is server-asserted (flips only via the queue).

### Verification requests
| Method + path | Body | Errors |
|---|---|---|
| `POST /verification-requests` | `{target_type: "profile_skill"\|"identity_doc", target_id}` → 201 | `409 request_exists` · `409 already_verified` · `404 skill_claim_not_found`/`evidence_not_found` · `403 permission_denied` |
| `GET /verification-requests?status=&page=&page_size=` | queue — **requires `verification:review`** | 403 |
| `POST /verification-requests/{id}/approve` | `{note?}` (≤1000) | `409 already_decided` → reload row |
| `POST /verification-requests/{id}/reject` | `{note?}` | `409 already_decided` |

Approving a `profile_skill` request flips the claim to `evidenced`; approving an `identity_doc` request flips the evidence to `verified`. Decision-once semantics.

### Organizations
| Method + path | Purpose | Errors |
|---|---|---|
| `POST /organizations` | `{name, slug?, description?, website_url?}` — creator becomes `org_admin` | `409 slug_taken` · `422 invalid_slug` |
| `GET /organizations` | my orgs | — |
| `GET /organizations/invitations` | my pending invites `{member_id, organization_id, organization_name, invited_at}` | — |
| `GET /organizations/{id}` | detail (members or `organization:manage`) | `403 permission_denied` · `404 organization_not_found` |
| `PATCH /organizations/{id}` | edit (name, description, website_url, logo_url — **slug immutable**) | `403` |
| `GET /organizations/{id}/members` | list `{id, user{id,email,full_name}, status, consent_given, joined_at}` (org_admin) | `403` |
| `POST /organizations/{id}/members` | invite by email — account must exist; **no email is sent by the backend** | `404 user_not_found` · `409 member_exists` |
| `POST /organizations/{id}/members/me/consent` | member consents → org-scoped **`professional`** role granted (refresh session roles) | `409 not_pending` · `404 member_not_found` |
| `DELETE /organizations/{id}/members/{member_id}` | remove | `409 cannot_remove_self` · `404 member_not_found` |
| `GET /organizations/{id}/skills` | aggregate `{skill_id, name, category, member_count, evidenced_count, self_declared_count}` | `403` |

### Admin & RBAC
| Method + path | Permission |
|---|---|
| `GET /roles` | any authed user |
| `POST /admin/users/{id}/roles` · `DELETE …` | `rbac:manage` — errors `409 role_already_granted` · `404 role_not_found`/`role_not_granted` |
| `GET /audit-logs` | `audit:read` |

---

## 6. Profile-checks pipeline (LIVE — local evaluator + ai-backend web-search tool)

The backend owns all data; `ai-backend/test.py` (`search_everywhere`) is invoked **as a tool** by `backend/app/services/profile_check.py` (loaded by path via `importlib`) to corroborate Upwork/Fiverr public presence. Router: `backend/app/api/v1/profile_checks.py`.

```
POST /profile-checks/cv       multipart file (PDF/DOCX/TXT/MD ≤10 MB) → 200 {cv_token, filename, content_type, size_bytes}
POST /profile-checks          {github_url?, upwork_url?, fiverr_url?, cv_token?, reuse_cv?} (≥1 source) → 202 {id, status, poll_url}
GET  /profile-checks/{id}     owner-scoped poll (404 for others) — UI polls every 2s
GET  /profile-checks/latest   most recent check for the caller (404 if none)
GET  /profile-checks/cv/suggestions
                              {check_id, filename, suggested[], already_claimed[]} — CV keywords diffed
                              against existing claims, ranked by frequency (alpha tie-break); 404 if no CV on file
```

CV handling: files are stored under `backend/storage/cvs/{user_id}/` (gitignored; override with `CV_STORAGE_ROOT`), text extracted server-side (pypdf / docx2txt / utf-8), trimmed to 8 KB in the stored raw. `cv_token` is single-use, 15-minute TTL, minted at upload and consumed by check creation (`404 cv_token_not_found` on reuse/expiry, `403 permission_denied` on foreign token).

**Re-run path (`reuse_cv: true`):** because tokens are single-use, a re-run of a CV-bearing check would otherwise lose its CV (and a CV-only re-run would fail `422 no_sources`). With `reuse_cv=true` and no `cv_token`, the service re-links the latest check's stored CV — only when that file is still on disk (path/ownership guard unchanged). The UI always sends `reuse_cv: true` from its re-run button; a plain empty body without it still fails honestly with `422 no_sources`.

Errors: `422 no_sources` · `422 invalid_url` (details name the bad fields) · `422 unsupported_content_type` / `empty_file` / `file_too_large` (CV) · `409 check_in_progress` (while pending/fetching/evaluating) · `404 check_not_found` · `422 cv_unreadable` (per-source, when extraction fails).

Status walk: `pending → fetching → evaluating → completed | failed` (FastAPI BackgroundTasks; the background entry point opens its own session via `SessionLocal`). GitHub is fetched live (public API, cached 1h per username); Upwork/Fiverr go through the web-search tool; CV is `skipped` until file-upload wiring lands. The tool's verdicts: `websearch_tool_unavailable` (module/`requests`/`ddgs` missing), `websearch_not_configured` (no provider + no keyless fallback), `no_strong_match` (search ran, nothing ≥ threshold 90), `websearch_error`.

**Scoring (max 100):** GitHub footprint 25 · Upwork/Fiverr presence 20 (10 each, strong-match corroboration) · AI5K profile completeness 20 (headline/roles/links/visibility) · skill claims 30 (10 per evidenced up to 20, 2 per self-declared up to 10) · CV 5 (present 2 + recognized-skill keywords 3). **Evidence cap:** no evidenced claim → score held at 30 (`capped=true`, reason surfaced).

**UI obligations (implemented on `/analyze`):**
- Poll until terminal; surface the status walk while polling (Queued → Fetching → Scoring).
- Per-source honesty panel: `ok` / `failed` (human message + `error_code`) / `skipped`.
- `PARTIAL` badge when any source failed or was skipped.
- `EVIDENCE CAP` band next to the score when capped.
- Dimension bars with signals; skill audit (evidenced vs self-declared); re-run affordance (sends `reuse_cv: true`; re-links the stored CV server-side).
- **Score-lift callout** (after a re-run): the previous completed score is snapshotted client-side *only after the new run is accepted* (a failed create can never fake a 0-lift banner); the next verdict shows `▲ +n SINCE YOUR LAST CHECK` / `▼ n` / `— NO CHANGE` in the score band.
- **Claims-since prompt:** the verdict diffs the user's *current* claim count against the check's stored `claims` snapshot — "n skills claimed since this check — re-run to fold them into your score" with an inline re-run button; updates live as chips are claimed; disappears once the check includes them.
- **"From your CV" suggestions panel:** `GET /profile-checks/cv/suggestions` on verdict mount → chips + **Claim all (n)** (sequential claims, spinner on the in-flight chip, "Claiming… n left" progress). Each claim = `GET /profiles/me` → `POST /profiles/{id}/skills`; success moves the chip to "Already claimed"; `409 skill_already_claimed` removes the chip silently; a failed claim is tracked and summarized ("Couldn't claim: …") without blocking the rest of the batch.
- Scheme-less URL input normalized client-side (`type="text"`, not `type="url"` — native URL validation would block scheme-less input before normalization).

---

## 7. Data model (18 models in `app/models/__init__.py`)

| Domain | Models |
|---|---|
| Identity & RBAC | `User, Organization, OrganizationMember, Role, Permission, RolePermission, UserRole, AuditLog` |
| Profile domain | `Profile, Skill, ProfileSkill, Service, Evidence, EvidenceSkillLink, VerificationRequest` |
| Profile checks | `ProfileCheck, ProfileCheckSource, ProfileCheckResult` |

**Key relationships:**
- `User` ↔ `Organization` via `OrganizationMember` — multi-org, consent-gated, org-scoped roles.
- `Profile` (individual- or organization-owned) → `ProfileSkill` claims → linked `Evidence` via `EvidenceSkillLink`.
- `VerificationRequest` — pending → approved/rejected, decision-once; approval mutates the target (claim `evidenced` / evidence `verified`).
- `ProfileCheck` → `ProfileCheckSource` (unique per source) + `ProfileCheckResult` (1:1).

**Status vocabularies (plain varchar, not PG enums):** user `pending|active|suspended` · member `invited|active` · claim `self_declared|evidenced` · evidence `pending|verified|rejected` · check `pending|fetching|evaluating|completed|failed` · source `ok|failed|skipped`.

---

## 8. Frontend architecture to rebuild

```
src/
├── app/                        App Router pages (§4 route map)
├── lib/
│   ├── api.ts                  fetch wrapper: base-URL env, bearer, Content-Type,
│   │                           error-envelope parser, 401 → refresh → retry → redirect
│   ├── api-helpers.ts          typed helpers + interfaces per domain (§5),
│   │                           describeApiError, slugifyOrgName, normalizeUrl
│   ├── auth-context.tsx        AuthProvider (bootstrap via /auth/me), useAuth,
│   │                           usePermissions, RequireAuth guard
│   └── post-login.ts           ?next= → profile-exists check → onboarding vs /profile/me
└── components/
    ├── layout/AppShell.tsx     RequireAuth + AppHeader
    ├── layout/AppHeader.tsx    nav: Profile · Skills · Services · Evidence ·
    │                           Organizations · Analysis  + identity + logout
    └── org/OrgTabNav.tsx       Overview / Members / Skills tabs
```

### State & error mechanics
- **Error envelope:** `{error: {code, message, details}}` — branch on **code**; render 422 `details` per-field; never show raw status codes.
- **Every list has four states:** loading / empty (with the fix-action) / error (with retry) / data.
- **Optimistic updates** only where safe (proficiency PATCH, delete); reconcile on failure.
- **Formats:** snake_case fields, ISO-8601 UTC timestamps, pagination `{data, total, page, page_size}`, `X-Request-ID` echoed for tracing.
- **Server-asserted fields — no UI controls:** `claim_type`, `verification_status`, org `slug` (immutable), profile `owner_type`.
- **503 `storage_not_configured`** → graceful degradation on every file-upload flow.
- **Consent changes roles** → call auth-context `refresh()` after joining an org.
- **URL inputs:** client-side scheme normalization (backend requires `^https?://`) + "https:// is added automatically" hint. Never `type="url"` — native validation silently blocks scheme-less submits (a real bug we hit).
- **RBAC:** gate the UI by role, but treat an API 403 as truth — render a "no access" state, never a crash.
- **Never wire UI to endpoints that don't exist** — stub or hide instead.

---

## 9. What does NOT exist yet — build last or stub

Buyer marketplace & search (L8) · contracts/escrow/payments (L10) · reviews & reputation · team/pod builder · AI agent catalog (L11) · opportunity intelligence (L6) · proposal assistant (L7) · org capability score (PRD §11) · credential badges (OB 3.0, PRD §23) · full CV→LLM parsing (the current CV scoring is keyword/presence-based) · the external LLM evaluator (grounded claims / rewritten title & overview — the current local evaluator scores, it doesn't generate).

## 10. Build-order recommendation (for the rebuild)

1. **Foundation:** `api.ts` → `auth-context` (+ guards) → `AppShell` → login/signup/verify-email → post-login routing.
2. **Profile domain:** onboarding → `/profile/me` → skills → services → evidence (all LIVE APIs).
3. **Organizations:** hub/create → overview → members → invitations → aggregate skills.
4. **Public surface:** `/profiles/[id]`, landing page.
5. **Admin surface:** verification queue → roles → audit logs (APIs are live).
6. **Analysis:** `/analyze` is live (§6) — submit form, 2s polling, verdict screen.
7. **Planned-layer stubs:** opportunities, proposals, marketplace — visible but clearly marked "coming soon".
