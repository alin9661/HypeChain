// Load environment variables first, before any other imports
import './config/env.js';

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import listingRoutes from './routes/listing.js';
import paymentRoutes from './routes/payment.js';

const app = express();
const PORT = process.env.PORT || 3001;

// ========================================
// Middleware
// ========================================

// Security headers
app.use(helmet());

// CORS configuration
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true
}));

// Body parsing
app.use(express.json({ limit: '10mb' })); // Increased limit for base64 images
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request logging
app.use(morgan('dev'));

// ========================================
// Routes
// ========================================

// Health check
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

// Root endpoint
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
      verifyPayment: 'POST /api/payments/verify',
      paymentHistory: 'GET /api/payments/history/:walletAddress',
      walletBalance: 'GET /api/payments/balance/:walletAddress',
      getListingDetails: 'GET /api/payments/listing/:listingId'
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

// ========================================
// Server Start
// ========================================

app.listen(PORT, () => {
  console.log('🚀 HypeChain Backend Server Started');
  console.log(`📍 Server running on http://localhost:${PORT}`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔗 Frontend URL: ${process.env.FRONTEND_URL || 'http://localhost:3000'}`);
  console.log('\n✨ Available endpoints:');
  console.log(`   GET  /                              - API information`);
  console.log(`   GET  /health                        - Health check`);
  console.log('\n📦 Listing Endpoints:');
  console.log(`   POST /api/create-listing            - Create NFT listing`);
  console.log(`   GET  /api/create-listing            - Listing endpoint info`);
  console.log('\n💰 Payment Endpoints (Solana Pay):');
  console.log(`   POST /api/payments/create           - Create payment request`);
  console.log(`   POST /api/payments/verify           - Verify payment`);
  console.log(`   GET  /api/payments/history/:wallet  - Transaction history`);
  console.log(`   GET  /api/payments/balance/:wallet  - Wallet balance`);
  console.log(`   GET  /api/payments/listing/:id      - Get listing details`);
  console.log('\n🎯 Ready to mint NFTs and process payments!\n');
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM signal received: closing HTTP server');
  app.close(() => {
    console.log('HTTP server closed');
  });
});

export default app;
