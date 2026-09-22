
#!/usr/bin/env python3
"""
profile_websearch.py

Search a public Upwork/Fiverr profile URL across multiple web-search providers,
merge/deduplicate results, score likely matches, and save structured JSON.

Supported providers:
- Brave Search API
- Tavily Search API
- Exa Search API
- Firecrawl Search API
- SerpAPI: Google + Bing engines
- Serper: Google
- Google Custom Search JSON API (existing customers only)
- DuckDuckGo (optional, unofficial/no-key fallback via `ddgs`)

Install:
    pip install requests ddgs python-dotenv

API keys are read from the environment, or from a .env file beside this
script (gitignored). Any key left empty disables that provider:
    BRAVE_API_KEY, TAVILY_API_KEY, EXA_API_KEY, FIRECRAWL_API_KEY,
    SERPAPI_API_KEY, SERPER_API_KEY

Optional Google Custom Search:
    GOOGLE_CSE_API_KEY, GOOGLE_CSE_CX

Usage:
    python profile_websearch.py "https://www.upwork.com/freelancers/~01abc..."
    python profile_websearch.py "https://www.fiverr.com/username" --max-results 10
    python profile_websearch.py URL --output my_results.json
"""

from __future__ import annotations

import argparse
import concurrent.futures
import json
import os
import re
import sys
import threading
import time
from dataclasses import dataclass, asdict, field
from typing import Any, Callable
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

import requests


# ============================================================
# API keys come from the environment (see .env, which is gitignored).
# An unset/empty key disables that provider.
# ============================================================

def _load_dotenv() -> None:
    """Load .env next to this file, if python-dotenv is installed."""
    try:
        from dotenv import load_dotenv
    except ImportError:
        return
    load_dotenv(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env"))


_load_dotenv()


def _key(name: str) -> str:
    return os.environ.get(name, "").strip()


BRAVE_API_KEY = _key("BRAVE_API_KEY")
TAVILY_API_KEY = _key("TAVILY_API_KEY")
EXA_API_KEY = _key("EXA_API_KEY")
FIRECRAWL_API_KEY = _key("FIRECRAWL_API_KEY")
SERPAPI_API_KEY = _key("SERPAPI_API_KEY")
SERPER_API_KEY = _key("SERPER_API_KEY")

# Optional Google Custom Search
GOOGLE_CSE_API_KEY = _key("GOOGLE_CSE_API_KEY")
GOOGLE_CSE_CX = _key("GOOGLE_CSE_CX")


# Hard ceilings imposed by the providers themselves.
PROVIDER_RESULT_CAP = 20
GOOGLE_CSE_RESULT_CAP = 10

TIMEOUT = 20
MAX_WORKERS = 20  # Maximum parallel search requests
USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/152.0 Safari/537.36"
)


@dataclass
class SearchResult:
    title: str
    url: str
    snippet: str = ""
    provider: str = ""
    query: str = ""
    score: float = 0.0
    sources: list[str] = field(default_factory=list)
    queries: list[str] = field(default_factory=list)


def clean_text(value: Any) -> str:
    if value is None:
        return ""
    text = re.sub(r"<[^>]+>", " ", str(value))
    return re.sub(r"\s+", " ", text).strip()


def normalize_url(url: str) -> str:
    """Normalize enough for deduplication without changing profile identity."""
    url = url.strip()
    if not url:
        return ""
    if "://" not in url:
        url = "https://" + url

    parts = urlsplit(url)
    scheme = "https"
    netloc = parts.netloc.lower()
    if netloc.startswith("www."):
        netloc = netloc[4:]

    path = re.sub(r"/+", "/", parts.path).rstrip("/")
    return urlunsplit((scheme, netloc, path, "", ""))


# Params that identify a campaign/referrer rather than a distinct page.
TRACKING_PARAMS = {
    "gclid", "fbclid", "msclkid", "igshid", "mc_cid", "mc_eid",
    "ref", "referrer", "source", "si", "_ga", "_gl", "yclid",
}


