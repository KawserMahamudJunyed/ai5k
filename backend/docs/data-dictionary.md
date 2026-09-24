# Data Dictionary

Every table and column in the AI5K core schema. Enum-like `varchar` columns list **proposed**
values — confirm/finalize with the team before the schema freeze; these aren't DB-enforced enums
in v1 (kept as `varchar` + application-layer validation, so new values don't need a migration
during the pilot).

All `id` columns are `uuid`, generated server-side (`gen_random_uuid()` or app-side UUID4). All
`created_at`/`updated_at`/timestamp columns are `timestamptz`, UTC.

---

## Identity, Organizations & RBAC

### `users`
| Column | Type | Notes |
|---|---|---|
| id | uuid pk | |
| email | varchar, unique | login identifier |
| password_hash | varchar | nullable if Cognito is sole auth path |
| cognito_sub | varchar, unique | Cognito subject id |
| full_name | varchar | |
| avatar_url | varchar | nullable |
| status | varchar | proposed: `active`, `pending`, `suspended` |
| created_at | timestamptz | |
| updated_at | timestamptz | |

### `organizations`
| Column | Type | Notes |
|---|---|---|
| id | uuid pk | |
| name | varchar | |
| slug | varchar, unique | used in public org page URL |
| description | text | nullable |
| website_url | varchar | nullable |
| logo_url | varchar | nullable |
| status | varchar | proposed: `active`, `pending`, `suspended` |
| created_at | timestamptz | |
| updated_at | timestamptz | |

### `organization_members`
| Column | Type | Notes |
|---|---|---|
| id | uuid pk | |
| organization_id | uuid, fk → organizations.id | |
| user_id | uuid, fk → users.id | |
| consent_given | boolean | must be true before member's skills count toward org aggregate view |
| status | varchar | proposed: `invited`, `active`, `removed` |
| joined_at | timestamptz | |

### `roles`
| Column | Type | Notes |
|---|---|---|
| id | uuid pk | |
| name | varchar, unique | `professional`, `org_admin`, `platform_admin` |
| description | varchar | |

### `permissions`
| Column | Type | Notes |
|---|---|---|
| id | uuid pk | |
| code | varchar, unique | e.g. `opportunity:read`, `verification:approve` — define full list in `rbac.md` |
| description | varchar | |

### `role_permissions`
| Column | Type | Notes |
|---|---|---|
| id | uuid pk | |
| role_id | uuid, fk → roles.id | |
| permission_id | uuid, fk → permissions.id | unique together with role_id |

### `user_roles`
| Column | Type | Notes |
|---|---|---|
| id | uuid pk | |
| user_id | uuid, fk → users.id | |
| role_id | uuid, fk → roles.id | |
| organization_id | uuid, fk → organizations.id, nullable | null = platform-wide role |
| granted_at | timestamptz | |

---

## Profiles, Skills & Evidence

> **Status (2026-09-20):** `profiles`, `skills`, `profile_skills`, `services` are implemented in
> migration `0002_add_profiles_skills_services`; `evidence`, `evidence_skill_links` in
> `0003_add_evidence_tables`; `verification_requests` in `0004_add_verification_requests`. Two
> deviations from the original dictionary are flagged below and await schema-freeze sign-off (see
> `specs/2026-09-19-profile-crud-org-members-design.md`). Evidence upload flow:
> `specs/2026-09-20-evidence-uploads-design.md`; verification queue:
> `specs/2026-09-20-verification-queue-design.md`.

### `profiles`
| Column | Type | Notes |
|---|---|---|
| id | uuid pk | |
| owner_type | varchar | `individual` or `organization` |
| user_id | uuid, fk → users.id, nullable, **unique** | set when owner_type = individual |
| organization_id | uuid, fk → organizations.id, nullable, **unique** | set when owner_type = organization |
| display_name | varchar(255) | |
| headline | varchar(255), nullable | **pilot addition** — one-line professional summary |
| job_roles | jsonb (list of str, ≤10), default `[]` | **pilot addition** — professional titles, e.g. `["Backend Engineer"]` |
| portfolio_links | jsonb (list of {label, url}, ≤20), default `[]` | **pilot addition** — url must match `https?://` |
| visibility | varchar | implemented: `private` (default), `public`; `unverified` reserved for the verification flow |
| created_at | timestamptz | |
| updated_at | timestamptz | |

Party pattern (ADR 0001): a CHECK constraint enforces exactly one of `user_id` / `organization_id`.
The unique constraints give at most one profile per user / per organization. Owner FKs and
`owner_type` are immutable after creation.

