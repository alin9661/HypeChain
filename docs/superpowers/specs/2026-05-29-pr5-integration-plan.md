# PR5 — Integration Capstone: Implementation Plan

**Date:** 2026-05-29
**Depends on:** PR1 #22 (scaffold), PR2 #23 (DSQL), PR3 #24 (Solana), PR4 #25 (AI/IPFS) — all merged to `main`.
**Branch:** `refactor/backend-fastapi-integration` (off `main` once the stack lands).
**Design source of truth:** `2026-05-28-backend-fastapi-refactor-design.md` (§3, §3.6, §4, §6).

---

## Context

PRs 2–4 built the domain layers (DB, Solana/Metaplex, AI/IPFS) and were verified to
compose (104 tests green combined, all modules import together). PR5 is the integration
glue: the request/response boundary (Pydantic schemas), the two domain routers that
orchestrate the services, the typed-exception error contract, the **previously-unassigned
`app/services/payment.py`** (Solana Pay business logic), and the HTTP-parity harness that
proves field-for-field equivalence with the Express service.

This is the only non-parallelizable PR — it needs holistic sight of every service's actual
signature, so it's built in one pass after the domains merge.

---

## Pre-work: confirm service signatures

The subagents built the services independently; before wiring, read the merged modules and
record the actual function names/signatures (do NOT assume):
- `app/db/queries.py` — insert listing, get_user_id_by_wallet, fetch_listing, update_listing_status, insert_transaction, increment_user_volume, history JOIN.
- `app/services/solana.py` — `mint_nft`, `list_item_on_marketplace`; `app/services/verification.py` — `submit_verification`, `confidence_to_bps`.
- `app/services/openrouter.py` — `verify_product[_with_model]`, `generate_marketing_image_with_model`, `download_image_as_base64`.
- `app/services/ipfs.py` — `create_and_upload_nft_metadata`.
- `app/utils/display_name.py` — `product_display_name`; `app/utils/solana_validation.py` — validators.

Adjust the wiring below to the real signatures.

---

## Files to create

### 1. `app/exceptions.py` — typed pipeline exceptions
`VerificationError`, `ImageGenError`, `IPFSError`, `MintError`, `DBError` (+ base
`PipelineError`). Each carries the `failed_at` label + `possible_causes[]` list (port the
Express `errorMessage.includes(...)` branches at `listing.js:455-503` into a static mapping
on each exception class). A helper `pipeline_error_response(exc) -> JSONResponse(500, ...)`
emits the exact `failure_details{failed_at, explanation, possible_causes, timestamp, note}`
payload.

### 2. `app/schemas/listing.py` — Pydantic v2 models
- `CreateListingRequest`: `userWallet: str | None`, `userEmail: str | None`,
  `productImage: str`, `optionalPriceSol: float | None`, `verificationModelId: str | None`,
  `imageGenModelId: str | None`, `useCompressedNFT: bool = True`. Validators (replace
  `validation.js`): at-least-one of wallet/email (model_validator); valid Solana pubkey if
  wallet present; base64 image ≤5MB (reuse `app/utils/solana_validation.py`); valid model
  IDs (reuse `app/config/ai_models.py`). Use `populate_by_name` + `alias` so the camelCase
  wire names bind to snake_case fields. **422 on failure is acceptable** for schema-level;
  the at-least-one-of and liveness checks that Express returned as 400 must stay 400 (do
  those in the router, not as Pydantic validators, OR convert 422→400 for those).
- `CreateListingResponse`: `success, listing_id, nft_mint_address, nft_image_url,
  product_name, listing_price_sol, status, is_pending_claim, message, verification{brand,
  model, confidence, liveness_score}` — field names verbatim from `listing.js:419-437`.

### 3. `app/schemas/payment.py` — Pydantic models
Request/response models for the 6 payment endpoints, field names verbatim from
`payment.js` docstrings (paymentRequest{...}, verification{...}, transaction history nested
`listing{...}`, balance, listing details).

### 4. `app/services/payment.py` — Solana Pay business logic (GAP — unassigned in original split)
Port `backend/src/services/payment.js` as orchestration over the already-built layers:
- `create_payment_request(listing_id, buyer_wallet)` — fetch listing via `db.queries`, build
  Solana Pay request (recipient=seller, amount=price_sol, reference, memo, listing/NFT meta).
