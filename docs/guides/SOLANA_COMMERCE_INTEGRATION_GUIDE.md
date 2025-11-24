# Solana Commerce Kit & Attestation Integration - Complete Guide

## Overview

This guide documents the complete integration of **Solana Pay** payment processing and preparation for **Solana Attestation Service** into the HypeChain NFT Marketplace.

## What Was Implemented

### ✅ Phase 1: Solana Pay Payment System (COMPLETED)

#### Backend Implementation

1. **Payment Service** ([backend/src/services/payment.js](backend/src/services/payment.js))
   - `createPaymentRequest()` - Generate Solana Pay payment requests
   - `verifyPayment()` - Verify transactions on-chain
   - `completePurchase()` - Update database after successful payment
   - `getTransactionHistory()` - Fetch user transaction history
   - `getWalletBalance()` - Get SOL balance for wallets

2. **Payment Routes** ([backend/src/routes/payment.js](backend/src/routes/payment.js))
   - `POST /api/payments/create` - Create payment request
   - `POST /api/payments/verify` - Verify payment transaction
   - `GET /api/payments/history/:walletAddress` - Get transaction history
   - `GET /api/payments/balance/:walletAddress` - Get wallet balance
   - `GET /api/payments/listing/:listingId` - Get listing details

3. **Database Integration**
   - Updated listing route to save NFTs to Supabase
   - Two new tables: `listings` and `transactions`
   - Complete SQL schema with indexes, RLS policies, and functions

#### Frontend Implementation

1. **API Client Updates** ([frontend/lib/api-client.ts](frontend/lib/api-client.ts))
   - Payment-related TypeScript interfaces
   - `createPayment()` method
   - `verifyPayment()` method
   - `getTransactionHistory()` method
   - `getWalletBalance()` method
   - `getListingDetails()` method
   - `getAllListings()` method

2. **Purchase Button Component** ([frontend/components/purchase-button.tsx](frontend/components/purchase-button.tsx))
   - Solana Pay integration
   - Wallet connection via Privy
   - Transaction signing and sending
   - Payment verification
   - Loading states and error handling
   - Success/failure notifications

3. **Listing Detail Page** ([frontend/app/listings/[id]/page.tsx](frontend/app/listings/[id]/page.tsx))
   - Individual NFT listing display
   - Purchase button integration
   - AI verification badges
   - NFT metadata display
   - Solscan links

4. **Listings API Route** ([frontend/app/api/listings/route.ts](frontend/app/api/listings/route.ts))
   - Fetch active listings from Supabase
   - Search, filter, and pagination support

#### Database Schema

- **listings** table: Stores all NFT listings
- **transactions** table: Tracks all purchase transactions
- **favorites** table: User favorites (optional, for future use)
- Views and functions for analytics and updates

### 🔄 Phase 2: Authentication (OPTIONAL - Not Required)

**Current State**: Using Privy for wallet connection ✅

**Alternative Option**: Migrate to Supabase Web3 Auth (Sign in with Solana)
- Not implemented as Privy is working well
- Can be added later if desired
- Documentation available in planning notes

### 🚧 Phase 3: Solana Attestation (FUTURE)

**Status**: Prepared for future implementation

**Why Not Implemented Now**:
- Solana Attestation Service is very new (2025)
- Limited public documentation currently available
- attest.solana.com shows empty documentation

**Use Cases When Available**:
- Seller verification badges
- KYC/AML compliance
- Reputation systems
- Anti-fraud measures

---

## Setup Instructions

### Prerequisites

1. **Supabase Account**: https://supabase.com
2. **Privy Account**: https://privy.io
3. **Solana Wallet**: Phantom, Solflare, or Backpack
4. **Node.js**: v18 or higher
5. **pnpm**: Package manager

### Step 1: Install Dependencies

```bash
# Backend
cd backend
pnpm install

# Frontend
cd ../frontend
pnpm install
```

### Step 2: Configure Supabase

1. Create a new Supabase project at https://app.supabase.com

2. Run the database schema migration:
   - Open Supabase SQL Editor
   - Copy contents of [supabase_marketplace_schema.sql](supabase_marketplace_schema.sql)
   - Execute the SQL

3. Get your Supabase credentials:
   - Go to Project Settings → API
   - Copy **Project URL**
   - Copy **anon public** key
   - Copy **service_role** key (for backend)

### Step 3: Configure Environment Variables

#### Backend (.env)
```bash
cd backend
cp .env.example .env
```

Edit `backend/.env`:
```env
# Server
PORT=3001
NODE_ENV=development
FRONTEND_URL=http://localhost:3000

# Supabase (REQUIRED for payments)
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=your_service_role_key_here

# Solana
SOLANA_RPC_URL=https://api.devnet.solana.com
SOLANA_NETWORK=devnet
SERVER_WALLET_PRIVATE_KEY=your_private_key_here

# APIs
OPENROUTER_API_KEY=your_key_here
NFT_STORAGE_API_KEY=your_key_here
```

#### Frontend (.env.local)
```bash
cd ../frontend
cp .env.example .env.local
```

