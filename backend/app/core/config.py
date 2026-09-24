"""Application configuration.

Reads from environment variables / `.env` (see .env.example). Mirrors the keys
documented in docs/environment-setup.md.
"""

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # --- App ---
    env: str = "local"
    secret_key: str = "change-me-in-prod"
    local_token_issuer: str = "ai5k-local"
    local_token_audience: str = "ai5k-api"
    access_token_ttl_seconds: int = 900
    refresh_token_ttl_seconds: int = 2_592_000
    email_verification_ttl_seconds: int = 86_400

    # --- Database ---
    database_url: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/ai5k"

    # --- AWS Cognito (Task 1.3); empty values disable the Cognito verification path ---
    cognito_user_pool_id: str = ""
    cognito_client_id: str = ""
    cognito_region: str = "us-east-1"
    cognito_jwks_cache_ttl_seconds: int = 3600
    aws_access_key_id: str = ""
    aws_secret_access_key: str = ""

    # --- Other services (used by later tasks) ---
    s3_evidence_bucket: str = ""
    evidence_upload_ttl_seconds: int = 900
    evidence_download_ttl_seconds: int = 300
    opensearch_endpoint: str = ""
    llm_provider_base_url: str = ""

    # --- Profile-readiness pipeline (UF-7) ---
    # GitHub: classic PAT, no scopes needed. 60 req/h anonymous → 5000 authenticated.
    github_token: str = ""
    # RapidAPI key subscribed to `upwork-scraping-api` and `fiverr-scrapper-free`
    # (reserved for the dedicated Upwork/Fiverr clients; the readiness pipeline
    # currently corroborates via the ai-backend web-search tool).
    rapid_api_key: str = ""
    # External evaluator (ai-backend) base URL + timeout.
    llm_backend_url: str = "http://127.0.0.1:8001"
    llm_backend_timeout_seconds: float = 30.0
    # CV storage override (relative paths resolve against the backend root).
    # The CV_STORAGE_ROOT environment variable still takes precedence — tests
    # and deployments set it per-process.
    cv_storage_dir: str = ""
    # RapidAPI client cache dirs (relative paths resolve against the backend root).
    upwork_cache_dir: str = ""
    fiverr_cache_dir: str = ""
    # Dev toggles: run the RapidAPI clients against fixtures / skip them entirely.
    upwork_api_offline: bool = False
    fiverr_api_offline: bool = False
    # Score from whatever sources succeeded when some fail (never all-or-nothing).
    allow_partial_sources: bool = True
    # Dev-only: allow impersonating a user id via header (never enable outside local).
    allow_user_id_override: bool = False

    # --- Security / observability ---
    cors_origins: list[str] = ["*"]

    @property
    def is_local(self) -> bool:
        return self.env == "local"

    @property
    def github_configured(self) -> bool:
        return bool(self.github_token)

    @property
    def cognito_configured(self) -> bool:
        return bool(self.cognito_user_pool_id and self.cognito_region)


@lru_cache
def get_settings() -> Settings:
    return Settings()
