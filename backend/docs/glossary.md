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
can have its own profile.

**Skill claim** (`profile_skills`) — a specific skill a profile says it has. Can be
self-declared or evidenced.

**Evidence** — a document, screenshot, certificate, or link uploaded to back up a skill claim or
an identity verification.

**Verification** — the admin review process that moves a skill claim or identity doc from
"self-declared" to "verified," or approves/rejects it.

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
`rbac.md`.
