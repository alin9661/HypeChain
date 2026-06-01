# Reference: Configuration

Every setting the backend reads, defined once in `app/config/settings.py` as a
`pydantic-settings` model. Settings bind to environment variables case-insensitively by
field name (`hacknyu_openrouter_api_key` ← `HACKNYU_OPENROUTER_API_KEY`, `port` ← `PORT`).
Read them at runtime via `get_settings()`, which is `lru_cache`d (read once per process,
reused across warm Lambda invocations).

Service secrets default to `None` so the app boots for health checks and local dev without
every key present; each service validates the keys it needs when it is called, not at import.

Copy `.env.example` to `.env` for local development.

## Server

| Variable | Type | Default | Effect |
|----------|------|---------|--------|
| `PORT` | int | `3001` | Local dev port (uvicorn). Lambda ignores it. |
| `NODE_ENV` | str | `production` | **Fail-closed.** `development` enables verbose 500 bodies + stack traces and console log rendering. Any other value (incl. unset) is treated as production: generic 500s, JSON logs. Set `NODE_ENV=development` locally. |
| `HACKNYU_FRONTEND_URL` | str | `http://localhost:3000` | CORS allowed origin (credentials allowed). |

## OpenRouter (AI vision + image generation)

| Variable | Type | Default | Effect |
|----------|------|---------|--------|
| `HACKNYU_OPENROUTER_API_KEY` | str? | `None` | Required to call OpenRouter. Used by `app/services/openrouter.py`. |
| `HACKNYU_DEFAULT_VISION_MODEL` | str | `zhipuai/glm-4-plus` | Default product-verification model. |
| `HACKNYU_DEFAULT_IMAGE_GEN_MODEL` | str | `openai/gpt-5-image-mini` | Registry default. NFT art generation is hardcoded to `openai/gpt-5-image-mini` regardless. |

## Redis cache (optional)

| Variable | Type | Default | Effect |
|----------|------|---------|--------|
| `HACKNYU_REDIS_ENABLED` | bool | `true` | When false (or Redis unreachable), caching is a no-op — requests never fail on cache errors. |
| `HACKNYU_REDIS_URL` | str | `redis://localhost:6379` | Connection URL. TTLs: 24h verification, 7d images. |

## Solana / Metaplex

| Variable | Type | Default | Effect |
|----------|------|---------|--------|
| `HACKNYU_SOLANA_RPC_URL` | str | `https://api.devnet.solana.com` | RPC endpoint used by `app/services/solana.py`. |
| `HACKNYU_SERVER_WALLET_PRIVATE_KEY` | str? | `None` | Base58 server keypair; required to mint / sign custodial transactions. |
| `HACKNYU_MARKETPLACE_PROGRAM_ID` | str? | `None` | When set, on-chain `VerificationProof` anchoring + marketplace listing run (best-effort). When unset, those steps are skipped. |
| `HACKNYU_CASE_PREFIX` | str | `HC-2026-` | Evidence-Locker case label prefix. |
| `PLATFORM_CUSTODIAL_WALLET` | str | `HypeChainPlatformWallet111...` | Holds NFTs for guest (no-wallet) listings until claimed. |
| `HACKNYU_DAS_RPC_URL` | str? | `None` | **Deprecated** (compressed-NFT path dropped). |
| `HACKNYU_MERKLE_TREE_ADDRESS` | str? | `None` | **Deprecated** (compressed-NFT path dropped). |

## IPFS / NFT.Storage

| Variable | Type | Default | Effect |
|----------|------|---------|--------|
| `HACKNYU_NFT_STORAGE_API_KEY` | str? | `None` | Bearer token for NFT.Storage uploads (`app/services/ipfs.py`). |

## Aurora DSQL (replaces Supabase)

| Variable | Type | Default | Effect |
|----------|------|---------|--------|
| `HACKNYU_DSQL_ENDPOINT` | str? | `None` | DSQL cluster endpoint host. Required for DB access. |
| `HACKNYU_DSQL_REGION` | str | `us-east-1` | AWS region for the IAM auth token. |
| `HACKNYU_DSQL_DATABASE` | str | `postgres` | Database name. |

AWS credentials for the DSQL IAM token are resolved via the standard `boto3` chain
(environment, instance/role, or profile) — not via a setting. See
[How-to: Configure Aurora DSQL](howto-configure-dsql.md).

## Related
- [How-to: Local development](howto-local-development.md) — using settings locally
- [Explanation: Design decisions](explanation-design-decisions.md) — why `node_env` is fail-closed