Edit `frontend/.env.local`:
```env
# Privy (Wallet Auth)
NEXT_PUBLIC_PRIVY_APP_ID=your_privy_app_id

# Supabase (Database)
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key_here

# Backend API
NEXT_PUBLIC_API_URL=http://localhost:3001

# Solana RPC (REQUIRED for payments)
NEXT_PUBLIC_SOLANA_RPC_URL=https://api.devnet.solana.com
```

### Step 4: Start the Application

```bash
# Terminal 1 - Backend
cd backend
pnpm dev

# Terminal 2 - Frontend
cd frontend
pnpm dev
```

Navigate to http://localhost:3000

---

## Payment Flow

### Creating a Listing

1. User connects Solana wallet via Privy
2. User uploads product image
3. AI verifies authenticity
4. NFT is minted on Solana
5. Listing is saved to Supabase database
6. Status: "active"

### Purchasing an NFT

1. Buyer views listing at `/listings/[id]`
2. Clicks "Buy for X SOL" button
3. **PurchaseButton** component:
   - Creates payment request via `POST /api/payments/create`
   - Builds Solana transfer transaction
   - Requests wallet signature (Phantom/Solflare)
   - Sends transaction to Solana blockchain
   - Waits for confirmation
   - Verifies payment via `POST /api/payments/verify`
4. **Backend** verifies:
   - Transaction exists on-chain
   - No errors
   - Correct recipient
   - Correct amount
   - Not previously used
5. **Database** updates:
   - Listing status → "sold"
   - Transaction record created
   - Seller's total_volume incremented
6. **Success**: Buyer receives NFT, seller receives SOL

---

## API Endpoints

### Payment Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/payments/create` | Create payment request |
| POST | `/api/payments/verify` | Verify and complete payment |
| GET | `/api/payments/history/:wallet` | Get transaction history |
| GET | `/api/payments/balance/:wallet` | Get SOL balance |
| GET | `/api/payments/listing/:id` | Get listing details |

### Listing Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/create-listing` | Create new NFT listing |
| GET | `/api/listings` | Fetch all active listings |

### User Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/users/register` | Register/login user |
| GET | `/api/users/:walletAddress` | Get user profile |

---

## Database Schema

### listings Table
```sql
- id (UUID, Primary Key)
- nft_mint_address (TEXT, Unique)
- seller_wallet (TEXT)
- seller_user_id (UUID, FK to users)
- product_name (TEXT)
- description (TEXT)
- category (TEXT)
- condition (TEXT)
- image_url (TEXT)
- metadata_uri (TEXT)
- price_sol (NUMERIC)
- price_usdc (NUMERIC)
- status (TEXT: 'active' | 'sold' | 'delisted' | 'pending')
- ai_verified (BOOLEAN)
- ai_confidence_score (NUMERIC)
- created_at (TIMESTAMPTZ)
- updated_at (TIMESTAMPTZ)
- sold_at (TIMESTAMPTZ)
- buyer_wallet (TEXT)
- buyer_user_id (UUID, FK to users)
- transaction_signature (TEXT)
- views (INTEGER)
- favorites (INTEGER)
```

### transactions Table
```sql
- id (UUID, Primary Key)
- listing_id (UUID, FK to listings)
- buyer_wallet (TEXT)
- seller_wallet (TEXT)
- buyer_user_id (UUID, FK to users)
- seller_user_id (UUID, FK to users)
- amount_sol (NUMERIC)
- amount_usdc (NUMERIC)
- fee_sol (NUMERIC)
- signature (TEXT, Unique)
- status (TEXT: 'pending' | 'confirmed' | 'failed' | 'refunded')
- payment_method (TEXT)
- blockchain_confirmed (BOOLEAN)
- confirmation_time (INTEGER)
- error_message (TEXT)
- created_at (TIMESTAMPTZ)
- confirmed_at (TIMESTAMPTZ)
- updated_at (TIMESTAMPTZ)
```

---

## Testing the Integration

### 1. Create a Test Listing

```bash
# 1. Start both servers
cd backend && pnpm dev
cd frontend && pnpm dev

# 2. Get test SOL (devnet)
# Visit: https://faucet.solana.com

# 3. Connect wallet on homepage
# 4. Upload a product image
# 5. Set price (e.g., 0.1 SOL)
# 6. Submit - NFT will be minted and listing created
```

### 2. View in Marketplace

```bash
# Navigate to /marketplace
# You should see your listing
# Click to view details at /listings/[id]
```

### 3. Test Purchase Flow

```bash
# 1. Use a DIFFERENT wallet (or create new Phantom account)
# 2. Get test SOL from faucet
# 3. Go to listing detail page
# 4. Click "Buy for X SOL"
# 5. Approve transaction in wallet
# 6. Wait for confirmation
# 7. Verify:
#    - Listing status changed to "sold"
#    - Transaction appears in history
#    - SOL transferred to seller
```

### 4. Verify in Supabase

```bash
# Open Supabase dashboard
# Check tables:
# - listings: Should show status = 'sold'
# - transactions: Should have confirmed transaction record
```

### 5. Check on Solscan

```bash
# Get transaction signature from response
# Visit: https://solscan.io/tx/[signature]?cluster=devnet
# Verify transaction details
```

