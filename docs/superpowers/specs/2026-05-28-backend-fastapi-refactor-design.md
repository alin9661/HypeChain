# Backend FastAPI Refactor — Design Spec

**Date:** 2026-05-28 (revised 2026-05-29 after `/plan-eng-review`)
**Branch:** `refactor/backend-fastapi`
**Status:** Revised per eng review — split into parallel PRs (see §7)

---

## Context

The HypeChain backend is a 9-endpoint Express.js (JavaScript, Node 20) REST API deployed
as an AWS Lambda Docker container (Function URL, `InvokeMode: BUFFERED`, 900s timeout). It
orchestrates a heavy external-service pipeline: OpenRouter (AI vision verification + NFT
image generation), Solana (NFT minting + on-chain marketplace listing + verification-proof
anchoring), NFT.Storage (IPFS), Supabase (Postgres), and optional Redis caching.

We are refactoring it to **FastAPI (Python 3.13)** for a more ergonomic async stack, typed
Pydantic validation, auto-generated OpenAPI docs, and a real test suite (the current backend
has **zero tests**). This refactor also (a) folds in targeted hardening, and (b) migrates the
data layer from Supabase to **Aurora DSQL**.

Intended outcome: a `backend-py/` service **behaviorally identical at the HTTP boundary** —
same routes, same response JSON shapes, same env var names — so the Next.js frontend cuts
over by flipping one `BACKEND_URL` env var, with instant rollback to the Express service.

> **"Parity" means HTTP-contract parity, not data-layer parity.** The DB swap is internal;
> the externally observable JSON must match the Express service field-for-field. Because the
> data layer changes, parity is a per-field engineering task (see §3.6).

> **No production data at risk.** The live Supabase DB is empty (no rows, no live traffic),
> so there is no data migration and no production-breakage risk. This is why the DSQL swap
> can be bundled now and why the work can land across several PRs without a cutover freeze.

---

## Decisions (brainstorming + eng review)

| Decision | Choice | Source |
|---|---|---|
| Coexistence | Side-by-side `backend-py/`, env-var cutover | brainstorm |
| Scope | Parity port + targeted fixes | brainstorm |
| Solana minting | Standard NFTs only — drop cNFT (Bubblegum) | brainstorm |
| Deploy target | AWS Lambda + mangum, py3.13 container | brainstorm |
| Python tooling | uv (`uv.lock` committed) | brainstorm |
| Rate limiting | **Removed** from app; coarse Function URL throttling only (§5) | eng review |
| Mint de-risk | Golden-transaction byte test + pinned program ID + Borsh layout | eng review |
| Client lifecycle | Module-level singletons reused across warm invocations | eng review |
| **Database** | **Migrate Supabase → Aurora DSQL** (hardened per §3.5) | eng review |
| DB connection | Module-level small async pool, IAM-token-aware, `statement_cache_size=0` | eng review |
| Display name | Single `product_display_name()` helper | eng review |
| Tests | Full branch coverage (~30 branches) + DSQL-specific tests | eng review |
| **Delivery** | **5 PRs: 1 scaffold → 3 parallel → 1 integration** (§7) | user |

---

## §1 — Architecture & Directory Layout

```
backend-py/
├── pyproject.toml              # uv-managed; ALL deps declared up front (avoids cross-PR conflict)
├── uv.lock                     # committed
├── Dockerfile                  # public.ecr.aws/lambda/python:3.13 base
├── README.md
├── .env.example                # mirrors HACKNYU_* (minus Supabase, plus DSQL)
├── .python-version             # 3.13
├── schema/
│   ├── 000_dump_from_supabase.sql   # RECOVERED live schema (§3.5 step 0)
│   └── 001_dsql_schema.sql          # DSQL-adapted DDL (no FK/trigger/RLS)
├── app/
│   ├── main.py                 # FastAPI app factory + middleware
│   ├── lambda_handler.py       # handler = Mangum(app, lifespan="off")
│   ├── config/{settings.py, ai_models.py}
│   ├── routers/{health.py, listings.py, payments.py}
│   ├── schemas/{listing.py, payment.py}
│   ├── db/{pool.py, occ.py, queries.py}
│   ├── services/{openrouter.py, solana.py, metaplex.py, ipfs.py, cache.py, payment.py, verification.py}
│   ├── middleware/{cors.py, security.py}
│   └── utils/{solana_validation.py, display_name.py}
└── tests/{conftest.py, test_health.py, test_listings.py, test_payments.py,
            test_metaplex_golden.py, test_dsql.py}
```

