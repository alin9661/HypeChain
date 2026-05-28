# Backend FastAPI Refactor — Design Spec

**Date:** 2026-05-28
**Branch:** `refactor/backend-fastapi`
**Status:** Awaiting user review

---

## Context

The HypeChain backend is a 9-endpoint Express.js (JavaScript, Node 20) REST API deployed
as an AWS Lambda Docker container. It orchestrates a heavy external-service pipeline:
OpenRouter (AI vision verification + NFT image generation), Solana (NFT minting + on-chain
marketplace listing + verification-proof anchoring), NFT.Storage (IPFS), Supabase
(Postgres), and optional Redis caching.

We are refactoring it to **FastAPI (Python 3.13)**. The motivation is a more ergonomic
async Python stack with first-class typed request/response validation (Pydantic),
auto-generated OpenAPI docs, and a testing story (the current backend has **zero tests**).
This refactor also folds in a small set of overdue hardening fixes that are cheap to
include while we're rewriting the boundary anyway.

The intended outcome: a `backend-py/` service that is **behaviorally identical** to the
Express backend at the HTTP boundary — same routes, same request/response JSON shapes,
same env var names — so the Next.js frontend can cut over by flipping a single
`BACKEND_URL` env var, with the option to roll back instantly.

---

## Decisions (from brainstorming)

| Decision | Choice | Rationale |
|---|---|---|
| **Coexistence** | Side-by-side in new `backend-py/` | `backend/` keeps serving the frontend until parity is proven; instant rollback; demo never breaks. |
| **Scope** | Parity port **+ targeted fixes** | 1:1 routes, plus: real tests, rate limiting, Pydantic validation, security headers. |
| **Solana minting** | **Standard NFTs only — drop cNFT** | No first-class Python Bubblegum SDK. cNFT was already a fallback path. Simplifies on-chain flow (see §3). |
| **Deploy target** | **AWS Lambda** (match current) | FastAPI + `mangum`, `public.ecr.aws/lambda/python:3.13` container. Drop-in for existing Function URL. |
| **Python tooling** | **uv** | Rust-backed, single-binary, fast. Spiritual match to the recent bun migration. `uv.lock` committed. |

---

## §1 — Architecture & Directory Layout

New `backend-py/` sibling to `backend/`. Express keeps running until cutover; deleted in a
follow-up PR once parity is verified.

```
backend-py/
├── pyproject.toml              # uv-managed, deps + project metadata
├── uv.lock                     # committed
├── Dockerfile                  # public.ecr.aws/lambda/python:3.13 base
├── README.md
├── .env.example                # mirrors backend/.env.example, identical HACKNYU_* names
├── .python-version             # 3.13
├── app/
│   ├── __init__.py
│   ├── main.py                 # FastAPI app factory + middleware wiring
│   ├── lambda_handler.py       # exports `handler = Mangum(app)` for Lambda CMD
│   ├── config/
│   │   ├── settings.py         # pydantic-settings; reads + validates HACKNYU_* env
│   │   └── ai_models.py        # port of backend/src/config/ai-models.js (model registry, cost est.)
│   ├── routers/
│   │   ├── health.py           # GET /  and  GET /health
│   │   ├── listings.py         # POST /api/create-listing  (+ GET docs endpoint)
│   │   └── payments.py         # /api/payments/{create,verify,history,balance,listing,cancel}
│   ├── schemas/                # Pydantic v2 request/response models
│   │   ├── listing.py
│   │   └── payment.py
│   ├── services/
│   │   ├── openrouter.py       # AI verify + image gen (openai SDK, custom baseURL)
│   │   ├── solana.py           # solders + solana-py; standard NFT mint, marketplace list
│   │   ├── ipfs.py             # NFT.Storage via httpx
│   │   ├── supabase_client.py  # supabase-py async client (service-role key)
│   │   ├── cache.py            # redis.asyncio; optional/disabled fallback
│   │   ├── payment.py          # Solana Pay request build + tx verify + completePurchase
│   │   └── verification.py     # on-chain VerificationProof anchoring (confidence→bps)
│   ├── middleware/
│   │   ├── cors.py             # CORSMiddleware, HACKNYU_FRONTEND_URL
│   │   ├── security.py         # `secure` headers (Helmet equivalent)
│   │   └── rate_limit.py       # slowapi limiter
│   └── utils/
│       └── solana_validation.py  # is_valid_solana_pubkey, base64 image checks
└── tests/
    ├── conftest.py             # fixtures: app client, mocked settings, fake external svcs
    ├── test_health.py
    ├── test_listings.py        # respx-mocked OpenRouter/IPFS/Supabase; fixture Solana
    └── test_payments.py
```

**Entrypoints:**
- Lambda: `app.lambda_handler.handler` (Mangum-wrapped FastAPI) — Lambda `CMD`.
- Local dev: `uv run uvicorn app.main:app --reload --port 3001` (same port as Express).

Route paths and request/response shapes are **byte-for-byte identical** to Express. This is
what makes the frontend cutover a single env-var change.

---

## §2 — Dependency Mapping (Node → Python)

