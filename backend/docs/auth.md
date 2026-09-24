# Auth

AWS Cognito is the identity provider (Task 1.3/1.6). This backend never stores raw passwords for
Cognito-managed accounts — `users.password_hash` exists only as a fallback if a non-Cognito path
is ever needed; default path is Cognito-only.

## Flow

1. **Signup** — frontend calls Cognito directly (hosted UI or SDK) to create the account and
   trigger email verification.
2. **Confirm email** — user clicks the verification link / enters the code; Cognito marks the
   account confirmed.
3. **First login** — frontend exchanges credentials with Cognito, receives an ID token (JWT) and
   refresh token.
4. **Backend sync** — on first authenticated call, the backend checks for a `users` row matching
   the token's `sub` claim. If none exists, it creates one (`cognito_sub`, `email`, `full_name`
   from token claims) and assigns the default `professional` role via `user_roles`.
5. **Subsequent requests** — frontend sends `Authorization: Bearer <id_token>` on every request.
   The backend verifies the JWT signature against Cognito's public JWKS, checks expiry, and
   resolves `cognito_sub` → `users.id`.
6. **Token refresh** — frontend uses the refresh token against Cognito directly; backend doesn't
   handle refresh.

## Role-based access

Signup always grants `professional`. `org_admin` is granted when a user creates or is invited into
an organization (`organization_members` row with `consent_given = true` triggers a `user_roles`
row scoped to that org). `platform_admin` is granted manually by an existing platform_admin via
`rbac:manage` — no self-serve path.

## Token verification (backend responsibility)

- Fetch and cache Cognito's JWKS (public keys) at startup, refresh periodically.
- Verify signature, `iss`, `aud`/`client_id`, and `exp` on every request.
- Reject expired or malformed tokens with a `401` in the standard error envelope
  (`api-conventions.md`).

## Session/logout

Stateless — no server-side session table. Logout is a frontend-side token discard plus a Cognito
global sign-out call if "sign out everywhere" is needed.

## Local development

For local dev without hitting real Cognito on every request, use a Cognito test/sandbox user pool
(separate from staging/prod) — details TBD alongside Task 1.3 (AWS environment provisioning).