- `verify_payment(signature, seller_wallet, price_sol, listing_id)` — query Solana RPC
  (via `app/services/solana.py`'s RPC wrapper) for the tx; validate recipient + amount;
  return `{valid, amountTransferred, blockTime, slot, needsRetry?}`.
- `complete_purchase(listing_id, buyer_wallet, buyer_user_id, signature, amount)` — update
  listing status + insert transaction (`db.queries`) + OCC-safe `increment_user_volume`.
- `get_transaction_history(wallet, type)` — `db.queries` history JOIN (nested shape, §3.6).
- `get_wallet_balance(wallet)` — Solana RPC `getBalance`.
- `fetch_listing(listing_id)` — `db.queries`.
> Reuses the Solana RPC singleton from `app/services/solana.py` — do not create a second client.

### 5. `app/routers/listings.py`
- `POST /api/create-listing`: orchestrate the 9-step pipeline (spec §3). Each external step
  wrapped so failures raise the matching typed exception (→ 500 attribution). Liveness < 50
  → **400** with the full `details{}` incl. `next_steps[]` (verbatim from `listing.js:145-164`).
  Steps 7 (submit_verification) and 8 (list_item_on_marketplace) are **best-effort: try/except
  → log warning, do NOT fail** (the load-bearing behavior). Use `product_display_name()` once.
- `GET /api/create-listing`: the static API-info doc (port `listing.js:526-563` verbatim).

### 6. `app/routers/payments.py`
The 6 endpoints (`create`, `verify`, `history/{wallet}`, `balance/{wallet}`,
`listing/{listing_id}`, `cancel`) as thin controllers over `app/services/payment.py`.
`verify`: invalid → 400 with `needsRetry`; valid → `complete_purchase` → 200. Missing-field
→ 400 (or 422 via schema). `cancel` is a no-op 200.

### 7. Wire into `app/main.py`
Uncomment/add the router includes (the scaffold left the spot marked):
```python
from app.routers import listings, payments
app.include_router(listings.router, prefix="/api")
app.include_router(payments.router, prefix="/api/payments")
```

---

## Tests (spec §6 — full branch coverage)

### `tests/test_listings.py`
Mock services at the router boundary (monkeypatch the service functions; respx for any
direct HTTP). Cover: happy (wallet + guest); each validation failure (no-wallet-no-email
400, invalid pubkey, invalid image, invalid model IDs); liveness-fail 400 with `next_steps`;
each pipeline step raising → correct `failed_at`; **both best-effort on-chain paths
warn-not-fail (request still 200)**; `MARKETPLACE_PROGRAM_ID` unset → skip on-chain + 200;
custodial vs user-wallet signing branch; orphan `seller_user_id` → null.

### `tests/test_payments.py`
create (+ missing-field 400); verify valid→200 / invalid→400 `needsRetry` /
`complete_purchase` raises→500; history `type=buyer|seller|all` + nested shape; balance;
listing; cancel no-op; missing-param 400/404.

### `tests/test_parity.py` — HTTP-parity harness (the §3.6 guard)
A test (skippable without a running Express instance) that fires identical requests at both
`EXPRESS_URL` and the FastAPI app and diffs the JSON: key sets, value types, timestamp
format (`+00:00`, microseconds), Decimal→number, null handling. Encode the Express response
key-sets as fixtures derived from the route docs so the structural half runs in CI without
Express; the live-diff half is `@pytest.mark.skipif(no EXPRESS_URL)`.

---

## Verification

1. `cd backend-py && uv sync && uv run pytest -q` → all green (existing 104 + new).
2. `uv run ruff check .` clean.
3. `uv run uvicorn app.main:app --port 3001`; `/docs` shows all 9 routes; `/health` ok.
4. Run the parity harness against a local Express (`backend/`) on devnet for create-listing
   → pay; confirm field-for-field match.
5. `docker build` the Lambda image; invoke via Lambda RIE; confirm `/api/create-listing`
   round-trips.

---

## Open items to resolve during PR5 (carried from the domain PRs)

These need live infra and should be confirmed/closed as part of integration QA:
- **DSQL:** `users.total_volume` column name/type; `dsql:DbConnectAdmin` IAM grant.
- **Metaplex:** program ID + `CreateMetadataAccountV3` discriminator/Borsh layout/account
  order — byte-compare a Python-built mint against a real devnet tx (the golden test's TODO).
- **OpenRouter:** verification JSON shape; image-gen response path
  (`choices[0].message.images[0].image_url.url`); NFT.Storage upload response shape.

---

## NOT in PR5 scope
- Deleting `backend/` (Express) — separate follow-up after prod parity.
- The P0 Evidence Locker seller co-signature fix — preserve current behavior.
- Data migration — DB is empty; nothing to migrate.
