// Local development entry point — starts the Express server on PORT (3001)
// with graceful shutdown. AWS Lambda uses src/lambda.js instead.
//
// This file holds everything that's specific to running as a long-lived
// process (listen + signal handlers + nodemon SIGUSR2). Keeping it out
// of src/index.js means the Lambda container never runs `app.listen()`
// on cold start.
import app from './index.js';

const PORT = process.env.PORT || 3001;

const server = app.listen(PORT, () => {
  console.log('🚀 HypeChain Backend Server Started');
  console.log(`📍 Server running on http://localhost:${PORT}`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔗 Frontend URL: ${process.env.HACKNYU_FRONTEND_URL || 'http://localhost:3000'}`);
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

// Graceful shutdown for local dev. Lambda manages its own container lifecycle
// (freeze/thaw on warm reuse, no SIGTERM on idle), so these handlers are
// dev-only and not duplicated in src/lambda.js.
const gracefulShutdown = (signal) => {
  console.log(`\n${signal} signal received: closing HTTP server gracefully`);

  server.close(() => {
    console.log('✅ HTTP server closed');
    process.exit(0);
  });

  // Force close after 10 seconds
  setTimeout(() => {
    console.error('⚠️  Forced shutdown after timeout');
    process.exit(1);
  }, 10000);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle nodemon restart
process.once('SIGUSR2', () => {
  console.log('\n🔄 Nodemon restart detected: closing server');
  server.close(() => {
    process.kill(process.pid, 'SIGUSR2');
  });
});
