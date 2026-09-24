# User Flows — AI5K Frontend

**Date:** 2026-09-22 · **Status:** implemented and browser-verified
**Companion:** `APP-FLOW.md` (screens/routes/behavior per page)

The five core flows a user can complete today against the live backend. Every flow below was
executed end-to-end in a real browser on the running stack.

---

## Flow 1 — First visit → activated account (local dev)

```
/signup ──► /verify-email ──► /login
```

| Step | What happens | Success signal |
|---|---|---|
| 1. `/signup` | Full name + email + password (strength meter). On submit → `POST /auth/signup` | 201; account created `pending` |
| 2. Token handoff | Backend (`ENV=local`) returns `verification_token`; signup page stashes it in `sessionStorage` | — |
| 3. `/verify-email` | `useEffect` reads the stashed token → `POST /auth/verify-email` → "Email verified!" → routes to `/login` after 1.5s | account `active` |
| 4. Manual path | No stashed token → paste-token form shown (`401 invalid_token` = expired/invalid) | — |

## Flow 2 — New user login → onboarding → first save

```
/login ──► /onboarding/profile ──► /analyze
```

| Step | What happens | Success signal |
|---|---|---|
| 1. Login | `POST /auth/login` → access + refresh tokens stored; **smart routing**: no profile yet → onboarding | lands `/onboarding/profile` |
| 2. Onboarding form | Display name (required), headline, GitHub/Upwork links (auto `https://`), optional PDF CV | — |
| 3. Save | `POST /profiles` (or `PATCH` if profile exists) → then evidence flow if a CV was chosen (presign → PUT → create; graceful on 503 `storage_not_configured`) | 201/200 |
| 4. `/analyze` | Mock capability report (Phase 4 stub) with "Keep going" links to skills/services/profile | — |

## Flow 3 — Returning user login

```
/login ──► /profile/me
```

Smart routing resolves profile existence first: `GET /profiles/me` 200 → `/profile/me`;
404 → onboarding. `?next=` overrides both when the user was bounced by a route guard.

## Flow 4 — Profile, skills & services management (nav shell)

```
AppHeader: Profile · Skills · Services · Analysis        [avatar] Log out
```

- **Profile** `/profile/me` — prefilled form; job roles ≤10, portfolio links ≤20, visibility
  (`private`/`public`); "Profile saved." confirmation; link to public page.
- **Skills** `/profile/me/skills` — catalog autocomplete chips or free-text create (server
  lowercases); proficiency dropdown (optimistic PATCH); remove; duplicate → friendly message.
  `claim_type` renders read-only "Self-declared — verify it with evidence" (server-asserted).
- **Services** `/profile/me/services` — create (title, rate type, amount > 0, description);
  color-coded availability toggle; remove; `$85/h` style rate display.
- **Public profile** `/profiles/[id]` — real data; states for not-found and private (403).

## Flow 5 — Route protection

```
anon → /profile/me ──► /login?next=/profile/me ──login──► back to /profile/me
```

`AppShell` (= guard + header) wraps every authed page. A stored-but-unresolved token
re-runs bootstrap instead of bouncing (fixes the just-logged-in race).

---

## Old flows removed / changed

- **`/builder/[id]` dummy page** → now redirects to `/profiles/[id]` (3s countdown + manual link).
- **Login always → `/onboarding/profile`** → replaced by smart routing (Flow 2/3).

## Not yet built (backend exists, UI doesn't)

Evidence page with link/testimonial flows · "Get verified" CTA (`POST /verification-requests`) ·
admin verification queue · organizations (all 5 pages) · real `/analyze` (backend module absent).

Full detail: `frontend/REVIEW.md`.
