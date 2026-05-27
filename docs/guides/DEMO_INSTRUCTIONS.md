# HypeChain Demo Instructions

Quick guide to demonstrate the HypeChain AI-Powered NFT Marketplace.

## Quick Start (5 minutes)

### 1. Start Backend

```bash
cd backend
bun install
bun dev
```

Wait for: `🚀 Server running on port 3001`

### 2. Start Frontend

```bash
cd frontend
bun install
bun dev
```

Open browser: http://localhost:3000

---

## Demo Walkthrough

### Part 1: Dashboard Overview (2 minutes)

1. **Navigate to Dashboard** (http://localhost:3000)
   - Show stats: Total Listings, Volume, Active Today
   - Point out recent activity feed
   - Highlight quick action links

2. **Explore Activities Page** (http://localhost:3000/activities)
   - Real Solana blockchain transactions
   - Auto-refresh every 30 seconds
   - Filter by transaction type
   - View transaction signatures

### Part 2: Marketplace (3 minutes)

1. **Open Marketplace** (http://localhost:3000/marketplace)
   - Grid layout with responsive design (2-4 columns)
   - Search functionality
   - Sort options (Recent, Price High/Low)
   - Stats cards

2. **Create NFT Listing** (Main Demo)
   - Click "Create Listing" button
   - Connect wallet (use demo wallet or Phantom)
   - Upload product image:
     - Example: Nike sneaker, luxury watch, etc.
     - Must be real product photo (not AI-generated)
     - Max 5MB, JPEG/PNG/WebP
   - Set price (e.g., 0.5 SOL)
   - Click "Create NFT Listing"

3. **Watch the Magic** ✨
   - Progress indicator shows:
     - ✅ Validating request...
     - ✅ Sending to backend...
     - ✅ AI verifying product authenticity...
     - ✅ Generating marketing image...
     - ✅ Uploading to IPFS...
     - ✅ Minting NFT on Solana...
     - ✅ NFT created successfully!

4. **View Results**
   - Success card shows:
     - Product name (AI-generated)
     - NFT Mint Address
     - IPFS Image URL
     - Price in SOL
   - Click "View on IPFS" to see AI-generated marketing image
   - NFT automatically appears in marketplace grid

5. **Inspect NFT Card**
   - Click on NFT card for details
   - Modal shows:
     - Full product information
     - Mint address
     - Owner wallet
     - Created timestamp
     - IPFS link
     - "Buy Now" button (demo)

### Part 3: Real-Time Updates (1 minute)

1. **WebSocket Demo**
   - Open two browser windows side by side
   - Create NFT in window 1
   - Watch it appear in window 2 in real-time
   - Toast notification: "New NFT listed: [Product Name]"

### Part 4: API Documentation (2 minutes)

1. **Navigate to API Docs** (http://localhost:3000/api-docs)
   - Backend health status (green = healthy)
   - API information card
   - Complete endpoint documentation:
     - GET /health
     - GET /
     - GET /api/create-listing
     - POST /api/create-listing (main endpoint)

2. **Show Integration Examples**
   - Request/response examples
   - Processing pipeline (6 steps)
   - Code snippets for developers
   - Environment variables table

### Part 5: Wallet Integration (1 minute)

1. **Connect Phantom Wallet** (if available)
   - Click wallet icon in header
   - Approve connection
   - View balance
   - Copy address
   - View on Solana Explorer

2. **Demo Wallet Fallback**
   - If no wallet detected, uses demo wallet
   - Shows address: `7xKXtg...gAsU`
   - Displays balance: 1.5 SOL

---

## Key Features to Highlight

### 🤖 AI Verification
- GLM-4-Plus vision model analyzes images
- Liveness score (0-100) detects AI-generated images
- Rejects fake products (score < 50)
- Extracts brand, model, colorway automatically

### 🎨 AI Marketing Images
- Auto-generates Solana-themed marketing images
- 1024x1024 PNG, crypto-styled
- Purple/green color scheme
- Professional product showcase

### 🔗 Blockchain Integration
- Real Solana DevNet transactions
- Metaplex NFT standard
- IPFS storage via nft.storage
- Transparent on-chain verification

### 💻 Developer-Friendly
- Complete API documentation
- React hooks for easy integration
- TypeScript support
- Comprehensive error handling
- Unit tests included

### ⚡ Real-Time Updates
- WebSocket integration
- Instant marketplace updates
- Live notifications
- Auto-refresh transaction feed

---

## Sample Products to Demo

Use these product types for best AI verification results:

✅ **Good Examples:**
- Athletic shoes (Nike, Adidas, Yeezy)
- Luxury watches (Rolex, Omega)
- Designer handbags
- Electronics with visible branding
- Collectible sneakers with tags

❌ **Avoid:**
- AI-generated images (will be rejected)
- Generic products without branding
- Blurry or low-quality photos
- Screenshots or digital art
- Images without physical products

---

## Demo Script (5-Minute Version)

```
"Welcome to HypeChain, an AI-powered NFT marketplace on Solana.

1. [Dashboard] Here's our dashboard showing marketplace stats and recent activity.

2. [Marketplace] Let's create an NFT. I'll upload this Nike sneaker photo.

3. [Create Listing] Watch as our AI verifies authenticity...
   It's analyzing the product, checking if it's real, extracting details...

4. [AI Processing] The AI generates a marketing image, uploads to IPFS,
   and mints an NFT on Solana blockchain.

5. [Success] NFT created! Here's the mint address, IPFS link, and
   AI-generated product name.

6. [Marketplace Grid] The NFT instantly appears in the marketplace.
   All in under 30 seconds!

7. [API Docs] For developers, we have complete API documentation
   with code examples and integration guides.

That's HypeChain - bringing AI verification and blockchain NFTs together!"
```

---

## Testing Checklist

Before demo:

- [ ] Backend running on port 3001
- [ ] Frontend running on port 3000
- [ ] OpenRouter API key configured
- [ ] NFT.Storage API key configured
- [ ] Solana wallet funded (DevNet)
- [ ] Test image ready (real product photo)
- [ ] Internet connection stable
- [ ] Browser console open (to show logs)
- [ ] Phantom wallet installed (optional)

---

## Common Demo Issues & Solutions

### Issue: AI rejects image
**Solution:** Use real product photo with visible branding and good lighting

### Issue: Backend timeout
**Solution:** AI processing can take 15-30 seconds, be patient

### Issue: IPFS upload slow
**Solution:** Normal, NFT.Storage can take 10-20 seconds

### Issue: WebSocket not connecting
**Solution:** Restart both frontend and backend servers

### Issue: Wallet balance insufficient
**Solution:** Airdrop SOL: `solana airdrop 2 YOUR_ADDRESS --url devnet`

---

## Advanced Demo Features

### Show Error Handling

1. Upload invalid image (PDF file)
   - See validation error

2. Upload oversized image (>5MB)
   - See size limit error

3. Try fake/AI-generated image
   - See authenticity rejection

### Show Form Validation

1. Leave wallet field empty
   - See required field error

2. Enter invalid wallet address
   - See format validation error

### Show Loading States

1. Point out skeleton loaders
2. Show progress indicators
3. Highlight toast notifications

---

## Demo Video Script

```
[0:00-0:10] Introduction
"Hi, I'm demonstrating HypeChain, an AI-powered NFT marketplace"

[0:10-0:30] Dashboard & Features
"The platform combines AI verification with Solana blockchain"

[0:30-1:30] Create Listing Demo
"Let's create an NFT from this Nike sneaker photo..."

[1:30-2:00] AI Processing
"The AI verifies authenticity and generates marketing images..."

[2:00-2:30] Success & Results
"NFT minted successfully! Here's the IPFS link and blockchain proof..."

[2:30-3:00] Marketplace View
"The NFT appears instantly in the marketplace with real-time updates..."

[3:00-3:30] API Documentation
"For developers, we provide complete API docs and integration guides..."

[3:30-4:00] Conclusion
"HypeChain makes NFT creation secure, automated, and developer-friendly!"
```

---

## Pro Tips

1. **Prepare Multiple Images**: Have 3-4 product photos ready
2. **Test First**: Do a dry run before live demo
3. **Show Logs**: Keep browser console open to show WebSocket events
4. **Explain Each Step**: Narrate what's happening during AI processing
5. **Compare Before/After**: Show original photo vs AI marketing image
6. **Highlight Speed**: Point out how fast the entire process is
7. **Show Mobile**: Demonstrate responsive design on phone

---

## Questions to Anticipate

**Q: How does the AI detect fake products?**
A: Uses liveness score (0-100) to measure if image shows physical product vs AI-generated/screenshot. Requires score > 50.

**Q: What blockchain is this on?**
A: Solana DevNet (for demo), can switch to MainNet for production.

**Q: How much does it cost?**
A: Transaction fees on Solana are ~0.001 SOL per NFT mint.

**Q: Can I sell the NFTs?**
A: Yes, marketplace smart contract support (currently in development).

**Q: Is this production-ready?**
A: Demo version on DevNet. For production, switch to MainNet and add more security.

---

## Next Steps After Demo

1. Explore code on GitHub
2. Read API documentation
3. Run unit tests (`bun test`)
4. Try marketplace integration
5. Deploy to production (see DEPLOYMENT_GUIDE.md)

---

Enjoy the demo! 🚀
