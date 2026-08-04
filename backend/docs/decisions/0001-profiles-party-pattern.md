# ADR 0001: `profiles` party pattern instead of dual nullable FKs

**Status:** Accepted
**Date:** 2026-07-25
**Owner:** Habibullah

## Context

Early schema draft had `profile_skills`, `services`, `matches`, and `engagements` each carry two
separate nullable foreign keys — one to `users`, one to `organizations` — to represent "this thing
belongs to either an individual or an org." Example (old shape):

```
services {
  owner_user_id uuid   -- nullable
  organization_id uuid -- nullable
}
```

This is a repeated polymorphic-association pattern across 4 tables. Problems:

- No database-level guarantee that exactly one of the two FKs is set (would need a `CHECK`
  constraint repeated 4 times, easy to forget on a 5th table later).
- Every query and every service that needs "who owns this" has to branch on which FK is non-null.
- `users` and `organizations` become high-fan-out hub nodes in the ERD (each connects to ~8-9
  other tables), which made the diagram hard to read and hard to reason about.

## Decision

Introduce a single `profiles` entity:

```
profiles {
  id uuid pk
  owner_type varchar   -- "individual" | "organization"
  user_id uuid          -- nullable, set when owner_type = individual
  organization_id uuid  -- nullable, set when owner_type = organization
}
```

`profile_skills`, `services`, `matches`, and `engagements` now reference `profiles.id` with a
single FK each, instead of two.

## Consequences

- Code that used to check `if owner_user_id else organization_id` now checks
  `profiles.owner_type` instead. **This touches Kawser (2.1/2.3 — individual/org profile CRUD)
  and Sakibul (3.3 — matching engine)** — flagged before the Week 2 schema freeze.
- One `CHECK` constraint on `profiles` (exactly one of `user_id`/`organization_id` set) replaces
  what would have been 4 repeated constraints.
- `users` and `organizations` are no longer directly wired to marketplace-facing tables — cleaner
  ERD, and conceptually correct: a user "has" a profile, rather than a service "belonging to" a
  user directly.
- Slight extra join (`profiles` → `users`/`organizations`) when resolving display info — acceptable
  trade for the pilot's scale.

## Alternatives considered

- **Single-table inheritance on `users`** (add an `is_organization` flag to `users` and let orgs be
  a special kind of user) — rejected, conflates login/account identity with marketplace presence,
  and organizations don't log in.
- **Keep dual nullable FKs, add CHECK constraints** — rejected, doesn't solve the hub fan-out or
  the repeated-pattern maintenance burden.
