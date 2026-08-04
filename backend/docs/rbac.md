# RBAC

Owned by Habibullah (Tasks 1.4, 1.6). Backed by `roles`, `permissions`, `role_permissions`,
`user_roles` — see `erd.md` / `data-dictionary.md` for the schema.

## Roles

| Role | Scope | Description |
|---|---|---|
| `professional` | platform-wide (default) | Individual signing up to build a profile, claim skills, respond to opportunities |
| `org_admin` | per-organization | Manages one org's profile, members, services; org-scoped |
| `platform_admin` | platform-wide | Internal team — verification queue, rule management, full visibility |

A user can hold multiple roles (e.g. `professional` platform-wide + `org_admin` for one specific
org) via multiple `user_roles` rows.

## How scoping works

`user_roles.organization_id`:
- **null** → the role applies platform-wide (`professional`, `platform_admin`)
- **set** → the role applies only within that organization (`org_admin` for org X doesn't grant
  anything in org Y)

Permission check pseudocode:

```python
def has_permission(user_id, permission_code, organization_id=None):
    roles = get_user_roles(user_id, organization_id)  # matches null-scope OR this org's scope
    return any(permission_code in role_permissions(r) for r in roles)
```

## Permission codes (proposed — finalize before Week 1 ends)

| Code | Grants |
|---|---|
| `profile:read` | View any public profile |
| `profile:write` | Edit own profile |
| `organization:manage` | Edit org profile, invite/remove members (org_admin) |
| `opportunity:read` | View opportunities |
| `opportunity:write` | Create/edit opportunities |
| `opportunity:assign` | Change `assigned_to` |
| `proposal:approve` | Approve a drafted proposal before it's sent |
| `verification:review` | Act on items in the verification queue |
| `verification:approve` | Approve/reject a verification request |
| `audit:read` | View audit logs |
| `rbac:manage` | Grant/revoke roles |
| `rule:manage` | Create/edit platform rules |

Each `roles` row gets its permission set via `role_permissions`. Suggested starting mapping:

- `professional` → `profile:write`, `opportunity:read`, `opportunity:write`
- `org_admin` → all of `professional`'s + `organization:manage`
- `platform_admin` → all permission codes

## Enforcement

- API layer: a FastAPI dependency resolves the Cognito token to a user, loads their roles, and
  checks the required permission code per route.
- Every permission-gated action that changes state should also write an `audit_logs` row — see
  `audit-logging.md`.

## Open questions for the team

- Does `platform_admin` need finer sub-roles (e.g. separate "verification reviewer" vs "rule
  manager") for the pilot, or is one admin role enough for 4 weeks?
- Who besides Habibullah needs `rbac:manage` during the pilot?
