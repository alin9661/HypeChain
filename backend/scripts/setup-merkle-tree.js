#!/usr/bin/env node

/**
 * Setup script for creating a Merkle tree for compressed NFTs
 * Run this once to initialize your compressed NFT infrastructure
 *
 * Usage:
 *   pnpm setup-tree                    # Creates default tree (16,384 NFTs)
 *   pnpm setup-tree -- --size small    # 16,384 NFTs (~0.22 SOL)
 *   pnpm setup-tree -- --size medium   # 1,048,576 NFTs (~1.5 SOL)
 *   pnpm setup-tree -- --size large    # 16,777,216 NFTs (~24 SOL)
 *   pnpm setup-tree -- --custom 17 128 # Custom: 131,072 NFTs
 */

import '../src/config/env.js';  // Load environment variables
import { createMerkleTree } from '../src/services/compressed-nft.js';

// Predefined tree sizes
const TREE_SIZES = {
  small: { maxDepth: 14, maxBufferSize: 64, capacity: 16384, cost: '~0.22 SOL' },
  medium: { maxDepth: 20, maxBufferSize: 256, capacity: 1048576, cost: '~1.5 SOL' },
  large: { maxDepth: 24, maxBufferSize: 2048, capacity: 16777216, cost: '~24 SOL' }
};

/**
 * Parse command line arguments
 */
function parseArgs() {
  const args = process.argv.slice(2);

  // Check for help flag
  if (args.includes('--help') || args.includes('-h')) {
    printHelp();
    process.exit(0);
  }

  // Check for custom size
  const customIndex = args.indexOf('--custom');
  if (customIndex !== -1) {
    const maxDepth = parseInt(args[customIndex + 1]);
    const maxBufferSize = parseInt(args[customIndex + 2]);

    if (isNaN(maxDepth) || isNaN(maxBufferSize)) {
      console.error('❌ Invalid custom parameters. Usage: --custom <maxDepth> <maxBufferSize>');
      process.exit(1);
    }

    if (maxDepth < 3 || maxDepth > 30) {
      console.error('❌ maxDepth must be between 3 and 30');
      process.exit(1);
    }

    if (maxBufferSize < 8 || maxBufferSize > 2048) {
      console.error('❌ maxBufferSize must be between 8 and 2048');
      process.exit(1);
    }

    return { maxDepth, maxBufferSize, custom: true };
  }

  // Check for predefined size
  const sizeIndex = args.indexOf('--size');
  if (sizeIndex !== -1) {
    const size = args[sizeIndex + 1];
    if (!TREE_SIZES[size]) {
      console.error(`❌ Invalid size: ${size}. Use: small, medium, or large`);
      process.exit(1);
    }
    return { ...TREE_SIZES[size], size };
  }

  // Default to small
  return { ...TREE_SIZES.small, size: 'small' };
}

/**
 * Print help information
 */
function printHelp() {
  console.log(`
🌳 Merkle Tree Setup for Compressed NFTs
==========================================

This script creates a Merkle tree for minting compressed NFTs (cNFTs).
You only need to run this once per tree.

USAGE:
  pnpm setup-tree [OPTIONS]

OPTIONS:
  --size <size>              Use a predefined tree size
                             Options: small, medium, large

  --custom <depth> <buffer>  Create custom tree
                             depth: Tree depth (3-30)
                             buffer: Buffer size (8-2048)

  --help, -h                 Show this help message

PREDEFINED SIZES:
  small   - 16,384 NFTs      (maxDepth: 14, buffer: 64)   ~0.22 SOL
  medium  - 1,048,576 NFTs   (maxDepth: 20, buffer: 256)  ~1.5 SOL
  large   - 16,777,216 NFTs  (maxDepth: 24, buffer: 2048) ~24 SOL

EXAMPLES:
  pnpm setup-tree                    # Create small tree (default)
  pnpm setup-tree -- --size medium   # Create medium tree
  pnpm setup-tree -- --custom 17 128 # Create 131,072 NFT tree

NOTES:
  - The tree cannot be expanded after creation
  - Choose a size based on your expected NFT volume
  - Once full, you'll need to create a new tree
  - Cost is one-time per tree, mints are ~$0.001 each

REQUIREMENTS:
  - HACKNYU_SERVER_WALLET_PRIVATE_KEY must be set in .env
  - Wallet must have sufficient SOL for tree creation
  - Connected to Solana network (check HACKNYU_SOLANA_RPC_URL)
  `);
}

/**
 * Main execution function
 */
