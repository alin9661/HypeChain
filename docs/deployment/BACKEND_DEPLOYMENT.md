# Backend Deployment Guide

## 📋 Overview

This guide covers deploying the HypeChain Express.js backend to production-ready hosting platforms.

**Why not Vercel for backend?**
- ⚠️ Vercel is designed for serverless functions with 10-60 second timeouts
- ⚠️ Express.js needs long-running server for WebSockets, background jobs
- ⚠️ Cold starts would impact API performance
- ✅ Use Railway, Render, or Fly.io instead

## 🎯 Recommended Platforms

| Platform | Free Tier | Best For | Setup Time |
|----------|-----------|----------|------------|
| **Railway** | $5 credit/month | MVP, startups | 5 min |
| **Render** | 750 hours/month | Hobby projects | 10 min |
| **Fly.io** | $5 credit | Global edge | 15 min |

## 🚂 Railway Deployment (Recommended)

### Why Railway?

- ✅ $5/month free credit (sufficient for MVP)
- ✅ Automatic HTTPS
- ✅ Simple GitHub integration
- ✅ Excellent developer experience
- ✅ Built-in metrics and logs
- ✅ No cold starts

### Step 1: Prepare Your Backend

Ensure you have a health check endpoint:

```javascript
// backend/src/index.js
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});
```

### Step 2: Sign Up & Connect

