# ai5k

Two things live in this repository. A profile-readiness service that scores a
freelancer's public evidence, and a pair of written operating systems for
selling AI work on Upwork and Fiverr.

They share a subject — an AI freelancer's market presence — and not much else.
The first is code. The second is documentation you execute by hand.

## Profile readiness

A freelancer submits a CV, a GitHub URL, an Upwork URL and a Fiverr URL. The
system fetches those sources, scores the evidence against a niche benchmark,
and returns a readiness verdict with ranked gaps and a rewritten title and
overview.

```
frontend
  → POST /api/v1/profile-checks        store the CV and the four inputs
  → fetch GitHub / Upwork / Fiverr     cache-first
  → store raw payloads
  → POST /evaluate                     score it
  → store result
  → GET /api/v1/profile-checks/{id}    poll for the verdict
```

Scoring runs in a separate service that never touches a database, a file, or an
external data source. Same request body, same verdict, every time. That purity
is what lets the main backend call it with whatever subset of the four sources
actually came back — a check where Fiverr ran out of quota still returns a
result, marked `partial`, built from the three payloads that worked.

### `backend/` — main backend

FastAPI, async SQLAlchemy, PostgreSQL, Alembic. Owns all I/O: auth, CV uploads,
RapidAPI and GitHub fetching, caching, persistence. Scores nothing.

The domain is three tables, one per stage of a check:

| Table | Holds |
|---|---|
| `profile_checks` | the submission, its four inputs, overall status |
| `profile_check_sources` | one row per source — the raw payload, or the failure |
| `profile_check_results` | what the evaluator returned |

`profile_check_sources` is what makes partial results honest. It records the
difference between "your Fiverr profile couldn't be read", "you didn't give us
a Fiverr profile", and "your Fiverr profile is empty". Those are three
different things to tell a user.

Identity is separate: users, organizations, roles, permissions, and an audit
log, in `app/models/identity.py` and `app/models/audit.py`.

### `ai-backend/` — search and evaluation

`test.py` searches a public Upwork or Fiverr profile URL across several search
providers at once, merges and deduplicates the hits, scores likely matches, and
writes structured JSON.

```bash
pip install requests ddgs python-dotenv
python ai-backend/test.py "https://www.upwork.com/freelancers/~01abc..."
python ai-backend/test.py "https://www.fiverr.com/username" --max-results 10
```

Providers are Brave, Tavily, Exa, Firecrawl, SerpAPI (Google and Bing), Serper,
Google Custom Search, and DuckDuckGo as a keyless fallback. Each one is enabled
by its key being present and skipped when it isn't, so the script runs with one
key or with all of them.

### `frontend/`

Next.js 14, React 18, TypeScript, framer-motion.

## Marketplace playbooks

`fiverr/` and `upwork/` are complete written systems for positioning and
selling enterprise AI work on each platform — nine numbered documents each,
plus machine-readable exports.

| | `fiverr/` | `upwork/` |
|---|---|---|
| Positioning | seller profile, brand identity, video script | general profile plus two specialized profiles |
| Offerings | 5 launch gigs with packages, extras, FAQs | 5 Project Catalog offerings, 2 consultations |
| Winning work | keyword intent matrix, escalation pricing | 15 proposal templates, Connects ROI strategy |
| Delivery | 22 templates, 17-stage delivery model | 20 templates, hourly and fixed-price SOPs |
| Measurement | 27 KPIs, experiment framework, 365-day plan | 25 KPIs, proposal A/B testing, 365-day roadmap |
| Risk | 32-item register | 30-item register |

Both carry an automation policy register, a relational schema for running the
system in Notion, Airtable or Supabase, and a reusable optimizer skill in YAML.
Start at `fiverr/README.md` or `upwork/README.md`.

## Getting started

Follow these steps in order, from the repository root. At the end you will
have PostgreSQL, the API on <http://localhost:8000> and the web app on
<http://localhost:3000> running.

You run two processes plus a database. There is no separate evaluation service
to start: the backend loads `ai-backend/test.py` directly, in-process.

### Step 0 — Install the prerequisites