| Concern | Current (Node) | FastAPI replacement | Notes |
|---|---|---|---|
| Web framework | express@4.18 | **fastapi** | Async-native; OpenAPI at `/docs`. |
| Dev server | nodemon | **uvicorn[standard]** | `uv run uvicorn ... --reload`. |
| Lambda adapter | serverless-http | **mangum** | Standard FastAPI-on-Lambda choice. |
| Validation | hand-written `utils/validation.js` | **pydantic v2** models | Replaces `isValidSolanaPublicKey` + `validateBase64Image`; auto 422 errors. |
| CORS | cors@2.8 | **CORSMiddleware** | Same `HACKNYU_FRONTEND_URL`, `allow_credentials=True`. |
| Security headers | helmet@7.1 | **`secure`** | Helmet-equivalent for ASGI; CSP/HSTS/X-Frame-Options. |
| HTTP logging | morgan('dev') | **structlog** + uvicorn access log | JSON logs in prod for CloudWatch Insights. |
| Rate limiting *(fix)* | none | **slowapi** | Per-IP limits on `/api/create-listing` and `/api/payments/verify`. |
| Env loading | dotenv@16.4 | **pydantic-settings** | Type-safe; fails fast on missing required vars. |
| Solana RPC + tx | @solana/web3.js@1.95 | **solders + solana-py** | solders = Rust primitives; solana-py = async RPC client. |
| Metaplex standard NFT | umi + mpl-token-metadata | raw instruction builders via **solders** | No Python Metaplex SDK; craft Token + Metadata instructions directly. |
| Metaplex cNFT | mpl-bubblegum | **DROPPED** | Standard NFT only. `useCompressedNFT` flag accepted but ignored (see §3). |
| OpenRouter AI | openai@4.72 (custom baseURL) | **openai** Python SDK (same baseURL) | API identical; vision + image-gen models unchanged. |
| IPFS | nft.storage@7.2 | **httpx** → NFT.Storage REST | No first-class Python SDK; trivial REST surface. |
| Supabase | @supabase/supabase-js@2.81 | **supabase-py** (async) | Service-role key; tables `listings`, `transactions`, `users`. |
| Redis | ioredis@5.4 | **redis.asyncio** | Same TTLs (24h verify, 7d image); optional/disabled fallback. |
| Base58 | bs58@6.0 | **base58** | Solana keypair decode. |
| Testing *(fix)* | Jest (unused) | **pytest + pytest-asyncio + respx** | respx mocks httpx; Solana RPC via fixtures. |

**Security libraries (explicit, per repo security guidance):** `secure` (headers),
`slowapi` (rate limit), `pydantic-settings` (typed env, no silent missing vars).

---

## §3 — Data Flow

### POST /api/create-listing (the core pipeline)

Ported 1:1 from `backend/src/routes/listing.js`, with the cNFT branch removed. Sequence:

1. **Validate** — at least one of `userWallet`/`userEmail`; valid Solana pubkey if wallet
   given; valid base64 image (≤5MB); valid model IDs if given. **Now enforced by Pydantic**
   at the request boundary → automatic 422 with structured errors. Guest flow: no wallet →
   use `PLATFORM_CUSTODIAL_WALLET`, listing status `pending_wallet`.
2. **AI verification** — `verifyProduct[WithModel]`. If `liveness_score < 50` → **400** with
   the detailed failure payload (preserve `next_steps` array and field names verbatim;
   frontend renders these).
3. **NFT image generation** — always `openai/gpt-5-image-mini` from the item name; download
   generated image to base64.
4. **IPFS** — `createAndUploadNFTMetadata` → `{ metadataUri, imageUrl }`.
5. **Mint** — **always standard NFT** via `mintNFT(targetWallet, metadataUri, productName)`.
   *(cNFT branch and merkle-tree fallback deleted.)*
6. **DB save** — insert into `listings`. cNFT-specific columns (`is_compressed`,
   `merkle_tree_address`, `leaf_index`) written as `False`/`None` to keep schema compatible.
7. **On-chain verification anchor (Step 4.5)** — if `HACKNYU_MARKETPLACE_PROGRAM_ID` set:
   `submitVerification(...)` → `VerificationProof` PDA. **Wrapped in try/except — warns but
   does NOT fail the request.** *(The old `!isCompressed` guard is gone since all mints are
   standard now; this path runs on every happy path.)*
8. **Marketplace listing (Step 5)** — if proof written: `listItemOnMarketplace(...)`.
   Custodial (server-signed) for guests; prepared-but-unsigned for user wallets (frontend
   signs via `anchor-client.ts`). **Also try/except — warns, does not fail.**
9. **200** with the success payload (`listing_id`, `nft_mint_address`, `nft_image_url`,
   `product_name`, `listing_price_sol`, `status`, `verification{...}`) — field names verbatim.

> **Load-bearing behavior to preserve:** Steps 7–8 are best-effort. A listing is considered
> successful once minted + saved to Supabase, even if on-chain anchoring/listing fails. The
> port must keep this graceful degradation exactly.

