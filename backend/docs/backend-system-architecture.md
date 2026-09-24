# Backend System Architecture

Internal architecture of the AI5K backend service — how the FastAPI app is organized, how
requests flow through it, and how it talks to everything else. Complements `erd.md` (data model)
and the team-wide architecture doc from Task 1.1 (stack/repo/API-convention decisions across the
whole project — that one isn't duplicated here).


---

## 1. Service overview

One sentence on what this service is responsible for vs. what other services own.

- Owns: relational core (identity, RBAC, profiles, skills/evidence, opportunities, matching
  records, proposals, engagements, reviews, verification, audit logs, platform rules).
- Does not own: LLM inference itself (calls out to the LLM provider integration layer, Task 1.7),
  search indexing (OpenSearch, Task 2.7 / owned by Data/Search), embeddings (vector store, Task
  1.8), frontend rendering.

## 2. Module layout — `TBD`, confirm at Task 1.1 workshop

Proposed starting point (adjust to match what the team agrees):

```
backend/
├── app/
│   ├── api/            # FastAPI routers, one module per resource
│   │   ├── v1/
│   │   │   ├── users.py
│   │   │   ├── organizations.py
│   │   │   ├── profiles.py
│   │   │   ├── opportunities.py
│   │   │   ├── proposals.py
│   │   │   ├── engagements.py
│   │   │   └── ...
│   ├── models/          # SQLAlchemy models, one module per domain group
│   │   ├── identity.py
│   │   ├── profiles.py
│   │   ├── opportunities.py
│   │   └── ...
│   ├── schemas/         # Pydantic request/response models
│   ├── services/         # business logic, one module per domain group
│   ├── core/             # config, DB session, security/auth dependency, logging
│   ├── workers/           # background jobs (scoring recompute, n8n webhook handlers)
│   └── main.py
├── alembic/
├── tests/
└── docs/
```

Decide: does business logic live in `services/` (thin routers, fat services) or inline in routers
for a 4-week pilot where speed matters more than layering purity? Recommend thin
routers/fat services regardless — it's what makes the AI/LLM team's calls into this backend (e.g.
matching engine reading profiles) predictable.

## 3. Request lifecycle

```
Client request
  → FastAPI router (app/api)
  → Auth dependency (validates Cognito JWT → resolves users.id, see auth.md)
  → RBAC dependency (checks required permission code, see rbac.md)
  → Pydantic schema validation (request body/query params)
  → Service layer (business logic, may call other services below)
  → SQLAlchemy session (DB read/write)
  → Response schema serialization
  → (if state changed) audit_logs write, see audit-logging.md
```

Where does the audit-log write happen — inside the service function, or via a decorator/middleware
that inspects what changed? `TBD` — decide once the first few write endpoints exist, so the
pattern is based on real code rather than guessed upfront.

## 4. Sync vs. async / background work

| Work | Path |
|---|---|
| Standard CRUD (profiles, opportunities, engagements) | Synchronous, in-request |
| Matching engine scoring | `TBD` — synchronous call from proposal flow, or a queued job triggered on opportunity creation? Depends on Sakibul's matching engine design (3.3) |
| Proposal drafting (LLM call) | Likely synchronous from the user-facing "generate draft" action, given the 4-week pilot has no job queue infra yet — confirm with Najib/Tanvir |
| `profile_scores` nightly recompute (2.8) | Background/scheduled job — needs a scheduler decision: cron on the container, or AWS EventBridge → Lambda/ECS task? `TBD`, ties to Task 1.3 (AWS provisioning) |
| n8n intake webhooks (3.1/3.2) | Backend exposes a webhook endpoint n8n calls; ingestion logic runs synchronously in-request unless volume requires otherwise |
| Evidence upload processing | Direct-to-S3 presigned upload from frontend, backend just records metadata — avoids routing file bytes through the API |

No task queue (Celery/SQS worker, etc.) is currently scoped for the pilot. If nightly scoring or
webhook volume needs one, that's a scope conversation, not a silent addition.

## 5. External integrations (what this service calls, and what calls it)

```
                     ┌─────────────────────┐
  n8n  ─────────────▶│                     │◀───── Frontend (Next.js)
 (webhooks)           │   Backend (FastAPI)  │
                     │                     │──────▶ LLM provider layer (Task 1.7)
  Cognito ◀───────────│                     │──────▶ Vector store / OpenSearch (Task 1.8/2.7)
 (token verify)       │                     │──────▶ S3 (evidence files, presigned URLs)
                     └─────────┬───────────┘
                               │
                        Aurora Postgres
```

- **Cognito** — token verification only; backend doesn't manage credentials (see `auth.md`).
- **LLM provider layer** — backend calls it for proposal drafting and buyer-intake brief
  structuring; backend does not call model APIs directly.
- **OpenSearch / pgvector** — backend writes to Postgres as source of truth; a separate indexing
  step (owned by Data/Search, Task 2.7) keeps the search index in sync. `TBD`: sync-on-write vs.
  a periodic reindex job.
- **S3** — evidence files. Backend issues presigned upload URLs; frontend uploads directly;
  backend stores the resulting `file_url` on the `evidence` row.
- **n8n** — calls into a backend webhook endpoint for automated opportunity intake; backend does
  not call out to n8n (one-directional for the pilot).

## 6. Deployment shape — `TBD`, depends on Task 1.2/1.3

- Compute: containerized (Docker), target `TBD` — ECS/Fargate vs. simpler EC2, decided in Task 1.3.
- Database: Aurora Postgres, staging + prod accounts per Task 1.3.
- Secrets: AWS Secrets Manager or SSM Parameter Store — not plain `.env` past local dev.
- CI/CD: GitHub Actions → staging on merge to main, per Task 1.2. Prod deploy is manual/gated
  until Task 4.9 (production deployment).

## 7. Error handling & observability

- Structured logging (JSON), correlation/request id on every log line — `TBD` exact library
  (structlog vs. stdlib logging with a formatter).
- CloudWatch for staging/prod log aggregation (Task 1.3).
- Error responses follow `api-conventions.md`'s envelope.
- Unhandled exceptions → 500 with a generic message to the client, full stack trace to logs only.

## 8. Security notes (interim coverage, Habibullah — Task 4.4 does the formal pass)

- All write endpoints behind auth + RBAC dependency, no exceptions.
- Evidence/file uploads: validate content-type and size before issuing presigned URL.
- Rate limiting: `TBD`, likely at the API Gateway/CloudFront layer rather than in-app.
- Encryption in transit (TLS) via ALB/CloudFront; at rest via Aurora default encryption — confirm
  in Task 1.3.

---

## Open items to resolve at/after the Task 1.1 workshop

- Finalize module layout (Section 2) against whatever repo structure the team agrees on.
- Decide matching-engine and proposal-drafting call pattern (sync vs. queued) with Sakibul/Najib.
- Decide search-index sync strategy with Zahid (2.7).
- Decide scheduler mechanism for nightly scoring job.
- Confirm logging library and correlation-id approach.
