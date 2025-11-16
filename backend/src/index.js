import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';
import listingRoutes from './routes/listing.js';

// Load environment variables
dotenv.config();

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

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    name: 'HypeChain Backend API',
    version: '1.0.0',
    description: 'AI-Powered NFT Marketplace Backend',
    endpoints: {
      health: '/health',
      createListing: 'POST /api/create-listing',
      listingInfo: 'GET /api/create-listing'
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
  console.log(`   GET  /                     - API information`);
  console.log(`   GET  /health               - Health check`);
  console.log(`   POST /api/create-listing   - Create NFT listing`);
  console.log(`   GET  /api/create-listing   - Listing endpoint info`);
  console.log('\n🎯 Ready to mint NFTs!\n');
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM signal received: closing HTTP server');
  app.close(() => {
    console.log('HTTP server closed');
  });
});

export default app;
