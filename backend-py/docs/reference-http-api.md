# Reference: HTTP API

> **Status:** The service/DB layers are complete, but the routers that expose the listing and
> payment endpoints land in **PR5**. Today the **live** API is `GET /health` and `GET /`. The
> listing/payment routes below are documented from the design spec and Express parity, marked
> **Pending (PR5)** until wired. The response *shapes* are the contract PR5 must match.

The interactive OpenAPI UI is served at `/docs` when the app runs.

---

## Live routes

### `GET /health`
Liveness probe (used by the Lambda Function URL and local dev).
```json
{
  "status": "healthy",
  "timestamp": "2026-06-01T18:00:00.000000+00:00",
  "uptime": 12.34,
  "environment": "production"
}
```

### `GET /`
API discovery document.
```json
{
  "name": "HypeChain Backend API",
  "version": "1.0.0",
  "description": "AI-Powered NFT Marketplace Backend with Solana Pay",
  "endpoints": { "health": "/health", "createListing": "POST /api/create-listing", "...": "..." },
  "documentation": "https://github.com/alin9661/HypeChain"
}
```

---

## Error contract

Shared across all routes (ported from the Express backend):

| Case | Status | Body |
|------|--------|------|
| Unmatched route | 404 | `{"success": false, "error": "Endpoint not found", "path": "<path>"}` |
| Request body > 5MB | 413 | `{"success": false, "error": "Request body too large (max 5MB)"}` |
| Unexpected error (production) | 500 | `{"success": false, "error": "Internal server error"}` |
| Unexpected error (development) | 500 | `{"success": false, "error": "<message>", "stack": "<traceback>"}` |
| Schema validation | 422 | FastAPI validation detail (Pydantic) |

---

## Pending (PR5)

### `POST /api/create-listing`
Creates an AI-verified NFT listing. Request (camelCase wire names):
```json
{
  "userWallet": "<solana pubkey>",      // OR userEmail (at least one required)
  "userEmail": "user@example.com",
  "productImage": "data:image/jpeg;base64,...",   // ≤5MB
  "optionalPriceSol": 0.5,
  "verificationModelId": "zhipuai/glm-4-plus",     // optional
  "useCompressedNFT": true                          // accepted, ignored (cNFT dropped)
}
```
Success (200):
```json
{
  "success": true, "listing_id": "...", "nft_mint_address": "...",
  "nft_image_url": "...", "product_name": "...", "listing_price_sol": 0.5,
  "status": "active", "is_pending_claim": false, "message": "...",
  "verification": { "brand": "...", "model": "...", "confidence": 0.9, "liveness_score": 87 }
}
```
- **Liveness fail (400):** `liveness_score < 50` → `{"success": false, "error": "...", "details": {..., "next_steps": [...]}}` (the `next_steps` array is rendered by the frontend).
- **Pipeline failure (500):** `{"success": false, "error": "...", "failure_details": {"failed_at": "Step N: ...", "explanation": "...", "possible_causes": [...], "timestamp": "..."}}`.
- The on-chain anchoring (Step 4.5) and marketplace listing (Step 5) are **best-effort**: they log a warning but never fail the request — a listing succeeds once minted + saved.

### `GET /api/create-listing`
Static endpoint documentation (field descriptions, supported models).

### Payments — `/api/payments/*`
| Method & path | Purpose |
|---------------|---------|
| `POST /create` | Build a Solana Pay request for a listing → `{success, paymentRequest{...}}`. |
| `POST /verify` | Verify a payment tx, then complete the purchase. Invalid → 400 with `needsRetry`; valid → 200 with `verification` + `purchase`. |
| `GET /history/:walletAddress?type=buyer\|seller\|all` | Transaction history with nested `listing{...}`. |
| `GET /balance/:walletAddress` | SOL balance → `{success, walletAddress, balance}`. |
| `GET /listing/:listingId` | Listing details for the payment UI. |
| `POST /cancel` | UI-state no-op (Solana Pay needs no cancellation) → `{success: true}`. |

These map onto the service functions in [Reference: Service & data layer](reference-services.md)
(`services.payment` — itself part of PR5 — orchestrating `db.queries` + `services.solana`).

## Related
- [Explanation: Architecture](explanation-architecture.md) — the create-listing pipeline diagram
- [Reference: Service & data layer](reference-services.md)
