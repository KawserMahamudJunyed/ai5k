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

## Installation

### Prerequisites

- **Python 3.12.** Not 3.14 — `docling` and a few other dependencies don't ship
  wheels for it yet.
- **Node.js 18.17 or newer**, for Next.js 14.
- **PostgreSQL**, running locally, for the main backend.
- A **Gemini API key** from <https://ai.google.dev>. The free tier is enough.
  A local [Ollama](https://ollama.com) instance works instead if you'd rather
  not use Gemini.
- A **RapidAPI key** subscribed to both `upwork-scraping-api` and
  `fiverr-scrapper-free`. Optional — without it the manual paste box still
  works.

Start the services in the order below. The main backend calls the evaluation
service, not the other way round, so `ai-backend` has to be up first.

### 1. `ai-backend` — evaluation service

```bash
cd ai-backend
python3.12 -m venv .venv
.venv/bin/pip install -r requirements.txt     # macOS/Linux
# .venv\Scripts\pip install -r requirements.txt   # Windows
```

Create `ai-backend/.env`:

```bash
GEMINI_API_KEY="your-key-here"
RAPID_API_KEY="your-key-here"       # optional
GITHUB_TOKEN="your-token-here"      # optional: 60 req/hour → 5000
```

Run it on 8001, which is where the main backend expects it:

```bash
.venv/bin/python -m uvicorn app.main:app --port 8001
```

Standalone, it defaults to 8000 and serves its own UI at
<http://127.0.0.1:8000/> — upload a native PDF or DOCX CV, add a GitHub
username, an Upwork profile ID and a Fiverr username, submit.

To run against a local model instead of Gemini, `ollama pull qwen2.5:7b` once,
then set `LLM_PROVIDER=ollama` in `.env`. No GPU needed, just slower per call.
`app/llm/client.py` is the only file that knows which backend is live.

There's no single test runner. Each module carries its own smoke test, meant to
be read as much as run:

```bash
.venv/bin/python -m app.scoring.smoke_test               # no LLM calls
.venv/bin/python -m app.ingestion.smoke_test_github      # no LLM calls
.venv/bin/python -m app.ingestion.smoke_test_upwork_api  # no LLM or API calls
.venv/bin/python -m app.generation.smoke_test_live       # real generation
```

`requirements-dev.txt` adds Playwright, fpdf2 and python-docx for the
browser-based test in `scripts/test_walking_skeleton.py`. Playwright then needs
`python -m playwright install chromium`.

The standalone search script has its own much smaller dependency set:

```bash
pip install requests ddgs python-dotenv
python test.py "https://www.upwork.com/freelancers/~01abc..."
```

### 2. `backend` — main backend

```bash
cd backend
python3.12 -m venv .venv
.venv/bin/pip install -r requirements.txt
```

Create `backend/.env` with `DATABASE_URL`, `SECRET_KEY`, the token TTLs, the
Cognito pool settings, `RAPID_API_KEY`, `GITHUB_TOKEN`, and `LLM_BACKEND_URL`
pointing at the evaluation service (it defaults to `http://127.0.0.1:8001`).

Then create the database, migrate, and seed:

```bash
createdb ai5k
.venv/bin/python -m alembic upgrade head
PYTHONPATH=. .venv/bin/python scripts/seed_roles_permissions.py
.venv/bin/python -m uvicorn app.main:app --port 8000
```

Set `UPWORK_API_OFFLINE=true` while developing. Upwork's quota is about **50
calls per month**; responses are cached per profile under
`backend/var/upwork_api_cache/` and read before any network call, so repeat
runs on the same profile cost nothing. The flag turns a cache miss into an
error rather than a live call, which makes an accidental burn impossible.
Fiverr allows 10,000/month and isn't a practical constraint.

Every route needs a bearer token. In local dev, signup returns the
verification token directly, so three calls get you one:

```bash
curl -X POST localhost:8000/api/v1/auth/signup \
  -H 'Content-Type: application/json' \
  -d '{"email":"you@example.com","password":"testpassword123","full_name":"You"}'
curl -X POST localhost:8000/api/v1/auth/verify-email \
  -H 'Content-Type: application/json' -d '{"token":"<verification_token>"}'
curl -X POST localhost:8000/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"you@example.com","password":"testpassword123"}'
```

Submitting a check returns `202` and a `check_id`; the work runs in the
background and you poll `/api/v1/profile-checks/{id}` for the verdict. All four
sources are optional — send at least one. Adding `?wait=true` runs it inline
and returns the finished verdict, which is good for curl and tests and will
time out in a browser, since a real CV parse plus the model calls takes
minutes.

### 3. `frontend`

```bash
cd frontend
npm install
npm run dev
```

<http://localhost:3000>. `npm run build` and `npm start` for production,
`npm run lint` for eslint.

Deployment is zero-config on Vercel: import the repo, confirm the framework
preset is Next.js, and the build settings are detected automatically.

## Repository state

Most of the application code is not committed yet. What's here:

- `backend/app/models/` — the SQLAlchemy models, complete
- `ai-backend/test.py` — the multi-provider search script, complete
- `frontend/` — lockfile and TypeScript shim only, no `package.json`, no source
- `fiverr/`, `upwork/` — complete

`backend/app/api`, `core`, `schemas`, `integrations`, `services`, along with
`backend/alembic`, `backend/scripts` and `backend/tests`, exist as empty
directories. None of the `requirements.txt` files are committed either.

So the installation steps above are the correct process for this project, and
they will not run against a fresh clone until that source lands. Full histories
for `frontend` and `ai-backend` are sitting in `_git-history-backup/*.bundle`
outside the repo; inspect one with `git clone <file>.bundle <dir>`.

For reference, the backend venv currently has:

```
fastapi==0.141.1        SQLAlchemy==2.0.54      alembic==1.20.0
uvicorn==0.53.0         asyncpg==0.31.0         greenlet==3.5.6
pydantic==2.13.5        pydantic-settings==2.15.0
PyJWT==2.14.0           bcrypt==5.0.0           email-validator==2.3.0
python-multipart==0.0.32  python-dotenv==1.2.3  httpx==0.28.1
docling==2.124.0
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