**Entrypoints:** Lambda `app.lambda_handler.handler`; local `uv run uvicorn app.main:app
--reload --port 3001`.

---

## §2 — Dependency Mapping (Node → Python)

| Concern | Current (Node) | Replacement | Notes |
|---|---|---|---|
| Web framework | express | **fastapi** | OpenAPI at `/docs`. |
| Dev server | nodemon | **uvicorn[standard]** | |
| Lambda adapter | serverless-http | **mangum** | `lifespan="off"`. |
| Validation | hand-written | **pydantic v2** | auto 422. |
| CORS | cors | **CORSMiddleware** | same `HACKNYU_FRONTEND_URL`. |
| Security headers | helmet | **`secure`** | CSP/HSTS/X-Frame. |
| Logging | morgan | **structlog** + uvicorn access log | |
| Rate limiting | none | **none (removed)** | Function URL throttling only; §5. |
| Env | dotenv | **pydantic-settings** | fail-fast on missing. |
| Solana RPC/tx | @solana/web3.js | **solders + solana-py** | |
| Metaplex std NFT | umi + mpl-token-metadata | **hand-built via solders** (`metaplex.py`) | pinned program ID + Borsh; golden-tx test. |
| Metaplex cNFT | mpl-bubblegum | **DROPPED** | flag accepted, ignored. |
| OpenRouter AI | openai | **openai** (same baseURL) | |
| IPFS | nft.storage | **httpx** → NFT.Storage REST | |
| **Database** | **@supabase/supabase-js** | **asyncpg + SQLAlchemy-async + boto3** | DSQL IAM token; §3.5. |
| Redis | ioredis | **redis.asyncio** | optional/disabled. |
| Base58 | bs58 | **base58** | |
| Testing | Jest (unused) | **pytest + pytest-asyncio + respx** | |

`supabase-py` is **not** used — DSQL is plain Postgres over asyncpg.

---

## §3 — Data Flow

### POST /api/create-listing (cNFT branch removed)

1. **Validate** (Pydantic → 422): ≥1 of `userWallet`/`userEmail`; valid pubkey if wallet;
   valid base64 image ≤5MB; valid model IDs. Guest (no wallet) → `PLATFORM_CUSTODIAL_WALLET`,
   status `pending_wallet`.
2. **AI verify**; `liveness_score < 50` → **400** with full `details{}` incl. `next_steps[]` (verbatim).
3. **NFT image** — `openai/gpt-5-image-mini` from `product_display_name(...)`; download to base64.
4. **IPFS** → `{metadataUri, imageUrl}`.
5. **Mint** — **always standard NFT** via `metaplex.py` (pinned builder).
6. **DB save** — INSERT `listings`; cNFT cols `false`/`null`. App-level integrity (no DB FK):
   look up `users.id` by wallet; orphan `seller_user_id` → `null`.
7. **On-chain anchor (best-effort)** — if `HACKNYU_MARKETPLACE_PROGRAM_ID` set:
   `submitVerification(...)`. **try/except → warn, do NOT fail.**
8. **Marketplace list (best-effort)** — custodial(guest) vs user-wallet signing
   (`listing.js:399`). **try/except → warn, do NOT fail.**
9. **200** — field names verbatim.

> **Load-bearing:** steps 7–8 never fail the request. Listing succeeds once minted + saved.

### Payment routes

Thin controllers over `services/payment.py`, 1:1. `verify`: fetch listing → `verifyPayment`
(invalid → 400 `needsRetry`) → `completePurchase` → 200. `completePurchase` runs the
`increment_user_volume` logic app-side, OCC-safe (§3.5). `history` join + nested shape (§3.6).

---

## §3.5 — Data Layer: Supabase → Aurora DSQL (hardened)

**Step 0 — Recover live schema (PREREQUISITE).** Repo `.sql` files define only `listings`,
`transactions`, `favorites`. The backend also depends on objects that exist **only in live
Supabase**: the **`users` table** (`listing.js:313`) and **`increment_user_volume`** RPC
(`payment.js:298`), plus triggers (`update_updated_at_column`), views (`active_listings`,
`user_stats`, `compressed_nft_stats`, `pending_nft_claims`), functions (`mark_listing_as_sold`,
`confirm_transaction`, `claim_nft`). Run `pg_dump --schema-only` → `schema/000_dump_from_supabase.sql`.
**No DSQL DDL can be authored until this exists.** (DB is empty — schema-only dump, no data.)