| Tool | Version | Check with |
|---|---|---|
| Python | 3.12 (3.11 also works; **not** 3.14) | `python3.12 --version` |
| Node.js | 18.17 or newer | `node --version` |
| Docker Desktop | any recent version, for PostgreSQL | `docker --version` |
| Git | any | `git --version` |

If you'd rather use a PostgreSQL you installed yourself, skip Docker and make
sure a server is listening on `localhost:5432`.

### Step 1 — Get the code

```bash
git clone <repo-url> ai5k
cd ai5k
```

### Step 2 — Start PostgreSQL

```bash
cd backend
docker compose up -d
```

This starts Postgres 16 on port 5432 with user `postgres`, password
`postgres`, and an empty database called `ai5k`. Wait a few seconds, then
confirm it's healthy:

```bash
docker compose ps        # STATUS should say "healthy"
```

*Using your own Postgres instead:* run `createdb ai5k` and adjust
`DATABASE_URL` in step 4 to match your user and password.

### Step 3 — Install the backend's Python packages

Still inside `backend/`:

```bash
python3.12 -m venv .venv
.venv/bin/pip install --upgrade pip
.venv/bin/pip install -r requirements-dev.txt
```

On Windows, use `.venv\Scripts\pip` and `.venv\Scripts\python` wherever these
steps say `.venv/bin/pip` and `.venv/bin/python`.

`requirements-dev.txt` includes everything in `requirements.txt` plus pytest.

### Step 4 — Create the backend `.env`

```bash
cp .env.example .env
```

The defaults are enough to run locally. The only value you must look at is
`DATABASE_URL`; it already matches the Docker database from step 2:

```bash
DATABASE_URL=postgresql+asyncpg://postgres:postgres@localhost:5432/ai5k
```

Optional, but recommended:

```bash
GITHUB_TOKEN=ghp_...          # raises GitHub's limit from 60 to 5000 requests/hour
UPWORK_API_OFFLINE=true       # never spend live Upwork calls while developing
```

Leave the `COGNITO_*` and `AWS_*` values empty. Local sign-up and login work
without them.

### Step 5 — Create the tables and seed the roles

Still inside `backend/`:

```bash
.venv/bin/python -m alembic upgrade head
PYTHONPATH=. .venv/bin/python scripts/seed_roles_permissions.py
```

The second command should end with
`Done: professional, org_admin, platform_admin roles + permission mappings.`
Both commands are safe to run again.

### Step 6 — Start the backend

```bash
.venv/bin/python -m uvicorn app.main:app --reload --port 8000
```

Leave this terminal open. Check it from a second terminal:

```bash
curl http://localhost:8000/health
```

The interactive API docs are at <http://localhost:8000/docs>.

### Step 7 — (Optional) Add web-search keys

The profile check uses `ai-backend/test.py` to look up Upwork and Fiverr
profiles. It works with no keys at all, using DuckDuckGo. For better results,
create `ai-backend/.env` and fill in whichever providers you have:

```bash
BRAVE_API_KEY=
TAVILY_API_KEY=
EXA_API_KEY=
FIRECRAWL_API_KEY=
SERPAPI_API_KEY=
SERPER_API_KEY=
GOOGLE_CSE_API_KEY=
GOOGLE_CSE_CX=
```

An empty value turns that provider off. Restart the backend (step 6) after
changing this file.

### Step 8 — Start the frontend

Open a new terminal at the repository root:

```bash
cd frontend
cp .env.local.example .env.local
npm install
npm run dev
```

`.env.local` points the app at `http://localhost:8000/api/v1`. Open
<http://localhost:3000>.

### Step 9 — Create an account and run a check

1. Go to <http://localhost:3000/signup> and create an account.
2. In local dev, no email is sent. The sign-up response includes the
   verification token, and the app takes you through verification.
3. Log in, open **Analyze**, and submit any of the four inputs: a CV (PDF or
   DOCX), a GitHub URL, an Upwork URL or a Fiverr URL. You need at least one.
4. The check runs in the background, and the page shows the verdict when it
   finishes.

To do the same with curl instead of the browser:

