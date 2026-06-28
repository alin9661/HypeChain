// Express app factory — builds and exports the configured app.
// Runtime entry points:
//   • src/dev.js     — local dev (calls app.listen on PORT 3001)
//   • src/lambda.js  — AWS Lambda (wraps app with serverless-http)
// This file is import-side-effect-safe: no listen, no signal handlers.

// Load environment variables first, before any service module reads process.env.
import './config/env.js';

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import listingRoutes from './routes/listing.js';
import paymentRoutes from './routes/payment.js';
import activitiesRoutes from './routes/activities.js';
import webhookRoutes from './routes/webhooks.js';
import waitlistRoutes from './routes/waitlist.js';
import userRoutes from './routes/users.js';
import { requestId } from './middleware/request-id.js';
import { createListingLimiter, paymentsLimiter, waitlistLimiter } from './middleware/rate-limit.js';

const app = express();

// Behind the Lambda Function URL / ALB — trust the proxy so req.ip (used for
// rate-limit keying) is the real client IP, not the proxy's.
app.set('trust proxy', 1);

// ========================================
// Middleware
// ========================================

// Correlate every request (X-Request-Id) before anything else logs.
app.use(requestId);

// Security headers
app.use(helmet());

// CORS configuration — production frontend on Vercel, local dev on :3000.
// Fail-closed in production: never fall back to a localhost origin when the
// frontend URL is unconfigured. A misconfigured prod deploy should refuse to
// boot (clear error) rather than silently trust http://localhost:3000.
const isProduction = (process.env.NODE_ENV || 'development') === 'production';
const frontendOrigin = process.env.HACKNYU_FRONTEND_URL;
if (isProduction && !frontendOrigin) {
  throw new Error(
    'HACKNYU_FRONTEND_URL must be set when NODE_ENV=production (CORS fail-closed): ' +
      'refusing to fall back to http://localhost:3000.'
  );
}
app.use(cors({
  origin: frontendOrigin || 'http://localhost:3000',
  credentials: true
}));

// Body parsing — 5 MB cap to fit AWS Lambda's 6 MB sync invocation payload
// limit (base64-encoded product images expand raw bytes by ~33%). Larger
// uploads need the pre-signed S3 pattern (deferred to FastAPI follow-up).
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true, limit: '5mb' }));

// Request logging
app.use(morgan('dev'));

// ========================================
// Routes
// ========================================

// Health check — used by Lambda Function URL probes and local dev.
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// API routes. Rate limits guard the expensive (create-listing) and
// fund-mutating (payments) surfaces; the webhook is auth-gated, not IP-limited
// (Helius's IPs vary and it self-throttles on 2xx).
app.use('/api/create-listing', createListingLimiter);
app.use('/api/payments', paymentsLimiter);
// Public waitlist signup — per-IP throttle on the POST only (each signup can
// dispatch SES email). The admin export (GET /api/waitlist/export) must not
// share the signup budget, so it is exempt from this limiter.
app.use('/api/waitlist', (req, res, next) =>
  req.method === 'POST' ? waitlistLimiter(req, res, next) : next()
);
app.use('/api', listingRoutes);
app.use('/api/payments', paymentRoutes);
// Activity feed + provenance live at /api/activities and /api/nft/:mint/history.
app.use('/api', activitiesRoutes);
// Pre-production waitlist signup + admin export at /api/waitlist[/export].
app.use('/api', waitlistRoutes);
// User register/login + profile at /api/users/register and /api/users/:wallet
// (DSQL-backed; replaces the former Supabase Next.js routes).
app.use('/api', userRoutes);
// Helius enhanced-webhook ingest (fail-closed HMAC auth).
app.use('/api/webhooks', webhookRoutes);

// Root endpoint — kept for API discoverability.
app.get('/', (req, res) => {
  res.json({
    name: 'HypeChain Backend API',
    version: '1.0.0',
    description: 'AI-Powered NFT Marketplace Backend with Solana Pay',
    endpoints: {
      health: '/health',
      createListing: 'POST /api/create-listing',
      listingInfo: 'GET /api/create-listing',
      createPayment: 'POST /api/payments/create',
      cosignPurchase: 'POST /api/payments/cosign-purchase',
      verifyPayment: 'POST /api/payments/verify',
      paymentHistory: 'GET /api/payments/history/:walletAddress',
      walletBalance: 'GET /api/payments/balance/:walletAddress',
      getListingDetails: 'GET /api/payments/listing/:listingId',
      activities: 'GET /api/activities',
      nftHistory: 'GET /api/nft/:mint/history',
      waitlistSignup: 'POST /api/waitlist',
      waitlistExport: 'GET /api/waitlist/export',
      heliusWebhook: 'POST /api/webhooks/helius'
    },
    documentation: 'https://github.com/alin9661/HypeChain'
  });
});

// ========================================
// Error Handling
// ========================================

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found',
    path: req.path
  });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Server error:', err);

  res.status(err.status || 500).json({
    success: false,
    error: err.message || 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

export default app;
