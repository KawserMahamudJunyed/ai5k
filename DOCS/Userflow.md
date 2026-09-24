# Userflow.md — AI5K Platform User Flows

**Purpose:** the single source of truth for rebuilding the AI5K frontend from scratch.
Every screen, every step, every state a user can hit.

**Companion:** [`ApplicationFlow.md`](./ApplicationFlow.md) — routes, API contracts, data models, architecture.
**Strategy source:** [`AI5K-Master-Strategy-PRD.md`](./AI5K-Master-Strategy-PRD.md).

---

## 0. How to read this document

| Marker | Meaning |
|---|---|
| ✅ **LIVE** | Backend endpoints exist today — build this now, works end-to-end |
| 🔜 **PLANNED** | Defined in the PRD, no backend yet — design the screens, build last or stub |
| 🧪 **PARTIAL** | Some pieces live (models/API), pipeline incomplete |

Product layers referenced as **L1–L12** map to PRD §9 (Product Layers).

### The actors

| Actor | Who | Primary goal | Auth |
|---|---|---|---|
| **Individual professional** | Amara (BuildFest builder), Rahim (working freelancer) | Verified identity, evidence-backed skills, path to $5K/mo | Email + password |
| **Org admin** | Nova Solutions (agency) | Aggregate capability profile, member management, enterprise deals | Email + password + `org_admin` role |
| **Buyer** | Sarah (startup CTO), David (enterprise procurement) | Find and engage verified AI capability fast | Not implemented yet (P-L8) |
| **Platform admin** | Karim (AI5K trust & quality) | Review verification queue, manage roles, audit trail | Email + password + `platform_admin` role |

---

## 1. First-run discovery (public, unauthenticated) — 🔜 mostly PLANNED

**Goal:** land a visitor (professional or buyer) and route them to the right door.

1. Visitor opens `/` — marketing landing: tagline *"Build AI. Prove capability. Earn globally."*, what AI5K is (curated capability network, **not** an open marketplace), who it's for.
2. Two doors:
   - **"Join as a professional"** → `/signup` (UF-2)
   - **"Hire verified AI talent"** → buyer flow (UF-13, 🔜 — button renders but points to a waitlist placeholder until L8 exists)
3. Public pages planned: how verification works (the evidence ladder), for-organizations pitch, pricing transparency page (PRD §6 fee table).

> Claims policy (PRD §3): the UI must **never** promise "$5,000/month". Always the qualified phrasing: *"designed to help qualified, verified, market-ready professionals pursue at least USD 5,000/month."* No income guarantees anywhere.

---

## 2. Signup & email verification — ✅ LIVE

**Entry:** `/signup` · **Layer:** L1 Identity

| Step | User action | System response |
|---|---|---|
| 1 | Enters full name, email, password (8+ chars) | `POST /auth/signup` → 201 |
| 2 | — | Backend returns a `verification_token` **only in local dev**; production sends email. Frontend captures it and hands off to `/verify-email?token=…` |
| 3 | Lands on `/verify-email` | Page auto-submits `POST /auth/verify-email {token}` |
| 4 | Sees "Email verified!" | Auto-redirect to `/login` after ~1.5s |
| 5 | Logs in | → UF-3 |

**Edge states:** email already registered (`409 email_already_registered`), weak password (`422 weak_password`), invalid/expired token (`401 invalid_token`), user-not-found for token (`404 user_not_found`).

---

## 3. Login & session — ✅ LIVE

**Entry:** `/login`

1. Email + password → `POST /auth/login` → access + refresh tokens stored client-side.
2. **Smart routing after login:**
   - `GET /profiles/me` → **404** (no profile) → `/onboarding/profile` (new user, UF-4)
   - `GET /profiles/me` → **200** → `/profile/me` (returning user, UF-5)
   - A `?next=` param (set by route guards) always wins.
