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

- `profiles` — the "party" entity: what actually appears on the marketplace. `owner_type` is
  `individual` or `organization`; exactly one of `user_id` / `organization_id` is set. Everything
  marketplace-facing (skills, services, matches, engagements) references `profiles.id`, not
  `users.id` / `organizations.id` directly.
- `skills` — flat taxonomy (`name` + `category`) for the pilot. No hierarchy — the skills/evidence
  graph is the Data Engineer external hire's scope, not this relational core.
- `profile_skills` — a skill claim; `claim_type` is `self_declared` or `evidenced`.
- `evidence` — uploaded docs/screenshots/links. Linked to `profile_id` directly (for
  identity-verification docs) and, when relevant, to specific skill claims via
  `evidence_skill_links`.
- `profile_scores` — nightly capability/quality scoring job output (Task 2.8).

## 3. Opportunities, Matching & Proposals

`opportunities`, `opportunity_status_history`, `buyer_intake_briefs`, `matches`, `proposals`, `proposal_evidence_links`

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

`engagements`, `engagement_milestones`, `reviews`, `verification_requests`, `audit_logs`, `platform_rules`, `rule_check_logs`

- `engagements` — a won proposal becomes an engagement. `fee_amount`/`fee_currency` are tracking
  fields only — no payment execution in this pilot.
- `engagement_milestones` — status-tracked milestones per engagement.
- `reviews` — `review_type` separates `verified_delivery` from `imported_testimonial`.
- `verification_requests` — admin queue for identity docs and skill-claim approval. `target_type`
  + `target_id` is an intentional soft/polymorphic reference, validated at the application layer.
- `audit_logs` — single append-only table covering every sensitive action platform-wide.
- `platform_rules` / `rule_check_logs` — external-channel rule definitions and the allow/block log
  for every attempted automation action (Task 3.8).

---

## Design decisions

See `decisions/0001-profiles-party-pattern.md` for why `profiles` replaced dual nullable FKs
across `services`, `matches`, and `engagements`.

## Open items before schema freeze

- Confirm the `profiles` party-pattern change with Kawser (2.1/2.3) and Sakibul (3.3).
- Decide whether `verification_requests.target_type` needs an enum/check constraint.
- Confirm composite uniqueness at DDL time: `role_permissions (role_id, permission_id)`,
  `user_roles (user_id, role_id, organization_id)`.
