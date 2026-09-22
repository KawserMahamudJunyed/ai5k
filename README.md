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

## Repository state

Most of the application code is not committed yet. What's here:

- `backend/app/models/` — the SQLAlchemy models, complete
- `ai-backend/test.py` — the multi-provider search script, complete
- `frontend/` — lockfile and TypeScript shim only, no `package.json` and no source
- `fiverr/`, `upwork/` — complete

`backend/app/api`, `core`, `schemas`, `integrations`, `services`, along with
`backend/alembic` and `backend/tests`, exist as empty directories. The frontend
won't install or run in this state. Nothing here is a working deployment yet.

## Configuration

Every service reads its keys from a `.env` beside it. All `.env` files are
gitignored; commit an `.env.example` instead.

`backend/.env` needs `DATABASE_URL`, `SECRET_KEY`, token TTLs, the Cognito pool
settings, AWS credentials, `RAPID_API_KEY`, `GITHUB_TOKEN`, and
`LLM_BACKEND_URL` pointing at the evaluation service.

`ai-backend/.env` takes one key per search provider. Leave a key empty to turn
that provider off.

Rotate anything that has ever been pasted into a shell history or a commit.