### `profile_scores`
| Column | Type | Notes |
|---|---|---|
| id | uuid pk | |
| profile_id | uuid, fk → profiles.id | |
| score_type | varchar | `capability`, `quality` |
| score | numeric | |
| computed_at | timestamptz | nightly recompute (Task 2.8) |

### `skills`
| Column | Type | Notes |
|---|---|---|
| id | uuid pk | |
| name | varchar(128), unique | stored lowercase — application-layer normalization |
| category | varchar(128), nullable | flat grouping, no hierarchy in v1 |

### `profile_skills`
| Column | Type | Notes |
|---|---|---|
| id | uuid pk | |
| profile_id | uuid, fk → profiles.id | unique together with skill_id |
| skill_id | uuid, fk → skills.id | unique together with profile_id |
| claim_type | varchar | `self_declared`, `evidenced` — **server-asserted**: claims are always created `self_declared`; only the verification queue may flip to `evidenced` |
| proficiency_level | varchar | proposed: `beginner`, `intermediate`, `advanced`, `expert` |
| created_at | timestamptz | |

### `evidence`
> **Implemented (0003).** File uploads use presigned S3 PUTs — the backend never proxies file
> bytes. `file_url` stores `s3://{bucket}/{key}` for file types and the plain https?:// URL for
> `link`/`testimonial`. `verification_status` is **server-managed**: rows start `pending`; only
> the verification queue (Tasks 2.4/2.5) moves them to `verified`/`rejected`.

| Column | Type | Notes |
|---|---|---|
| id | uuid pk | |
| profile_id | uuid, fk → profiles.id | |
| uploader_id | uuid, fk → users.id | who performed the upload action |
| source_type | varchar | implemented: `document`, `screenshot`, `certificate` (file types; S3 required), `link`, `testimonial` (URL-only, no storage needed) |
| file_url | varchar(2048) | file types: `s3://{bucket}/{key}`; link/testimonial: the public URL |
| title | varchar(255) | |
| description | text | nullable |
| verification_status | varchar | `pending` (default), `verified`, `rejected` — server-managed |
| uploaded_at | timestamptz | |

### `evidence_skill_links`
> **Implemented (0003).** A skill claim can only be linked to evidence on the **same profile**
> (application-layer guard). Unique (evidence_id, profile_skill_id).

| Column | Type | Notes |
|---|---|---|
| id | uuid pk | |
| evidence_id | uuid, fk → evidence.id | unique together with profile_skill_id |
| profile_skill_id | uuid, fk → profile_skills.id | unique together with evidence_id |

---

## Services & Opportunities

### `services`
| Column | Type | Notes |
|---|---|---|
| id | uuid pk | |
| profile_id | uuid, fk → profiles.id | |
| title | varchar(255) | |
| description | text | |
| rate_type | varchar | proposed: `hourly`, `fixed`, `retainer` |
| rate_amount | numeric(12,2) | > 0, application-layer validation |
| availability_status | varchar | proposed: `available` (default), `booked`, `unavailable` |
| created_at | timestamptz | |
| updated_at | timestamptz | **deviation** — not in the original dictionary; added for TimestampMixin consistency |

### `opportunities`
| Column | Type | Notes |
|---|---|---|
| id | uuid pk | |
| title | varchar | |
| description | text | |
| source_channel | varchar | proposed: `manual`, `email`, `import` |
| external_ref | varchar, unique | idempotency key for n8n ingestion dedup |
| service_area | varchar | |
| status | varchar | `new`, `qualified`, `proposal_sent`, `won`, `lost` |
| submitted_by | uuid, fk → users.id, nullable | |
| assigned_to | uuid, fk → users.id, nullable | CRM owner |
| created_at | timestamptz | |
| updated_at | timestamptz | |

### `opportunity_status_history`
| Column | Type | Notes |
|---|---|---|
| id | uuid pk | |
| opportunity_id | uuid, fk → opportunities.id | |
| status | varchar | snapshot of status at change time |
| changed_by | uuid, fk → users.id | |
| changed_at | timestamptz | |
| notes | text | nullable |

### `buyer_intake_briefs`
| Column | Type | Notes |
|---|---|---|
| id | uuid pk | |
| opportunity_id | uuid, fk → opportunities.id | |
| buyer_name | varchar | nullable — buyer may be unauthenticated |
| buyer_email | varchar | nullable |
| raw_input | text | natural-language input from the public form |
| structured_brief | jsonb | LLM-structured output |
| created_at | timestamptz | |

---

## Matching & Proposals

