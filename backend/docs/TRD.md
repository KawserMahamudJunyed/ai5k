# Technical Requirements Document (TRD) — AI5K Backend

**Project:** AI5K — Skills & Evidence Marketplace Pilot  
**Document Version:** 1.0  
**Date:** July 28, 2026  
**Build Window:** Jul 27 – Aug 23, 2026 (4 weeks)  
**Author:** Compiled from backend docs (Habibullah Mahmud, et al.)

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Technology Stack](#2-technology-stack)
3. [System Architecture](#3-system-architecture)
4. [Data Model & Schema](#4-data-model--schema)
5. [API Design](#5-api-design)
6. [Authentication & Authorization](#6-authentication--authorization)
7. [Domain Modules & Features](#7-domain-modules--features)
8. [Integrations](#8-integrations)
9. [Security Requirements](#9-security-requirements)
10. [Environment & Deployment](#10-environment--deployment)
11. [Non-Functional Requirements](#11-non-functional-requirements)
12. [Timeline & Milestones](#12-timeline--milestones)
13. [Glossary of Terms](#13-glossary-of-terms)
14. [Open Items & Decisions Pending](#14-open-items--decisions-pending)

---

## 1. Executive Summary

### 1.1 Purpose

The AI5K backend is the relational core of a skills-and-evidence marketplace platform. It manages identity, RBAC, profiles, skills & evidence, opportunities-to-engagement pipeline, matching, proposals, reviews, verification, audit logging, and platform-rule checking. It exposes a REST API consumed by a Next.js frontend and by internal AI/LLM services (matching engine, proposal assistant, semantic search).

### 1.2 Scope (In-Scope)

- Identity management & RBAC (Cognito-backed)
- Profile management (individual & organization, using the party pattern)
- Skills taxonomy, skill claims, and evidence uploads
- CRM-style opportunity management
- Matching engine scoring records
- Proposal drafting workflow (LLM-assisted)
- Engagement management with milestones
- Review system for completed engagements
- Verification queue for identity docs & skill claims
- Audit logging for security & compliance
- Platform rule checking for external-channel automation
- REST API consumed by Next.js frontend & AI services

### 1.3 Scope (Out-of-Scope for Pilot)

- Payment execution / payout logic (fee fields exist for tracking only)
- External-platform API integrations (Upwork, Fiverr, etc.)
- Agent/IP commerce
- Job queue / Celery / SQS worker infrastructure
- Production deployment & hardening (weeks 3-4)

### 1.4 Team (Backend Role Group)

| Person | Focus |
|---|---|
| Habibullah Mahmud (lead) | Relational core, RBAC, audit logs, interim security |
| Kawser Mahamud Junyed | APIs, contracts, milestones, payouts |
| Zahid Hasan | Search & data pipelines (interim data eng) |
| Md. Shahjada Alif | Opportunity intake, integrations |

---

## 2. Technology Stack

| Layer | Technology | Rationale |
|---|---|---|
| **API Framework** | FastAPI (Python) | Async-first, auto-generated OpenAPI/Swagger docs, Pydantic integration |
| **ORM** | SQLAlchemy | Mature, async support via `asyncpg`, Alembic integration |
| **Migrations** | Alembic | Auto-generate migrations from model changes |
| **Database** | PostgreSQL (Aurora in AWS) | Relational core, JSONB support, UUID support |
| **Vector / Search** | pgvector **or** OpenSearch (TBD) | Semantic search for matching & skills graph |
| **Authentication** | AWS Cognito | Managed identity provider, JWT-based, social signup support |
| **Schema Validation** | Pydantic | Request/response validation, integrated with FastAPI |
| **Automation** | n8n | Intake pipelines, ops alerts (calls backend webhooks) |
| **Containerization** | Docker | Consistent local dev, deployable to ECS/Fargate |
| **CI/CD** | GitHub Actions | Staging deploy on merge to main |
| **Logging** | JSON structured logging (structlog vs stdlib — TBD) | Correlation IDs, CloudWatch integration |

---

## 3. System Architecture

### 3.1 Service Ownership Boundaries

- **Owns:** Identity & RBAC, profiles, skills & evidence, opportunities, matching records, proposals, engagements, reviews, verification, audit logs, platform rules.
- **Does not own:** LLM inference (calls out to LLM integration layer), search indexing (separate OpenSearch pipeline), embeddings (vector store), frontend rendering.

### 3.2 Module Layout (Proposed)

```
backend/
├── app/
│   ├── api/                    # FastAPI routers
│   │   └── v1/
│   │       ├── users.py
│   │       ├── organizations.py
│   │       ├── profiles.py
│   │       ├── skills.py
│   │       ├── evidence.py
│   │       ├── services.py
│   │       ├── opportunities.py
│   │       ├── matches.py
│   │       ├── proposals.py
│   │       ├── engagements.py
│   │       ├── reviews.py
│   │       ├── verification.py
│   │       ├── audit_logs.py
│   │       ├── platform_rules.py
│   │       └── auth.py
│   ├── models/                 # SQLAlchemy models
│   │   ├── identity.py
│   │   ├── profiles.py
│   │   ├── opportunities.py
│   │   ├── engagements.py
│   │   └── rules.py
│   ├── schemas/                # Pydantic request/response models
│   ├── services/               # Business logic layer
│   ├── core/                   # Config, DB session, auth deps, logging
│   ├── workers/                # Background jobs
│   └── main.py                 # FastAPI app entry point
├── alembic/                    # Migration scripts
├── tests/
├── scripts/                    # Seed data, backfill scripts
└── docs/
```

### 3.3 Request Lifecycle

```
Client Request
  → FastAPI Router (app/api/v1/)
  → Auth Dependency (Cognito JWT validation → resolve users.id)
  → RBAC Dependency (check required permission code)
  → Pydantic Schema Validation (body/query params)
  → Service Layer (business logic)
  → SQLAlchemy Session (DB read/write)
  → Response Serialization (Pydantic → JSON)
  → (if state changed) Audit Log Write
```

### 3.4 Architecture Diagram (Integration View)

```
                     ┌─────────────────────┐
  n8n  ─────────────▶│                     │◀───── Frontend (Next.js)
 (webhooks)           │   Backend (FastAPI)  │
                     │                     │──────▶ LLM Provider Layer (Task 1.7)
  Cognito ◀───────────│                     │──────▶ Vector Store / OpenSearch
 (token verify)       │                     │──────▶ S3 (evidence files)
                     └─────────┬───────────┘
                               │
                        Aurora Postgres
```

### 3.5 Sync vs. Async Work Distribution

| Workload | Execution Model | Notes |
|---|---|---|
| Standard CRUD | Synchronous, in-request | Profiles, opportunities, engagements |
| Matching engine scoring | TBD (sync or queued) | Depends on matching engine architecture |
| Proposal drafting (LLM) | Likely synchronous | No job queue infra in pilot |
| `profile_scores` nightly recompute | Background scheduled job | Needs scheduler: cron vs. EventBridge |
| n8n intake webhooks | Synchronous in-request | Unless volume requires otherwise |
| Evidence upload processing | Direct-to-S3 presigned upload | Backend records metadata only |

---

## 4. Data Model & Schema

### 4.1 Schema Organization (4 Domains)

#### Domain 1: Identity, Organizations & RBAC
**Tables:** `users`, `organizations`, `organization_members`, `roles`, `permissions`, `role_permissions`, `user_roles`

#### Domain 2: Profiles, Skills & Evidence
**Tables:** `profiles`, `profile_scores`, `skills`, `profile_skills`, `evidence`, `evidence_skill_links`

#### Domain 3: Opportunities, Matching & Proposals
**Tables:** `opportunities`, `opportunity_status_history`, `buyer_intake_briefs`, `matches`, `proposals`, `proposal_evidence_links`

#### Domain 4: Engagements, Reviews, Verification, Audit & Rules
**Tables:** `engagements`, `engagement_milestones`, `reviews`, `verification_requests`, `audit_logs`, `platform_rules`, `rule_check_logs`

### 4.2 Key Design Decisions

- **Party Pattern:** A single `profiles` entity replaces dual nullable FKs to `users`/`organizations` across services, matches, and engagements. `owner_type` discriminates `individual` vs `organization`.
- **Soft References:** `audit_logs.entity_id` and `verification_requests.target_id` use soft references (not FK-enforced) so audit/verification rows outlive the entities they describe.
- **JSONB for Flexibility:** `audit_logs.metadata`, `matches.reasoning`, `buyer_intake_briefs.structured_brief`, and `platform_rules.condition` use JSONB for semi-structured data.
- **Varchar Enums:** Enum-like fields use `varchar` + application-layer validation (not DB-enforced enums) so new values don't require migrations during pilot.
- **UUID Primary Keys:** All tables use UUID primary keys generated server-side (`gen_random_uuid()` or app-side UUID4).
- **Timestamps:** All timestamp columns are `timestamptz` (UTC).

### 4.3 Total Schema Size

26 tables across 4 domains, with approximately 200 columns total.

### 4.4 Schema Freeze

After Wednesday of Week 2: no new tables or column changes to core entities (`profiles`, `users`, `organizations`) without sign-off from Habibullah — downstream AI/LLM and frontend work depends on the shape staying stable.

---

## 5. API Design

### 5.1 Base URL & Versioning

```
/api/v1/...
```

Version in URL path. Breaking changes → `/api/v2`. Additive changes (new optional fields, new endpoints) do not require a version bump.

### 5.2 Resource Naming Conventions

- **Plural nouns** for collections: `/profiles`, `/opportunities`, `/engagements`
- **Nested resources** for clear ownership: `/opportunities/{id}/proposals`
- **Verb sub-paths** for non-CRUD actions: `/opportunities/{id}/status` (PATCH), `/verification-requests/{id}/approve` (POST)

### 5.3 HTTP Methods

| Method | Use Case |
|---|---|
| GET | Read, list |
| POST | Create, or non-idempotent actions (`/approve`, `/publish`) |
| PATCH | Partial update (preferred over PUT) |
| PUT | Full replace (rare) |
| DELETE | Soft-delete where table has `status`; hard-delete only for join-table rows |

### 5.4 Pagination

- **Cursor-based** for unbounded collections (opportunities, audit_logs, matches):
  ```
  GET /opportunities?limit=20&cursor=eyJpZCI6...
  
  Response: { "data": [...], "next_cursor": "...", "has_more": true }
  ```
- **Offset-based** for small bounded lists (roles, skills categories):
  ```
  GET /skills?page=1&page_size=50
  ```

### 5.5 Error Response Envelope

Consistent format for all non-2xx responses:

```json
{
  "error": {
    "code": "verification_request_not_found",
    "message": "No verification request with that id.",
    "details": {}
  }
}
```

- `code`: Stable machine-readable string (snake_case)
- `message`: Human-readable description
- `details`: Optional context (field-level validation errors)

### 5.6 Response Field Naming

`snake_case` throughout, matching DB columns — no camelCase translation layer unless frontend team requests it.

### 5.7 Timestamp Format

ISO 8601, UTC, with `Z` suffix: `2026-07-27T09:00:00Z`

### 5.8 Filtering & Sorting

Query params for GET requests:

```
GET /opportunities?status=qualified&sort=-created_at
```

`-` prefix on `sort` = descending order.

### 5.9 Idempotency

Endpoints callable by automation pipelines (especially n8n opportunity intake) must accept an `Idempotency-Key` header or rely on `opportunities.external_ref` uniqueness.

### 5.10 Key API Endpoints (Planned)

| Module | Endpoints |
|---|---|
| **Auth** | POST `/auth/sync` (create user on first login) |
| **Users** | GET/PATCH `/users/{id}` |
| **Organizations** | CRUD `/organizations`, members management |
| **Profiles** | CRUD `/profiles`, scores |
| **Skills** | GET `/skills`, POST `/profiles/{id}/skills` |
| **Evidence** | POST `/evidence/upload-url` (presigned), CRUD `/evidence` |
| **Opportunities** | CRUD `/opportunities`, PATCH status |
| **Matches** | GET `/opportunities/{id}/matches` |
| **Proposals** | CRUD `/opportunities/{id}/proposals`, POST approve |
| **Engagements** | CRUD `/engagements`, milestone management |
| **Reviews** | POST `/engagements/{id}/reviews` |
| **Verification** | GET/POST `/verification-requests`, POST approve/reject |
| **Audit Logs** | GET `/audit-logs` (platform_admin only) |
| **Platform Rules** | CRUD `/platform-rules` |

---

## 6. Authentication & Authorization

### 6.1 Authentication Flow (AWS Cognito)

1. **Signup:** Frontend calls Cognito directly (hosted UI or SDK) → email verification triggered.
2. **Email Confirmation:** User verifies email → Cognito marks account confirmed.
3. **Login:** Frontend exchanges credentials → receives ID token (JWT) + refresh token.
4. **Backend Sync:** On first authenticated API call, backend checks for `users` row matching token's `sub` claim. If none → creates one (`cognito_sub`, `email`, `full_name`) and assigns default `professional` role.
5. **Subsequent Requests:** Frontend sends `Authorization: Bearer <id_token>`. Backend verifies JWT signature against Cognito JWKS, checks expiry, resolves `cognito_sub` → `users.id`.
6. **Token Refresh:** Frontend handles refresh against Cognito directly — backend does not handle refresh.

### 6.2 Token Verification Requirements

- Fetch and cache Cognito's JWKS at startup, refresh periodically
- Verify signature, `iss`, `aud`/`client_id`, and `exp` on every authenticated request
- Reject expired/malformed tokens with `401` in standard error envelope

### 6.3 RBAC Model

#### Roles

| Role | Scope | Description |
|---|---|---|
| `professional` | Platform-wide (default) | Individual building profile, claiming skills, responding to opportunities |
| `org_admin` | Per-organization | Manages one org's profile, members, services |
| `platform_admin` | Platform-wide | Internal team — verification queue, rule management, full visibility |

#### Permission Codes

| Code | Grants |
|---|---|
| `profile:read` | View any public profile |
| `profile:write` | Edit own profile |
| `organization:manage` | Edit org profile, invite/remove members |
| `opportunity:read` | View opportunities |
| `opportunity:write` | Create/edit opportunities |
| `opportunity:assign` | Change `assigned_to` |
| `proposal:approve` | Approve drafted proposal before sending |
| `verification:review` | Act on verification queue items |
| `verification:approve` | Approve/reject verification requests |
| `audit:read` | View audit logs |
| `rbac:manage` | Grant/revoke roles |
| `rule:manage` | Create/edit platform rules |

#### Role-to-Permission Mapping (Suggested)

- `professional` → `profile:write`, `opportunity:read`, `opportunity:write`
- `org_admin` → all `professional` permissions + `organization:manage`
- `platform_admin` → all permission codes

#### Enforcement Pattern

FastAPI dependency resolves Cognito token → loads user roles → checks required permission code per route. Every permission-gated state change also writes an `audit_logs` row.

### 6.4 Session Management

Stateless — no server-side session table. Logout = frontend-side token discard + optional Cognito global sign-out.

---

## 7. Domain Modules & Features

### 7.1 Identity & User Management

- User registration via Cognito (frontend-initiated)
- Automatic user sync on first authenticated API call
- User profile fields: email, full_name, avatar_url, status (active/pending/suspended)
- Account status management (suspend/reinstate by platform_admin)

### 7.2 Organization Management

- Organization creation with name, slug, description, website, logo
- Member management with invited/active/removed status
- Consent tracking for aggregated skill visibility
- Organization profiles on marketplace

### 7.3 Profile Management (Party Pattern)

- Dual-owner profile: individual ↔ organization
- Visibility control: public, private, unverified
- Display name, scores (capability & quality)
- Profiles are the central entity referenced by skills, services, matches, and engagements

### 7.4 Skills & Evidence

- Flat skills taxonomy (name + category, no hierarchy in pilot)
- Skill claims with claim_type (self_declared, evidenced) and proficiency levels
- Evidence upload: documents, screenshots, certificates, links, testimonials
- Presigned S3 upload URLs for evidence files
- Evidence-to-skill linking
- Verification workflow for evidence (pending → verified/rejected)

### 7.5 Services Catalog

- Services offered by profiles
- Rate types: hourly, fixed, retainer
- Availability tracking: available, booked, unavailable

### 7.6 Opportunity Management (CRM)

- Full opportunity lifecycle: new → qualified → proposal_sent → won/lost
- Source channels: manual, email, import (n8n)
- Idempotency key for deduplication (`external_ref`)
- Assignment to internal team members
- Status history with notes (CRM-facing audit trail)
- Buyer intake briefs with LLM-structured output

### 7.7 Matching Engine Integration

- Stores matching engine output: profile scored against opportunity
- Score + reasoning (JSONB) for ranked shortlist
- Integrated into proposal creation flow

### 7.8 Proposal Workflow

- LLM-drafted proposals with human review
- Status workflow: draft → human_reviewed → approved → sent
- Evidence linking to back proposal claims
- Approval requirement before sending

### 7.9 Engagement Management

- Won proposals become engagements
- Scope definition, fee tracking (no payment execution)
- Milestones with due dates and status tracking
- Engagement lifecycle: active → completed/cancelled

### 7.10 Review System

- Buyer reviews on completed engagements
- Separate verified_delivery reviews from imported_testimonials
- 1-5 rating scale with optional comments

### 7.11 Verification Queue

- Admin queue for reviewing identity documents and skill claims
- Polymorphic target reference (identity_doc, profile_skill, organization)
- Approval/rejection workflow with reviewer tracking

### 7.12 Audit Logging

- Append-only log for all sensitive state-changing actions
- Action naming: `entity.verb` past tense (e.g., `user_role.granted`)
- Structured metadata: before/after JSON diff + reason
- Retained through entire pilot (no auto-deletion)
- Access gated by `audit:read` permission (platform_admin only)

**Logged actions (minimum):** RBAC changes, verification decisions, profile/org status changes, proposal approvals, engagement status changes, admin overrides.

**Not logged:** Routine reads, high-frequency low-stakes writes (draft autosaves).

### 7.13 Platform Rules Engine

- Rule definitions per external channel
- Rule types: block, warn
- Rule checking log (allow/block result per attempted action)
- Supports automation pipeline governance

---

## 8. Integrations

### 8.1 External Services Integration Map

| Service | Direction | Protocol | Purpose |
|---|---|---|---|
| **AWS Cognito** | Inbound (verify) | JWKS/HTTPS | Token verification only — backend doesn't manage credentials |
| **LLM Provider Layer (Task 1.7)** | Outbound | HTTP/REST | Backend calls for proposal drafting, buyer-intake brief structuring |
| **OpenSearch / pgvector (Task 1.8/2.7)** | Outbound | HTTP/REST | Search indexing — backend writes to Postgres as source of truth; separate indexing step syncs search index |
| **S3** | Outbound | AWS SDK | Presigned upload URLs for evidence files — frontend uploads directly |
| **n8n** | Inbound | Webhook (HTTP) | One-directional: n8n calls backend webhook for automated opportunity intake |

### 8.2 Integration Constraints

- **No direct LLM model API calls** — backend calls the internal LLM provider layer
- **Search index sync** — TBD: sync-on-write vs. periodic reindex job
- **No task queue** — all integrations are synchronous for the pilot

---

## 9. Security Requirements

### 9.1 Authentication & Authorization

- All write endpoints behind auth + RBAC dependency — no exceptions
- Cognito JWT validation on every authenticated request
- RBAC enforcement at API layer via FastAPI dependency

### 9.2 Data Protection

- TLS encryption in transit (via ALB/CloudFront)
- Aurora default encryption at rest (confirm in Task 1.3)
- Secrets via AWS Secrets Manager or SSM Parameter Store (not `.env` past local dev)
- No plaintext passwords stored (Cognito-only auth path)

### 9.3 File Upload Security

- Validate content-type and file size before issuing presigned S3 URL
- Evidence files uploaded directly from frontend to S3 (backend never routes file bytes)

### 9.4 Rate Limiting

TBD — likely at API Gateway/CloudFront layer rather than in-app.

### 9.5 Audit & Compliance

- All sensitive state changes logged to `audit_logs` table
- Append-only — no deletion during pilot
- Platform_admin-only access to audit logs

### 9.6 Interim Security Coverage

Handled by Habibullah (Tasks 1.4, 4.4). Formal security hardening pass in Task 4.4.

---

## 10. Environment & Deployment

### 10.1 Environment Tiers

| Environment | Purpose | Provisioned In |
|---|---|---|
| **Local** | Development | Developer machine (Docker Compose) |
| **Staging** | Integration testing | AWS (Task 1.3) |
| **Production** | Live | AWS (Task 4.9 — manual/gated) |

### 10.2 Local Development Setup

#### Prerequisites

- Python 3.11+
- Docker + Docker Compose
- Poetry or pip (team decision TBD)
- AWS CLI configured (for Cognito/S3 access in staging)

#### Quick Start

```bash
git clone git@github.com:CloudCampBD/ai5k.git
cd ai5k/backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
docker compose up -d db
alembic upgrade head
uvicorn app.main:app --reload --port 8000
```

#### Key Environment Variables

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Postgres connection string |
| `COGNITO_USER_POOL_ID` | AWS Cognito user pool |
| `COGNITO_CLIENT_ID` | Cognito app client ID |
| `COGNITO_REGION` | AWS region |
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` | Local dev (staging/prod use IAM roles) |
| `S3_EVIDENCE_BUCKET` | Evidence file upload bucket |
| `OPENSEARCH_ENDPOINT` | Search endpoint (if OpenSearch chosen) |
| `LLM_PROVIDER_BASE_URL` | Internal LLM provider layer |
| `SECRET_KEY` | App-level signing secret |
| `ENV` | `local`, `staging`, `prod` |

### 10.3 Deployment Architecture (Staging/Prod)

- **Compute:** Containerized (Docker), target TBD — ECS/Fargate vs. EC2
- **Database:** Aurora Postgres (staging + prod)
- **Secrets:** AWS Secrets Manager or SSM Parameter Store
- **CI/CD:** GitHub Actions → staging on merge to main; prod deploy is manual/gated until Task 4.9
- **Observability:** CloudWatch for log aggregation (JSON structured logging)

### 10.4 Migration Workflow

1. Change SQLAlchemy models
2. `alembic revision --autogenerate -m "<description>"`
3. Review generated migration before committing
4. Test locally: `alembic upgrade head` → `alembic downgrade -1` → `alembic upgrade head`
5. Commit migration in same PR as model change

**Rules:**
- One logical schema change per migration
- Never edit a migration already applied to staging/prod — write a new migration to fix forward
- No data migrations mixed with schema migrations (unless trivial)
- Foreign keys + indexes created in same migration as the table

---

## 11. Non-Functional Requirements

### 11.1 Performance

- Standard CRUD operations complete synchronously in-request
- No job queue infrastructure for the pilot — sync execution for all operations
- Presigned S3 URLs avoid routing file bytes through the API

### 11.2 Observability

- JSON structured logging with correlation/request ID on every log line (format TBD: structlog vs. stdlib)
- CloudWatch for staging/prod log aggregation
- Unhandled exceptions → 500 with generic message to client, full stack trace to logs only

### 11.3 Maintainability

- Thin routers / fat services pattern (business logic in `services/`)
- Separate modules per domain group in models, schemas, and API routers
- Pydantic schemas for request/response validation

### 11.4 Database Conventions

- All `id` columns: UUID, generated server-side
- All timestamp columns: `timestamptz`, UTC
- Enum-like columns: `varchar` + application-layer validation (not DB enums)
- Soft references for audit/verification target entities

### 11.5 Code Quality

- Type hints throughout (Python type annotations)
- Pytest for testing
- Descriptive Alembic revision names (present tense)

---

## 12. Timeline & Milestones

### 12.1 Week 1 (Jul 27 – Aug 1)

- Task 1.1: Architecture workshop — finalize module layout, confirm conventions
- Task 1.2: Repository setup, branching model, CI/CD
- Task 1.3: AWS environment provisioning (DB, Cognito, S3)
- Task 1.4: Core schema DDL + initial Alembic migration
- Task 1.5: Project scaffold (FastAPI app structure, config, DB session)

### 12.2 Week 2 (Aug 2 – Aug 8)

- Task 1.6: Cognito integration + user sync endpoint
- Task 1.6: RBAC implementation (roles, permissions, user_roles, auth dependency)
- Task 2.1: Profile CRUD APIs (individual + organization)
- Task 2.3: Skills + evidence APIs
- Task 3.1: Opportunity intake APIs
- **Wed, Week 2: Schema freeze** — no core entity changes without sign-off

### 12.3 Week 3 (Aug 9 – Aug 15)

- Task 1.7: LLM provider layer integration
- Task 1.8 / 2.7: Search/vector store integration
- Task 2.8: Scoring job setup
- Task 3.3: Matching engine integration
- Task 3.5: Proposal workflow APIs

### 12.4 Week 4 (Aug 16 – Aug 23)

- Task 3.7: Engagement + milestone APIs
- Task 3.8: Platform rules engine
- Task 4.4: Security hardening pass
- Task 4.9: Production deployment (manual/gated)

### 12.5 Key Milestones

| Milestone | Date | Deliverable |
|---|---|---|
| Architecture frozen | Jul 27 | Module layout, conventions, tooling decisions |
| Core schema deployed | Jul 31 | All 26 tables in DB, initial migration |
| Schema freeze | Aug 5 | Core entities locked |
| Auth + RBAC live | Aug 5 | Cognito integration, permission enforcement |
| Core CRUD APIs done | Aug 8 | Profiles, skills, evidence, opportunities |
| AI integrations complete | Aug 15 | LLM drafting, matching, search |
| All major APIs done | Aug 20 | Engagements, reviews, rules, audit |
| Pilot ready | Aug 23 | Security pass, prod deploy, handover |

---

## 13. Glossary of Terms

| Term | Definition |
|---|---|
| **Profile** | Marketplace-facing entity holding skills, services, matches, engagements. Belongs to individual or organization. |
| **User** | Person with Cognito-backed login. Every individual profile has exactly one user; not every user has a profile yet. |
| **Organization** | Company/team account with members and its own profile. |
| **Skill Claim** (`profile_skills`) | A specific skill a profile claims. Can be self-declared or evidenced. |
| **Evidence** | Document, screenshot, certificate, or link uploaded to back a skill claim or identity verification. |
| **Verification** | Admin review process moving a skill claim or identity doc from "self-declared" to "verified." |
| **Opportunity** | Inbound lead — could come from public intake form, manual entry, or automated email import. |
| **Match** | Scoring engine's ranked pairing of an opportunity to a profile with reasoning. |
| **Proposal** | LLM-drafted, human-reviewed response to an opportunity. |
| **Engagement** | Won proposal becomes actual work being delivered. Has milestones and reviews. |
| **Review** | Buyer feedback on completed engagement. |
| **Platform Rule** | Rule governing what automated actions are allowed on external channels. |
| **Audit Log** | Append-only record of sensitive state-changing actions. |
| **RBAC Scope** | Whether a role applies platform-wide or is limited to a single organization. |

---

## 14. Open Items & Decisions Pending

### 14.1 Technical Decisions Required

| Item | Owner | Deadline | Status |
|---|---|---|---|
| Finalize module layout (Section 3.2) | All backend | Task 1.1 workshop | Open |
| Business logic: thin routers/fat services vs. inline | Team consensus | Task 1.1 workshop | Recommended: fat services |
| Matching-engine call pattern (sync vs. queued) | Sakibul | Week 2 | Open |
| Proposal-drafting call pattern | Najib/Tanvir | Week 2 | Open |
| Search-index sync strategy (sync-on-write vs. periodic) | Zahid | Week 2 | Open |
| Scheduler for nightly scoring job | Habibullah | Week 2 | Open |
| Logging library (structlog vs. stdlib) | Habibullah | Week 1 | Open |
| Rate limiting (API Gateway vs. in-app) | Habibullah | Week 1 | Open |
| Package manager (Poetry vs. pip) | Team | Task 1.1 workshop | Open |
| Vector store (pgvector vs. OpenSearch) | Team (Task 1.8) | Week 2 | Open |
| Compute target (ECS/Fargate vs. EC2) | DevOps (Task 1.3) | Week 1 | Open |
| Cognito test/sandbox pool for local dev | DevOps (Task 1.3) | Week 1 | Open |
| Audit log write pattern (service vs. decorator/middleware) | Habibullah | Week 1-2 | Open |
| `platform_admin` sub-roles needed for pilot? | Team | Week 1 | Open |
| Who besides Habibullah needs `rbac:manage`? | Team | Week 1 | Open |
| `verification_requests.target_type` enum/check constraint? | Habibullah | Before schema freeze | Open |

### 14.2 Identified Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Schema freeze delay affects AI/frontend dependencies | Blocked downstream work | Strict freeze enforcement by Habibullah |
| No job queue for async operations | Poor UX on slow operations | Sync execution for pilot; scope conversation if needed |
| Cognito configuration complexity | Slow auth setup | Use sandbox pool for local dev |
| Matching engine integration pattern unclear | Rework | Decide sync vs. queued before implementation |
| LLM provider layer not ready by Week 3 | Delayed proposal drafting | Mock LLM responses for testing |

---

## Appendix A: Database Schema Summary

### Table Count by Domain

| Domain | Tables |
|---|---|
| Identity, Organizations & RBAC | 7 |
| Profiles, Skills & Evidence | 6 |
| Opportunities, Matching & Proposals | 6 |
| Engagements, Reviews, Verification, Audit & Rules | 7 |
| **Total** | **26** |

### All Tables

`users`, `organizations`, `organization_members`, `roles`, `permissions`, `role_permissions`, `user_roles`, `profiles`, `profile_scores`, `skills`, `profile_skills`, `evidence`, `evidence_skill_links`, `services`, `opportunities`, `opportunity_status_history`, `buyer_intake_briefs`, `matches`, `proposals`, `proposal_evidence_links`, `engagements`, `engagement_milestones`, `reviews`, `verification_requests`, `audit_logs`, `platform_rules`, `rule_check_logs`

Full column-level details in `data-dictionary.md`.

## Appendix B: Related Documents

| Document | Location |
|---|---|
| ERD (Entity Relationship Diagram) | `docs/erd.md`, `docs/decisions/ERD.md` |
| Data Dictionary (all columns) | `docs/data-dictionary.md` |
| Architecture Decision Records | `docs/decisions/` |
| Auth Flow | `docs/auth.md` |
| RBAC | `docs/rbac.md` |
| API Conventions | `docs/api-conventions.md` |
| Audit Logging | `docs/audit-logging.md` |
| Migrations | `docs/migrations.md` |
| Environment Setup | `docs/environment-setup.md` |
| Glossary | `docs/glossary.md` |