1. Go to [railway.app](https://railway.app)
2. Sign in with GitHub
3. Click "New Project"
4. Select "Deploy from GitHub repo"
5. Choose `alin9661/HypeChain`

### Step 3: Configure Service

```
Service Name: hypechain-backend
Root Directory: backend
Builder: Nixpacks (auto-detected)
Start Command: bun start
Health Check Path: /health
```

### Step 4: Environment Variables

Add all variables from `backend/.env.example`:

#### Server Configuration
```bash
PORT=3001
NODE_ENV=production
```

#### Frontend URL
```bash
# Your Vercel frontend URL
HACKNYU_FRONTEND_URL=https://your-project.vercel.app
```

#### API Keys
```bash
HACKNYU_OPENROUTER_API_KEY=sk-or-v1-xxxxx
NFT_STORAGE_API_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

#### Solana Configuration
```bash
SOLANA_RPC_URL=https://api.devnet.solana.com
SOLANA_NETWORK=devnet
SERVER_WALLET_PRIVATE_KEY=your_base58_private_key
MARKETPLACE_PROGRAM_ID=your_deployed_program_id
```

#### Compressed NFT (Optional)
```bash
MERKLE_TREE_ADDRESS=your_merkle_tree_public_key
```

#### Database (if using Supabase)
```bash
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### Step 5: Deploy

1. Click "Deploy"
2. Railway will:
   - Clone your repo
   - Detect Node.js
   - Run `bun install`
   - Start with `bun start`
3. Your API will be live at: `https://your-service.up.railway.app`

### Step 6: Update Frontend

Update Vercel environment variable:

```bash
NEXT_PUBLIC_API_URL=https://your-service.up.railway.app
```

Then redeploy frontend on Vercel.

### Railway CLI (Optional)

```bash
# Install Railway CLI
npm i -g @railway/cli

# Login
railway login

# Link project
cd backend
railway link

# Deploy
railway up

# View logs
railway logs

# Open in browser
railway open
```

### Railway Configuration File

We've created `backend/railway.json` for advanced config:

```json
{
  "build": {
    "builder": "NIXPACKS",
    "buildCommand": "bun install"
  },
  "deploy": {
    "startCommand": "bun start",
    "healthcheckPath": "/health",
    "healthcheckTimeout": 300,
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 10
  }
}
```

---

## 🎨 Render Deployment

### Why Render?

- ✅ 750 free hours/month (enough for 1 service)
- ✅ Auto-deploy from GitHub
- ✅ Free SSL certificates
- ⚠️ Service spins down after 15 min inactivity (free tier)
- ⚠️ ~30 second cold start on first request

### Step 1: Sign Up

1. Go to [render.com](https://render.com)
2. Sign in with GitHub
3. Click "New +"
4. Select "Web Service"

### Step 2: Connect Repository

1. Connect `alin9661/HypeChain` repository
2. Configure service:

```
Name: hypechain-backend
Region: Oregon (or closest to users)
Root Directory: backend
Runtime: Node
Build Command: bun install
Start Command: bun start
Plan: Free
```

### Step 3: Environment Variables

Add the same variables as Railway (see above).

### Step 4: Advanced Settings

```
Health Check Path: /health
Auto-Deploy: Yes (deploys on git push)
```

### Step 5: Deploy

Click "Create Web Service" and wait for deployment.

Your API will be at: `https://hypechain-backend.onrender.com`

### Render Configuration File

We've created `backend/render.yaml` for Infrastructure as Code:

```yaml
services:
  - type: web
    name: hypechain-backend
    runtime: node
    buildCommand: bun install
    startCommand: bun start
    envVars:
      - key: NODE_ENV
        value: production
      # ... add others in Render dashboard
```

### Handling Cold Starts (Free Tier)

Use a cron job to ping your service:

1. Create `backend/src/routes/ping.js`:
```javascript
export const pingRoute = (req, res) => {
  res.status(200).json({ pong: true });
};
```

2. Set up [cron-job.org](https://cron-job.org):
   - URL: `https://your-backend.onrender.com/health`
   - Interval: Every 10 minutes

---

## 🪰 Fly.io Deployment

### Why Fly.io?

- ✅ Global edge deployment
- ✅ Low latency worldwide
- ✅ $5 free credit
- ⚠️ More complex setup

### Step 1: Install Fly CLI

```bash
# macOS
brew install flyctl

# Linux
curl -L https://fly.io/install.sh | sh

# Windows
iwr https://fly.io/install.ps1 -useb | iex
```

### Step 2: Authenticate

```bash
flyctl auth login
```

### Step 3: Initialize App

```bash
cd backend
flyctl launch

# Answer prompts:
# App name: hypechain-backend
# Region: Choose closest
# PostgreSQL: No (unless you need it)
# Redis: No (unless you need it)
```

This creates `fly.toml`.

### Step 4: Set Environment Variables

```bash
flyctl secrets set \
  NODE_ENV=production \
  PORT=8080 \
  HACKNYU_FRONTEND_URL=https://your-frontend.vercel.app \
  HACKNYU_OPENROUTER_API_KEY=sk-or-v1-xxx \
  NFT_STORAGE_API_KEY=your_key \
  SOLANA_RPC_URL=https://api.devnet.solana.com \
  SOLANA_NETWORK=devnet \
  SERVER_WALLET_PRIVATE_KEY=your_key \
  MARKETPLACE_PROGRAM_ID=your_id
```

### Step 5: Deploy

```bash
flyctl deploy
```

Your API will be at: `https://hypechain-backend.fly.dev`

---

## 🔍 Verification & Testing

### 1. Health Check

```bash
# Railway
curl https://your-service.up.railway.app/health

# Render
curl https://hypechain-backend.onrender.com/health

# Fly.io
curl https://hypechain-backend.fly.dev/health
```

Expected response:
```json
{
  "status": "healthy",
  "timestamp": "2025-01-19T12:00:00.000Z",
  "uptime": 123.456
}
```

### 2. Test API Endpoints

```bash
# Test listing endpoint
curl -X GET https://your-backend-url/api/listings

# Test create listing (requires auth)
curl -X POST https://your-backend-url/api/create-listing \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Test NFT",
    "description": "Testing deployment",
    "price": 10
  }'
```

### 3. Check Logs

**Railway:**
```bash
railway logs
# Or visit dashboard → Logs tab
```

**Render:**
Visit dashboard → Logs

**Fly.io:**
```bash
flyctl logs
```

### 4. Monitor Performance

**Railway Dashboard:**
- CPU usage
- Memory usage
- Request count
- Response time

**Render Dashboard:**
- Events log
- Metrics (Pro plan)

**Fly.io:**
```bash
flyctl status
flyctl metrics
```

---

## 🔐 Security Best Practices

### 1. CORS Configuration

Update `backend/src/index.js`:

```javascript
import cors from 'cors';

const allowedOrigins = [
  'http://localhost:3000',
  'https://your-project.vercel.app',
  /\.vercel\.app$/  // Allow all preview deployments
];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);

    if (allowedOrigins.some(allowed => {
      if (allowed instanceof RegExp) return allowed.test(origin);
      return allowed === origin;
    })) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));
```

### 2. Rate Limiting

```javascript
import rateLimit from 'express-rate-limit';

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: 'Too many requests, please try again later.'
});

app.use('/api/', limiter);
```

### 3. Environment Variables

- ✅ Never commit `.env` files
- ✅ Rotate API keys regularly
- ✅ Use different keys for dev/staging/prod
- ✅ Store sensitive keys in platform secrets

### 4. HTTPS Only

All platforms provide automatic HTTPS. Redirect HTTP:

```javascript
app.use((req, res, next) => {
  if (req.header('x-forwarded-proto') !== 'https' && process.env.NODE_ENV === 'production') {
    res.redirect(`https://${req.header('host')}${req.url}`);
  } else {
    next();
  }
});
```

---

## 📊 Monitoring & Debugging

### Add Logging

```javascript
import winston from 'winston';

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.Console({
      format: winston.format.simple()
    })
  ]
});

// Use in routes
logger.info('Listing created', { listingId: listing.id });
logger.error('Failed to mint NFT', { error: error.message });
```

### Error Tracking with Sentry (Optional)

```bash
cd backend
bun add @sentry/node
```

```javascript
import * as Sentry from '@sentry/node';

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV
});

