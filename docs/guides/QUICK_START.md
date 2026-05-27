# 🚀 Quick Start Guide - HypeChain

Get up and running in 5 minutes!

## Prerequisites

```bash
# Install Node.js 18+, bun, Rust, Solana CLI, Anchor CLI
node --version  # 18+
bun --version
solana --version
anchor --version  # 0.30.1
```

## Step 1: Clone & Install (2 min)

```bash
cd frontend
bun install
```

## Step 2: Get API Keys (3 min)

### OpenRouter
1. Visit https://openrouter.ai/
2. Sign up / Login
3. Go to Keys → Create Key
4. Copy your key: `sk-or-...`

### NFT.Storage
1. Visit https://nft.storage/
2. Sign up with email
3. Create API Token
4. Copy token: `eyJhbG...`

## Step 3: Configure Environment (1 min)

Create `frontend/.env.local`:

```bash
# Paste your keys here
OPENROUTER_API_KEY=sk-or-your-key-here
NFT_STORAGE_API_KEY=your-token-here

# Use devnet for testing
SOLANA_RPC_URL=https://api.devnet.solana.com
SOLANA_NETWORK=devnet

# Generate a new wallet
# Run: solana-keygen new --outfile ./server-wallet.json
# Then: solana-keygen pubkey ./server-wallet.json (to get the address)
# Then: cat ./server-wallet.json | jq -r '.' | base58 (to encode)
# Or use an existing wallet's private key in base58
SERVER_WALLET_PRIVATE_KEY=your_base58_encoded_key

# Will add after deploying contract
MARKETPLACE_PROGRAM_ID=
```

## Step 4: Generate Server Wallet (1 min)

```bash
# Generate new keypair
solana-keygen new --outfile ~/.config/solana/hypechain-server.json

# Get the public key
solana-keygen pubkey ~/.config/solana/hypechain-server.json

# Get devnet SOL (airdrop 2 SOL)
solana airdrop 2 $(solana-keygen pubkey ~/.config/solana/hypechain-server.json) --url devnet

# Convert to base58 for .env
# The JSON file contains the secret key as an array
# You need to convert it to base58 format
# Option 1: Use bs58 npm package
npm install -g bs58-cli
cat ~/.config/solana/hypechain-server.json | bs58 -e

# Option 2: Use this one-liner
node -e "console.log(require('bs58').encode(Buffer.from(require('$HOME/.config/solana/hypechain-server.json'))))"
```

Copy the output to `SERVER_WALLET_PRIVATE_KEY` in `.env.local`

## Step 5: Deploy Smart Contract (2 min)

```bash
cd contracts

# Build
anchor build

# Deploy to devnet
anchor deploy --provider.cluster devnet

# Copy the Program ID from output (looks like: Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS)
# Add it to frontend/.env.local as MARKETPLACE_PROGRAM_ID
```

## Step 6: Run! (10 sec)

```bash
cd frontend
bun dev
```

Visit: http://localhost:3000

## 🧪 Test the API

### Option 1: Using cURL

```bash
# Take a photo of a product (sneakers, watch, etc.)
# Convert to base64: https://base64.guru/converter/encode/image

curl -X POST http://localhost:3000/api/create-listing \
  -H "Content-Type: application/json" \
  -d '{
    "userWallet": "YOUR_WALLET_ADDRESS",
    "productImage": "data:image/jpeg;base64,/9j/4AAQ...",
    "optionalPriceSol": 0.1
  }'
```

### Option 2: Using Postman / Insomnia

1. Create POST request to `http://localhost:3000/api/create-listing`
2. Set header: `Content-Type: application/json`
3. Body:
```json
{
  "userWallet": "YOUR_SOLANA_ADDRESS",
  "productImage": "data:image/jpeg;base64,...",
  "optionalPriceSol": 0.5
}
```

### Option 3: Using JavaScript

Create `test-api.js`:

```javascript
const fs = require('fs');

// Convert image to base64
const imageBuffer = fs.readFileSync('./your-product-photo.jpg');
const base64Image = `data:image/jpeg;base64,${imageBuffer.toString('base64')}`;

fetch('http://localhost:3000/api/create-listing', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    userWallet: 'YOUR_WALLET_ADDRESS',
    productImage: base64Image,
    optionalPriceSol: 0.5
  })
})
.then(res => res.json())
.then(data => {
  console.log('Success!');
  console.log('NFT Mint:', data.nft_mint_address);
  console.log('Image URL:', data.nft_image_url);
});
```

Run: `node test-api.js`

## ✅ Expected Response

```json
{
  "success": true,
  "nft_mint_address": "9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin",
  "nft_image_url": "https://nftstorage.link/ipfs/bafybei...",
  "product_name": "Nike Air Jordan 1 Chicago",
  "listing_price_sol": 0.5
}
```

## 🎉 Success!

Your NFT is now:
- ✅ Minted on Solana devnet
- ✅ Stored on IPFS
- ✅ Listed on the marketplace
- ✅ Owned by the specified wallet

## 🔍 Verify on Explorer

```bash
# View NFT on Solscan
open https://solscan.io/token/${NFT_MINT_ADDRESS}?cluster=devnet

# View transaction
open https://solscan.io/tx/${TRANSACTION_SIGNATURE}?cluster=devnet
```

## 📦 What Happens Next?

1. **AI Verification**: GLM 4.6 analyzes the image
   - Detects brand, model, colorway
   - Calculates liveness score
   - Rejects if score < 50

2. **Image Generation**: Creates marketing image
   - Professional product photo
   - Crypto/web3 themed background
   - 1024x1024 PNG

3. **IPFS Upload**: Uploads to decentralized storage
   - Image uploaded first
   - Metadata JSON created
   - Both pinned permanently

4. **NFT Minting**: Creates NFT on Solana
   - Metaplex standard
   - Minted to user's wallet
   - 5% royalty set

5. **Marketplace Listing**: Lists on smart contract
   - Price stored on-chain
   - Seller info recorded
   - Available for purchase

## 🐛 Common Issues

### "Invalid Solana wallet address"
- Use a valid Solana public key (base58, starts with letters/numbers)
- Get one from Phantom wallet or generate: `solana-keygen new`

### "Image appears inauthentic"
- Take a real photo of a physical product
- Ensure good lighting and clear view
- Don't use screenshots or AI-generated images

### "Image size exceeds maximum"
- Resize image to under 5MB
- Use JPEG instead of PNG
- Compress with https://tinyjpg.com/

### "SERVER_WALLET_PRIVATE_KEY not set"
- Check `.env.local` exists in `frontend/` directory
- Ensure private key is in base58 format
- Restart dev server after adding

### "Insufficient funds"
- Server wallet needs SOL for transaction fees
- Run: `solana airdrop 2 <YOUR_WALLET> --url devnet`

## 📚 Learn More

- [Full Documentation](./README.md)
- [Implementation Details](./IMPLEMENTATION.md)
- [Smart Contract Guide](./contracts/README.md)

## 🆘 Need Help?

- Check logs in terminal
- API returns detailed error messages
- Open an issue on GitHub

---

**Ready to build the future of NFT marketplaces!** 🚀
