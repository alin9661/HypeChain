# HypeChain Backend API

Express.js backend for the HypeChain NFT Marketplace with AI-powered product verification.

## Quick Start

### Install Dependencies

```bash
bun install
```

### Configure Environment

Create `.env` file:

```bash
# Copy example
cp .env.example .env

# Edit with your values
PORT=3001
HACKNYU_OPENROUTER_API_KEY=sk-or-your-key
HACKNYU_NFT_STORAGE_API_KEY=your-token
HACKNYU_SOLANA_RPC_URL=https://api.devnet.solana.com
HACKNYU_SERVER_WALLET_PRIVATE_KEY=your_base58_key
HACKNYU_SUPABASE_URL=https://your-project.supabase.co
HACKNYU_SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
HACKNYU_MARKETPLACE_PROGRAM_ID=your_program_id
HACKNYU_CASE_PREFIX=HC-2026-
```

### Run Server

```bash
# Development
bun dev

# Production
bun start
```

Server runs on `http://localhost:3001`

## API Endpoints

### POST /api/create-listing

Creates a new NFT listing with AI verification. `userWallet` is required —
requests without it get `400 { success: false, code: "ACCOUNT_REQUIRED" }`
(guests must create an account with a wallet before listing; there is no
custodial mint-target fallback).

**Request:**
```json
{
  "userWallet": "SOLANA_PUBLIC_KEY",
  "productImage": "data:image/jpeg;base64,...",
  "optionalPriceSol": 0.5
}
```

**Response:**
```json
{
  "success": true,
  "nft_mint_address": "ABC123...",
  "nft_image_url": "https://nftstorage.link/ipfs/...",
  "product_name": "Nike Air Jordan 1",
  "listing_price_sol": 0.5
}
```

### POST /api/payments/cosign-purchase

Builds and custodially co-signs an on-chain `purchase_evidence` transaction
for a custodial listing. The server builds the full transaction itself,
validates it against the on-chain listing PDA, partial-signs as the custodial
seller, and returns it for the buyer to sign and send. See
`src/services/cosign-purchase.js` for the security model (the server only
signs transactions it built itself).

**Request:**
```json
{
  "listingId": "uuid",
  "buyerWallet": "SOLANA_PUBLIC_KEY"
}
```

**Response (200):**
```json
{
  "success": true,
  "transaction": "base64, seller-signed",
  "priceLamports": 500000000,
  "priceSol": 0.5,
  "blockhash": "...",
  "lastValidBlockHeight": 123456,
  "nftMint": "...",
  "listingPda": "...",
  "seller": "..."
}
```

**Errors** (`{ success: false, error, code }` with 400/404/409/500):

| Code | Meaning |
|------|---------|
| MISSING_FIELDS | `listingId` or `buyerWallet` missing |
| INVALID_BUYER_WALLET | `buyerWallet` is not a valid public key (400) |
| SELF_PURCHASE | Buyer is the custodial seller wallet (400) |
| LISTING_NOT_FOUND / LISTING_NOT_ACTIVE | DB row missing or not purchasable |
| SELLER_NOT_CUSTODIAL | Listing's seller is not the custodial server wallet |
| LISTING_NOT_ON_CHAIN | No on-chain listing PDA for the mint |
| LISTING_NOT_PURCHASABLE | On-chain status is not `Listed` |
| PRICE_MISMATCH | DB price disagrees with on-chain price |
| NFT_NOT_IN_CUSTODY | NFT is not in the custodial wallet's ATA |
| CUSTODIAL_KEY_DRIFT | Server key no longer matches the on-chain seller |
| COSIGN_FAILED | Unexpected failure building/signing the transaction |

### Other payment endpoints

`POST /api/payments/create`, `POST /api/payments/verify`,
`GET /api/payments/history/:walletAddress`, `GET /api/payments/balance/:walletAddress`,
`GET /api/payments/listing/:listingId`, `POST /api/payments/cancel`.

`verify` is idempotent: replaying the same signature for the same listing and
buyer returns success instead of `409`.

### GET /health

Health check endpoint.

### GET /

API information and available endpoints.

## Project Structure

```
backend/
├── src/
│   ├── index.js                     # Express server
│   ├── routes/
│   │   ├── listing.js               # Listing routes
│   │   └── payment.js               # Payment routes (incl. cosign-purchase)
│   ├── services/
│   │   ├── openrouter.js            # AI verification & generation
│   │   ├── ipfs.js                  # IPFS uploads
│   │   ├── solana.js                # NFT minting
│   │   ├── payment.js               # Payment create/verify (idempotent replay)
│   │   ├── cosign-purchase.js       # Custodial co-sign tx builder
│   │   ├── evidence-locker-client.js # Anchor program client (fail-closed program ID)
│   │   ├── verification.js          # On-chain verification anchoring
│   │   ├── compressed-nft.js        # cNFT minting
│   │   ├── arweave.js               # Arweave uploads
│   │   └── cache.js                 # Caching layer
│   └── utils/
│       └── validation.js            # Input validation
├── scripts/
│   └── devnet-buy-smoke.js          # RUN_DEVNET=1 buy-side smoke test
├── package.json
└── .env.example
```

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| PORT | Server port | No (default: 3001) |
| HACKNYU_FRONTEND_URL | Frontend URL for CORS | No |
| HACKNYU_OPENROUTER_API_KEY | OpenRouter API key | Yes |
| HACKNYU_NFT_STORAGE_API_KEY | NFT.Storage API key | Yes |
| HACKNYU_SOLANA_RPC_URL | Solana RPC endpoint | Yes |
| HACKNYU_SERVER_WALLET_PRIVATE_KEY | Server wallet (base58) | Yes |
| HACKNYU_SUPABASE_URL | Supabase project URL (DB behind payments/listings) | Yes |
| HACKNYU_SUPABASE_SERVICE_ROLE_KEY | Supabase service-role key (DB behind payments/listings) | Yes |
| HACKNYU_MARKETPLACE_PROGRAM_ID | Evidence Locker program ID | In production (startup fails closed if unset/placeholder) |
| HACKNYU_CASE_PREFIX | Case-number prefix (e.g. `HC-2026-`) | No |
| HACKNYU_REDIS_ENABLED / HACKNYU_REDIS_URL, HACKNYU_DAS_RPC_URL, HACKNYU_MERKLE_TREE_ADDRESS (deprecated cNFT compat), HACKNYU_DEFAULT_VISION_MODEL / HACKNYU_DEFAULT_IMAGE_GEN_MODEL | Optional: caching, DAS RPC, legacy cNFT minting, AI model overrides | No |

## Testing

```bash
# Test with cURL
curl -X POST http://localhost:3001/api/create-listing \
  -H "Content-Type: application/json" \
  -d '{
    "userWallet": "YOUR_WALLET",
    "productImage": "data:image/jpeg;base64,...",
    "optionalPriceSol": 0.1
  }'
```

## Dependencies

- **express** - Web framework
- **@solana/web3.js** - Solana blockchain
- **@metaplex-foundation/umi** - NFT minting
- **nft.storage** - IPFS storage
- **openai** - OpenRouter API client
- **cors** - Cross-origin requests
- **helmet** - Security headers
- **morgan** - Request logging

## Development

```bash
# Run with nodemon
bun dev

# Lint code
bun run lint

# Run tests
bun test
```

## License

MIT
