# ERD — AI5K Core Schema

PostgreSQL / Aurora. Owned by Habibullah (Task 1.4). Diagram source lives in Eraser
(`AI5K DB DIAGRAM`) — 4 split files for team review (`AI5K_ERD_1..4_*.md`) plus one master file
for DDL generation (`AI5K_ERD_0_Master_Full.md`).

Line direction convention in the diagram: `parent.id < child.fk_id` — one parent row relates to
many child rows.

---

## 1. Identity, Organizations & RBAC

`users`, `organizations`, `organization_members`, `roles`, `permissions`, `role_permissions`, `user_roles`

- `users` — every person on the platform, tied to Cognito via `cognito_sub`.
- `organizations` — companies/teams that can hold their own profile, skills, and services.
- `organization_members` — join table; `consent_given` flag prevents double-counting a member's
  individual skills in the org's aggregated skill view.
- `roles` / `permissions` / `role_permissions` — standard RBAC.
- `user_roles` — role assignment with optional `organization_id`. Null = platform-wide role
  (`platform_admin`); set = org-scoped role (`org_admin`).

## 2. Profiles, Skills & Evidence

`profiles`, `profile_scores`, `skills`, `profile_skills`, `evidence`, `evidence_skill_links`

> **Implemented (2026-09-20):** `profiles`, `skills`, `profile_skills` + `services` (Domain 3)
> exist in migration `0002_add_profiles_skills_services`; `evidence` + `evidence_skill_links` in
> `0003_add_evidence_tables`; `verification_requests` in `0004_add_verification_requests`.
> `profile_scores` is a later task (2.8). The Eraser diagram needs a re-sync.

- `profiles` — the "party" entity: what actually appears on the marketplace. `owner_type` is
  `individual` or `organization`; a CHECK constraint enforces exactly one of `user_id` /
  `organization_id` is set, and unique constraints on each give at most one profile per user /
  per org. Everything marketplace-facing (skills, services, matches, engagements) references
  `profiles.id`, not `users.id` / `organizations.id` directly. Pilot additions beyond the
  original draft: `headline`, jsonb `job_roles` (≤10), jsonb `portfolio_links` (≤20) — pending
  schema-freeze sign-off (see `specs/2026-09-19-profile-crud-org-members-design.md`).
- `skills` — flat taxonomy (`name` unique + `category`) for the pilot. Names are normalized
  lowercase by the application. No hierarchy — the skills/evidence graph is the Data Engineer
  external hire's scope, not this relational core. Skills are create-or-get from skill claims.
- `profile_skills` — a skill claim; `claim_type` is `self_declared` or `evidenced`, unique per
  (profile, skill). **`claim_type` is server-asserted:** claims are always created
  `self_declared`; only the verification queue (Tasks 2.4/2.5) may flip one to `evidenced`.
- `evidence_skill_links` — **implemented (0003).** Join table (unique per pair) tying evidence to
  the skill claims it backs; a claim can only be linked to evidence on the **same profile**
  (application-layer guard).
- `evidence` — **implemented (0003).** Uploaded docs/screenshots/certificates via presigned S3
  PUTs (the backend never proxies bytes; `file_url` = `s3://{bucket}/{key}`), or plain URLs for
  `source_type` `link`/`testimonial` (no storage needed). `verification_status` is server-managed:
  rows start `pending`; only the verification queue (2.4/2.5) flips them. Linked to `profile_id`
  directly (for identity-verification docs) and, when relevant, to specific skill claims via
  `evidence_skill_links`.
- `profile_scores` — nightly capability/quality scoring job output (Task 2.8).

## 3. Opportunities, Matching & Proposals

`services`, `opportunities`, `opportunity_status_history`, `buyer_intake_briefs`, `matches`, `proposals`, `proposal_evidence_links`

- `services` — **implemented (migration 0002).** A profile's sellable offerings: `title`,
  `description`, `rate_type` (`hourly`/`fixed`/`retainer`), `rate_amount` numeric(12,2),
  `availability_status` (`available`/`booked`/`unavailable`). One FK to `profiles.id` per the
  party pattern. `updated_at` is a documented deviation from the original dictionary.
- `opportunities` — the CRM record. `status` drives the kanban. `assigned_to` is the internal
  owner; `external_ref` is a unique idempotency key for the n8n email-import pipeline.
- `opportunity_status_history` — stage-change audit trail (CRM-facing, separate from
  `audit_logs`).
- `buyer_intake_briefs` — output of the public guided-scoping form. Buyers don't need an account,
  so `buyer_name`/`buyer_email` are captured directly here.
- `matches` — matching-engine output; `reasoning` (jsonb) holds the "why" for the ranked
  shortlist.
- `proposals` — LLM-drafted, human-reviewed. `status`: draft → human_reviewed → approved → sent.
- `proposal_evidence_links` — which evidence backed a proposal's claims.

## 4. Engagements, Reviews, Verification, Audit & Rules

`engagements`, `engagement_milestones`, `reviews`, `verification_requests` *(implemented)*, `audit_logs` *(implemented)*, `platform_rules`, `rule_check_logs`

- `engagements` — a won proposal becomes an engagement. `fee_amount`/`fee_currency` are tracking
  fields only — no payment execution in this pilot.
- `engagement_milestones` — status-tracked milestones per engagement.
- `reviews` — `review_type` separates `verified_delivery` from `imported_testimonial`.
- `verification_requests` — **implemented (0004).** Admin queue for identity docs and skill-claim
  approval. `target_type` + `target_id` is an intentional soft/polymorphic reference, validated at
  the application layer (`profile_skill` | `identity_doc`; `organization` reserved). Decision-once:
  approve/reject also lands on the target row (claim → `evidenced`; evidence → `verified`/`rejected`).
- `audit_logs` — single append-only table covering every sensitive action platform-wide.
- `platform_rules` / `rule_check_logs` — external-channel rule definitions and the allow/block log
  for every attempted automation action (Task 3.8).

---

## Design decisions

See `decisions/0001-profiles-party-pattern.md` for why `profiles` replaced dual nullable FKs
across `services`, `matches`, and `engagements`.

## Open items before schema freeze

- Confirm the `profiles` party-pattern change with Kawser (2.1/2.3) and Sakibul (3.3). —
  *Implemented in migration 0002; sign-off still pending.*
- Sign off the two documented deviations from the data dictionary: `services.updated_at` and
  jsonb `job_roles` / `portfolio_links` on `profiles` (`specs/2026-09-19-profile-crud-org-members-design.md`).
- Decide whether `verification_requests.target_type` needs an enum/check constraint.
- Confirm composite uniqueness at DDL time: `role_permissions (role_id, permission_id)`,
  `user_roles (user_id, role_id, organization_id)`. — *Confirmed in 0001; `profiles` owner
  uniqueness and `profile_skills (profile_id, skill_id)` confirmed in 0002.*
- Re-sync the Eraser diagram with migration 0002.