def dedup_key(url: str) -> str:
    """
    Identity key for merging results.

    Unlike normalize_url(), this keeps the query string, because pages such as
    `/search?q=a` and `/search?q=b` are genuinely different pages and must not
    collapse into one. Tracking parameters are dropped and the rest are sorted
    so that orderings and campaign tags still merge.
    """
    base = normalize_url(url)
    if not base:
        return ""

    query = urlsplit(url.strip() if "://" in url else "https://" + url.strip()).query
    kept = sorted(
        (k, v)
        for k, v in parse_qsl(query, keep_blank_values=True)
        if k.lower() not in TRACKING_PARAMS and not k.lower().startswith("utm_")
    )
    if not kept:
        return base

    parts = urlsplit(base)
    return urlunsplit((parts.scheme, parts.netloc, parts.path, urlencode(kept), ""))


def detect_platform(profile_url: str) -> tuple[str, str, str]:
    """
    Returns: (platform, domain, identifier)
    identifier is username/profile-id extracted from the URL when possible.
    """
    normalized = normalize_url(profile_url)
    parts = urlsplit(normalized)
    host = parts.netloc.lower()
    path_parts = [p for p in parts.path.split("/") if p]

    if host.endswith("upwork.com"):
        platform = "upwork"
        domain = "upwork.com"
        identifier = ""
        if "freelancers" in path_parts:
            i = path_parts.index("freelancers")
            if i + 1 < len(path_parts):
                identifier = path_parts[i + 1]
        elif path_parts:
            identifier = path_parts[-1]
        return platform, domain, identifier

    if host.endswith("fiverr.com"):
        platform = "fiverr"
        domain = "fiverr.com"
        identifier = path_parts[0] if path_parts else ""
        return platform, domain, identifier

    domain = host
    identifier = path_parts[-1] if path_parts else host
    return "unknown", domain, identifier


def build_queries(profile_url: str) -> list[str]:
    normalized = normalize_url(profile_url)
    platform, domain, identifier = detect_platform(normalized)

    queries = [f'"{normalized}"']

    if identifier:
        queries.append(f'site:{domain} "{identifier}"')
        queries.append(f'"{identifier}" {platform} profile')
        if platform == "upwork":
            queries.append(f'"{identifier}" Upwork freelancer')
        elif platform == "fiverr":
            queries.append(f'"{identifier}" Fiverr seller')

    # preserve order, remove duplicates
    return list(dict.fromkeys(q for q in queries if q.strip()))


# Score arithmetic for an Upwork/Fiverr target (see relevance_score):
#   exact profile URL ........ 100 + 30 + 25 + 10 + 10 = 175
#   sub-page of the profile ..       30 + 20 + 25 + 10 + 10 = 95
#   any same-domain page that merely mentions the identifier .. 30 + 25 + 10 + 10 = 75
# The old cutoff of 55 let that last group through, and the generated
# `site:<domain> "<identifier>"` query produces plenty of them. 90 keeps the
# profile and its sub-pages, and drops incidental mentions to all_results.
STRONG_MATCH_THRESHOLD = 90.0


def relevance_score(result: SearchResult, target_url: str) -> float:
    target = normalize_url(target_url)
    candidate = normalize_url(result.url)
    platform, domain, identifier = detect_platform(target)

    score = 0.0
    if candidate == target:
        score += 100

    t = urlsplit(target)
    c = urlsplit(candidate)

    if c.netloc == t.netloc:
        score += 30

    if candidate.startswith(target + "/") or target.startswith(candidate + "/"):
        score += 20

    haystack = " ".join(
        [result.url, result.title, result.snippet]
    ).lower()

    if identifier and identifier.lower() in haystack:
        score += 25

    if platform != "unknown" and platform in haystack:
        score += 10

    if domain and domain in candidate:
        score += 10

    return score


def _get_json(
    url: str,
    *,
    headers: dict[str, str] | None = None,
    params: dict[str, Any] | None = None,
) -> dict[str, Any]:
    r = requests.get(
        url,
        headers=headers or {},
        params=params or {},
        timeout=TIMEOUT,
    )
    r.raise_for_status()
    return r.json()


def _post_json(
    url: str,
    *,
    headers: dict[str, str] | None = None,
    payload: dict[str, Any] | None = None,
) -> dict[str, Any]:
    r = requests.post(
        url,
        headers=headers or {},
        json=payload or {},
        timeout=TIMEOUT,
    )
    r.raise_for_status()
    return r.json()