**Step 1 — Adapt DDL** (`schema/001_dsql_schema.sql`): drop FK → app-enforce
`seller_user_id → users.id`; replace `update_updated_at_column` trigger → set `updated_at`
explicitly in UPDATEs; keep `gen_random_uuid()` only if DSQL supports it else app-side UUIDs;
port only views/functions the 9 routes actually query (routes use raw table reads → drop
unused; document each).

**Step 2 — `increment_user_volume` → OCC-safe app-side.** DSQL optimistic concurrency control:
single `UPDATE users SET total_volume = total_volume + :amt WHERE id = :id` wrapped in
`db/occ.py` retry-on-serialization-error (OC001), or DSQL PL/pgSQL if supported. Concurrency test required (§6).

**Step 3 — Connection** (`db/pool.py`): module-level async pool (2–5), reused warm.
**`statement_cache_size=0`** (DSQL prepared-statement limit — else 2nd query errors). IAM
token via `boto3` on **new connection creation** (token auths connection setup, not each query).

**Step 4 — RLS dropped.** Backend uses service-role (bypasses RLS) → functionally neutral;
documented security delta. Confirm no read path relied on the guest-claim SELECT policy.

---

## §3.6 — HTTP Parity Across the DB Swap

- **No `SELECT *`.** Enumerate/order every column the frontend consumes (~30 on listings).
- **Nested history shape.** Reproduce Supabase's `listing: {product_name, image_url,
  nft_mint_address}` nested object via `json_build_object(...)` over `transactions JOIN
  listings`, `WHERE buyer_wallet = :w OR seller_wallet = :w` — single JOIN, **not** N+1.
- **Scalar serialization.** Normalize `TIMESTAMPTZ` to Supabase's exact string (`+00:00`,
  microseconds); `Decimal` → JSON number; null handling. Parity test (§6) diffs live Supabase
  JSON vs DSQL JSON per endpoint.

---

## §4 — Error Handling

Mirror Express exactly: validation → 400/422 `{success:false, error}` (liveness fail keeps
full `details{}` incl. `next_steps[]`); pipeline → 500 `failure_details{failed_at, explanation,
possible_causes[], timestamp, note}` via typed exceptions (`VerificationError`, `ImageGenError`,
`IPFSError`, `MintError`, `DBError`) replacing string-matching; payment → 500 `{success:false,
error}`; central handler for 404 + catch-all 500.

---

## §5 — Deployment

- **Container:** multi-stage on `public.ecr.aws/lambda/python:3.13`; `uv` install; `CMD ["app.lambda_handler.handler"]`.
- **Adapter:** `Mangum(app, lifespan="off")`; clients/pool lazy + reused warm.
- **Payload:** 5MB JSON guard (Function URL BUFFERED caps response 6MB).
- **Function URL / SAM:** reuse template; swap image + handler. Cutover = `BACKEND_URL` flip.
- **Rate limiting = infra, coarse.** Function URL/API Gateway throttling is per-function
  concurrency, **not per-IP** — this *removes* app-level limiting, not replaces it. Known gap.
- **Env:** add DSQL endpoint/region/IAM; **remove** `HACKNYU_SUPABASE_*`; cNFT vars deprecated.

---

## §6 — Testing

Full branch coverage (~30 branches): pytest + pytest-asyncio + respx; Solana via fixtures.
**Each PR ships its own tests** (§7). Highlights: all validation 422s; liveness 400 w/
`next_steps`; per-step `failed_at`; **both best-effort on-chain paths warn-not-fail**;
program-id-unset skip; custodial vs user signing; orphan `seller_user_id`→null; payment
missing-field 400s + `completePurchase` throw→500; history nested shape; **[CRITICAL]
test_metaplex_golden** byte-guard (pin to Borsh spec AND reference devnet tx; spec wins on
disagreement); **test_dsql** — `statement_cache_size=0` 2nd-query, OCC concurrent increment,
per-field parity diff vs Supabase, column-enumeration guard.

---

## §7 — PR Split & Parallel Build (NEW — user directive)

Empty DB + no prod traffic → safe to land across multiple PRs without a cutover freeze.
Splitting also restores bisectability (the outside voice's main objection): each PR is an
independent, reviewable change with its own tests.

**Dependency graph:**
```
PR1 scaffold ──┬──> PR2 DSQL data layer   ──┐
               ├──> PR3 Solana/Metaplex    ──┼──> PR5 routers + integration + parity harness
               └──> PR4 OpenRouter/IPFS     ──┘
        (PR2/3/4 run in PARALLEL worktrees after PR1 merges)
