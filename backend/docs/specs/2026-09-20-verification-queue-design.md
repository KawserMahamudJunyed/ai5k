# Verification Queue: Identity Docs & Skill Claims — Design

**Date:** 2026-09-20
**Status:** Approved
**Scope:** Tasks 2.4/2.5 — admin queue to review identity docs (evidence rows) and skill claims
(`profile_skills`), approve/reject with audit logging. Approving a skill claim flips it to
`evidenced`; approving identity-doc evidence flips it to `verified`.

**Doc anchors:** TRD §7.11 (queue + polymorphic target), data-dictionary `verification_requests`,
rbac.md permission split (`verification:review` to view the queue, `verification:approve` to
decide), audit-logging.md verbs (`verification_request.approved` / `.rejected`), erd.md open item
(`target_type` stays app-layer-validated, no CHECK constraint for the pilot).

**Decisions:**
- Target types in scope: `profile_skill`, `identity_doc`. `organization` is reserved (dictionary
  lists it) but not implemented.
- Decision-once: a decided request can never be re-decided (409 `already_decided`).
- No reviewer assignment / work locking — single shared queue for the pilot.
- No notification emails (backend has no email infrastructure).

---

## Data model — migration `0004_add_verification_requests.py`

`verification_requests` (per data-dictionary.md, unchanged):

| Column | Type | Notes |
|---|---|---|
| id | uuid pk | |
| requestor_id | uuid fk → users.id | who filed the request (target's owner) |
| target_type | varchar(32) | `profile_skill` \| `identity_doc` (app-layer validated; `organization` reserved) |
| target_id | uuid | **soft reference, not FK-enforced** (intentional per erd.md) |
| status | varchar(32), default `pending` | `pending` \| `approved` \| `rejected` |
| reviewed_by | uuid fk → users.id, nullable | deciding admin |
| reviewed_at | timestamptz, nullable | decision timestamp |
| created_at | timestamptz | |

Indexes: `status` (queue scan), `(target_type, target_id)` (dedup lookup).

## Endpoints (router `/verification-requests`)

| Route | Who | Behavior |
|---|---|---|
| `POST /verification-requests` | Target's owner (profile manage rights) | Body `{target_type, target_id}`. Resolves the owning profile: `profile_skill` → claim → profile; `identity_doc` → evidence row → profile. Guards: 409 `request_exists` if a pending request for the same target exists; 409 `already_verified` if the target is already verified/evidenced; rejected targets may be resubmitted |
| `GET /verification-requests?status=&page=&page_size=` | `verification:review` | The queue. Default filter `pending`; `status=all` allowed; newest first; offset pagination `{data, total, page, page_size}` |
| `POST /verification-requests/{id}/approve` | `verification:approve` | 409 if already decided. Sets `status=approved`, `reviewed_by`, `reviewed_at`. **Side effects:** `profile_skill` → `claim_type=evidenced`; `identity_doc` → evidence `verification_status=verified`. Optional `{note}` → audit metadata |
| `POST /verification-requests/{id}/reject` | `verification:approve` | Same guards; `status=rejected`. Side effect: `identity_doc` → evidence `verification_status=rejected`. `profile_skill` claims stay `self_declared` (editable/resubmittable) |

## Rules

- **Permission split (rbac.md):** queue listing requires `verification:review`; deciding
  (approve/reject) requires `verification:approve`. `platform_admin` holds both.
- **Decision-once:** the decision lands on the request row AND on the target row in the same
  transaction; re-deciding → 409 `already_decided`.
- Approving a claim automatically feeds the org aggregate's `evidenced_count` (the aggregate
  already counts `claim_type='evidenced'` — no extra wiring).
- Audit: `verification_request.approved` / `verification_request.rejected` with metadata
  `{target_type, target_id, reviewer_id, note?}`; the target's state change is part of the same
  commit.
- Requestor guard on create uses the same `can_manage_profile` used elsewhere (owner / org admin
  for org profiles / platform_admin).

## Files

- New: `models/verification.py`, `alembic/versions/0004_add_verification_requests.py`,
  `schemas/verification.py`, `services/verification.py`, `api/v1/verification.py`,
  `tests/test_verification.py`
- Edited: `models/__init__.py`, `main.py`, docs (data-dictionary, BACKEND-MANUAL §9.17 + §12,
  erd.md status, glossary if needed)

## Test plan (`tests/test_verification.py`)

- `profile_skill` request → approve → `claim_type=evidenced` (and audited)
- `identity_doc` request → approve → evidence `verification_status=verified`
- `identity_doc` request → reject → evidence `verification_status=rejected`; claim reject keeps
  `self_declared`
- Duplicate pending request → 409; already-verified target → 409; resubmit after reject → 201
- Re-decide → 409 `already_decided`
- Permission matrix: professional cannot list (403 `verification:review` missing); reviewer
  (custom role in tests) can list but not decide without `verification:approve`; platform_admin
  both
- Queue filters (`status=pending` default, `all`), pagination envelope