# -----------------------------
# Search provider implementations
# -----------------------------

def search_brave(query: str, limit: int) -> list[SearchResult]:
    key = BRAVE_API_KEY
    if not key:
        return []

    data = _get_json(
        "https://api.search.brave.com/res/v1/web/search",
        headers={
            "Accept": "application/json",
            "X-Subscription-Token": key,
            "User-Agent": USER_AGENT,
        },
        params={
            "q": query,
            "count": min(limit, PROVIDER_RESULT_CAP),
            "search_lang": "en",
            "safesearch": "moderate",
        },
    )

    out = []
    for item in data.get("web", {}).get("results", [])[:limit]:
        out.append(
            SearchResult(
                title=clean_text(item.get("title")),
                url=item.get("url", ""),
                snippet=clean_text(item.get("description")),
                provider="brave",
                query=query,
            )
        )
    return out


def search_tavily(query: str, limit: int) -> list[SearchResult]:
    key = TAVILY_API_KEY
    if not key:
        return []

    data = _post_json(
        "https://api.tavily.com/search",
        headers={
            "Authorization": f"Bearer {key}",
            "Content-Type": "application/json",
        },
        payload={
            "query": query,
            "search_depth": "basic",
            "topic": "general",
            "max_results": min(limit, PROVIDER_RESULT_CAP),
            "include_answer": False,
            "include_raw_content": False,
        },
    )

    out = []
    for item in data.get("results", [])[:limit]:
        out.append(
            SearchResult(
                title=clean_text(item.get("title")),
                url=item.get("url", ""),
                snippet=clean_text(item.get("content")),
                provider="tavily",
                query=query,
            )
        )
    return out


def search_exa(query: str, limit: int) -> list[SearchResult]:
    key = EXA_API_KEY
    if not key:
        return []

    data = _post_json(
        "https://api.exa.ai/search",
        headers={
            "x-api-key": key,
            "Content-Type": "application/json",
        },
        payload={
            "query": query,
            "type": "auto",
            "numResults": min(limit, PROVIDER_RESULT_CAP),
            "contents": {
                "highlights": {
                    "maxCharacters": 1200
                }
            },
        },
    )

    out = []
    for item in data.get("results", [])[:limit]:
        highlights = item.get("highlights") or []
        snippet = " ".join(
            h if isinstance(h, str) else str(h)
            for h in highlights
        )
        if not snippet:
            snippet = item.get("text", "")

        out.append(
            SearchResult(
                title=clean_text(item.get("title")),
                url=item.get("url", ""),
                snippet=clean_text(snippet),
                provider="exa",
                query=query,
            )
        )
    return out



def search_firecrawl(query: str, limit: int) -> list[SearchResult]:
    """Firecrawl Search API v2. Requires FIRECRAWL_API_KEY."""
    key = FIRECRAWL_API_KEY
    if not key:
        return []

    headers = {
        "Content-Type": "application/json",
        "User-Agent": USER_AGENT,
        "Authorization": f"Bearer {key}",
    }

    data = _post_json(
        "https://api.firecrawl.dev/v2/search",
        headers=headers,
        payload={
            "query": query,
            "limit": min(limit, PROVIDER_RESULT_CAP),
            "sources": ["web"],
            # We only need search snippets at this stage.
            # Later you can add:
            # "scrapeOptions": {"formats": ["markdown"]}
            # to retrieve full page content for each result.
        },
    )

    payload = data.get("data", {})

    # Current v2 response:
    # {"success": true, "data": {"web": [...]}}
    if isinstance(payload, dict):
        items = payload.get("web", [])
    # Defensive fallback for older/alternate payloads.
    elif isinstance(payload, list):
        items = payload
    else:
        items = []

    out = []
    for item in items[:limit]:
        if not isinstance(item, dict):
            continue

        snippet = (
            item.get("description")
            or item.get("snippet")
            or item.get("markdown")
            or ""
        )

        out.append(
            SearchResult(
                title=clean_text(item.get("title")),
                url=item.get("url", ""),
                snippet=clean_text(snippet),
                provider="firecrawl",
                query=query,
            )
        )

    return out