```

| PR | Scope | Files (own, low conflict) | Depends on | Tests in PR |
|----|-------|---------------------------|------------|-------------|
| **PR1 Scaffold** | uv project, Dockerfile, `app/main.py`, `config/settings.py`, middleware, health router, lambda_handler. **Declares ALL deps in pyproject.toml up front.** | `pyproject.toml`, `Dockerfile`, `app/main.py`, `app/config/`, `app/middleware/`, `app/routers/health.py`, `app/lambda_handler.py` | — | test_health |
| **PR2 DSQL** | schema dump + adapt, pool, OCC, queries | `schema/`, `app/db/` | PR1 | test_dsql |
| **PR3 Solana** | mint, pinned Metaplex builder, on-chain verification | `app/services/{solana,metaplex,verification}.py`, `app/utils/solana_validation.py` | PR1 | test_metaplex_golden |
| **PR4 AI/IPFS** | OpenRouter, IPFS, cache, model registry, display-name helper | `app/services/{openrouter,ipfs,cache}.py`, `app/config/ai_models.py`, `app/utils/display_name.py` | PR1 | service unit tests |
| **PR5 Integration** | `routers/{listings,payments}.py`, schemas, wire all services, error contract, parity harness | `app/routers/{listings,payments}.py`, `app/schemas/` | PR2+PR3+PR4 | test_listings, test_payments, parity |

**Conflict mitigation:** the only shared file across PR2/3/4 is `pyproject.toml` — **PR1
declares the full dependency set up front** so the parallel lanes never edit it. They touch
disjoint directories otherwise (`db/` vs `services/` vs `config/`).

**Execution:** PR1 merges first → spawn 3 subagents in isolated worktrees for PR2/3/4
concurrently → after all merge, PR5 wires them and runs the parity harness against the live
Express service.

---

## Risk Register (from outside-voice challenge)

| Risk | Mitigation |
|---|---|
| `users` table + `increment_user_volume` only in live DB | §3.5 step 0 schema dump (PR2 prerequisite) |
| OCC lost-update on volume increment | §3.5 step 2 retry + concurrency test |
| asyncpg prepared-statement break on DSQL | `statement_cache_size=0` + test |
| HTTP parity drift | §3.6 normalization + parity test (PR5) |
| Triggers/views/functions/RLS lost | port-if-used else document drop |
| ~~Unbisectable: two hard changes~~ | **Resolved** by §7 PR split + empty DB (no migration) |

---

## What Already Exists (reuse, don't rebuild)

- **Express backend** = behavioral reference for every route.
- **`frontend/lib/anchor-client.ts`** mirrors the Solana program — crib PDA derivation +
  account layout for `solana.py`/`verification.py`.
- **`supabase_marketplace_schema.sql` + migrations** = DDL starting point (`users` + RPC from live dump).
- **`config/ai-models.js`** = direct port to `ai_models.py`.

## NOT in Scope

- cNFT (Bubblegum) minting — dropped.
- P0 Evidence Locker seller co-signature fix (memory 1651) — preserve current behavior.
- USDC currency semantics — port wording as-is.
- Deleting `backend/` — follow-up after parity verified.
- App-level/per-IP rate limiting — removed; revisit as infra.
- Frontend changes beyond `BACKEND_URL` flip.

---

## Verification (end-to-end)

1. Per PR: `uv run pytest` for that PR's suite green.
2. After PR5: `uv run uvicorn app.main:app --port 3001`; hit `/health`, `/docs`.
3. **Parity harness:** create-listing → pay on devnet against both Express and FastAPI; diff
   responses field-for-field.
4. `docker build` Lambda image; run via Lambda RIE; confirm round-trip.
5. Deploy to **preview** Function URL; staging frontend before prod `BACKEND_URL` flip.