### `matches`
| Column | Type | Notes |
|---|---|---|
| id | uuid pk | |
| opportunity_id | uuid, fk → opportunities.id | |
| profile_id | uuid, fk → profiles.id | |
| score | numeric | |
| reasoning | jsonb | why the match was ranked this way |
| generated_at | timestamptz | |

### `proposals`
| Column | Type | Notes |
|---|---|---|
| id | uuid pk | |
| opportunity_id | uuid, fk → opportunities.id | |
| match_id | uuid, fk → matches.id, nullable | |
| author_id | uuid, fk → users.id | usually the AI service acting as a system user, or the human editor |
| draft_content | text | |
| status | varchar | `draft`, `human_reviewed`, `approved`, `sent` |
| approved_by | uuid, fk → users.id, nullable | |
| approved_at | timestamptz | nullable |
| created_at | timestamptz | |

### `proposal_evidence_links`
| Column | Type | Notes |
|---|---|---|
| id | uuid pk | |
| proposal_id | uuid, fk → proposals.id | |
| evidence_id | uuid, fk → evidence.id | |

---

## Engagements & Reviews

### `engagements`
| Column | Type | Notes |
|---|---|---|
| id | uuid pk | |
| opportunity_id | uuid, fk → opportunities.id | |
| proposal_id | uuid, fk → proposals.id, nullable | |
| provider_profile_id | uuid, fk → profiles.id | |
| scope | text | |
| fee_amount | numeric | tracking only, no payment execution |
| fee_currency | varchar | e.g. `BDT`, `USD` |
| status | varchar | proposed: `active`, `completed`, `cancelled` |
| started_at | timestamptz | nullable |
| completed_at | timestamptz | nullable |

### `engagement_milestones`
| Column | Type | Notes |
|---|---|---|
| id | uuid pk | |
| engagement_id | uuid, fk → engagements.id | |
| title | varchar | |
| due_date | date | |
| status | varchar | proposed: `pending`, `in_progress`, `done` |
| completed_at | timestamptz | nullable |

### `reviews`
| Column | Type | Notes |
|---|---|---|
| id | uuid pk | |
| engagement_id | uuid, fk → engagements.id | |
| reviewer_id | uuid, fk → users.id | |
| rating | integer | 1–5 |
| comment | text | nullable |
| review_type | varchar | `verified_delivery`, `imported_testimonial` |
| created_at | timestamptz | |

---

## Verification, Audit & Rules

### `verification_requests`
> **Implemented (0004).** Admin queue for identity docs & skill claims
> (`specs/2026-09-20-verification-queue-design.md`). In-scope `target_type` values:
> `profile_skill`, `identity_doc` (`organization` reserved, not implemented).
> **Decision-once:** approve/reject also lands on the target row in the same transaction —
> approving a claim flips it to `evidenced`; identity-doc evidence goes `verified`/`rejected`.

| Column | Type | Notes |
|---|---|---|
| id | uuid pk | |
| requestor_id | uuid, fk → users.id | the target's owner |
| target_type | varchar | implemented: `profile_skill`, `identity_doc`; `organization` reserved — app-layer validated, no CHECK (erd.md open item) |
| target_id | uuid | soft reference, not FK-enforced (intentional) |
| status | varchar | `pending` (default), `approved`, `rejected` |
| reviewed_by | uuid, fk → users.id, nullable | deciding admin |
| reviewed_at | timestamptz | nullable |
| created_at | timestamptz | |

### `audit_logs`
| Column | Type | Notes |
|---|---|---|
| id | uuid pk | |
| actor_id | uuid, fk → users.id, nullable | null for system-triggered actions |
| action | varchar | see `audit-logging.md` for naming convention |
| entity_type | varchar | e.g. `opportunity`, `user_role`, `evidence` |
| entity_id | uuid | soft reference |
| metadata | jsonb | before/after diff or context |
| ip_address | varchar | nullable |
| created_at | timestamptz | |

### `platform_rules`
| Column | Type | Notes |
|---|---|---|
| id | uuid pk | |
| rule_name | varchar | |
| channel | varchar | which external channel this rule applies to |
| rule_type | varchar | `block`, `warn` |
| condition | jsonb | rule logic/config |
| created_at | timestamptz | |

### `rule_check_logs`
| Column | Type | Notes |
|---|---|---|
| id | uuid pk | |
| rule_id | uuid, fk → platform_rules.id | |
| action_attempted | varchar | |
| entity_type | varchar | |
| entity_id | uuid | soft reference |
| result | varchar | `blocked`, `allowed` |
| checked_at | timestamptz | |
