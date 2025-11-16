# HypeChain Deployment Guide

Complete guide for deploying the HypeChain AI-Powered NFT Marketplace on Solana.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Environment Setup](#environment-setup)
3. [Backend Deployment](#backend-deployment)
4. [Frontend Deployment](#frontend-deployment)
5. [Testing the Integration](#testing-the-integration)
6. [Production Deployment](#production-deployment)
7. [Troubleshooting](#troubleshooting)

---

## Prerequisites

### Required Software

- **Node.js**: v18 or higher ([Download](https://nodejs.org/))
- **npm**: v9 or higher (comes with Node.js)
- **Git**: Latest version
- **Solana CLI**: For wallet management (optional)

### Required API Keys

1. **OpenRouter API Key**
   - Sign up at [OpenRouter](https://openrouter.ai/)
   - Get API key from dashboard
   - Used for AI verification and image generation

2. **NFT.Storage API Key**
   - Sign up at [NFT.Storage](https://nft.storage/)
   - Create API token
   - Used for IPFS uploads

3. **Solana Wallet**
   - Create a Solana wallet for the server
   - Fund it with SOL (DevNet for testing, MainNet for production)
   - Export private key in base58 format

---

## Environment Setup

### 1. Clone the Repository

```bash
git clone https://github.com/alin9661/HypeChain.git
cd HypeChain
```

### 2. Backend Environment Variables

Create `.env` file in the `backend/` directory:

```env
# Server Configuration
PORT=3001
NODE_ENV=development
FRONTEND_URL=http://localhost:3000

# OpenRouter AI API
OPENROUTER_API_KEY=your_openrouter_api_key_here

# NFT Storage IPFS
NFT_STORAGE_API_KEY=your_nft_storage_api_key_here

# Solana Configuration
SOLANA_RPC_URL=https://api.devnet.solana.com
SERVER_WALLET_PRIVATE_KEY=your_server_wallet_private_key_base58

# Marketplace Program (Optional)
MARKETPLACE_PROGRAM_ID=your_marketplace_program_id_here
```

### 3. Frontend Environment Variables

Create `.env.local` file in the `frontend/` directory:

```env
# Backend API
NEXT_PUBLIC_API_URL=http://localhost:3001

# WebSocket URL
NEXT_PUBLIC_WS_URL=ws://localhost:3001/ws

# Solana Network
NEXT_PUBLIC_SOLANA_NETWORK=devnet
```

---

## Backend Deployment

### 1. Install Dependencies

```bash
cd backend
npm install
```

### 2. Verify Configuration

```bash
# Check .env file
cat .env

# Test connection to Solana
node -e "const { Connection } = require('@solana/web3.js'); const conn = new Connection('https://api.devnet.solana.com'); conn.getVersion().then(console.log);"
```

### 3. Start Backend Server

**Development Mode:**
```bash
npm run dev
```

**Production Mode:**
```bash
npm start
```

### 4. Verify Backend Health

```bash
# Health check
curl http://localhost:3001/health

# API info
curl http://localhost:3001/

# Listing endpoint info
curl http://localhost:3001/api/create-listing
```

Expected response:
```json
{
  "status": "healthy",
  "timestamp": "2025-11-16T...",
  "uptime": 123.45,
  "environment": "development"
}
```

---

## Frontend Deployment

### 1. Install Dependencies

```bash
cd frontend
npm install
```

### 2. Build and Start

**Development Mode:**
```bash
npm run dev
```

**Production Build:**
```bash
npm run build
npm start
```

### 3. Access the Application

Open your browser and navigate to:
- **Frontend**: http://localhost:3000
- **Marketplace**: http://localhost:3000/marketplace
- **API Docs**: http://localhost:3000/api-docs

---

## Testing the Integration

### 1. Health Check

Visit the API Docs page at http://localhost:3000/api-docs to verify:
- Backend status (should show "healthy")
- API information
- Available endpoints

### 2. Create Test NFT Listing

1. Go to http://localhost:3000/marketplace
2. Click "Create Listing"
3. Connect wallet (or use demo wallet)
4. Upload product image (max 5MB, JPEG/PNG/WebP)
5. Set optional price in SOL
6. Submit

**Expected Flow:**
- ✅ Image validated (size, format)
- ✅ AI verification (liveness score > 50)
- ✅ Marketing image generated
- ✅ Uploaded to IPFS
- ✅ NFT minted on Solana
- ✅ Listed on marketplace
- ✅ Success notification shown

### 3. Run Unit Tests

```bash
cd frontend
npm test
```

Expected output:
```
PASS  __tests__/api-client.test.ts
PASS  __tests__/nft-card.test.tsx

Test Suites: 2 passed, 2 total
Tests:       15 passed, 15 total
```

### 4. Test WebSocket Connection

1. Open browser console
2. Navigate to marketplace
3. Check for WebSocket connection:
```
WebSocket connected
Connected to real-time updates
```

---

## Production Deployment

### Backend Deployment (Railway/Heroku/DigitalOcean)

#### Option 1: Railway

1. Install Railway CLI:
```bash
npm i -g @railway/cli
```

2. Login and initialize:
```bash
railway login
railway init
```

3. Set environment variables:
```bash
railway variables set OPENROUTER_API_KEY=your_key
railway variables set NFT_STORAGE_API_KEY=your_key
railway variables set SOLANA_RPC_URL=https://api.mainnet-beta.solana.com
railway variables set SERVER_WALLET_PRIVATE_KEY=your_key
```

4. Deploy:
```bash
railway up
```

#### Option 2: Docker

1. Create `Dockerfile` in backend:
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 3001
CMD ["npm", "start"]
```

2. Build and run:
```bash
docker build -t hypechain-backend .
docker run -p 3001:3001 --env-file .env hypechain-backend
```

### Frontend Deployment (Vercel)

1. Install Vercel CLI:
```bash
npm i -g vercel
```

2. Deploy:
```bash
cd frontend
vercel
```

3. Set environment variables in Vercel dashboard:
- `NEXT_PUBLIC_API_URL`
- `NEXT_PUBLIC_WS_URL`
- `NEXT_PUBLIC_SOLANA_NETWORK`

4. Production deployment:
```bash
vercel --prod
```

---

## Security Checklist

Before deploying to production:

- [ ] Change `SOLANA_RPC_URL` to MainNet
- [ ] Use production Solana wallet with sufficient SOL
- [ ] Set `NODE_ENV=production`
- [ ] Enable HTTPS for frontend and backend
- [ ] Secure API keys (use secrets manager)
- [ ] Enable rate limiting on backend
- [ ] Configure CORS properly
- [ ] Add monitoring and logging
- [ ] Set up error tracking (Sentry)
- [ ] Configure backup strategy for wallet
- [ ] Test with real products before launch

---

## Monitoring

### Backend Monitoring

Add health check endpoint to monitoring service:
```bash
curl https://your-backend.com/health
```

### Frontend Monitoring

Vercel Analytics is already integrated. View metrics at:
- https://vercel.com/dashboard

### Solana Monitoring

Monitor transactions and NFT mints:
- **DevNet**: https://explorer.solana.com/?cluster=devnet
- **MainNet**: https://explorer.solana.com/

---

## Troubleshooting

### Backend Issues

**Issue: Backend won't start**
```bash
# Check logs
npm run dev 2>&1 | tee backend.log

# Verify environment variables
node -e "console.log(process.env.OPENROUTER_API_KEY ? 'OK' : 'MISSING')"
```

**Issue: Solana RPC errors**
```bash
# Test RPC connection
curl https://api.devnet.solana.com -X POST -H "Content-Type: application/json" -d '{"jsonrpc":"2.0","id":1,"method":"getHealth"}'

# Switch to different RPC
# Try: https://api.mainnet-beta.solana.com
# Or: https://solana-api.projectserum.com
```

**Issue: IPFS upload fails**
```bash
# Verify NFT.Storage API key
curl -X POST https://api.nft.storage/upload \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -F "file=@test.jpg"
```

### Frontend Issues

**Issue: Can't connect to backend**
```bash
# Check backend is running
curl http://localhost:3001/health

# Verify NEXT_PUBLIC_API_URL
echo $NEXT_PUBLIC_API_URL

# Check CORS configuration in backend
```

**Issue: WebSocket not connecting**
```bash
# Test WebSocket manually
wscat -c ws://localhost:3001/ws

# Check backend WebSocket support
# Ensure backend handles /ws route
```

**Issue: Build errors**
```bash
# Clear Next.js cache
rm -rf .next

# Reinstall dependencies
rm -rf node_modules package-lock.json
npm install

# Rebuild
npm run build
```

### NFT Creation Issues

**Issue: "Image appears inauthentic"**
- Liveness score < 50
- Use real product photos (not AI-generated)
- Ensure good lighting and clarity
- Include brand tags/serial numbers

**Issue: "Insufficient funds"**
```bash
# Check wallet balance
solana balance YOUR_WALLET_ADDRESS --url devnet

# Airdrop SOL (DevNet only)
solana airdrop 2 YOUR_WALLET_ADDRESS --url devnet
```

---

## Performance Optimization

### Backend

1. **Enable caching for AI responses**
2. **Use connection pooling for Solana RPC**
3. **Implement rate limiting**
4. **Add Redis for session management**

### Frontend

1. **Enable Next.js Image Optimization**
2. **Implement lazy loading for NFT grid**
3. **Use ISR (Incremental Static Regeneration)**
4. **Add CDN for static assets**

---

## Scaling Considerations

### Horizontal Scaling

1. **Load Balancer**: Use Nginx or cloud load balancer
2. **Multiple Backend Instances**: Run multiple backend servers
3. **Database**: Add PostgreSQL/MongoDB for listing persistence
4. **Cache Layer**: Implement Redis for frequently accessed data

### Vertical Scaling

1. **Increase server resources**: More CPU/RAM for AI processing
2. **Faster RPC**: Use paid Solana RPC providers (QuickNode, Alchemy)
3. **CDN**: CloudFlare/Fastly for global content delivery

---

## Support

For issues or questions:
- **GitHub Issues**: https://github.com/alin9661/HypeChain/issues
- **Documentation**: https://github.com/alin9661/HypeChain
- **Solana Docs**: https://docs.solana.com/

---

## License

MIT License - See LICENSE file for details
