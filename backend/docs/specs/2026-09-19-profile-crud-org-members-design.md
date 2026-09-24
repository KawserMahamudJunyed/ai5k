# Profile CRUD + Organization Members, Consent & Aggregated Skills — Design

**Date:** 2026-09-19
**Status:** Approved
**Scope:** Two workstreams — (1) profile CRUD (headline, job roles, skills with claim types,
portfolio links, rates, availability), (2) org member invites, consent flags, and the aggregated
skill view (no double counting).

**Dependencies:** Workstream 2 builds on workstream 1 (aggregation joins `profiles` /
`profile_skills` / `skills`). Implement 1 first.

---

## Workstream 1 — Profile CRUD

### Data model (hybrid, per decision)

One migration `0002_add_profiles_skills_services.py`, following the 0001 domain-slice precedent
(one migration per logical schema change — here one domain: profiles + skills + services).

**`profiles`** (party pattern, ADR 0001):

| Column | Type | Notes |
|---|---|---|
| id | uuid pk | |
| owner_type | varchar | `individual` \| `organization` |
| user_id | uuid fk → users.id, nullable, unique | set iff owner_type = individual |
| organization_id | uuid fk → organizations.id, nullable, unique | set iff owner_type = organization |
| display_name | varchar(255), not null | |
| headline | varchar(255), nullable | new — pilot addition |
| job_roles | jsonb (list of str, ≤10), not null, default `[]` | new — professional titles |
| portfolio_links | jsonb (list of {label, url}, ≤20), not null, default `[]` | new |
| visibility | varchar(32), not null, default `private` | `private` \| `public` |
| created_at / updated_at | timestamptz | |

- CHECK constraint: exactly one of `user_id` / `organization_id` set (ADR 0001).
- Unique `user_id` and unique `organization_id` → one profile per owner.

**`skills`**: id, name (varchar unique), category (varchar). Flat taxonomy, no hierarchy.

**`profile_skills`**: id, profile_id fk, skill_id fk, claim_type (`self_declared` \| `evidenced`),
proficiency_level (`beginner` \| `intermediate` \| `advanced` \| `expert`, nullable), created_at.
Unique (profile_id, skill_id).

**`services`**: id, profile_id fk, title, description (text), rate_type (`hourly` \| `fixed` \|
`retainer`), rate_amount numeric(12,2), availability_status (`available` \| `booked` \|
`unavailable`), created_at / updated_at.

### Endpoints

```
POST   /profiles                              # self (individual) or org profile (needs org-scoped organization:manage); 409 if one exists
GET    /profiles/me                           # caller's own individual profile
GET    /profiles/{id}                         # public → any authed user; private → owner / owning-org admin / platform_admin
PATCH  /profiles/{id}                         # owner / owning-org admin / platform_admin
GET    /skills?category=&page=&page_size=     # catalog; offset pagination (bounded list per api-conventions.md)
POST   /profiles/{id}/skills                  # body {skill_id} or {skill_name, category}; claim_type ALWAYS server-set to self_declared
PATCH  /profiles/{id}/skills/{claim_id}       # proficiency_level only
DELETE /profiles/{id}/skills/{claim_id}
POST   /profiles/{id}/services                # title, description, rate_type, rate_amount, availability_status
GET    /profiles/{id}/services
PATCH  /profiles/{id}/services/{service_id}   # incl. availability_status
DELETE /profiles/{id}/services/{service_id}
```

### Rules

- **`evidenced` is server-asserted only.** Clients cannot set it; the flip happens via the
  verification queue (Tasks 2.4/2.5). A client sending `claim_type: "evidenced"` still gets
  `self_declared`.
- Ownership/permission helper `rbac.has_role(db, user_id, "platform_admin")` added for the
  private-view and edit checks; org profiles use org-scoped `has_permission(..., organization_id)`.
- Audit actions: `profile.created`, `profile.updated`, `profile_skill.created`,
  `profile_skill.updated`, `profile_skill.deleted`, `service.created`, `service.updated`,
  `service.deleted` — all inside audit-logging.md's verb vocabulary, with before/after metadata.
- Slug-immutable principle does not apply here; `display_name` is freely editable. `owner_type`
  and owner FKs are immutable after creation.

### Documented deviations (need Habibullah's schema-freeze sign-off per migrations.md)

1. `services.updated_at` — data dictionary omits it; added for consistency with TimestampMixin.
2. `job_roles` / `portfolio_links` as jsonb on `profiles` — the dictionary has no home for these
   fields; a separate table is rejected for pilot scope (hybrid decision).

---

## Workstream 2 — Organization members, consent, aggregated skills

