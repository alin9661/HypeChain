# Production secrets & configuration checklist

Every environment variable the backend reads, sourced from
`backend-py/app/config/settings.py` (the single source of truth). pydantic-settings
binds case-insensitively, so the field `hacknyu_openrouter_api_key` reads
`HACKNYU_OPENROUTER_API_KEY`, `port` reads `PORT`, etc.

**No real values live in this file** — placeholders only. Set the real values on
the Lambda function configuration (or in `samconfig.toml` parameters if deploying
via `backend/template.yaml`), never in source control.

## Fail-closed / safety flags (read these first)

- **`NODE_ENV` defaults to `production`.** An unset `NODE_ENV` is treated as
  production, so stack traces and verbose error bodies are never accidentally
  exposed. Leave it unset or `production` in prod; only local dev opts into
  `development`.
- **`HACKNYU_DATABASE_URL` must be UNSET in production.** It is a LOCAL/CI-ONLY
  escape hatch (a direct Postgres connection string that bypasses the Aurora DSQL
  IAM-token path). If present in a prod environment it overrides the DSQL auth
  flow — never set it on the Lambda. (Not yet a field in `settings.py` on this
  branch; documented here so the rule is in place when the DSQL direct-URL escape
  hatch lands.)
- **Redis must be disabled on Lambda.** Set `HACKNYU_REDIS_ENABLED=false`. With it
  `true`, every cold start tries to connect to Redis and leaks connections across
  warm invocations. (Default in `settings.py` is `true` for local dev — override
  it in prod.)
- **The Helius webhook is fail-closed (401).** The webhook route rejects every
  request with `401` unless `HACKNYU_HELIUS_WEBHOOK_SECRET` is set and the incoming
  request presents the matching secret. An unset secret means the webhook is
  effectively closed — which is the safe default. (The webhook router + this
  setting land on the activities/provenance branch; documented here so the secret
  is provisioned before that route goes live in prod.)

## Server

| Env var | Purpose | Required? | Example / placeholder |
|---|---|---|---|
| `PORT` | Local HTTP port. Ignored on Lambda (Function URL fronts the handler). | Optional (default `3001`) | `3001` |
| `NODE_ENV` | Environment mode. Fail-closed to `production`; `development` enables stack traces. | Optional (default `production`) | `production` |
| `HACKNYU_FRONTEND_URL` | Frontend origin for the CORS allowlist. Must match the Function URL CORS config. | Optional (default `http://localhost:3000`) — **set to the real prod origin in prod** | `https://hypechain.vercel.app` |

## OpenRouter (AI vision + image generation)

| Env var | Purpose | Required? | Example / placeholder |
|---|---|---|---|
| `HACKNYU_OPENROUTER_API_KEY` | OpenRouter key for AI verification + NFT image generation. | **Required** for create-listing (validated at call time). | `sk-or-v1-REPLACE_ME` |
| `HACKNYU_DEFAULT_VISION_MODEL` | Default vision model for product verification. | Optional (default `zhipuai/glm-4-plus`) | `zhipuai/glm-4-plus` |
| `HACKNYU_DEFAULT_IMAGE_GEN_MODEL` | Default model for generated NFT artwork. | Optional (default `openai/gpt-5-image-mini`) | `openai/gpt-5-image-mini` |

## Redis cache

| Env var | Purpose | Required? | Example / placeholder |
|---|---|---|---|
| `HACKNYU_REDIS_ENABLED` | Toggle the Redis cache. **Set `false` on Lambda** (see fail-closed flags). | Optional (default `true`) — **override to `false` in prod** | `false` |
| `HACKNYU_REDIS_URL` | Redis connection URL. Only relevant when caching is enabled. | Optional (default `redis://localhost:6379`) | `rediss://prod-cache.example:6379` |

## Solana / Metaplex

| Env var | Purpose | Required? | Example / placeholder |
|---|---|---|---|
| `HACKNYU_SOLANA_RPC_URL` | Solana RPC endpoint. Public devnet by default; use Helius/QuickNode for prod load. | Optional (default `https://api.devnet.solana.com`) | `https://devnet.helius-rpc.com/?api-key=REPLACE_ME` |
| `HACKNYU_SERVER_WALLET_PRIVATE_KEY` | Base58 server wallet key used for minting. | **Required** for minting (validated at call time). | `base58-REPLACE_ME` |
| `HACKNYU_MARKETPLACE_PROGRAM_ID` | Anchor marketplace program ID. Empty leaves marketplace listing stubbed. | Optional (default unset / `None`) | `REPLACE_ME_PROGRAM_ID` |
| `HACKNYU_CASE_PREFIX` | Case-file ID prefix for listings. | Optional (default `HC-2026-`) | `HC-2026-` |
| `PLATFORM_CUSTODIAL_WALLET` | Custodial wallet holding NFTs for guest (pending-claim) users. | Optional (has a built-in default pubkey) | `HypeChainPlatformWallet1111111111111111111111111` |
| `HACKNYU_DAS_RPC_URL` | **DEPRECATED** (compressed-NFT path dropped). Kept for env compatibility. | Optional (default unset / `None`) | _leave unset_ |
| `HACKNYU_MERKLE_TREE_ADDRESS` | **DEPRECATED** (compressed-NFT path dropped). Kept for env compatibility. | Optional (default unset / `None`) | _leave unset_ |

## IPFS / NFT.Storage

| Env var | Purpose | Required? | Example / placeholder |
|---|---|---|---|
| `HACKNYU_NFT_STORAGE_API_KEY` | NFT.Storage key for pinning NFT metadata + images to IPFS. | **Required** for create-listing (validated at call time). | `nftstorage-REPLACE_ME` |

## Aurora DSQL

The backend authenticates to DSQL with a short-lived IAM token minted by `boto3`
per connection — there is **no DB password env var**. AWS credentials come from
the Lambda execution role (which needs `dsql:DbConnectAdmin`). See
`backend-py/docs/howto-configure-dsql.md`.

| Env var | Purpose | Required? | Example / placeholder |
|---|---|---|---|
| `HACKNYU_DSQL_ENDPOINT` | DSQL cluster endpoint host. | **Required** for any DB access (validated at call time). | `abcd1234.dsql.us-east-1.on.aws` |
| `HACKNYU_DSQL_REGION` | DSQL cluster region (must match the cluster for token signing). | Optional (default `us-east-1`) | `us-east-1` |
| `HACKNYU_DSQL_DATABASE` | Database name. | Optional (default `postgres`) | `postgres` |
| `HACKNYU_DATABASE_URL` | **LOCAL/CI-ONLY** direct Postgres URL escape hatch. **Never set in prod.** | Must be **UNSET** in prod | _unset in prod_ |

## Helius webhook (provenance feed)

| Env var | Purpose | Required? | Example / placeholder |
|---|---|---|---|
| `HACKNYU_HELIUS_WEBHOOK_SECRET` | Shared secret authenticating inbound Helius webhook calls. **Without it the webhook is fail-closed (401).** | **Required** to accept webhook traffic | `whsec-REPLACE_ME` |

> The webhook router + this setting land on the activities/provenance branch. Set
> the secret on the Lambda before that route is exposed in prod, otherwise the
> webhook rejects all traffic with 401 (the safe default).

## AWS credentials (not env vars)

DSQL IAM-token minting and any other AWS API calls use the **standard boto3
credential chain**: the Lambda execution role in prod, env/profile locally. Do
not put long-lived AWS keys in the function environment.

## Throttling

App-level rate limiting was intentionally removed. Request throttling is applied
at the Function URL / concurrency layer — see `deploy/THROTTLING.md`.
