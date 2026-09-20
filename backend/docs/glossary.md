# Glossary

Domain terms used across the schema and codebase, for anyone (especially AI/LLM and frontend
folks) who hasn't internalized the backend vocabulary yet.

**Profile** — the marketplace-facing entity that holds skills, offers services, gets matched, and
delivers engagements. A profile belongs to either an individual (`user`) or an `organization`, not
both. Not the same as a `user` — a `user` is a login/account; a `profile` is what shows up
publicly.

**User** — a person with a login (Cognito-backed account). Every individual profile has exactly
one user behind it, but not every user necessarily has a profile yet (e.g. right after signup,
before they've filled anything in).

**Organization** — a company/team account. Has members (`organization_members`) and, like a user,
can have its own profile. The creator becomes that org's `org_admin`; a member who accepts an
invite gets an org-scoped `professional` role.

**Headline** — a one-line professional summary on a profile (`profiles.headline`). Pilot
addition alongside `job_roles` and `portfolio_links`.

**Job roles** — the professional titles a profile lists, e.g. `["Backend Engineer", "Data
Analyst"]` (jsonb column on `profiles`, ≤10). Not RBAC roles — see **RBAC scope** for those.

**Portfolio link** — a `{label, url}` entry (jsonb on `profiles`, ≤20) pointing at work the
profile owner wants to showcase.

**Service** (`services`) — a sellable offering attached to a profile: title, description,
`rate_type` (`hourly`/`fixed`/`retainer`), `rate_amount`, and `availability_status`
(`available`/`booked`/`unavailable`).

**Skill claim** (`profile_skills`) — a specific skill a profile says it has. Can be
self-declared or evidenced; unique per (profile, skill). Claims are always created
`self_declared` — the server ignores any client-sent `claim_type`.

**Aggregated skill view** — per-org rollup of consenting active members' individual skill
claims (`GET /organizations/{id}/skills`). `member_count` is the number of **distinct users**
claiming the skill, so a member counts once regardless of claims; members who haven't given
consent (or were removed) are never counted.

**Consent** (`organization_members.consent_given`) — the member's opt-in that allows their
individual skills to be counted in the org's aggregated skill view. Accepting an invitation
flips `invited → active`, sets `joined_at`, and grants the org-scoped `professional` role.

**Evidence** — a document, screenshot, certificate, or link uploaded to back up a skill claim or
an identity verification. File types go to S3 via presigned PUT URLs (the backend never touches
the bytes); `link`/`testimonial` evidence is just a URL. Every row starts
`verification_status: pending` — server-managed, never client-set.

**Source type** (`evidence.source_type`) — the tag saying what kind of evidence a row holds:
`document`, `screenshot`, `certificate` (file types, S3 required), `link`, or `testimonial`
(URL-only, no storage needed).

**Evidence–skill link** (`evidence_skill_links`) — which evidence backs which skill claim. The
claim must live on the same profile as the evidence.

**Verification** — the admin review process that moves a skill claim or identity doc from
"self-declared" to "verified," or approves/rejects it. The only path by which a skill claim's
`claim_type` becomes `evidenced`. Implemented as the `verification_requests` queue: owners file
requests, admins with `verification:approve` decide once, and the outcome also lands on the
request's target row (claim → `evidenced`; evidence → `verified`/`rejected`).

**Verification request** (`verification_requests`) — one queue item: who filed it (`requestor_id`),
what's being reviewed (`target_type` + `target_id`, a soft polymorphic reference), and the
decision (`status`, `reviewed_by`, `reviewed_at`).

**Opportunity** — an inbound piece of work (a "lead" in traditional CRM terms) — could come from a
buyer's public intake form, manual entry, or automated email import.

**Match** — the matching engine's scored pairing of an opportunity to a profile, with reasoning.

**Proposal** — an LLM-drafted, human-reviewed response to an opportunity, built from a match plus
supporting evidence.

**Engagement** — what an opportunity becomes once a proposal is won — the actual piece of work
being delivered. Has milestones and can be reviewed afterward.

**Review** — buyer feedback on a completed engagement. Distinguished from an "imported
testimonial" (a pre-platform reference) by `review_type`.

**Platform rule** — a rule governing what automated actions are allowed on external channels
(e.g. what the automation pipeline is and isn't allowed to do without human approval).

**Audit log** — the append-only record of sensitive state-changing actions across the platform.

**RBAC scope** — whether a role applies platform-wide or is limited to a single organization. See
`rbac.md`. The verification queue splits into `verification:review` (see the queue) and
`verification:approve` (decide); `platform_admin` holds both.
