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

### `profiles`
| Column | Type | Notes |
|---|---|---|
| id | uuid pk | |
| owner_type | varchar | `individual` or `organization` |
| user_id | uuid, fk → users.id, nullable | set when owner_type = individual |
| organization_id | uuid, fk → organizations.id, nullable | set when owner_type = organization |
| display_name | varchar | |
| visibility | varchar | proposed: `public`, `private`, `unverified` |
| created_at | timestamptz | |
| updated_at | timestamptz | |

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
| name | varchar, unique | |
| category | varchar | flat grouping, no hierarchy in v1 |

### `profile_skills`
| Column | Type | Notes |
|---|---|---|
| id | uuid pk | |
| profile_id | uuid, fk → profiles.id | |
| skill_id | uuid, fk → skills.id | |
| claim_type | varchar | `self_declared`, `evidenced` |
| proficiency_level | varchar | proposed: `beginner`, `intermediate`, `advanced`, `expert` |
| created_at | timestamptz | |

### `evidence`
| Column | Type | Notes |
|---|---|---|
| id | uuid pk | |
| profile_id | uuid, fk → profiles.id | |
| uploader_id | uuid, fk → users.id | who performed the upload action |
| source_type | varchar | proposed: `document`, `screenshot`, `certificate`, `link`, `testimonial` |
| file_url | varchar | S3 URL, nullable if source_type = link |
| title | varchar | |
| description | text | nullable |
| verification_status | varchar | `pending`, `verified`, `rejected` |
| uploaded_at | timestamptz | |

### `evidence_skill_links`
| Column | Type | Notes |
|---|---|---|
| id | uuid pk | |
| evidence_id | uuid, fk → evidence.id | |
| profile_skill_id | uuid, fk → profile_skills.id | |

---

## Services & Opportunities

### `services`
| Column | Type | Notes |
|---|---|---|
| id | uuid pk | |
| profile_id | uuid, fk → profiles.id | |
| title | varchar | |
| description | text | |
| rate_type | varchar | proposed: `hourly`, `fixed`, `retainer` |
| rate_amount | numeric | |
| availability_status | varchar | proposed: `available`, `booked`, `unavailable` |
| created_at | timestamptz | |

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
| Column | Type | Notes |
|---|---|---|
| id | uuid pk | |
| requestor_id | uuid, fk → users.id | |
| target_type | varchar | e.g. `profile_skill`, `identity_doc`, `organization` |
| target_id | uuid | soft reference, not FK-enforced |
| status | varchar | `pending`, `approved`, `rejected` |
| reviewed_by | uuid, fk → users.id, nullable | |
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
