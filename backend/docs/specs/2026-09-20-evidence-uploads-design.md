# Evidence Uploads (S3), Skill-Claim Links & Source-Type Tagging — Design

**Date:** 2026-09-20
**Status:** Approved
**Scope:** Task 2.3 precursor — evidence rows with `source_type` tagging, presigned S3 uploads
for file types, linking evidence to skill claims. Verification queue (flip to `verified`) stays
in Tasks 2.4/2.5.

**Decisions (user-approved):**
1. Links work everywhere; file types require a configured bucket (503 `storage_not_configured`
   otherwise) — no local-disk or DB fallback.
2. DELETE removes the row only; the S3 object is left in place (presigned URLs expire; orphan
   reaping is a later concern).

---

## Data model — migration `0003_add_evidence_tables.py`

**`evidence`** (per data-dictionary.md):

| Column | Type | Notes |
|---|---|---|
| id | uuid pk | |
| profile_id | uuid fk → profiles.id, not null | CASCADE |
| uploader_id | uuid fk → users.id, not null | who performed the upload action; SET NULL on user delete is NOT used — dictionary says fk, hard-delete of users is not a pilot flow |
| source_type | varchar(32) | `document` \| `screenshot` \| `certificate` \| `link` \| `testimonial` |
| file_url | varchar(2048), nullable | file types: `s3://{bucket}/{key}`; `link`: the plain `https?://` URL; null otherwise |
| title | varchar(255) | |
| description | text, nullable | |
| verification_status | varchar(32), default `pending` | `pending` \| `verified` \| `rejected` — **server-managed**; only the verification queue changes it |
| uploaded_at | timestamptz, server default now() | |

**`evidence_skill_links`**: id, evidence_id fk → evidence.id (CASCADE), profile_skill_id fk →
profile_skills.id (CASCADE), unique (evidence_id, profile_skill_id).

**File URL convention:** `file_url` stores `s3://{bucket}/{key}` for file types —
region-independent, bucket recorded at write time, reconstructable for presigned GETs.

## Storage layer — `services/storage.py` (new dependency: `boto3`)

- `get_storage(settings)` → `S3Storage | None`; `None` unless `S3_EVIDENCE_BUCKET` is set.
- `S3Storage.presign_put(key, content_type, expires_s)` — presigned PUT (computed locally by
  botocore signer; no network round-trip → safe to call from async paths).
- `S3Storage.presign_get(key, expires_s)` — presigned download for list/detail responses.
- Key format: `evidence/{profile_id}/{uuid}{ext}` — per-profile namespacing, path-traversal-safe.
- Content-type allowlist: `application/pdf`, `image/png`, `image/jpeg`, `image/webp`.
- Extension is derived from the content type (no client-controlled key parts).
- Settings additions: `evidence_upload_ttl_seconds` (default 900), `evidence_download_ttl_seconds`
  (default 300), `s3_evidence_bucket` (exists).

## Endpoints (profile-scoped; manage = owner / org admin of owning org / platform_admin; view per profile visibility)

```
POST   /profiles/{profile_id}/evidence/presign              # file types only; body {source_type, content_type}
                                                            # → {file_key, upload_url, expires_in}
                                                            # 503 storage_not_configured when no bucket
POST   /profiles/{profile_id}/evidence                      # create row
                                                            # file types: {source_type, title, description?, file_key, content_type?}
                                                            #   → file_url built from file_key (prefix `evidence/{profile_id}/` enforced, 422 otherwise)
                                                            # link: {source_type: link, title, url} (https?:// enforced)
                                                            # testimonial: text-only like link (no file)
GET    /profiles/{profile_id}/evidence                      # list (view rights); file rows include
                                                            # `download_url` (short-TTL presigned GET) when storage configured
GET    /profiles/{profile_id}/evidence/{evidence_id}        # detail, same rules
DELETE /profiles/{profile_id}/evidence/{evidence_id}      # manage rights; row only (204)
POST   /profiles/{profile_id}/evidence/{evidence_id}/skill-links           # {profile_skill_id}; claim must belong to the SAME profile
DELETE /profiles/{profile_id}/evidence/{evidence_id}/skill-links/{link_id} # unlink (204)
```

## Rules

- **Same-profile guard:** a skill claim can only be linked to evidence on the same profile
  (`profile_skill.profile_id == evidence.profile_id`, else 404 `skill_claim_not_found`).
- `verification_status` is never client-settable; created rows are `pending`.
- Evidence rows never expose `uploader_id`-based authorization — manage rights on the profile rule.
- Audit actions: `evidence.created`, `evidence.deleted`, `evidence_skill_link.created`,
  `evidence_skill_link.deleted` (verb vocabulary per audit-logging.md).
- Presigned PUT cannot enforce max file size — known limitation; revisit via presigned POST
  policies or gateway limits if abuse shows up during the pilot.

## Files

- New: `models/evidence.py`, `alembic/versions/0003_add_evidence_tables.py`,
  `schemas/evidence.py`, `services/evidence.py`, `services/storage.py`, `api/v1/evidence.py`,
  `tests/test_evidence.py`
- Edited: `models/__init__.py`, `core/config.py` (2 TTL knobs), `main.py` (router),
  `requirements.txt` (+boto3), docs (data-dictionary status, BACKEND-MANUAL §9/§12, erd.md,
  glossary.md, decisions/ERD.md)

## Test plan (`tests/test_evidence.py`)

Link evidence end-to-end (create → list → link claim → unlink → delete) with no storage
configured; file-type flow with a monkeypatched/fake storage (presign returns deterministic URL;
prefix validation rejects foreign `file_key`); same-profile claim-link guard; permission matrix
(stranger cannot create/list/delete; private-profile view rules); source-type validation
(`link` with `file_key` → 422, file type without key → 422); audit rows written; 503 when file
type requested without bucket.
