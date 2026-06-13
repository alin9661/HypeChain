# 🏆 HackNYU 2025 - First Place Winner 🏆
### Best Use of Solana

[![Live Demo](https://img.shields.io/badge/Live-Demo-00D9FF?style=for-the-badge&logo=vercel&logoColor=white)](https://hypechain.vercel.app/)
[![DevPost](https://img.shields.io/badge/Dev-Post-003E54?style=for-the-badge&logo=devpost&logoColor=white)](https://devpost.com/software/hypechain)

[![Next.js](https://img.shields.io/badge/Next.js-000000?style=for-the-badge&logo=next.js&logoColor=white)](https://nextjs.org/)
[![Solana](https://img.shields.io/badge/Solana-9945FF?style=for-the-badge&logo=solana&logoColor=white)](https://solana.com/)
[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)

---

# HypeChain - AI-Powered NFT Marketplace

HypeChain is a next-generation NFT marketplace that uses AI to verify product authenticity and generate professional marketing images before minting on the Solana blockchain.

## Features

- **AI Product Verification**: Uses GLM 4.6 vision model to analyze product authenticity
- **Liveness Detection**: Scores images to detect screenshots or AI-generated fakes
- **Auto Marketing Images**: Generates professional product photos with crypto-themed backgrounds
- **Solana NFT Minting**: Mints verified products as NFTs using Metaplex
- **IPFS Storage**: Decentralized storage via nft.storage
- **On-Chain Marketplace**: Anchor smart contract for buying/selling

## Prerequisites

- Node.js 18+ and bun
- Rust 1.75+ (for smart contract development)
- Anchor CLI 0.30.1
- Solana CLI 1.18+
- OpenRouter API key
- NFT.Storage API key

## Quick Start

### 1. Install Dependencies

**Backend:**
```bash
cd backend
bun install
```

**Frontend:**
```bash
cd frontend
bun install
```

### 2. Environment Setup

**Backend** (`backend/.env`):

```bash
PORT=3001
HACKNYU_FRONTEND_URL=http://localhost:3000

# OpenRouter API (for AI verification & image generation)
HACKNYU_OPENROUTER_API_KEY=your_key_here

# NFT.Storage (for IPFS uploads)
HACKNYU_NFT_STORAGE_API_KEY=your_key_here

# Solana Configuration
HACKNYU_SOLANA_RPC_URL=https://api.devnet.solana.com

# Server Wallet (for paying transaction fees)
HACKNYU_SERVER_WALLET_PRIVATE_KEY=your_base58_private_key

# Smart Contract (deploy first, then add). Required in production —
# the server refuses to start with NODE_ENV=production if this is unset
# or still the Anchor scaffold placeholder.
HACKNYU_MARKETPLACE_PROGRAM_ID=your_program_id
HACKNYU_CASE_PREFIX=HC-2026-
```

**Frontend** (`frontend/.env.local`):

```bash
NEXT_PUBLIC_API_URL=http://localhost:3001

# Privy wallet auth — required in production builds (the app throws at
# startup without it); local dev/test fall back to a placeholder.
NEXT_PUBLIC_PRIVY_APP_ID=your_privy_app_id

# Evidence Locker program — required in production builds (the app throws
# at import when unset or still the scaffold placeholder).
NEXT_PUBLIC_HYPECHAIN_PROGRAM_ID=your_program_id

# Optional: flip on the on-chain Anchor co-sign purchase flow
NEXT_PUBLIC_USE_ANCHOR_PURCHASE=1
```

### 3. Deploy Smart Contract

The Evidence Locker program is deployed to devnet as
`2pTtzWXELYNXAsXkWq3zgErbYnJTANfq5LmBptdk5uiF`. To redeploy yourself,
follow [`contracts/DEPLOY.md`](contracts/DEPLOY.md):

```bash
cd contracts

# Build the program — ALWAYS via the wrapper, which pins the
# nightly-2024-11-01 toolchain Anchor 0.30.1 needs
./anchor.sh build

# Deploy to devnet
anchor deploy --provider.cluster devnet

# Copy the Program ID to your .env file
```

### 4. Run Services

**Backend** (Terminal 1):
```bash
cd backend
bun dev
```
Server runs on `http://localhost:3001`

**Frontend** (Terminal 2):
```bash
cd frontend
bun dev
```
App runs on `http://localhost:3000`

## API Usage

### POST `/api/create-listing`

Creates a new NFT listing with AI verification. `userWallet` is required —
requests without it are rejected with `400 ACCOUNT_REQUIRED` (guests must
create an account with a wallet before listing).

**Request Body:**

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
  "product_name": "Nike Air Jordan 1 Chicago",
  "listing_price_sol": 0.5
}
```

### Processing Steps

1. **Validation**: Validates wallet address and image format (max 5MB)
2. **AI Verification**: Analyzes product with GLM 4.6
   - Identifies brand, model, colorway
   - Calculates liveness score (rejects if < 50)
3. **Image Generation**: Creates marketing image with crypto background
4. **IPFS Upload**: Uploads image and metadata
5. **NFT Minting**: Mints NFT to user's wallet via Metaplex
6. **Marketplace Listing**: Lists on-chain at specified price

### POST `/api/payments/cosign-purchase`

Builds and custodially co-signs an on-chain `purchase_evidence` transaction
for a custodial listing. The server constructs the full transaction itself,
validates it against the on-chain listing PDA, partial-signs as the custodial
seller, and returns it base64-encoded for the buyer to sign and send.

**Request Body:**

```json
{
  "listingId": "uuid",
  "buyerWallet": "SOLANA_PUBLIC_KEY"
}
```

**Response:** `{ success, transaction, priceLamports, priceSol, blockhash, lastValidBlockHeight, nftMint, listingPda, seller }`

Errors use `{ success: false, error, code }` with codes such as
`INVALID_BUYER_WALLET`, `SELF_PURCHASE`, `SELLER_NOT_CUSTODIAL`,
`LISTING_NOT_ON_CHAIN`, `LISTING_NOT_PURCHASABLE`, `PRICE_MISMATCH`,
`NFT_NOT_IN_CUSTODY`, `CUSTODIAL_KEY_DRIFT`, and
`COSIGN_FAILED` — see [`backend/README.md`](backend/README.md) for the full table.

## Architecture

```
┌─────────────────┐
│   Frontend      │
│   Next.js 16    │
└────────┬────────┘
         │
    ┌────▼─────┐
    │   API    │
    │  Routes  │
    └────┬─────┘
         │
    ┌────▼──────────────────────────┐
    │        Services               │
    ├───────────────────────────────┤
    │ • OpenRouter (AI Verify)      │
    │ • OpenRouter (Image Gen)      │
    │ • IPFS (nft.storage)          │
    │ • Solana (Metaplex Umi)       │
    └────┬──────────────────────────┘
         │
    ┌────▼─────────────┐
    │  Solana Blockchain│
    │  ┌──────────────┐│
    │  │   NFT Mint   ││
    │  └──────────────┘│
    │  ┌──────────────┐│
    │  │  Marketplace ││
    │  │   Contract   ││
    │  └──────────────┘│
    └──────────────────┘
```

## Project Structure

> **FastAPI backend (shipped):** a Python 3.13 / FastAPI port of the Express backend lives
> in [`backend-py/`](backend-py/README.md), with full docs at
> [`backend-py/docs/`](backend-py/docs/README.md). It runs as an AWS Lambda container, keeps
> HTTP parity with the Express API, and adds an on-chain activities / provenance feed plus a
> Helius transfer-ingest webhook. Deploy scripts live in [`backend-py/deploy/`](backend-py/deploy).
> The frontend cuts over by flipping `BACKEND_URL`; `backend/` (Express) stays until the cutover lands.

```
HackNYU 2025/
├── frontend/                             # Next.js frontend
│   ├── app/                             # Next.js pages
│   ├── components/                      # React components
│   ├── lib/                             # Utilities
│   └── package.json
│
├── backend/                              # Express.js API server
│   ├── src/
│   │   ├── index.js                     # Server entry point
│   │   ├── routes/
│   │   │   ├── listing.js               # Listing routes
│   │   │   └── payment.js               # Payment routes (incl. cosign-purchase)
│   │   ├── services/
│   │   │   ├── openrouter.js            # AI services
│   │   │   ├── ipfs.js                  # IPFS uploads
│   │   │   ├── solana.js                # NFT minting
│   │   │   ├── cosign-purchase.js       # Custodial co-sign tx builder
│   │   │   └── evidence-locker-client.js # Anchor program client
│   │   └── utils/
│   │       └── validation.js            # Input validation
│   ├── package.json
│   └── .env
│
├── backend-py/                           # FastAPI backend (Python 3.13, AWS Lambda)
│   ├── app/                              # routers, services, db, config
│   ├── deploy/                           # deploy.sh, smoke-test, SECRETS/CUTOVER/THROTTLING
│   ├── docs/                             # Diataxis docs (tutorial/how-to/reference/explanation)
│   ├── schema/                           # Aurora DSQL schema
│   ├── tests/                            # pytest suite
│   └── pyproject.toml
│
└── contracts/                            # Solana smart contracts
    ├── programs/
    │   └── hypechain-marketplace/
    │       ├── src/
    │       │   └── lib.rs               # Anchor smart contract
    │       ├── Cargo.toml
    │       └── Xargo.toml
    └── Anchor.toml
```

## Smart Contract

The Anchor program (`hypechain_evidence_locker`) is deployed to devnet as
`2pTtzWXELYNXAsXkWq3zgErbYnJTANfq5LmBptdk5uiF`.

### Instructions

#### 1. `init_dossier`
One-time per server wallet: opens the Dossier that issues case numbers.

#### 2. `submit_verification`
Anchors an AI verification proof (confidence, model, liveness) for a mint.

#### 3. `list_evidence`
Lists a verified NFT for sale.

```rust
pub fn list_evidence(ctx: Context<ListEvidence>, price_lamports: u64) -> Result<()>
```

#### 4. `delist_evidence`
Removes a listing (seller only).

#### 5. `purchase_evidence`
Purchases an NFT (buyer + seller co-sign).

```rust
pub fn purchase_evidence(ctx: Context<PurchaseEvidence>) -> Result<()>
```

**Actions:**
- Transfers SOL to seller
- Transfers NFT to buyer
- Marks listing as `Sold`

#### 6. `flag_dispute`
Examiner flags a listing as disputed.

### Account Structure

```rust
pub struct EvidenceListing {
    pub seller: Pubkey,
    pub nft_mint: Pubkey,
    pub dossier: Pubkey,
    pub verification_proof: Pubkey,
    pub examiner: Pubkey,
    pub custodian: Option<Pubkey>, // Some(server_wallet) for custodial sellers
    pub case_number: u32,
    pub price_lamports: u64,
    pub status: ListingStatus, // Pending/Verified/Listed/Sold/Delisted/Disputed
    pub created_at: i64,
    pub bump: u8,
}
```

The program also stores `Dossier` (per server wallet) and `VerificationProof`
(per mint) accounts — see `contracts/programs/hypechain-marketplace/src/lib.rs`.

## Testing

### Test API Endpoint

```bash
curl -X POST http://localhost:3001/api/create-listing \
  -H "Content-Type: application/json" \
  -d '{
    "userWallet": "YOUR_SOLANA_ADDRESS",
    "productImage": "data:image/jpeg;base64,/9j/4AAQ...",
    "optionalPriceSol": 0.1
  }'
```

### Test Smart Contract

```bash
cd contracts
./anchor.sh test
```

## Development

### Build Smart Contract

```bash
cd contracts
./anchor.sh build   # wrapper pins nightly-2024-11-01 (required for Anchor 0.30.1)
```

### Deploy to Devnet

```bash
anchor deploy --provider.cluster devnet
```

### Deploy to Mainnet

```bash
anchor deploy --provider.cluster mainnet-beta
```

## Dependencies

### Frontend
- `@solana/web3.js` - Solana blockchain interaction
- `@metaplex-foundation/umi` - NFT minting
- `nft.storage` - IPFS storage
- `openai` - OpenRouter API client
- `next` - React framework

### Smart Contract
- `anchor-lang` - Solana program framework
- `anchor-spl` - Token program integration

## API Keys

1. **OpenRouter**: https://openrouter.ai/
   - Sign up and create an API key
   - Supports GLM 4.6 for vision and image generation

2. **NFT.Storage**: https://nft.storage/
   - Free tier includes unlimited uploads
   - Provides IPFS pinning

3. **Solana RPC**:
   - Devnet: `https://api.devnet.solana.com` (free)
   - Mainnet: Use QuickNode, Helius, or Alchemy

## Important Notes

- **Devnet Testing**: Always test on devnet first
- **Transaction Fees**: Server wallet pays for NFT minting (~0.01 SOL)
- **Image Size**: Max 5MB for base64 images
- **Liveness Score**: Minimum 50/100 to pass verification
- **NFT Ownership**: NFTs are minted directly to user's wallet

## License

MIT License - see LICENSE file for details

## Contributing

Contributions welcome! Please open an issue or PR.

## Roadmap

- [ ] Frontend UI for listing creation
- [ ] Browse marketplace page
- [ ] User profiles and collections
- [ ] Advanced filtering and search
- [ ] Auction functionality
- [ ] Mobile app (React Native)

## Support

For questions or issues:
- Open a GitHub issue
- Contact: [your-email]

---

Built for HackNYU 2025