def search_serpapi(query: str, limit: int, engine: str) -> list[SearchResult]:
    key = SERPAPI_API_KEY
    if not key:
        return []

    params: dict[str, Any] = {
        "engine": engine,
        "q": query,
        "api_key": key,
    }

    if engine == "google":
        params["num"] = min(limit, PROVIDER_RESULT_CAP)
    elif engine == "bing":
        params["count"] = min(limit, PROVIDER_RESULT_CAP)

    data = _get_json("https://serpapi.com/search", params=params)

    out = []
    for item in data.get("organic_results", [])[:limit]:
        out.append(
            SearchResult(
                title=clean_text(item.get("title")),
                url=item.get("link", ""),
                snippet=clean_text(item.get("snippet")),
                provider=f"serpapi_{engine}",
                query=query,
            )
        )
    return out


def search_serpapi_google(query: str, limit: int) -> list[SearchResult]:
    return search_serpapi(query, limit, "google")


def search_serpapi_bing(query: str, limit: int) -> list[SearchResult]:
    return search_serpapi(query, limit, "bing")


def search_serper(query: str, limit: int) -> list[SearchResult]:
    key = SERPER_API_KEY
    if not key:
        return []

    data = _post_json(
        "https://google.serper.dev/search",
        headers={
            "X-API-KEY": key,
            "Content-Type": "application/json",
        },
        payload={
            "q": query,
            "num": min(limit, PROVIDER_RESULT_CAP),
        },
    )

    out = []
    for item in data.get("organic", [])[:limit]:
        out.append(
            SearchResult(
                title=clean_text(item.get("title")),
                url=item.get("link", ""),
                snippet=clean_text(item.get("snippet")),
                provider="serper_google",
                query=query,
            )
        )
    return out


def search_google_cse(query: str, limit: int) -> list[SearchResult]:
    key = GOOGLE_CSE_API_KEY
    cx = GOOGLE_CSE_CX
    if not key or not cx:
        return []

    # Google CSE returns max 10 per call.
    data = _get_json(
        "https://customsearch.googleapis.com/customsearch/v1",
        params={
            "key": key,
            "cx": cx,
            "q": query,
            "num": min(limit, GOOGLE_CSE_RESULT_CAP),
        },
    )

    out = []
    for item in data.get("items", [])[:limit]:
        out.append(
            SearchResult(
                title=clean_text(item.get("title")),
                url=item.get("link", ""),
                snippet=clean_text(item.get("snippet")),
                provider="google_cse",
                query=query,
            )
        )
    return out


# DuckDuckGo has no API contract and rate-limits aggressively. Run its queries
# one at a time with a short gap instead of firing them all in parallel.
_DDG_LOCK = threading.Lock()
DDG_MIN_INTERVAL = 1.5
_ddg_last_call = 0.0


def search_duckduckgo(query: str, limit: int) -> list[SearchResult]:
    """
    No-key fallback using the third-party `ddgs` package.
    This is NOT an official DuckDuckGo API and may be rate-limited/break.
    """
    global _ddg_last_call

    DDGS = None

    try:
        from ddgs import DDGS as _DDGS
        DDGS = _DDGS
    except ImportError:
        try:
            from duckduckgo_search import DDGS as _DDGS
            DDGS = _DDGS
        except ImportError:
            return []

    out = []
    with _DDG_LOCK:
        wait = DDG_MIN_INTERVAL - (time.time() - _ddg_last_call)
        if wait > 0:
            time.sleep(wait)
        try:
            with DDGS() as ddgs:
                rows = ddgs.text(query, max_results=limit)
        finally:
            _ddg_last_call = time.time()

    for item in rows or []:
        out.append(
            SearchResult(
                title=clean_text(item.get("title")),
                url=item.get("href") or item.get("url") or "",
                snippet=clean_text(item.get("body") or item.get("snippet")),
                provider="duckduckgo",
                query=query,
            )
        )
    return out


PROVIDERS: dict[str, Callable[[str, int], list[SearchResult]]] = {
    "brave": search_brave,
    "tavily": search_tavily,
    "exa": search_exa,
    "firecrawl": search_firecrawl,
    "serpapi_google": search_serpapi_google,
    "serpapi_bing": search_serpapi_bing,
    "serper_google": search_serper,
    "google_cse": search_google_cse,
    "duckduckgo": search_duckduckgo,
}


