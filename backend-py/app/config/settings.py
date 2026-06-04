"""Typed application settings.

Single source of truth for every environment variable the backend reads. The
scaffold PR declares the FULL surface (across all service domains) up front so
the parallel domain PRs never edit this file and never conflict on it.

Service-specific secrets are Optional with `None` defaults so the app boots for
health checks and local dev without every key present. Each service validates
the presence of its own required settings at call time (fail loud, not at import).

pydantic-settings matches env vars to field names case-insensitively, so the
field `hacknyu_openrouter_api_key` binds to `HACKNYU_OPENROUTER_API_KEY`, `port`
binds to `PORT`, etc.
"""

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # ---- Server ----
    port: int = 3001
    # Fail-closed: default to production so an unset NODE_ENV never accidentally
    # exposes dev-only behavior (stack traces in 500s, verbose error bodies).
    # Local dev opts in explicitly via NODE_ENV=development (see .env.example).
    node_env: str = "production"
    hacknyu_frontend_url: str = "http://localhost:3000"

    # ---- OpenRouter (AI vision + image gen) — PR4 ----
    hacknyu_openrouter_api_key: str | None = None
    hacknyu_default_vision_model: str = "zhipuai/glm-4-plus"
    hacknyu_default_image_gen_model: str = "openai/gpt-5-image-mini"

    # ---- Redis cache (optional) — PR4 ----
    hacknyu_redis_enabled: bool = True
    hacknyu_redis_url: str = "redis://localhost:6379"

    # ---- Solana / Metaplex — PR3 ----
    hacknyu_solana_rpc_url: str = "https://api.devnet.solana.com"
    hacknyu_server_wallet_private_key: str | None = None
    hacknyu_marketplace_program_id: str | None = None
    hacknyu_case_prefix: str = "HC-2026-"
    platform_custodial_wallet: str = "HypeChainPlatformWallet1111111111111111111111111"
    # cNFT vars — DEPRECATED (compressed-NFT path dropped); kept for env compatibility.
    hacknyu_das_rpc_url: str | None = None
    hacknyu_merkle_tree_address: str | None = None

    # ---- IPFS / NFT.Storage — PR4 ----
    hacknyu_nft_storage_api_key: str | None = None

    # ---- Aurora DSQL — PR2 ----
    hacknyu_dsql_endpoint: str | None = None
    hacknyu_dsql_region: str = "us-east-1"
    hacknyu_dsql_database: str = "postgres"
    # LOCAL/CI ONLY: a plain Postgres DSN (e.g. postgres://admin:pw@localhost:5432/db).
    # When set, the pool connects with normal password auth instead of the DSQL
    # IAM-token + TLS path, so end-to-end tests can run against a local Postgres.
    # Production NEVER sets this — leave empty to use Aurora DSQL.
    hacknyu_database_url: str | None = None

    # ---- Helius (activity feed: transfer indexing webhook) ----
    # Shared secret the Helius webhook sends in its Authorization header. The
    # ingest endpoint is fail-closed: if this is unset, every webhook POST is
    # rejected 401 (an unauthenticated write path would let anyone forge
    # transfer events into the provenance feed — the exact trust the product sells).
    hacknyu_helius_webhook_secret: str | None = None
    # API key for Helius DAS / RPC (historical backfill — deferred, see plan).
    hacknyu_helius_api_key: str | None = None

    @property
    def is_development(self) -> bool:
        return self.node_env == "development"


@lru_cache
def get_settings() -> Settings:
    """Cached singleton — read once per process, reused across warm invocations."""
    return Settings()
