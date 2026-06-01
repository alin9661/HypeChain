# Explanation: Architecture

This explains how the backend is structured and why a request flows the way it does. For the
*what* (signatures, settings), see the reference docs; for the *why we chose this stack*, see
[Design decisions](explanation-design-decisions.md).

## The problem

The backend orchestrates a long chain of external services — AI vision, image generation,
IPFS, Solana, a database — behind a small HTTP surface, and it runs on AWS Lambda where the
same process is reused across many requests. Two things go wrong if you're naive about it:
reconnecting to every external service on each request (latency), and letting a flaky
third-party step (a Solana RPC hiccup) fail a request that has already done the expensive,
irreversible work (minting an NFT).

## Layers

```
            HTTP request (Lambda Function URL → Mangum → ASGI)
                                │
        ┌───────────────────────────────────────────────┐
        │  Middleware stack (outer → inner)              │
        │    BodySizeLimitMiddleware   (5MB stream cap)  │
        │    SecurityHeadersMiddleware (helmet-equiv)    │
        │    CORSMiddleware                              │
        └───────────────────────────────────────────────┘
                                │
        ┌───────────────────────────────────────────────┐
        │  Routers  app/routers/                         │
        │    health (live) · listings, payments (PR5)    │
        └───────────────────────────────────────────────┘
                                │  validate (Pydantic) → orchestrate
        ┌───────────────────────────────────────────────┐
        │  Services  app/services/                       │
        │   openrouter · ipfs · cache · solana ·         │
        │   metaplex · verification · payment (PR5)      │
        └───────────────────────────────────────────────┘
                                │
        ┌───────────────────────────────────────────────┐
        │  Data + external clients (lazy singletons)     │
        │   app/db (DSQL pool, OCC, queries) ·           │
        │   OpenRouter SDK · httpx · redis · Solana RPC  │
        └───────────────────────────────────────────────┘
```

`app/config/settings.py` is read once (`get_settings()` is `lru_cache`d) and is the single
source of truth for every environment variable. `app/main.py` assembles the app;
`app/lambda_handler.py` wraps it with `Mangum(app, lifespan="off")`.

## Warm-instance model (why clients are module-level singletons)

Lambda freezes and reuses the execution environment between invocations. Every external client
— the OpenRouter SDK, the Redis connection, the Solana RPC client, the DSQL pool — is created
lazily on first use and held at module scope, so subsequent warm invocations reuse the open
connection instead of paying a fresh TLS/handshake each time. `lifespan="off"` is set because
Lambda, not ASGI lifespan events, owns the process lifecycle.

The DSQL pool is the subtle one: it is small (2–5 connections), and it mints a fresh IAM auth
token per *new physical connection* (the token authenticates connection setup, not each query),
with `statement_cache_size=0` because DSQL rejects prepared-statement reuse. See
[Configure Aurora DSQL](howto-configure-dsql.md).

## Request lifecycle: `create-listing` (PR5)

The headline pipeline. Steps 1–6 must succeed; steps 7–8 are **best-effort**.

```
 validate (Pydantic; ≥1 of wallet/email, image ≤5MB, model ids)
   │   guest (no wallet) → PLATFORM_CUSTODIAL_WALLET, status "pending_wallet"
   ▼
 1. AI verify  ──────────────►  liveness_score < 50 ?  ── yes ─►  400 + next_steps[]
   │  (openrouter.verify_product, cached)                          (STOP — no mint)
   ▼ no
 2. generate NFT art (gpt-5-image-mini) → download base64
   ▼
 3. upload image + metadata → IPFS            (ipfs.create_and_upload_nft_metadata)
   ▼
 4. mint standard NFT                         (solana.mint_nft)   ◄─ irreversible
   ▼
 5. INSERT listing                            (db.queries.insert_listing)
   ▼
 6. ── success is now guaranteed ──
   ▼
 7. on-chain VerificationProof PDA            (best-effort: try/except → warn)
   ▼
 8. marketplace listing (custodial vs user)   (best-effort: try/except → warn)
   ▼
 200  { listing_id, nft_mint_address, verification{...}, ... }
```

The best-effort boundary is deliberate: once the NFT is minted and the row is saved, the
listing exists. A failure talking to the marketplace program afterward must not turn that into
a 500 — it logs a warning and the request still returns 200. Pipeline failures *before* that
boundary return a 500 with `failure_details.failed_at` naming the step.

## Trade-offs

- **Synchronous pipeline.** create-listing runs every external call inline within one request
  (no queue). Simple and matches the Lambda 900s budget, but a slow AI/image step stretches the
  request. A job-queue split was considered and deferred (it would break the byte-for-byte
  parity goal and add infrastructure).
- **Service layer over a framework.** Plain modules with module-level singletons (not a DI
  container) keep the call graph obvious and testable; the cost is that lifecycle is by
  convention, not enforced.

## Related
- [Design decisions](explanation-design-decisions.md)
- [Reference: HTTP API](reference-http-api.md) · [Reference: Service & data layer](reference-services.md)
