# AI5K Backend

Skills & evidence marketplace pilot. 4-week build, Jul 27 – Aug 23, 2026.

> **New here?** Start with [`BACKEND-MANUAL.md`](./BACKEND-MANUAL.md) — the cross-team manual
> for the infrastructure, frontend, and documentation teams (how to run/deploy, API reference,
> auth flows, doc map).

## What this service does

The backend owns the relational core of AI5K: identity/RBAC, profiles, skills & evidence,
opportunities → matching → proposals, engagements, reviews, verification, audit logging, and
platform-rule checking. It exposes a REST API consumed by the Next.js frontend and by internal
AI/LLM services (matching engine, proposal assistant, semantic search).

## Stack

| Layer | Choice |
|---|---|
| API framework | FastAPI |
| ORM | SQLAlchemy |
| Migrations | Alembic |
| Database | PostgreSQL (Aurora in AWS) |
| Auth | AWS Cognito |
| Vector / search | pgvector or OpenSearch (final choice per Task 1.8) |
| Automation | n8n (intake pipelines, ops alerts) |

## Docs in this folder

| File | Purpose |
|---|---|
| `BACKEND-MANUAL.md` | **Entry point for other teams** — run/deploy, API reference, auth flows, doc map |
| `erd.md` | Entity relationship diagram + narrative walkthrough of the schema |
| `data-dictionary.md` | Every table, every column, types and meaning |
| `environment-setup.md` | How to get the service running locally |
| `api-conventions.md` | REST naming, pagination, error shape, auth headers |
| `rbac.md` | Roles, permissions, and how scoping works |
| `auth.md` | Cognito signup/login/token flow |
| `audit-logging.md` | What gets logged, naming convention, retention |
| `migrations.md` | Alembic conventions |
| `glossary.md` | Domain terms (profile vs user vs org, etc.) |
| `decisions/` | Short ADRs for schema/architecture decisions |

## Team (Backend role group)

| Person | Focus |
|---|---|
| Habibullah Mahmud (lead) | Relational core, RBAC, audit logs, interim security |
| Kawser Mahamud Junyed | APIs, contracts, milestones, payouts |
| Zahid Hasan | Search & data pipelines (interim data eng) |
| Md. Shahjada Alif | Opportunity intake, integrations |

## Getting started

See `environment-setup.md`. Short version: clone, copy `.env.example` to `.env`, `docker compose up`,
`alembic upgrade head`.

## Scope boundaries (4-week pilot)

Out of scope for this build: payment execution, external-platform API integrations, agent/IP
commerce. Engagement fee fields exist for tracking only — no payout logic.
