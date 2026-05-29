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
OPENROUTER_API_KEY=sk-or-your-key
NFT_STORAGE_API_KEY=your-token
SOLANA_RPC_URL=https://api.devnet.solana.com
SERVER_WALLET_PRIVATE_KEY=your_base58_key
MARKETPLACE_PROGRAM_ID=your_program_id
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

Creates a new NFT listing with AI verification.

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

### GET /health

Health check endpoint.

### GET /

API information and available endpoints.

## Project Structure

```
backend/
├── src/
│   ├── index.js              # Express server
│   ├── routes/
│   │   └── listing.js        # Listing routes
│   ├── services/
│   │   ├── openrouter.js     # AI verification & generation
│   │   ├── ipfs.js           # IPFS uploads
│   │   └── solana.js         # NFT minting
│   └── utils/
│       └── validation.js     # Input validation
├── package.json
└── .env.example
```

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| PORT | Server port | No (default: 3001) |
| FRONTEND_URL | Frontend URL for CORS | No |
| OPENROUTER_API_KEY | OpenRouter API key | Yes |
| NFT_STORAGE_API_KEY | NFT.Storage API key | Yes |
| SOLANA_RPC_URL | Solana RPC endpoint | Yes |
| SERVER_WALLET_PRIVATE_KEY | Server wallet (base58) | Yes |
| MARKETPLACE_PROGRAM_ID | Smart contract ID | No |

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
