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

const app = express();

// ========================================
// Middleware
// ========================================

// Security headers
app.use(helmet());

// CORS configuration — production frontend on Vercel, local dev on :3000.
app.use(cors({
  origin: process.env.HACKNYU_FRONTEND_URL || 'http://localhost:3000',
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

// API routes
app.use('/api', listingRoutes);
app.use('/api/payments', paymentRoutes);
// Activity feed + provenance live at /api/activities and /api/nft/:mint/history.
app.use('/api', activitiesRoutes);
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