---

## Troubleshooting

### Payment Fails: "Transaction not found"

**Cause**: Transaction hasn't been confirmed on blockchain yet
**Solution**: Wait a few seconds and retry verification

### Payment Fails: "Amount mismatch"

**Cause**: Wrong amount sent or network fees
**Solution**: Check listing price and wallet balance

### Wallet Not Connecting

**Cause**: Wallet extension not installed
**Solution**: Install Phantom, Solflare, or Backpack

### Database Errors

**Cause**: Missing Supabase credentials or schema not created
**Solutions**:
1. Run [supabase_marketplace_schema.sql](supabase_marketplace_schema.sql) in SQL Editor
2. Verify `SUPABASE_URL` and keys in `.env` files
3. Check RLS policies allow operations

### "Missing Environment Variables"

**Cause**: `.env` or `.env.local` not configured
**Solution**: Copy from `.env.example` and fill in values

---

## Security Considerations

### Environment Variables

- **NEVER** commit `.env` or `.env.local` files
- Use service key only in backend (never frontend)
- Rotate keys if accidentally exposed

### Payment Verification

- All payments verified on-chain (not just client-side)
- Transaction signatures checked for duplicates
- Amount and recipient validated server-side
- RLS policies prevent unauthorized data access

### Wallet Security

- Users maintain full custody of private keys
- No passwords stored
- Wallet signatures required for all transactions

---

## Production Deployment

### Vercel (Frontend)

```bash
# 1. Push to GitHub
git push origin main

# 2. Import to Vercel
# Connect GitHub repo at vercel.com

# 3. Add environment variables in Vercel dashboard
NEXT_PUBLIC_PRIVY_APP_ID=...
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
NEXT_PUBLIC_API_URL=https://your-backend.com
NEXT_PUBLIC_SOLANA_RPC_URL=https://api.mainnet-beta.solana.com

# 4. Deploy
```

### Railway/Render (Backend)

```bash
# 1. Create new service
# 2. Connect GitHub repo
# 3. Add environment variables
# 4. Deploy

# Or use Vercel Serverless Functions:
# Move backend routes to frontend/app/api/
```

### Switch to Mainnet

```env
# Update RPC URLs to mainnet
SOLANA_RPC_URL=https://api.mainnet-beta.solana.com
NEXT_PUBLIC_SOLANA_RPC_URL=https://api.mainnet-beta.solana.com
SOLANA_NETWORK=mainnet-beta

# Update wallet to mainnet wallet
SERVER_WALLET_PRIVATE_KEY=mainnet_private_key
```

⚠️ **Warning**: Test thoroughly on devnet before mainnet deployment!

---

## Future Enhancements

### Short-term (Next Sprint)

- [ ] Add USDC payment support (in addition to SOL)
- [ ] Implement escrow for safer transactions
- [ ] Add transaction history page for users
- [ ] Integrate marketplace page with real data (see [MARKETPLACE_INTEGRATION_GUIDE.md](MARKETPLACE_INTEGRATION_GUIDE.md))

### Medium-term

- [ ] Add seller verification (when Solana Attestation docs available)
- [ ] Implement auction functionality
- [ ] Add favorites/watchlist feature
- [ ] Create user profiles with stats

### Long-term

- [ ] Mobile app (React Native + Solana Mobile SDK)
- [ ] Cross-chain support (Ethereum, Polygon)
- [ ] Advanced analytics dashboard
- [ ] Royalty system for creators

---

## Resources

### Documentation

- [Solana Pay Docs](https://docs.solanapay.com/)
- [Supabase Docs](https://supabase.com/docs)
- [Privy Docs](https://docs.privy.io)
- [Solana Web3.js Docs](https://solana-labs.github.io/solana-web3.js/)

### Tools

- [Solana Explorer (Devnet)](https://explorer.solana.com/?cluster=devnet)
- [Solscan (Devnet)](https://solscan.io/?cluster=devnet)
- [Solana Faucet](https://faucet.solana.com/)
- [Supabase Dashboard](https://app.supabase.com)

### Community

- [Solana Discord](https://discord.gg/solana)
- [Solana Stack Exchange](https://solana.stackexchange.com/)

---

## Support

If you encounter issues:

1. Check browser console for errors
2. Check backend logs (`pnpm dev` output)
3. Verify environment variables
4. Check Supabase logs in dashboard
5. Test on Solana devnet first
6. Review transaction on Solscan

---

## Summary

✅ **Completed**:
- Full Solana Pay payment processing
- Database integration with Supabase
- Listing creation and management
- Purchase flow with on-chain verification
- Transaction history tracking
- PurchaseButton component
- Listing detail page
- API client with payment methods

🔄 **Optional**:
- Migrate from Privy to Supabase Web3 Auth

🚧 **Future**:
- Solana Attestation Service integration (when available)
- Enhanced marketplace features
- USDC payment support

**All core payment functionality is working and ready for testing!**

---

**Last Updated**: November 16, 2025
**Integration Version**: 1.0
**Solana Network**: Devnet
**Status**: Ready for Testing ✅