async function main() {
  console.log('\n🚀 HypeChain Compressed NFT - Merkle Tree Setup\n');
  console.log('═'.repeat(50));

  // Check environment variables
  if (!process.env.HACKNYU_SERVER_WALLET_PRIVATE_KEY) {
    console.error('\n❌ Error: HACKNYU_SERVER_WALLET_PRIVATE_KEY not set');
    console.error('   Please set your server wallet private key in .env');
    console.error('   Never use your personal wallet - generate a new one for the server\n');
    process.exit(1);
  }

  const rpcUrl = process.env.HACKNYU_SOLANA_RPC_URL || 'https://api.devnet.solana.com';
  const network = rpcUrl.includes('devnet') ? 'devnet' : rpcUrl.includes('testnet') ? 'testnet' : 'mainnet';

  console.log(`\n📡 Network: ${network.toUpperCase()}`);
  console.log(`   RPC: ${rpcUrl}\n`);

  // Parse arguments
  const config = parseArgs();

  // Show configuration
  if (config.custom) {
    const capacity = 2 ** config.maxDepth;
    console.log('📋 Tree Configuration (Custom):');
    console.log(`   Max Depth: ${config.maxDepth}`);
    console.log(`   Buffer Size: ${config.maxBufferSize}`);
    console.log(`   Capacity: ${capacity.toLocaleString()} NFTs`);
    console.log(`   Estimated creation cost: Variable`);
  } else {
    console.log(`📋 Tree Configuration (${config.size}):` );
    console.log(`   Max Depth: ${config.maxDepth}`);
    console.log(`   Buffer Size: ${config.maxBufferSize}`);
    console.log(`   Capacity: ${config.capacity.toLocaleString()} NFTs`);
    console.log(`   Estimated creation cost: ${config.cost}`);
  }

  console.log('\n⚠️  WARNING:');
  console.log('   - Tree creation costs are non-refundable');
  console.log('   - Tree size cannot be changed after creation');
  console.log('   - Choose wisely based on your expected volume');

  // In non-interactive mode (CI/CD), auto-confirm
  if (process.env.CI || process.env.AUTO_CONFIRM) {
    console.log('\n✅ Auto-confirming (CI mode)...\n');
  } else {
    // For local development, we'll just proceed
    // In production, you might want to add readline confirmation
    console.log('\n⏳ Creating tree...\n');
  }

  try {
    // Create the Merkle tree
    const result = await createMerkleTree(config.maxDepth, config.maxBufferSize);

    console.log('\n═'.repeat(50));
    console.log('\n🎉 SUCCESS! Merkle Tree Created\n');
    console.log('═'.repeat(50));

    console.log('\n📝 IMPORTANT: Add this to your .env file:\n');
    console.log(`HACKNYU_MERKLE_TREE_ADDRESS=${result.treeAddress}\n`);

    console.log('═'.repeat(50));
    console.log('\n📊 Tree Details:');
    console.log(`   Address: ${result.treeAddress}`);
    console.log(`   Capacity: ${result.capacity.toLocaleString()} NFTs`);
    console.log(`   Max Depth: ${result.maxDepth}`);
    console.log(`   Buffer Size: ${result.maxBufferSize}`);

    console.log('\n💰 Cost Analysis:');
    console.log(`   Cost per mint: ~$0.001`);
    console.log(`   Total capacity value: ~$${(result.capacity * 0.001).toLocaleString()}`);
    console.log(`   Savings vs standard NFTs: ~99.98%`);

    console.log('\n✅ Next Steps:');
    console.log('   1. Copy the tree address to your .env file');
    console.log('   2. Restart your backend server');
    console.log('   3. Start minting compressed NFTs!');

    console.log('\n🔗 View on Solana Explorer:');
    const explorerUrl = network === 'mainnet'
      ? `https://explorer.solana.com/address/${result.treeAddress}`
      : `https://explorer.solana.com/address/${result.treeAddress}?cluster=${network}`;
    console.log(`   ${explorerUrl}\n`);

  } catch (error) {
    console.error('\n═'.repeat(50));
    console.error('\n❌ ERROR: Failed to create Merkle tree\n');
    console.error('═'.repeat(50));
    console.error(`\n${error.message}\n`);

    if (error.message.includes('Insufficient funds')) {
      console.error('💡 Tip: Your server wallet needs more SOL');
      console.error('   Get devnet SOL: https://faucet.solana.com/');
    } else if (error.message.includes('Invalid')) {
      console.error('💡 Tip: Check your HACKNYU_SERVER_WALLET_PRIVATE_KEY');
      console.error('   It should be a base58-encoded private key');
    } else if (error.message.includes('Network')) {
      console.error('💡 Tip: Check your RPC endpoint');
      console.error(`   Current: ${rpcUrl}`);
    }

    console.error('\n❓ Need help? Check the docs or create an issue\n');
    process.exit(1);
  }
}

// Run the script
main().catch((error) => {
  console.error('\n❌ Unexpected error:', error);
  process.exit(1);
});