3. Session rules:
   - Every authed page is wrapped in a route guard; anonymous visitors are bounced to `/login?next=<current>`.
   - On app load the session is resolved via `GET /auth/me` (user + roles). A stored token with unresolved user re-triggers bootstrap (covers the just-logged-in race).
   - On 401 mid-session: one silent refresh attempt (`POST /auth/refresh`), then clear tokens → `/login`.
   - **Log out** lives in the app header on every authed page.

**Edge states:** `403 email_not_verified` (pending), `403 account_suspended` (suspended), `401 invalid_credentials`.

---

## 4. Individual onboarding → profile creation — ✅ LIVE

**Entry:** `/onboarding/profile` · **Layer:** L1 + L2 (identity → individual profile)

| Step | User action | Notes |
|---|---|---|
| 1 | Basic info: display name (required), headline | Step wizard UI |
| 2 | Portfolio & links: GitHub URL, Upwork profile URL | URLs are **scheme-normalized client-side** (`github.com/x` → `https://github.com/x`); backend requires `^https?://` |
| 3 | Optionally upload CV (PDF) | 3-step file flow: `POST /profiles/{id}/evidence/presign` → `PUT` to S3 → `POST …/evidence`. If storage isn't configured the backend returns `503 storage_not_configured` — UI degrades gracefully and continues without the CV |
| 4 | Save → `POST /profiles` (or `PATCH` when profile exists) | Redirects to the Analysis page (UF-7) |

**Server-asserted fields the UI must not offer controls for:** `claim_type`, `verification_status`, `slug`, profile `owner_type`.

---

## 5. My profile — view & edit — ✅ LIVE

**Entry:** `/profile/me` · **Layer:** L2

- Editable: display name, headline, job roles (≤10, comma input), portfolio links (label + URL, ≤20), visibility (`private` / `public`).
- `PATCH /profiles/{id}`; success confirmation inline; 422 field errors rendered per-field.
- Link out: "View public page" → `/profiles/{id}` (UF-6 public view).
- Header shows signed-in email; app nav gives access to Skills / Services / Evidence / Organizations / Analysis.

---

## 6. Skills, evidence & getting verified — ✅ LIVE

**Entry:** `/profile/me/skills`, `/profile/me/evidence` · **Layer:** L2 + L3 (capability graph) + verification (P-L4)

### 6a. Claim skills
1. Search box with catalog autocomplete (`GET /skills`); suggestion chips; free-text creates a new skill (server lowercases).
2. Optional proficiency: beginner / intermediate / advanced / expert.
3. `POST /profiles/{id}/skills` → claim appears with type label **"Self-declared"**.
4. Optimistic updates for proficiency `PATCH` (proficiency is the only editable field) and delete.

### 6b. Add evidence
Three flows on `/profile/me/evidence`:
- **Link** — title + URL (scheme-normalized). No storage needed.
- **Testimonial** — title + URL (e.g. client reference). No storage needed.
- **File** — document/certificate/screenshot; presign → PUT → create (503-degradable, see UF-4).

Each row shows: source type, verification status chip (`pending`/`verified`/`rejected`), download link for files, delete, and a **"Supports:"** section listing linked skill claims (link/unlink inline; `409 link_exists` handled).

### 6c. Get verified (the trust loop)
- **On an evidence row:** "Get verified" → `POST /verification-requests {target_type: "identity_doc", target_id}` → row shows **Requested** chip. Duplicate → `409 request_exists` → "already pending" message.
- **On a skill claim (skills page):** same CTA with `target_type: "profile_skill"` → notice "Verification requested for 'X' — an admin will review it." → **Requested** chip.
- **What happens next (platform side):** a reviewer approves/rejects in the queue (UF-11). Approval flips the skill claim to **evidenced** and the evidence row to **verified** — the user's row then shows the elevated tier. This is PRD's core loop: *evidence over assertion*.

### 6d. Public profile
- `/profiles/[id]` renders real data: name, headline, job-role chips, portfolio links, skills (with claim type), services.
- States: `403 permission_denied` → "Private profile", `404` → "Not found".
- Legacy `/builder/[id]` redirects here.