app.use(Sentry.Handlers.requestHandler());
app.use(Sentry.Handlers.errorHandler());
```

---

## 🚀 Performance Optimization

### 1. Enable Compression

```javascript
import compression from 'compression';
app.use(compression());
```

### 2. Cache AI Responses

Already implemented in `backend/src/services/cache.js`:

```javascript
import { getCachedVerification, cacheVerification } from './cache.js';

// Before making AI call
const cached = await getCachedVerification(imageHash, modelId);
if (cached) return cached;

// After AI response
await cacheVerification(imageHash, modelId, result);
```

### 3. Connection Pooling

For database connections, use pools:

```javascript
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY,
  {
    db: { schema: 'public' },
    auth: { persistSession: false }
  }
);
```

### 4. Optimize Solana RPC Calls

Use Helius or QuickNode for better performance:

```bash
# Instead of public RPC
SOLANA_RPC_URL=https://api.devnet.solana.com

# Use premium RPC (recommended for production)
SOLANA_RPC_URL=https://rpc.helius.xyz/?api-key=your-key
# or
SOLANA_RPC_URL=https://YOUR-SUBDOMAIN.solana-devnet.quiknode.pro/YOUR-TOKEN/
```

---

## 💰 Cost Estimates

### Free Tier Usage

**Railway:** $5/month credit
- Sufficient for ~50k API requests
- Includes 500MB RAM, 1GB disk

**Render:** 750 hours/month free
- 1 web service running 24/7
- 512MB RAM
- ⚠️ Spins down after 15 min inactivity

**Fly.io:** $5/month credit
- ~160 hours of uptime
- Shared CPU

### Paid Plans

**Railway:** Pay as you go
- ~$5-10/month for small MVP
- Scales automatically

**Render:** $7/month per service
- Always on (no cold starts)
- 512MB RAM

**Fly.io:** ~$5-15/month
- Based on usage
- Global deployment

---

## 🔄 CI/CD Integration

### Automatic Deployments

All platforms support automatic deployment on git push:

1. **Railway**: Auto-deploys on push to main
2. **Render**: Auto-deploys based on branch
3. **Fly.io**: Set up GitHub Actions

### GitHub Actions for Fly.io

Create `.github/workflows/deploy.yml`:

```yaml
name: Deploy to Fly.io

on:
  push:
    branches: [main]
    paths:
      - 'backend/**'

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: superfly/flyctl-actions/setup-flyctl@master
      - run: flyctl deploy --remote-only
        working-directory: ./backend
        env:
          FLY_API_TOKEN: ${{ secrets.FLY_API_TOKEN }}
```

---

## 🆘 Troubleshooting

### Common Issues

#### 1. Module not found errors

```bash
# Ensure all dependencies in package.json
cd backend
bun install

# Test locally
bun start
```

#### 2. Environment variable not working

```bash
# Railway: Check dashboard → Variables
# Render: Check dashboard → Environment
# Fly.io: List secrets
flyctl secrets list
```

#### 3. Health check failing

Check your health endpoint returns 200:

```javascript
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'healthy' });
});
```

#### 4. CORS errors

Update allowed origins in CORS config (see Security section).

#### 5. Solana RPC rate limits

Switch to premium RPC provider:
- Helius: https://helius.dev
- QuickNode: https://quicknode.com
- Alchemy: https://alchemy.com

---

## 📈 Scaling

### When to scale?

- API response time > 500ms
- Error rate > 1%
- CPU usage > 80%
- Memory usage > 80%

### Scaling strategies:

1. **Vertical scaling**: Upgrade plan (more RAM/CPU)
2. **Horizontal scaling**: Multiple instances (Railway/Fly.io)
3. **Database caching**: Redis for frequently accessed data
4. **CDN**: Cloudflare for static assets
5. **Load balancing**: Fly.io automatic, Railway Pro

---

## ✅ Deployment Checklist

### Pre-Deployment

- [ ] Test backend locally
- [ ] All environment variables documented
- [ ] Health check endpoint working
- [ ] CORS configured for production URLs
- [ ] Rate limiting enabled
- [ ] Error handling implemented
- [ ] Logging configured

### Platform Setup

- [ ] Platform account created
- [ ] Repository connected
- [ ] Root directory set to `backend`
- [ ] Build command: `bun install`
- [ ] Start command: `bun start`
- [ ] All environment variables added

### Post-Deployment

- [ ] Health check returns 200
- [ ] Test all API endpoints
- [ ] Check logs for errors
- [ ] Update frontend `NEXT_PUBLIC_API_URL`
- [ ] Redeploy frontend
- [ ] Test full application flow
- [ ] Monitor for 24 hours

---

## 🎉 Success!

Your backend is now deployed and production-ready!

**Next steps:**
1. Update frontend with backend URL
2. Test end-to-end flows
3. Monitor logs for issues
4. Set up error tracking
5. Configure alerts

Happy deploying! 🚀