def provider_enabled(name: str) -> tuple[bool, str]:
    checks = {
        "brave": {"BRAVE_API_KEY": BRAVE_API_KEY},
        "tavily": {"TAVILY_API_KEY": TAVILY_API_KEY},
        "exa": {"EXA_API_KEY": EXA_API_KEY},
        "firecrawl": {"FIRECRAWL_API_KEY": FIRECRAWL_API_KEY},
        "serpapi_google": {"SERPAPI_API_KEY": SERPAPI_API_KEY},
        "serpapi_bing": {"SERPAPI_API_KEY": SERPAPI_API_KEY},
        "serper_google": {"SERPER_API_KEY": SERPER_API_KEY},
        "google_cse": {
            "GOOGLE_CSE_API_KEY": GOOGLE_CSE_API_KEY,
            "GOOGLE_CSE_CX": GOOGLE_CSE_CX,
        },
    }

    if name == "duckduckgo":
        try:
            import ddgs  # noqa: F401
            return True, "ddgs installed"
        except ImportError:
            try:
                import duckduckgo_search  # noqa: F401
                return True, "duckduckgo_search installed"
            except ImportError:
                return False, "install package: pip install ddgs"

    required = checks.get(name, {})
    missing = [key_name for key_name, value in required.items() if not value]
    if missing:
        return False, "missing " + ", ".join(missing)

    return True, "configured"


def deduplicate(results: list[SearchResult], target_url: str) -> list[SearchResult]:
    merged: dict[str, SearchResult] = {}

    for r in results:
        if not r.url:
            continue

        key = dedup_key(r.url)
        if not key:
            continue

        if key not in merged:
            r.sources = [r.provider]
            r.queries = [r.query]
            merged[key] = r
        else:
            existing = merged[key]
            if r.provider not in existing.sources:
                existing.sources.append(r.provider)
            if r.query not in existing.queries:
                existing.queries.append(r.query)

            # Keep the richer title/snippet.
            if len(r.title) > len(existing.title):
                existing.title = r.title
            if len(r.snippet) > len(existing.snippet):
                existing.snippet = r.snippet

    # Score last: the loop above merges in the longest title/snippet, and
    # relevance_score() reads those fields. Scoring per-result mid-merge would
    # miss identifier mentions that only appear in the text we kept.
    for r in merged.values():
        r.score = relevance_score(r, target_url)

    return sorted(
        merged.values(),
        key=lambda x: (x.score, len(x.sources), len(x.snippet)),
        reverse=True,
    )


def search_everywhere(
    profile_url: str,
    max_results: int = 10,
) -> dict[str, Any]:
    target = normalize_url(profile_url)
    platform, domain, identifier = detect_platform(target)
    queries = build_queries(target)

    tasks: list[tuple[str, str, Callable[[str, int], list[SearchResult]]]] = []
    provider_status: dict[str, dict[str, Any]] = {}

    for name, fn in PROVIDERS.items():
        enabled, reason = provider_enabled(name)
        provider_status[name] = {
            "enabled": enabled,
            "reason": reason,
            "requests": 0,
            "results": 0,
            "errors": [],
        }
        if enabled:
            for query in queries:
                tasks.append((name, query, fn))

    all_results: list[SearchResult] = []
    started = time.time()

    # Run providers/queries concurrently.
    # Keep worker count moderate to avoid hammering APIs.
    workers = min(MAX_WORKERS, max(1, len(tasks)))

    def run_one(
        name: str,
        query: str,
        fn: Callable[[str, int], list[SearchResult]],
    ) -> tuple[str, str, list[SearchResult], str | None]:
        try:
            rows = fn(query, max_results)
            return name, query, rows, None
        except Exception as exc:
            return name, query, [], f"{type(exc).__name__}: {exc}"

    if tasks:
        with concurrent.futures.ThreadPoolExecutor(max_workers=workers) as executor:
            futures = [
                executor.submit(run_one, name, query, fn)
                for name, query, fn in tasks
            ]

            for future in concurrent.futures.as_completed(futures):
                name, query, rows, error = future.result()
                provider_status[name]["requests"] += 1
                provider_status[name]["results"] += len(rows)

                if error:
                    provider_status[name]["errors"].append(
                        {"query": query, "error": error}
                    )

                all_results.extend(rows)

    merged = deduplicate(all_results, target)

    # "Strong matches" are likely the requested profile or pages clearly
    # referring to it. Keep all merged results too.
    strong_matches = [r for r in merged if r.score >= STRONG_MATCH_THRESHOLD]

    return {
        "target": {
            "input_url": profile_url,
            "normalized_url": target,
            "platform": platform,
            "domain": domain,
            "identifier": identifier,
        },
        "queries": queries,
        "provider_status": provider_status,
        "summary": {
            "raw_results": len(all_results),
            "unique_results": len(merged),
            "strong_matches": len(strong_matches),
            "elapsed_seconds": round(time.time() - started, 2),
            "parallel_workers": workers if tasks else 0,
        },
        "strong_matches": [asdict(r) for r in strong_matches],
        "all_results": [asdict(r) for r in merged],
    }