---

## 7. Profile readiness check ("Analysis") — ✅ LIVE (local evaluator + ai-backend web-search tool)

**Entry:** `/analyze` · **Layer:** L9 Talent Readiness + PRD §10 scoring

> **Status:** LIVE. `POST /profile-checks` (202) runs a background pipeline owned by the backend: GitHub is fetched via the public API (cached 1h, 60 req/h unauthenticated budget); Upwork/Fiverr public presence is corroborated by invoking `ai-backend/test.py` (`search_everywhere`) as a **tool** — the backend stores all raw payloads in `profile_check_sources` and scores everything itself. **CV upload is live:** `POST /profile-checks/cv` (multipart, PDF/DOCX/TXT/MD ≤10 MB) stores the file, returns a single-use 15-minute `cv_token`; attaching it to the check scores the extracted text (presence 2 + recognized-skill keywords 3, max 5). With no search-provider API keys, the keyless DuckDuckGo fallback (`ddgs`) runs; without it, that source fails with `websearch_not_configured`. **CV skill suggestions are live:** `GET /profile-checks/cv/suggestions` diffs the CV's detected keywords against existing claims; the verdict screen offers one-click chips plus **Claim all**.

**User story:** Rahim submits his four public sources and gets a readiness verdict with ranked gaps and a rewritten profile.

| Step | User action | System |
|---|---|---|
| 1 | Uploads a CV (PDF/DOCX/TXT/MD) and/or enters GitHub / Upwork / Fiverr URLs (at least one source) | CV: `POST /profile-checks/cv` → `{cv_token}` → attach to the check; URLs: scheme-less input normalized client-side, unparseable → `422 invalid_url` |
| 2 | Progress state — **poll** `GET /profile-checks/{id}` (UI polls every 2s) | Status walks `pending → fetching → evaluating → completed`; a second submit while in flight → `409 check_in_progress` |
| 3 | Verdict screen | See below |
| 4 | Optionally claims the suggested skills (chip-by-chip or **Claim all**) | Suggestions come from the latest CV-bearing check; each claim is a normal `POST /profiles/{id}/skills` — claimed chips move to "Already claimed"; `409 skill_already_claimed` is handled silently |
| 5 | Re-runs after making changes (new claims, evidence, profile edits) | Re-run button sends `reuse_cv: true` so the stored CV is re-linked server-side (tokens are single-use); the next verdict shows the **score lift** — `▲ +n since your last check` / `▼ n` / `— NO CHANGE` — in the score band. While claims are outstanding the verdict prompts: "n skills claimed since this check — re-run to fold them into your score" |

