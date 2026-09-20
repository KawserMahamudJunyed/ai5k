// AI5K Pilot — Full Core Schema (PostgreSQL / Aurora) — v2
// Diagram link - [DIAGRAM](https://app.eraser.io/workspace/5M1c7TCD6HGPiEeWxEaq)
// This is the master reference for DDL generation. For team review /
// whiteboard sessions, use the 4 split diagrams instead — Eraser's ERD
// mode has no group/cluster support, so a single 26-table diagram will
// always render busy. Split files: AI5K_ERD_1..4_*.md


AI5K DB DIAGRAM

Core relational schema for the AI5K pilot (Jul 27 – Aug 23, 2026). PostgreSQL / Aurora.

> **Implementation status (2026-09-20):** migrations `0001` (identity/RBAC/audit), `0002`
> (profiles, skills, profile_skills, services), `0003` (evidence, evidence_skill_links) and `0004`
> (verification_requests) are applied. Everything else in this diagram is still a later task
> (scoring 2.8, opportunities 3.1, matching/proposals 3.3–3.5, engagements/reviews, rules). Diagram
> blocks below are annotated where the implemented schema deviates from this v2 draft.

Scope: relational core, RBAC, and audit logging for the full opportunity-to-engagement pipeline. Payments execution, external-platform API integrations, and agent/IP commerce are explicitly out of scope for these 4 weeks.

---

## How to read this
The diagram is organized into 4 domains. Each was pasted as a separate Eraser file during team review to keep it legible — Eraser's ERD mode doesn't support grouping, so a single 26-table diagram gets unreadable fast. This document (and this canvas) holds the full combined picture for reference and for generating the DDL/Alembic migration later.

Line direction: `parent.id < child.fk_id` — one parent row relates to many child rows.

---

## 1. Identity, Organizations & RBAC
**Tables:** `users`, `organizations`, `organization_members`, `roles`, `permissions`, `role_permissions`, `user_roles` 

- `users`  — every person on the platform, tied to AWS Cognito via `cognito_sub` .
- `organizations`  — companies/teams that can hold their own profile, skills, and services.
- `organization_members`  — join table; a user belongs to an org with a `consent_given`  flag (needed for the aggregated org skill view — no double-counting a member's individual skills as the org's).
- `roles`  / `permissions`  / `role_permissions`  — standard RBAC.
- `user_roles`  — assigns a role to a user, with an **optional** `organization_id` . Null means the role is platform-wide (e.g. `platform_admin` ); set means it's scoped to that org (e.g. `org_admin` ).
**Roles at launch:** `professional`, `org_admin`, `platform_admin` (per Task 1.6).

---

## 2. Profiles, Skills & Evidence
**Tables:** `profiles`, `profile_scores`, `skills`, `profile_skills`, `evidence`, `evidence_skill_links`