### No schema changes

`organization_members` already carries `consent_given` (bool) and `status`
(`invited`/`active`/`removed`). The auth.md mechanism — "consent_given = true triggers a
user_roles row scoped to that org" — is implemented via the existing `grant_role`.

### Endpoints

| Route | Who | Behavior |
|---|---|---|
| `GET /organizations/{org_id}/members` | that org's org_admin, platform_admin | id, user (id/email/full_name), status, consent_given, joined_at |
| `POST /organizations/{org_id}/members` | that org's org_admin, platform_admin | body `{email}` → **existing users only** (404 `user_not_found` otherwise — no email infra in the backend). Creates row `status=invited, consent_given=false`. 409 `member_exists` if already invited/active. If prior row is `removed`, re-invite resets it to `invited` with fresh `consent_given=false` |
| `GET /organizations/invitations` | any authed user | caller's pending invites (org id/name, invited_at) — needed because `GET /organizations` lists active memberships only |
| `POST /organizations/{org_id}/members/me/consent` | the invited member **only** | Flips `consent_given=true`, `status invited→active`, sets `joined_at`, **grants org-scoped `professional` role** (decided: NOT org_admin — elevation is a platform_admin action via the existing admin endpoint). 409 if already consented/active |
| `DELETE /organizations/{org_id}/members/{member_id}` | that org's org_admin, platform_admin | Sets `status=removed`, revokes that user's org-scoped role rows (`revoke_role` per role). **Cannot remove yourself** (prevents last-admin lockout); 409 on re-delete of an already-removed row |

All management routes are guarded by `ensure_can_manage_organization` (workstream 1 helper:
404 no org / 403 `permission_denied`). Every state change writes an audit row
`organization_member.updated` with before/after metadata; role grant/revoke audit rows come from
`grant_role` / `revoke_role`.

### Aggregated skill view

`GET /organizations/{org_id}/skills` — active members, that org's org_admin, or platform_admin.

```json
[{ "skill_id": "...", "name": "...", "category": "...",
   "member_count": 3, "evidenced_count": 1, "self_declared_count": 2 }]
```

- Joins: members (`status=active AND consent_given=true`) → users → individual `profiles`
  (`owner_type=individual`) → `profile_skills` → `skills`.
- **No double counting:** `COUNT(DISTINCT profiles.user_id)` per skill — a member contributes at
  most once per skill no matter how many times they claimed it (unique (profile_id, skill_id)
  already prevents duplicate claims per profile; DISTINCT guards the multi-profile case).
- `evidenced_count` / `self_declared_count` are claim-type counts within the same consenting set.
- Sorted by `member_count` desc, then `name` asc. Empty list for orgs with no consenting members.
- The org's own `owner_type=organization` profile skills are out of scope here — they surface via
  that profile's endpoints.

### Test plan (`test_org_members.py`)

Invite → consent → org-scoped professional role granted → aggregate counts → remove → role
revoked → re-invite resets consent. Plus the 403 matrix (non-member, member-of-other-org,
professional), self-removal blocked, and a no-double-count regression: a member has exactly one
profile (unique `user_id`) and one claim per skill (unique `(profile_id, skill_id)`), so they
count once; `COUNT(DISTINCT profiles.user_id)` stays as defense in depth.

---

## Out of scope

- Email notifications on invite/verification (no email infrastructure in the backend).
- Member elevation to org_admin by org_admins (platform_admin only, existing endpoint).
- Evidence uploads & verification queue (Tasks 2.3/2.4/2.5).
- Profile listing/search, matching, profile_scores (Tasks 3.x/2.8).
- Public marketplace org skill pages (aggregate view is members/admins only, per decision).

## Files

- New: `models/profile.py`, `schemas/profile.py`, `schemas/organization.py`,
  `services/profiles.py`, `api/v1/profiles.py`, `api/v1/skills.py`,
  `alembic/versions/0002_add_profiles_skills_services.py`,
  `tests/test_profiles.py`, `tests/test_profile_skills.py`, `tests/test_profile_services.py`,
  `tests/test_org_members.py`
- Edited: `models/__init__.py`, `services/rbac.py` (has_role helper),
  `services/organization.py` (member + aggregate functions, ensure_can_manage_organization),
  `api/v1/organizations.py` (member + PATCH + aggregate endpoints), `main.py` (routers)

## Implementation order

1. Workstream 1: migration → models → schemas → services → endpoints → tests.
2. Workstream 2: schemas → service functions → endpoints → tests (reuses workstream 1 helpers).
3. Full suite + typecheck green; `alembic upgrade head` / `downgrade -1` / `upgrade head` cycle.