**Verdict screen shows (all implemented on `/analyze`):**
- **Readiness score 0–95** across four dimensions — GitHub footprint 25, Upwork/Fiverr presence 20 (via the web-search tool), AI5K profile completeness 20, skill claims 30 — with per-dimension bars and signal lists.
- **Evidence cap:** with no admin-verified ("evidenced") skill claim the score is **held at 30** and the reason is surfaced in the score band (the #1 "why is my score 30" question).
- **Per-source honesty:** each of CV / GitHub / Upwork / Fiverr shown as `ok` (payload fetched), `failed` (human message + machine `error_code` — e.g. `github_rate_limited`, `no_strong_match`, `websearch_not_configured`), or `skipped` (not supplied). A `PARTIAL` badge appears when any source failed/skipped — a Fiverr timeout must never look like an empty profile.
- **Skill audit:** evidenced vs self-declared counts with the CTA to claim/verify more.
- **"From your CV" suggestions panel** (when a CV was checked): detected skills not yet claimed, ranked by frequency in the CV text — chips (`+ pytorch`) and a **Claim all (n)** button with live "Claiming… n left" progress; per-claim failures never block the batch and are summarized at the end. Hidden entirely when there is no CV or nothing left to suggest.
- **Re-run** affordance (server records `attempts`; `max_attempts` guard is enforced per check) — sends `reuse_cv: true` so a CV-bearing check keeps its CV across re-runs.
- **Score-lift callout** after a re-run: `▲ +n SINCE YOUR LAST CHECK` / `▼ n` / `— NO CHANGE` in the score band (baseline is the previous completed score, snapshotted only once the new run is accepted).
- **Claims-since prompt** when the check predates recent claims: "n skills claimed since this check — re-run to fold them into your score" with an inline re-run button; live-updates as CV chips are claimed.
- Error states: `409 check_in_progress`, `422 no_sources` / `invalid_url`, `404 check_not_found` (someone else's check is 404, not 403).

---

## 8. Organizations — create & manage — ✅ LIVE

**Entry:** `/organizations` · **Layer:** L2 (org identity)

### 8a. Create (org admin born here)
1. Hub page lists my orgs + create form.
2. Name (required) + **slug** (auto-suggested from name, editable, pattern `[a-z0-9-]`, **immutable after create** — labeled "permanent URL"), description, website.
3. `POST /organizations` → creator is onboarded as **`org_admin`** automatically → redirect to `/organizations/{id}`.
4. Errors: `409 slug_taken`, `422 invalid_slug`.

### 8b. Overview & edit
- `/organizations/{id}` — description, website, status, created date. **Edit** visible only to `org_admin` (org-scoped) or `platform_admin` — the RBAC hook reads roles from `/auth/me`.
- Non-member → `403` → "Private organization" state; bad id → 404 state.

### 8c. Members admin
- `/organizations/{id}/members` — list with **consent status** per member ("Consented — skills appear in aggregate view" / "Awaiting consent").
- **Invite by email** (`POST …/members`): the invitee **must already have an AI5K account**; **no email is sent by the backend** — the UI explicitly tells the admin to share the site URL. Error `404 user_not_found` → "no account with that email yet".
- **Remove** (`DELETE …/members/{id}`): `409 cannot_remove_self` → "ask another org admin".

### 8d. Invitations & consent (the member side)
- `/organizations/invitations` — inbox listing pending org invites.
- **Join** = consent: `POST /organizations/{id}/members/me/consent`.
- The consent screen states plainly what's shared: aggregate skill counts (proficiency + evidence counts) — nothing else.
- Consent grants the member org-scoped **`professional`** role — *not* `org_admin`. Roles refresh in the session after joining.
- `409 not_pending` → invitation already handled → reload list.
- The org hub shows a pending-invitations badge so members discover the inbox.

### 8e. Aggregate skills
- `/organizations/{id}/skills` — per skill: member count, **evidenced count**, self-declared count (bars). Members only (`403` otherwise).
- 🔜 PRD §11 full **Org Capability Score** (evidence-weighted depth × delivery quality × capacity × coverage × industry × governance) and the capability dashboard (team composition, utilization, backup coverage, commercial metrics) — design now, compute later.

> Membership model (PRD §11): an individual may belong to **multiple orgs**, consenting to each; skills are **not double-counted**; exiting members keep contribution history but leave the capability score.

---

## 9. Verification queue, roles & audit (platform admin) — ✅ API, UI to build

**Entry:** admin section (`verification:review` / `verification:approve` / `rbac:manage` / `audit:read` permissions)

### 9a. Queue (Karim's daily work)
1. `GET /verification-requests?status=pending` → queue rows: target type (skill claim / identity-doc evidence), requestor, created, link to target detail.
2. Open a request: see the evidence + the linked skill claim side by side.
3. **Approve** or **Reject** with optional note → `POST …/{id}/approve|reject`.
4. Decision-once semantics: a second decision returns `409 already_decided` → reload the row. Approving flips the skill claim to `evidenced` / evidence to `verified` — the requester sees it instantly on their next load.
5. `404 verification_request_not_found` if gone.

### 9b. Roles admin
- `GET /roles` (catalog), grant/revoke via `POST/DELETE /admin/users/{id}/roles` — `rbac:manage` only. `409 role_already_granted`, `404 role_not_found` / `role_not_granted`.

### 9c. Audit logs
- `GET /audit-logs` — `audit:read` only. Filterable table; entries carry actor, action, entity, IP, timestamp (`X-Request-ID` in every response for tracing).

---

## 10. Buyer discovery & engagement — 🔜 PLANNED (P-L8, L10)

**Goal (Sarah / David):** find, verify and engage proven AI capability **fast** — with evidence to make a confident decision.

1. **Search & filter** (`/search`) — by skill (evidenced first), industry vertical, role, availability, rate band, org vs individual. 🔜 search backend (OpenSearch/pgvector) not built.
2. **Compare shortlist** — side-by-side evidence tiers, capability scores, reviews.
3. **Request / engage** — RFP or direct hire → contracting (e-sign), milestones, escrow, payouts (Payoneer-first for BD; PRD §8).
4. **Delivery & reviews** — engagement workspace, milestone tracking, AI5K-verified reviews on completion; external reviews only with "Imported from X" disclosure (PRD §23).

> Not started anywhere in the stack. The current frontend correctly treats these as stubs; do **not** wire UI to nonexistent endpoints.

---

## 11. Opportunity intelligence & proposals — 🔜 PLANNED (P-L6, L7)

**Goal (Rahim):** stop bid-grinding blind; get scored opportunities and grounded proposal drafts.

1. Opportunities collected from Upwork/Fiverr/Freelancer/boards/RFPs (multi-source, deduped) — 🔜 no backend.
2. **AI5K Opportunity Score 0–100** (skill fit 25, industry 15, budget 15, delivery 10, availability 10, buyer quality 10, strategic 5, competition 5, platform risk 5) — recommend pursuing ≥65.
3. **Proposal Assistant** — draft + price recommendation + compliance check. Automation levels L0–L5 (PRD §19); **the human always approves; submissions are never automated without an officially authorized API**. The UI must make the approval gate unmissable.

---

## 12. Productized services, agents & earnings progression — 🔜 PLANNED (L5, L11, L9)

- **Services catalog:** fixed-scope, fixed-price offerings (PRD §20 ladder). Today's ✅ `services` CRUD (title, hourly/fixed/retainer rate, availability) is the seed of this.
- **Agent & asset marketplace:** list/license/deploy reusable AI agents (L11, post-MVP).
- **Talent tiers T0–T7** (PRD §22): the profile should always show the user's current tier and the **next transition requirement** (e.g. T2 → T3: "verified skills, first paying client"). Earnings framework content ($5K pathways, rate calculators per PRD §21) belongs on a dedicated progression page.

---

## 13. Cross-cutting UX rules (apply to every screen)

1. **Evidence-tier visual language.** Verification level is the strongest visual signal everywhere a skill/evidence appears (colors/badges escalate with tier — see PRD §10 ladder T1–T7). Self-declared must always be visually distinct from evidenced/verified.
2. **Error handling.** Backend errors are `{error: {code, message, details}}` — branch on **code**, render 422 `details` per-field. Never show raw status codes to users.
3. **Tracing.** Send/echo `X-Request-ID`; show it in support contexts.
4. **Formats.** snake_case JSON fields, ISO-8601 UTC timestamps, paginated lists as `{data, total, page, page_size}`.
5. **Every list has all four states:** loading (skeleton/spinner), empty (with the action that fixes it), error (with retry), populated.
6. **Optimistic updates** only where the API is idempotent-ish (proficiency, delete); always reconcile on failure.
7. **No income guarantees, ever** (claims policy). Tier language: "pursue", "target", "designed to help".
8. **Client-side URL normalization** (`^https?://` requirement) on every URL input, with the "https:// is added automatically" hint.
9. **RBAC-gated UI:** hide what a role can't do (org edit → org_admin; queue → verification:review) but treat the API 403 as the source of truth — never as an error state to crash on.
10. **Local-dev affordances:** signup's dev-only verification token is handled automatically; file-upload 503 degrades gracefully everywhere.