- `profiles`  — a "party" entity: the thing that actually appears on the marketplace, holds skills, offers services, gets matched, and delivers engagements. `owner_type`  is `individual`  or `organization` ; a CHECK constraint enforces exactly one of `user_id`  / `organization_id`  is set, and each is UNIQUE so a user/org has at most one profile. This replaced an earlier draft where `services` , `matches` , and `engagements`  each carried two separate nullable FKs — one entity now, referenced everywhere. **Pilot additions (implemented in 0002, pending schema-freeze sign-off):** `headline` , jsonb `job_roles` (≤10), jsonb `portfolio_links` (≤20) — see `specs/2026-09-19-profile-crud-org-members-design.md` .
- `skills`  — flat taxonomy (`name` UNIQUE + `category` ) for the pilot. Names are normalized lowercase by the application and skills are create-or-get from skill claims. No parent/child hierarchy: the skills/evidence _graph_ is explicitly the Data Engineer external hire's scope (OpenSearch/graph layer), not this relational core.
- `profile_skills`  — a skill claim by a profile, UNIQUE per (profile, skill). `claim_type`  distinguishes `self_declared`  from `evidenced` . **Server-asserted (implemented):** claims are always created `self_declared`; client-sent values are ignored — only the verification queue (Tasks 2.4/2.5) flips a claim to `evidenced` .
- `evidence`  — uploaded docs/screenshots/links, tagged by `source_type` . Linked to a `profile_id`  directly (so identity-verification docs don't need to piggyback on a skill claim) and, when relevant, to specific skill claims via `evidence_skill_links` .
- `profile_scores`  — output of the capability/quality scoring job (Task 2.8), recomputed nightly. `score_type`  distinguishes capability score from profile quality score.
**Rule enforced by product, not by FK:** only evidence-backed claims are shown on public profile pages.

---

## 3. Opportunities, Matching & Proposals
**Tables:** `services`, `opportunities`, `opportunity_status_history`, `buyer_intake_briefs`, `matches`, `proposals`, `proposal_evidence_links`

- `services`  — **implemented in 0002.** A profile's sellable offerings: `title` , `description` , `rate_type`  (`hourly`/`fixed`/`retainer`), `rate_amount` numeric(12,2), `availability_status`  (`available`/`booked`/`unavailable`). Single FK to `profiles.id` per the party pattern. `updated_at`  was added beyond this v2 draft (documented deviation).
- `opportunities`  — the CRM record. `status`  drives the kanban (new → qualified → proposal_sent → won/lost). `assigned_to`  is the internal owner; `external_ref`  is a unique idempotency key so the n8n email-import pipeline can dedupe re-ingested opportunities.
- `opportunity_status_history`  — audit trail of stage changes, separate from the general `audit_logs`  table since this one is CRM-facing (notes shown to the sales owner, not just compliance).
- `buyer_intake_briefs`  — output of the public guided-scoping form. Buyers aren't required to have an account, so `buyer_name` /`buyer_email`  are captured directly here rather than assuming a `users`  row exists.
- `matches`  — matching-engine output: a `profile_id`  scored against an `opportunity_id` , with `reasoning`  (jsonb) holding the "why" for the ranked shortlist.
- `proposals`  — LLM-drafted, human-reviewed. `status`  tracks draft → human_reviewed → approved → sent. `approved_by`  is the human sign-off (evidence-only-claims guardrail lives in the AI service, not the schema).
- `proposal_evidence_links`  — which pieces of evidence backed the claims in a given proposal.
---

## 4. Engagements, Reviews, Verification, Audit & Rules
**Tables:** `engagements`, `engagement_milestones`, `reviews`, `verification_requests`, `audit_logs`, `platform_rules`, `rule_check_logs` 

- `engagements`  — a won proposal becomes an engagement. `fee_amount` /`fee_currency`  are flat fields — no payment execution schema for the pilot, this is scope tracking only.
- `engagement_milestones`  — simple status-tracked milestones per engagement.
- `reviews`  — buyer review per engagement. `review_type`  separates `verified_delivery`  reviews from `imported_testimonial` , so the two never get conflated in trust signals.
- `verification_requests`  — the admin queue for identity docs and skill-claim approval. `target_type`  + `target_id`  is an intentional soft/polymorphic reference (not FK-enforced) since it points at different entity types; validated at the application layer. **Implemented in 0004** — `profile_skill`  and `identity_doc`  targets; decision-once with side effects on the target row (`specs/2026-09-20-verification-queue-design.md` ).
- `audit_logs`  — single append-only table (`entity_type`  + `entity_id`  + `metadata jsonb` ) covering every sensitive action platform-wide: admin verification decisions, RBAC changes, security-hardening coverage (Task 4.4).
- `platform_rules`  / `rule_check_logs`  — the platform-rule checker (Task 3.8): rule definitions per external channel, and a log of every attempted action with its allow/block result — doubles as the "approval history log."
---

## Open items before schema freeze (Wed, Week 2)
- Confirm the `profiles`  party-pattern change with Kawser (2.1/2.3) and Sakibul (3.3) — code that used to branch on "which FK is non-null" now branches on `profiles.owner_type` . *Implemented in 0002; sign-off still pending.*
- Sign off the two documented deviations from the v2 draft: `services.updated_at` and jsonb `job_roles` / `portfolio_links` on `profiles` (`specs/2026-09-19-profile-crud-org-members-design.md` ).
- Decide whether `verification_requests.target_id`  needs a lightweight enum/check constraint on `target_type` , or stays fully soft-referenced.
- Confirm composite uniqueness needs at DDL time: `role_permissions (role_id, permission_id)` , `user_roles (user_id, role_id, organization_id)` . *Confirmed in 0001; `profiles` owner uniqueness and `profile_skills (profile_id, skill_id)` confirmed in 0002.*
- Re-sync the Eraser workspace with migration 0002 (this file's diagram blocks are the source for that pass).



title AI5K Platform — Full Core ERD (PostgreSQL) v2

// ---------------- Identity & Access ----------------

users [icon: user] {
  id uuid pk
  email varchar unique
  password_hash varchar
  cognito_sub varchar unique
  full_name varchar
  avatar_url varchar
  status varchar
  created_at timestamp
  updated_at timestamp
}

organizations [icon: building] {
  id uuid pk
  name varchar
  slug varchar unique
  description text
  website_url varchar
  logo_url varchar
  status varchar
  created_at timestamp
  updated_at timestamp
}

organization_members [icon: users] {
  id uuid pk
  organization_id uuid
  user_id uuid
  consent_given boolean
  status varchar
  joined_at timestamp
}

roles [icon: shield] {
  id uuid pk
  name varchar unique
  description varchar
}

permissions [icon: key] {
  id uuid pk
  code varchar unique
  description varchar
}

role_permissions [icon: link] {
  id uuid pk
  role_id uuid
  permission_id uuid
}

user_roles [icon: shield] {
  id uuid pk
  user_id uuid
  role_id uuid
  organization_id uuid
  granted_at timestamp
}

// ---------------- Profiles (party pattern) ----------------
// Consolidates "individual OR organization" into one referenceable entity
// instead of dual nullable FKs repeated across skills/services/matches/engagements

profiles [icon: id-card] {
  id uuid pk
  owner_type varchar
  user_id uuid unique
  organization_id uuid unique
  display_name varchar
  headline varchar
  job_roles jsonb
  portfolio_links jsonb
  visibility varchar
  created_at timestamp
  updated_at timestamp
}

profile_scores [icon: activity] {
  id uuid pk
  profile_id uuid
  score_type varchar
  score numeric
  computed_at timestamp
}

// ---------------- Skills & Evidence ----------------

skills [icon: tag] {
  id uuid pk
  name varchar unique
  category varchar
}

profile_skills [icon: award] {
  id uuid pk
  profile_id uuid
  skill_id uuid
  claim_type varchar
  proficiency_level varchar
  created_at timestamp
}

evidence [icon: file-text] {
  id uuid pk
  profile_id uuid
  uploader_id uuid
  source_type varchar
  file_url varchar
  title varchar
  description text
  verification_status varchar
  uploaded_at timestamp
}
// implemented in 0003: file_url = s3://{bucket}/{key} for file types,
// verification_status server-managed (pending until the verification queue acts)

evidence_skill_links [icon: link] {
  id uuid pk
  evidence_id uuid
  profile_skill_id uuid
}
// implemented in 0003: unique (evidence_id, profile_skill_id);
// same-profile guard enforced at the application layer

// ---------------- Services & Opportunities ----------------

services [icon: briefcase] {
  id uuid pk
  profile_id uuid
  title varchar
  description text
  rate_type varchar
  rate_amount numeric
  availability_status varchar
  created_at timestamp
  updated_at timestamp
}

opportunities [icon: target] {
  id uuid pk
  title varchar
  description text
  source_channel varchar
  external_ref varchar unique
  service_area varchar
  status varchar
  submitted_by uuid
  assigned_to uuid
  created_at timestamp
  updated_at timestamp
}

opportunity_status_history [icon: clock] {
  id uuid pk
  opportunity_id uuid
  status varchar
  changed_by uuid
  changed_at timestamp
  notes text
}

buyer_intake_briefs [icon: clipboard] {
  id uuid pk
  opportunity_id uuid
  buyer_name varchar
  buyer_email varchar
  raw_input text
  structured_brief jsonb
  created_at timestamp
}

// ---------------- Matching & Proposals ----------------

matches [icon: activity] {
  id uuid pk
  opportunity_id uuid
  profile_id uuid
  score numeric
  reasoning jsonb
  generated_at timestamp
}

proposals [icon: file-text] {
  id uuid pk
  opportunity_id uuid
  match_id uuid
  author_id uuid
  draft_content text
  status varchar
  approved_by uuid
  approved_at timestamp
  created_at timestamp
}

proposal_evidence_links [icon: link] {
  id uuid pk
  proposal_id uuid
  evidence_id uuid
}

// ---------------- Engagements & Reviews ----------------

engagements [icon: handshake] {
  id uuid pk
  opportunity_id uuid
  proposal_id uuid
  provider_profile_id uuid
  scope text
  fee_amount numeric
  fee_currency varchar
  status varchar
  started_at timestamp
  completed_at timestamp
}

engagement_milestones [icon: check-circle] {
  id uuid pk
  engagement_id uuid
  title varchar
  due_date date
  status varchar
  completed_at timestamp
}

reviews [icon: star] {
  id uuid pk
  engagement_id uuid
  reviewer_id uuid
  rating integer
  comment text
  review_type varchar
  created_at timestamp
}

// ---------------- Verification, Audit & Rules ----------------

verification_requests [icon: check-circle] {
  id uuid pk
  requestor_id uuid
  target_type varchar
  target_id uuid
  status varchar
  reviewed_by uuid
  reviewed_at timestamp
  created_at timestamp
}
// implemented in 0004: target stays a soft reference (no FK); decision-once with
// side effects on the target row (claim → evidenced; evidence → verified/rejected)

audit_logs [icon: activity] {
  id uuid pk
  actor_id uuid
  action varchar
  entity_type varchar
  entity_id uuid
  metadata jsonb
  ip_address varchar
  created_at timestamp
}

platform_rules [icon: settings] {
  id uuid pk
  rule_name varchar
  channel varchar
  rule_type varchar
  condition jsonb
  created_at timestamp
}

rule_check_logs [icon: list] {
  id uuid pk
  rule_id uuid
  action_attempted varchar
  entity_type varchar
  entity_id uuid
  result varchar
  checked_at timestamp
}

// ============================================================
// Relationships (read as: one.id < many.fk)
// ============================================================

users.id < organization_members.user_id
organizations.id < organization_members.organization_id
roles.id < role_permissions.role_id
permissions.id < role_permissions.permission_id
users.id < user_roles.user_id
roles.id < user_roles.role_id
organizations.id < user_roles.organization_id

users.id - profiles.user_id
organizations.id - profiles.organization_id
profiles.id < profile_scores.profile_id

profiles.id < profile_skills.profile_id
skills.id < profile_skills.skill_id
profiles.id < evidence.profile_id
users.id < evidence.uploader_id
evidence.id < evidence_skill_links.evidence_id
profile_skills.id < evidence_skill_links.profile_skill_id

profiles.id < services.profile_id
users.id < opportunities.submitted_by
users.id < opportunities.assigned_to
opportunities.id < opportunity_status_history.opportunity_id
users.id < opportunity_status_history.changed_by
opportunities.id < buyer_intake_briefs.opportunity_id

opportunities.id < matches.opportunity_id
profiles.id < matches.profile_id
opportunities.id < proposals.opportunity_id
matches.id < proposals.match_id
users.id < proposals.author_id
users.id < proposals.approved_by
proposals.id < proposal_evidence_links.proposal_id
evidence.id < proposal_evidence_links.evidence_id

opportunities.id < engagements.opportunity_id
proposals.id < engagements.proposal_id
profiles.id < engagements.provider_profile_id
engagements.id < engagement_milestones.engagement_id
engagements.id < reviews.engagement_id
users.id < reviews.reviewer_id

users.id < verification_requests.requestor_id
users.id < verification_requests.reviewed_by
users.id < audit_logs.actor_id
platform_rules.id < rule_check_logs.rule_id