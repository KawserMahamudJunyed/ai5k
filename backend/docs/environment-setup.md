# Environment Setup

## Prerequisites

- Python 3.11+
- Docker + Docker Compose
- Poetry or pip (confirm which the team standardizes on in Task 1.1)
- AWS CLI configured (for Cognito / S3 access in staging)

## 1. Clone & install

```bash
git clone git@github.com:CloudCampBD/ai5k.git
cd ai5k/backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
```

## 2. Environment variables

Copy the example file and fill in real values:

```bash
cp .env.example .env
```

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Postgres connection string, e.g. `postgresql+asyncpg://user:pass@localhost:5432/ai5k` |
| `COGNITO_USER_POOL_ID` | AWS Cognito user pool |
| `COGNITO_CLIENT_ID` | Cognito app client id |
| `COGNITO_REGION` | AWS region |
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` | Local dev only — staging/prod use IAM roles |
| `S3_EVIDENCE_BUCKET` | Bucket for evidence file uploads |
| `OPENSEARCH_ENDPOINT` | If OpenSearch is chosen over pgvector (Task 1.8) |
| `LLM_PROVIDER_BASE_URL` | Internal LLM provider integration layer (Task 1.7) |
| `SECRET_KEY` | App-level signing secret |
| `ENV` | `local`, `staging`, `prod` |

Never commit `.env`. `.env.example` should list every key with a placeholder, no real secrets.

## 3. Local database

```bash
docker compose up -d db
alembic upgrade head
```

To seed local dev data (once a seed script exists):

```bash
python scripts/seed_dev_data.py
```

## 4. Run the API

```bash
uvicorn app.main:app --reload --port 8000
```

API docs auto-generated at `http://localhost:8000/docs` (FastAPI/Swagger) — no need to
hand-maintain a separate OpenAPI file.

## 5. Run tests

```bash
pytest
```

## 6. Common issues

| Symptom | Likely cause |
|---|---|
| `alembic upgrade head` fails on a fresh DB | Docker Postgres container not fully started — wait a few seconds, retry |
| Cognito calls fail locally | Missing/incorrect `COGNITO_*` env vars, or IAM permissions on the dev AWS account |
| Import errors on startup | Virtualenv not activated, or `pip install -r requirements.txt` not re-run after a dependency change |

## SSH / GitHub access

Each dev needs an SSH key added to their GitHub account for `git@github.com:CloudCampBD/ai5k.git`
access. See Task 1.2 (repos, branching model, CI/CD) for branch protection rules and PR
requirements.
