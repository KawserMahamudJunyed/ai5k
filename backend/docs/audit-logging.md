# Audit Logging

Single append-only table: `audit_logs`. Owned by Habibullah (Tasks 1.4, 4.4). Feeds the admin
verification workflow (2.6) and the security hardening pass (4.4).

## What gets logged

Any action that changes state and matters for compliance, security review, or dispute resolution.
At minimum:

- RBAC changes (role granted/revoked)
- Verification decisions (approved/rejected identity docs or skill claims)
- Profile/organization status changes (suspended, reinstated)
- Proposal approvals
- Engagement status changes
- Admin overrides of any kind

Not logged here: routine reads, or high-frequency low-stakes writes (e.g. a draft autosave) —
those would bloat the table without adding audit value. If in doubt, log it; storage is cheap,
missing audit trail during an incident isn't.

## `action` naming convention

`entity.verb`, snake_case, past tense on the verb:

```
user_role.granted
user_role.revoked
verification_request.approved
verification_request.rejected
profile.suspended
proposal.approved
opportunity.reassigned
```

Keep the vocabulary of verbs small and consistent: `created`, `updated`, `approved`, `rejected`,
`granted`, `revoked`, `suspended`, `reinstated`, `deleted`.

## `entity_type` / `entity_id`

`entity_type` matches the table name singular (`user`, `organization`, `proposal`,
`verification_request`). `entity_id` is the row's `id` — soft reference, not FK-enforced (an
audit row should outlive the entity it describes, e.g. after a hard delete).

## `metadata` (jsonb)

Store enough to reconstruct what happened without joining back to live data:

```json
{
  "before": {"status": "pending"},
  "after": {"status": "verified"},
  "reason": "Certificate matched LinkedIn profile"
}
```

## `actor_id`

The `users.id` who performed the action. Null only for genuinely system-triggered events (e.g. a
nightly scoring job writing to `profile_scores` — though that's arguably not audit-worthy at all;
audit logging is for actions with a human or security implication, not routine computed jobs).

## Retention

No auto-deletion during the pilot. Revisit retention policy post-launch alongside SOC 2/ISO 27001
groundwork (owned by the future Security Engineer external hire).

## Access

Gated by the `audit:read` permission (`rbac.md`) — `platform_admin` only in v1.
