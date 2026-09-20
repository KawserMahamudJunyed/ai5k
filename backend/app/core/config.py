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

    # --- Security / observability ---
    cors_origins: list[str] = ["*"]

    @property
    def is_local(self) -> bool:
        return self.env == "local"

    @property
    def cognito_configured(self) -> bool:
        return bool(self.cognito_user_pool_id and self.cognito_region)


@lru_cache
def get_settings() -> Settings:
    return Settings()
