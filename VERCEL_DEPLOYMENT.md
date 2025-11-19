# HypeChain Vercel Deployment Guide

## 📋 Overview

This guide covers deploying the HypeChain platform with an optimized configuration:
- **Frontend**: Deployed to Vercel (Next.js)
- **Backend**: Deployed to Railway/Render (Express.js)
- **Smart Contracts**: Deployed to Solana Devnet/Mainnet

## 🏗️ Project Structure

```
HackNYU 2025/
├── frontend/              → Deploy to Vercel
│   ├── app/
│   ├── components/
│   ├── lib/
│   ├── vercel.json       ← Frontend-specific config
│   └── package.json
├── backend/               → Deploy to Railway/Render
│   ├── src/
│   ├── package.json
│   └── .env.example
├── contracts/             → Deploy to Solana
└── vercel.json           ← Root config (optional)
```

## 🚀 Frontend Deployment (Vercel)

### Option 1: Deploy via Vercel Dashboard (Recommended)

1. **Connect Repository**
   - Go to [vercel.com](https://vercel.com)
   - Click "Add New Project"
   - Import your GitHub repository: `alin9661/HypeChain`

2. **Configure Project Settings**
   ```
   Framework Preset: Next.js
   Root Directory: frontend
   Build Command: pnpm install && pnpm build
   Output Directory: .next
   Install Command: pnpm install
   ```

3. **Set Environment Variables**

   Navigate to **Settings → Environment Variables** and add:

   ```bash
   # Required
   NEXT_PUBLIC_API_URL=https://your-backend-api.railway.app

   # Optional (defaults in vercel.json)
   NEXT_PUBLIC_CHAIN=solana
   NEXT_PUBLIC_SOLANA_NETWORK=devnet

   # Privy (if using)
   NEXT_PUBLIC_PRIVY_APP_ID=your_privy_app_id

   # Supabase (if using)
   NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
   ```

4. **Deploy**
   - Click "Deploy"
   - Wait for build to complete
   - Your site will be live at `https://your-project.vercel.app`

### Option 2: Deploy via Vercel CLI

```bash
# Install Vercel CLI
npm i -g vercel

# Navigate to project root
cd /path/to/HackNYU\ 2025

# Login to Vercel
vercel login

# Deploy (will prompt for settings)
vercel

# For production deployment
vercel --prod
```

### Option 3: Automatic GitHub Deployments

Once connected, Vercel automatically deploys:
- **Production**: Pushes to `main` branch
- **Preview**: Pull requests and feature branches

## 🔧 Backend Deployment (Railway)

### Why Railway for Backend?

- ✅ Express.js needs long-running server (WebSockets, background jobs)
- ✅ Vercel serverless has 10-60 second timeout limits
- ✅ Railway provides persistent containers
- ✅ Free $5/month credit (sufficient for MVP)

### Deploy to Railway

1. **Sign up at [railway.app](https://railway.app)**

2. **Create New Project**
   - Click "New Project"
   - Select "Deploy from GitHub repo"
   - Choose `alin9661/HypeChain`

3. **Configure Service**
   ```
   Service Name: hypechain-backend
   Root Directory: backend
   Start Command: npm start (or node src/index.js)
   ```

4. **Add Environment Variables**

   Go to **Variables** tab and add all from `backend/.env.example`:

   ```bash
   # Server
   PORT=3001
   NODE_ENV=production

   # Frontend URL (from Vercel)
   HACKNYU_FRONTEND_URL=https://your-frontend.vercel.app

   # OpenRouter API
   HACKNYU_OPENROUTER_API_KEY=your_openrouter_api_key

   # NFT Storage
   NFT_STORAGE_API_KEY=your_nft_storage_key

   # Solana
   SOLANA_RPC_URL=https://api.devnet.solana.com
   SOLANA_NETWORK=devnet
   SERVER_WALLET_PRIVATE_KEY=your_private_key_base58

   # Smart Contract
   MARKETPLACE_PROGRAM_ID=your_program_id

   # Compressed NFT (optional)
   MERKLE_TREE_ADDRESS=your_merkle_tree_address

   # Supabase (if using)
   SUPABASE_URL=your_supabase_url
   SUPABASE_ANON_KEY=your_key
   ```

5. **Deploy**
   - Railway will automatically build and deploy
   - Note your backend URL: `https://hypechain-backend.up.railway.app`

6. **Update Frontend Environment Variable**
   - Go to Vercel → Your Project → Settings → Environment Variables
   - Update `NEXT_PUBLIC_API_URL` with your Railway URL
   - Redeploy frontend

### Alternative: Deploy to Render

1. Go to [render.com](https://render.com)
2. Create "New Web Service"
3. Connect GitHub repository
4. Configure:
   ```
   Root Directory: backend
   Build Command: npm install
   Start Command: npm start
   ```
5. Add environment variables
6. Deploy

## 📝 Vercel Configuration Explained

### Frontend vercel.json Features

```json
{
  "framework": "nextjs",
  "buildCommand": "pnpm install && pnpm build",
  "installCommand": "pnpm install",
  "outputDirectory": ".next"
}
```

### Security Headers

We've added these security headers:
- **X-Content-Type-Options**: Prevents MIME sniffing
- **X-Frame-Options**: Prevents clickjacking
- **X-XSS-Protection**: Enables XSS filter
- **Referrer-Policy**: Controls referrer information
- **Permissions-Policy**: Restricts browser features

### Image Optimization

```json
"images": {
  "domains": [
    "nftstorage.link",
    "ipfs.io",
    "arweave.net"
  ],
  "formats": ["image/avif", "image/webp"]
}
```

Enables Next.js Image component to optimize images from:
- NFT.Storage (IPFS gateway)
- Arweave (permanent storage)

### Function Configuration

```json
"functions": {
  "app/api/**/*.ts": {
    "memory": 1024,
    "maxDuration": 30
  }
}
```

- **Memory**: 1GB (default is 1024MB)
- **Max Duration**: 30 seconds (Pro: 60s, Enterprise: 900s)

### Rewrites & Redirects

```json
"rewrites": [
  {
    "source": "/backend-api/:path*",
    "destination": "/api/proxy/:path*"
  }
]
```

Proxy backend API calls through Next.js (useful for avoiding CORS).

## 🌍 Environment Variables Management

### Development (.env.local)

```bash
# frontend/.env.local
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_SOLANA_NETWORK=devnet
```

### Production (Vercel)

Set in Vercel Dashboard:
- **Production**: For `main` branch
- **Preview**: For all branches
- **Development**: For local development via `vercel dev`

### Backend (.env)

```bash
# backend/.env (Railway)
PORT=3001
HACKNYU_FRONTEND_URL=https://your-frontend.vercel.app
HACKNYU_OPENROUTER_API_KEY=sk-or-v1-xxx
# ... other vars
```

## 🔍 Troubleshooting

### Issue 1: 404 Error on Vercel

**Cause**: Vercel building from wrong directory

**Solution**:
1. Check Root Directory in Vercel Dashboard → Settings → General
2. Should be set to `frontend`
3. Redeploy

### Issue 2: API Calls Failing (CORS)

**Cause**: Backend not allowing frontend origin

**Solution**:
```javascript
// backend/src/index.js
app.use(cors({
  origin: [
    'http://localhost:3000',
    'https://your-frontend.vercel.app',
    'https://*.vercel.app'  // Allow all preview deployments
  ]
}));
```

### Issue 3: Environment Variables Not Working

**Cause**: Variables not prefixed with `NEXT_PUBLIC_` or not set

**Solution**:
- Client-side variables MUST start with `NEXT_PUBLIC_`
- Server-side API routes can access all variables
- Set in Vercel Dashboard → Settings → Environment Variables
- Redeploy after adding new variables

### Issue 4: Build Failing

**Cause**: Missing dependencies or TypeScript errors

**Solution**:
```bash
# Check build locally first
cd frontend
pnpm install
pnpm build

# Fix TypeScript errors or ignore in vercel.json
{
  "typescript": {
    "ignoreBuildErrors": true  // Only for prototypes!
  }
}
```

### Issue 5: Images Not Loading

**Cause**: Domain not allowed in next.config.mjs

**Solution**:
```javascript
// frontend/next.config.mjs
export default {
  images: {
    domains: ['nftstorage.link', 'ipfs.io', 'arweave.net'],
    unoptimized: false  // Enable optimization
  }
}
```

### Issue 6: Function Timeout

**Cause**: API route taking too long

**Solution**:
1. Increase maxDuration in vercel.json (requires Pro plan for >10s)
2. Move long operations to background jobs
3. Use backend API instead of Next.js API routes

## 🚦 Deployment Checklist

### Pre-Deployment

- [ ] Test build locally: `cd frontend && pnpm build`
- [ ] Test backend locally: `cd backend && npm start`
- [ ] Update environment variables in `.env.example` files
- [ ] Commit all changes to Git
- [ ] Push to GitHub

### Frontend Deployment (Vercel)

- [ ] Create Vercel project
- [ ] Set Root Directory to `frontend`
- [ ] Add environment variables
- [ ] Deploy and verify build succeeds
- [ ] Test production URL
- [ ] Set up custom domain (optional)

### Backend Deployment (Railway)

- [ ] Create Railway project
- [ ] Set Root Directory to `backend`
- [ ] Add all environment variables
- [ ] Deploy and check logs
- [ ] Test API endpoints
- [ ] Update `NEXT_PUBLIC_API_URL` in Vercel
- [ ] Redeploy frontend

### Post-Deployment

- [ ] Test full user flow (connect wallet → create listing → purchase)
- [ ] Check API calls work (frontend → backend)
- [ ] Verify NFT minting on Solana explorer
- [ ] Test image uploads to IPFS/Arweave
- [ ] Check AI verification works
- [ ] Monitor logs for errors
- [ ] Set up error tracking (Sentry recommended)

## 📊 Monitoring & Analytics

### Vercel Analytics

Already integrated via `@vercel/analytics`:

```tsx
// frontend/app/layout.tsx
import { Analytics } from '@vercel/analytics/react'

export default function RootLayout({ children }) {
  return (
    <html>
      <body>
        {children}
        <Analytics />
      </body>
    </html>
  )
}
```

### Railway Logs

View logs in Railway Dashboard:
1. Select your service
2. Click "Logs" tab
3. Real-time streaming logs

### Error Tracking (Optional)

Install Sentry:
```bash
cd frontend
pnpm add @sentry/nextjs

cd ../backend
npm install @sentry/node
```

## 🔐 Security Best Practices

### 1. Environment Variables

- ✅ Never commit `.env` files
- ✅ Use `NEXT_PUBLIC_` prefix for client-side vars only
- ✅ Rotate API keys regularly
- ✅ Use different keys for dev/prod

### 2. API Security

- ✅ Enable CORS with specific origins
- ✅ Add rate limiting (use Upstash Redis)
- ✅ Validate all inputs
- ✅ Use HTTPS only

### 3. Wallet Security

- ✅ Never store private keys in frontend
- ✅ Use secure wallet adapters (Privy)
- ✅ Validate all transactions on backend

## 🎯 Performance Optimization

### Frontend

1. **Enable Image Optimization**
   ```json
   "images": {
     "formats": ["image/avif", "image/webp"],
     "minimumCacheTTL": 60
   }
   ```

2. **Use Dynamic Imports**
   ```tsx
   const HeavyComponent = dynamic(() => import('./HeavyComponent'))
   ```

3. **Enable Caching**
   ```tsx
   export const revalidate = 3600 // 1 hour
   ```

### Backend

1. **Cache AI Responses** (already implemented in cache.js)
2. **Use Connection Pooling** for database
3. **Implement Rate Limiting**
4. **Optimize Solana RPC calls**

## 📈 Scaling Considerations

### Free Tier Limits

**Vercel:**
- ✅ Unlimited deployments
- ✅ 100GB bandwidth/month
- ✅ Serverless function execution: 100GB-Hrs

**Railway:**
- ✅ $5 credit/month
- ⚠️ ~50k requests/month

### When to Upgrade

- **Vercel Pro ($20/month)**:
  - 1TB bandwidth
  - Extended function timeout (60s)
  - Team collaboration

- **Railway ($5-20/month)**:
  - Pay for usage
  - Scales automatically

## 🔗 Useful Links

- **Vercel Documentation**: https://vercel.com/docs
- **Railway Documentation**: https://docs.railway.app
- **Next.js Documentation**: https://nextjs.org/docs
- **Solana Documentation**: https://docs.solana.com

## 🆘 Support

If you encounter issues:

1. **Check build logs** in Vercel/Railway
2. **Review this documentation** for common issues
3. **Check environment variables** are set correctly
4. **Test locally first** before deploying
5. **Open GitHub issue** if problem persists

---

## 🎉 Success!

Your HypeChain platform should now be live:

- **Frontend**: https://your-project.vercel.app
- **Backend**: https://your-backend.railway.app
- **Status**: Production Ready ✅

Happy deploying! 🚀
