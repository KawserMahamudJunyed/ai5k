# API Conventions

Proposed defaults — confirm with Sakibul/team during the Task 1.1 architecture workshop, then
treat this file as the source of truth.

## Base URL & versioning

```
/api/v1/...
```

Version in the URL path, not headers. Breaking changes bump to `/api/v2`; additive changes
(new optional fields, new endpoints) don't require a version bump.

## Resource naming

- Plural nouns for collections: `/profiles`, `/opportunities`, `/engagements`
- Nested resources for clear ownership: `/opportunities/{id}/proposals`
- Actions that aren't pure CRUD as verbs on a sub-path: `/opportunities/{id}/status` (PATCH),
  `/verification-requests/{id}/approve` (POST)

## HTTP methods

| Method | Use |
|---|---|
| GET | Read, list |
| POST | Create, or non-idempotent actions (`/approve`, `/publish`) |
| PATCH | Partial update |
| PUT | Full replace (rare — prefer PATCH) |
| DELETE | Soft-delete where the table has a `status`; hard-delete only for join-table rows |

## Pagination

Cursor-based for anything that can grow unbounded (opportunities, audit_logs, matches):

```
GET /opportunities?limit=20&cursor=eyJpZCI6...
```

Response envelope:

```json
{
  "data": [...],
  "next_cursor": "eyJpZCI6...",
  "has_more": true
}
```

Offset pagination (`?page=2&page_size=20`) is acceptable for small, bounded lists (e.g. `roles`,
`skills` categories) where cursor overhead isn't worth it.

## Error shape

Consistent envelope for every non-2xx response:

```json
{
  "error": {
    "code": "verification_request_not_found",
    "message": "No verification request with that id.",
    "details": {}
  }
}
```

`code` is a stable machine-readable string (snake_case), `message` is human-readable, `details`
is optional context (e.g. field-level validation errors).

## Auth header

```
Authorization: Bearer <cognito_id_token>
```

Every authenticated route validates the token and resolves it to a `users.id`. See `auth.md`.

## Filtering & sorting

Query params, not request body, for GET:

```
GET /opportunities?status=qualified&sort=-created_at
```

`-` prefix on `sort` = descending.

## Idempotency

Any endpoint that can be safely retried by an automation pipeline (notably opportunity intake
from n8n) should accept an `Idempotency-Key` header or rely on `opportunities.external_ref` being
unique, whichever the intake module (Task 3.1) settles on.

## Response field naming

`snake_case` throughout, matching the DB columns — no camelCase translation layer unless the
frontend team specifically asks for one.

## Timestamps

ISO 8601, UTC, with `Z` suffix: `2026-07-27T09:00:00Z`.
