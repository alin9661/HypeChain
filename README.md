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
FRONTEND_URL=http://localhost:3000

# OpenRouter API (for AI verification & image generation)
OPENROUTER_API_KEY=your_key_here

# NFT.Storage (for IPFS uploads)
NFT_STORAGE_API_KEY=your_key_here

# Solana Configuration
SOLANA_RPC_URL=https://api.devnet.solana.com
SOLANA_NETWORK=devnet

# Server Wallet (for paying transaction fees)
SERVER_WALLET_PRIVATE_KEY=your_base58_private_key

# Smart Contract (deploy first, then add)
MARKETPLACE_PROGRAM_ID=your_program_id
```

**Frontend** (`frontend/.env.local`):

```bash
NEXT_PUBLIC_API_URL=http://localhost:3001
```

### 3. Deploy Smart Contract

```bash
cd contracts

# Build the program
anchor build

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

Creates a new NFT listing with AI verification.

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

```
HackNYU 2025/
├── frontend/                             # Next.js frontend
│   ├── src/
│   │   ├── app/                         # Next.js pages
│   │   ├── components/                  # React components
│   │   └── lib/                         # Utilities
│   └── package.json
│
├── backend/                              # Express.js API server
│   ├── src/
│   │   ├── index.js                     # Server entry point
│   │   ├── routes/
│   │   │   └── listing.js               # API routes
│   │   ├── services/
│   │   │   ├── openrouter.js            # AI services
│   │   │   ├── ipfs.js                  # IPFS uploads
│   │   │   └── solana.js                # NFT minting
│   │   └── utils/
│   │       └── validation.js            # Input validation
│   ├── package.json
│   └── .env
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

### Instructions

#### 1. `list_item`
Lists an NFT for sale.

```rust
pub fn list_item(ctx: Context<ListItem>, price_sol: u64) -> Result<()>
```

**Accounts:**
- `seller`: Signer
- `nft_mint`: NFT mint address
- `product_listing`: PDA storing listing data

#### 2. `delist_item`
Removes a listing (seller only).

```rust
pub fn delist_item(ctx: Context<DelistItem>) -> Result<()>
```

#### 3. `buy_item`
Purchases an NFT.

```rust
pub fn buy_item(ctx: Context<BuyItem>) -> Result<()>
```

**Actions:**
- Transfers SOL to seller
- Transfers NFT to buyer
- Marks listing as sold

### Account Structure

```rust
pub struct ProductListing {
    pub seller: Pubkey,
    pub nft_mint: Pubkey,
    pub price_sol: u64,
    pub is_listed: bool,
    pub bump: u8,
}
```

## Testing

### Test API Endpoint

```bash
curl -X POST http://localhost:3000/api/create-listing \
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
anchor test
```

## Development

### Build Smart Contract

```bash
cd contracts
anchor build
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