```bash
curl -X POST localhost:8000/api/v1/auth/signup \
  -H 'Content-Type: application/json' \
  -d '{"email":"you@example.com","password":"testpassword123","full_name":"You"}'
# copy "verification_token" from the response, then:
curl -X POST localhost:8000/api/v1/auth/verify-email \
  -H 'Content-Type: application/json' -d '{"token":"<verification_token>"}'
curl -X POST localhost:8000/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"you@example.com","password":"testpassword123"}'
# use "access_token" from the response as:  -H "Authorization: Bearer <token>"
```

`POST /api/v1/profile-checks` returns `202` and a `check_id`; poll
`GET /api/v1/profile-checks/{id}` for the verdict. Add `?wait=true` to the
POST to get the finished result in one call, which is handy for curl.

### Next time: the short version

After the first setup, you only need:

```bash
cd backend && docker compose up -d && cd ..
bash scripts/dev-start.sh
```

`scripts/dev-start.sh` starts the backend and the frontend in the background
and prints the URLs once both answer. Logs go to `/tmp/ai5k-api.log` and
`/tmp/ai5k-web.log`. Running it again restarts both.

If you pulled new code, run `.venv/bin/python -m alembic upgrade head` in
`backend/` first in case there are new migrations.

### Running the tests

```bash
cd backend
.venv/bin/python -m pytest
```

### Troubleshooting

| Symptom | Fix |
|---|---|
| `connection refused` on port 5432 | Postgres isn't running. `cd backend && docker compose up -d` |
| `database "ai5k" does not exist` | Own-Postgres setup: run `createdb ai5k` |
| `relation "..." does not exist` | Migrations haven't run. Step 5 |
| Login works but pages return 403 | Roles weren't seeded. Run the seed script in step 5 |
| `pip install` fails building a wheel | You're on Python 3.13 or 3.14. Recreate `.venv` with `python3.12` |
| Frontend shows network errors | Backend isn't on port 8000, or `frontend/.env.local` is missing |
| Port 8000 or 3000 already in use | `bash scripts/dev-start.sh` stops old instances, or `lsof -i :8000` |
| Upwork source fails with an offline error | Expected with `UPWORK_API_OFFLINE=true` when that profile isn't cached |

### Upwork quota

Upwork's RapidAPI quota is about **50 calls per month**. Responses are cached
per profile under `backend/var/upwork_api_cache/` and read before any network
call, so repeat runs on the same profile cost nothing. `UPWORK_API_OFFLINE=true`
turns a cache miss into an error instead of a live call. Fiverr allows
10,000/month, so quota isn't a practical concern there.

### About `ai-backend/app/`

The standalone evaluation service (`ai-backend/app/`, meant for port 8001) is
not part of this repository. Only compiled leftovers exist locally, with no
source and no `requirements.txt`, so it cannot be started. You don't need it:
the backend currently gets its web-search corroboration from
`ai-backend/test.py` directly. `LLM_BACKEND_URL` is reserved for when that
service lands.

`ai-backend/test.py` also runs on its own:

```bash
pip install requests ddgs python-dotenv
python ai-backend/test.py "https://www.fiverr.com/username" --max-results 10
```

## Configuration

Every service reads its keys from a `.env` beside it. All `.env` files are
gitignored; commit an `.env.example` instead.

| Variable | Service | Notes |
|---|---|---|
| `GEMINI_API_KEY` | ai-backend | Free tier at <https://ai.google.dev> |
| `RAPID_API_KEY` | both | One key, subscribed to `upwork-scraping-api` **and** `fiverr-scrapper-free` |
| `GITHUB_TOKEN` | both | Optional. A classic token with no scopes is enough |
| `LLM_BACKEND_URL` | backend | Defaults to `http://127.0.0.1:8001` |
| `DATABASE_URL` | backend | PostgreSQL connection string |
| `SECRET_KEY` | backend | Signing key for local tokens |

`ai-backend/test.py` takes one key per search provider — `BRAVE_API_KEY`,
`TAVILY_API_KEY`, `EXA_API_KEY`, `FIRECRAWL_API_KEY`, `SERPAPI_API_KEY`,
`SERPER_API_KEY`, and the `GOOGLE_CSE_API_KEY`/`GOOGLE_CSE_CX` pair. Leave one
empty to turn that provider off.

Rotate anything that has ever been pasted into a shell history or a commit.