### Payment routes (`backend/src/routes/payment.js`)

Thin controllers over `services/payment.py`. Ported 1:1:
- `POST /create` → `createPaymentRequest(listingId, buyerWallet)`.
- `POST /verify` → fetch listing → `verifyPayment(sig, seller, price, listingId)` →
  on invalid return **400** with `needsRetry`; on valid → `completePurchase(...)` → 200.
- `GET /history/:wallet?type=buyer|seller|all`, `GET /balance/:wallet`,
  `GET /listing/:listingId`, `POST /cancel` (UI-state no-op).

> **Note (not in scope to fix):** amounts are SOL despite some "USDC" wording in comments.
> Port the wording as-is; do not change currency semantics.

---

## §4 — Error Handling

Mirror the Express contract exactly so the frontend's error rendering keeps working:

- **Validation errors** → 400 (or Pydantic 422 for schema-level) with
  `{ success: false, error: "..." }`. For the liveness failure, preserve the full
  `details{}` object including `next_steps`.
- **Pipeline errors** in `create-listing` → 500 with the **step-attribution** payload:
  `failure_details{ failed_at, explanation, possible_causes[], timestamp, note }`. Port the
  `errorMessage.includes(...)` keyword routing to a small Python helper that maps an
  exception to its `(failed_at, explanation, possible_causes)` tuple.
- **Payment errors** → 500 with `{ success: false, error: message }`.
- A FastAPI **exception handler** centralizes the 404 (`{ success:false, error:'Endpoint not
  found', path }`) and the catch-all 500, replacing Express's global error middleware.

Custom exception types (`VerificationError`, `ImageGenError`, `IPFSError`, `MintError`,
`DBError`) replace brittle string matching for step attribution — internal improvement, same
external payload.

---

## §5 — Deployment

- **Container:** multi-stage Dockerfile on `public.ecr.aws/lambda/python:3.13`. Build stage
  runs `uv pip install --system -r` (from exported requirements or `uv sync`). Runtime
  `CMD ["app.lambda_handler.handler"]`.
- **Adapter:** `Mangum(app, lifespan="off")` (Lambda manages lifecycle; Redis connects
  lazily per the optional-cache pattern).
- **Payload cap:** 5MB JSON body limit retained (Lambda sync 6MB ceiling) — enforced via a
  request-size guard.
- **Function URL / SAM:** reuse the existing template; only the image and handler change.
  Frontend cutover = update `BACKEND_URL` env to the new Function URL.
- **Railway (secondary):** `railway.json` updated to `uv run uvicorn app.main:app
  --host 0.0.0.0 --port $PORT`, health check `/health`. Kept as a non-Lambda fallback.
- **Env vars:** identical `HACKNYU_*` names (see audit — 28 vars). `.env.example` mirrors
  `backend/.env.example`. cNFT vars (`HACKNYU_MERKLE_TREE_ADDRESS`, `HACKNYU_DAS_RPC_URL`)
  documented as unused/deprecated.

---

## §6 — Testing

The current backend has **zero tests**; this is the targeted fix with the most leverage.

- **Framework:** pytest + pytest-asyncio; `httpx.AsyncClient` against the ASGI app.
- **External mocking:** `respx` for OpenRouter / NFT.Storage / Supabase HTTP. Solana RPC via
  fixtures returning canned responses (no devnet calls in CI).
- **Coverage targets:**
  - `test_health.py` — `/` and `/health` shape.
  - `test_listings.py` — happy path (wallet + guest); liveness-fail 400 with `next_steps`;
    each pipeline-step failure → correct `failed_at` attribution; **on-chain anchor failure
    does NOT fail the request** (the load-bearing degradation in §3).
  - `test_payments.py` — create; verify valid→200; verify invalid→400 w/ `needsRetry`;
    history `type` filtering; balance; cancel no-op.
- **Schema parity guard:** a test asserting response JSON keys match the Express contract
  (encode the expected key sets as fixtures derived from the route docs).

---

## Out of Scope (explicit)

- Compressed NFT (Bubblegum) minting — dropped.
- The P0 Evidence Locker seller co-signature fix (memory 1651) — separate concern; the port
  preserves current behavior (prepared-but-unsigned for user wallets).
- USDC currency semantics — comments port as-is; no functional currency change.
- Deleting `backend/` — happens in a follow-up PR after parity is verified in production.
- Frontend changes beyond the eventual `BACKEND_URL` env flip.

---

## Verification (end-to-end)

1. `cd backend-py && uv sync && uv run pytest` → all tests green.
2. `uv run uvicorn app.main:app --port 3001` locally; hit `/health`, `/docs`.
3. Run the existing frontend against `BACKEND_URL=http://localhost:3001`; exercise the full
   create-listing → pay flow on devnet; compare responses to Express byte-for-byte.
4. `docker build` the Lambda image; `docker run -p 9000:8080` and invoke via the Lambda
   Runtime Interface Emulator; confirm `/api/create-listing` round-trips.
5. Deploy to a **preview** Lambda Function URL; point a staging frontend at it before
   flipping production `BACKEND_URL`.