def print_summary(data: dict[str, Any]) -> None:
    t = data["target"]
    s = data["summary"]

    print()
    print("=" * 80)
    print(f"Target:     {t['normalized_url']}")
    print(f"Platform:   {t['platform']}")
    print(f"Identifier: {t['identifier'] or '(none)'}")
    print(f"Raw hits:   {s['raw_results']}")
    print(f"Unique:     {s['unique_results']}")
    print(f"Strong:     {s['strong_matches']}")
    print(f"Time:       {s['elapsed_seconds']}s")
    print(f"Parallel:   {s.get('parallel_workers', 0)} workers")
    print("=" * 80)

    print("\nProvider status:")
    for name, status in data["provider_status"].items():
        state = "ON " if status["enabled"] else "OFF"
        print(
            f"  [{state}] {name:<18} "
            f"requests={status['requests']:<2} "
            f"results={status['results']:<3} "
            f"{status['reason']}"
        )
        for err in status["errors"][:2]:
            print(f"       error: {err['error']}")

    print("\nBest matches:")
    rows = data["strong_matches"] or data["all_results"][:10]

    if not rows:
        print("  No results found.")
        return

    for i, row in enumerate(rows[:15], start=1):
        print(f"\n{i}. [{row['score']:.0f}] {row['title'] or '(no title)'}")
        print(f"   {row['url']}")
        print(f"   Sources: {', '.join(row['sources'])}")
        if row["snippet"]:
            snippet = row["snippet"]
            if len(snippet) > 300:
                snippet = snippet[:297] + "..."
            print(f"   {snippet}")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Search an Upwork/Fiverr profile URL across multiple web search providers."
    )
    parser.add_argument(
        "url",
        nargs="?",
        help="Public Upwork/Fiverr profile URL",
    )
    parser.add_argument(
        "--max-results",
        type=int,
        default=10,
        help=(
            f"Max results per provider/query (default: 10). Providers cap this "
            f"at {PROVIDER_RESULT_CAP} ({GOOGLE_CSE_RESULT_CAP} for Google CSE)."
        ),
    )
    parser.add_argument(
        "--output",
        default="search_results.json",
        help="JSON output file (default: search_results.json)",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()

    profile_url = args.url
    if not profile_url:
        profile_url = input("Enter Upwork/Fiverr profile URL: ").strip()

    if not profile_url:
        print("No URL supplied.", file=sys.stderr)
        return 2

    if args.max_results < 1:
        print("--max-results must be >= 1", file=sys.stderr)
        return 2

    if args.max_results > PROVIDER_RESULT_CAP:
        print(
            f"Note: providers cap results at {PROVIDER_RESULT_CAP} per query "
            f"(Google CSE at {GOOGLE_CSE_RESULT_CAP}); "
            f"--max-results {args.max_results} will be clamped.",
            file=sys.stderr,
        )

    print(f"Searching for: {normalize_url(profile_url)}")
    print("Queries:")
    for q in build_queries(profile_url):
        print(f"  - {q}")

    data = search_everywhere(
        profile_url=profile_url,
        max_results=args.max_results,
    )

    print_summary(data)

    output_path = os.path.abspath(args.output)
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)

    print(f"\nFull JSON saved to: {output_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
