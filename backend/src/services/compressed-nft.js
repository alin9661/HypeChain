import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import {
  createTree,
  mintV1,
  mplBubblegum,
  parseLeafFromMintV1Transaction,
  findLeafAssetIdPda
} from '@metaplex-foundation/mpl-bubblegum';
import {
  generateSigner,
  keypairIdentity,
  percentAmount,
  publicKey as umiPublicKey,
  none
} from '@metaplex-foundation/umi';
import bs58 from 'bs58';
// Custodial keypair loading is centralized in the signer abstraction
// (env | secretsmanager). Never re-decode the env key here.
import { getServerWallet } from './signer.js';

const SOLANA_RPC_URL = process.env.HACKNYU_SOLANA_RPC_URL || 'https://api.devnet.solana.com';

/**
 * Creates a new Merkle tree for compressed NFTs
 * This should be called once to set up your tree, then reused for all mints
 *
 * @param {number} maxDepth - Tree depth (determines capacity: 2^maxDepth NFTs)
 *                            14 = 16,384 NFTs, 20 = 1,048,576 NFTs, 24 = 16,777,216 NFTs
 * @param {number} maxBufferSize - Number of concurrent changes allowed
 *                                 64 for small, 256 for medium, 2048 for large
 * @returns {Promise<{treeAddress: string, maxDepth: number, maxBufferSize: number, capacity: number}>}
 */
export async function createMerkleTree(maxDepth = 14, maxBufferSize = 64) {
  try {
    const umi = createUmi(SOLANA_RPC_URL).use(mplBubblegum());
    const serverWallet = getServerWallet();
    const umiKeypair = umi.eddsa.createKeypairFromSecretKey(serverWallet.secretKey);
    umi.use(keypairIdentity(umiKeypair));

    const merkleTree = generateSigner(umi);

    const capacity = 2 ** maxDepth;
    console.log(`🌳 Creating Merkle tree with capacity: ${capacity.toLocaleString()} NFTs`);
    console.log(`   Max concurrent operations: ${maxBufferSize}`);

    const builder = await createTree(umi, {
      merkleTree,
      maxDepth,
      maxBufferSize,
      public: false  // Only tree authority can mint
    });

    await builder.sendAndConfirm(umi);

    const treeAddress = merkleTree.publicKey;
    console.log(`✅ Merkle tree created successfully!`);
    console.log(`   Address: ${treeAddress}`);
    console.log(`   Capacity: ${capacity.toLocaleString()} NFTs`);
    console.log(`   Estimated cost per mint: ~$0.001`);
    console.log(`   Total capacity cost: ~$${(capacity * 0.001).toLocaleString()}`);

    return {
      treeAddress: treeAddress.toString(),
      maxDepth,
      maxBufferSize,
      capacity
    };
  } catch (error) {
    console.error('❌ Merkle tree creation error:', error);
    throw new Error(`Failed to create Merkle tree: ${error.message}`);
  }
}

/**
 * Mints a compressed NFT (cNFT) to the specified user wallet
 * Much cheaper than standard NFTs (~$0.001 vs ~$5.00 per mint)
 *
 * @param {string} userWalletAddress - User's Solana wallet address
 * @param {string} metadataUri - URI pointing to NFT metadata JSON
 * @param {string} productName - Name of the NFT (max 32 characters)
 * @param {string} treeAddress - Merkle tree address to mint into
 * @returns {Promise<{assetId: string, signature: string, leafIndex: number, merkleTree: string}>}
 */
export async function mintCompressedNFT(
  userWalletAddress,
  metadataUri,
  productName,
  treeAddress
) {
  try {
    const umi = createUmi(SOLANA_RPC_URL).use(mplBubblegum());
    const serverWallet = getServerWallet();
    const umiKeypair = umi.eddsa.createKeypairFromSecretKey(serverWallet.secretKey);
    umi.use(keypairIdentity(umiKeypair));

    console.log(`🎨 Minting compressed NFT...`);
    console.log(`   Name: ${productName}`);
    console.log(`   Owner: ${userWalletAddress}`);
    console.log(`   Tree: ${treeAddress}`);
    console.log(`   Metadata URI: ${metadataUri}`);

    // Truncate name to 32 characters (Metaplex limit)
    const truncatedName = productName.substring(0, 32);

    const { signature } = await mintV1(umi, {
      leafOwner: umiPublicKey(userWalletAddress),
      merkleTree: umiPublicKey(treeAddress),
      metadata: {
        name: truncatedName,
        uri: metadataUri,
        sellerFeeBasisPoints: percentAmount(5, 2), // 5% royalty
        collection: none(),
        creators: [
          {
            address: umiKeypair.publicKey,
            verified: true,
            share: 100
          }
        ],
      },
    }).sendAndConfirm(umi, {
      confirm: { commitment: 'finalized' }
    });

    // Parse the transaction to get leaf information
    const leaf = await parseLeafFromMintV1Transaction(umi, signature);

    // Calculate the asset ID (unique identifier for this cNFT)
    const assetId = findLeafAssetIdPda(umi, {
      merkleTree: umiPublicKey(treeAddress),
      leafIndex: leaf.nonce
    });

    const signatureBase58 = bs58.encode(signature);

    console.log('✅ Compressed NFT minted successfully!');
    console.log(`   Asset ID: ${assetId}`);
    console.log(`   Signature: ${signatureBase58}`);
    console.log(`   Leaf Index: ${leaf.nonce}`);
    console.log(`   💰 Cost saved: ~99.98% vs standard NFT ($0.001 vs $5.00)`);

    return {
      assetId: assetId.toString(),
      signature: signatureBase58,
      leafIndex: leaf.nonce,
      merkleTree: treeAddress
    };
  } catch (error) {
    console.error('❌ Compressed NFT minting error:', error);

    // Provide helpful error messages
    if (error.message?.includes('AccountNotFound')) {
      throw new Error('Merkle tree not found. Please run the setup script first.');
    } else if (error.message?.includes('TreeFull')) {
      throw new Error('Merkle tree is full. Please create a new tree.');
    } else if (error.message?.includes('InsufficientFunds')) {
      throw new Error('Insufficient SOL in server wallet for minting.');
    }

    throw new Error(`Failed to mint compressed NFT: ${error.message}`);
  }
}

/**
 * Gets compressed NFT data using DAS API
 * Requires RPC endpoint with DAS API support (Helius, QuickNode, etc.)
 *
 * @param {string} assetId - The asset ID of the compressed NFT
 * @returns {Promise<Object>} Asset data including metadata and ownership
 */
export async function getCompressedNFT(assetId) {
  try {
    // Use DAS-compatible RPC if configured, otherwise fall back to standard
    const dasRpcUrl = process.env.HACKNYU_DAS_RPC_URL || SOLANA_RPC_URL;

    console.log(`🔍 Fetching compressed NFT data for: ${assetId}`);

    // DAS API uses a different endpoint structure
    const response = await fetch(dasRpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 'hypechain-get-asset',
        method: 'getAsset',
        params: {
          id: assetId
        }
      })
    });

    const { result, error } = await response.json();

    if (error) {
      throw new Error(`DAS API error: ${error.message}`);
    }

    if (!result) {
      throw new Error('Asset not found');
    }

    console.log('✅ Compressed NFT data retrieved');

    return {
      id: result.id,
      name: result.content?.metadata?.name || 'Unknown',
      uri: result.content?.metadata?.uri || '',
      owner: result.ownership?.owner || '',
      creators: result.creators || [],
      compressed: result.compression?.compressed || false,
      tree: result.compression?.tree || '',
      leafId: result.compression?.leaf_id || 0
    };
  } catch (error) {
    console.error('❌ Get compressed NFT error:', error);

    if (error.message?.includes('DAS API')) {
      console.warn('⚠️  DAS API not available. Please use Helius, QuickNode, or another DAS-compatible RPC.');
      console.warn('   Set HACKNYU_DAS_RPC_URL in your .env file.');
    }

    throw new Error(`Failed to get compressed NFT: ${error.message}`);
  }
}

/**
 * Gets all compressed NFTs owned by a specific wallet
 * Requires DAS API support
 *
 * @param {string} ownerAddress - Wallet address to query
 * @param {number} limit - Maximum number of assets to return (default: 1000)
 * @returns {Promise<Array>} Array of compressed NFT assets
 */
export async function getCompressedNFTsByOwner(ownerAddress, limit = 1000) {
  try {
    const dasRpcUrl = process.env.HACKNYU_DAS_RPC_URL || SOLANA_RPC_URL;

    console.log(`🔍 Fetching compressed NFTs for owner: ${ownerAddress}`);

    const response = await fetch(dasRpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 'hypechain-get-assets-by-owner',
        method: 'getAssetsByOwner',
        params: {
          ownerAddress,
          limit,
          page: 1
        }
      })
    });

    const { result, error } = await response.json();

    if (error) {
      throw new Error(`DAS API error: ${error.message}`);
    }

    const assets = result?.items || [];
    const compressedAssets = assets.filter(asset => asset.compression?.compressed);

    console.log(`✅ Found ${compressedAssets.length} compressed NFTs`);

    return compressedAssets.map(asset => ({
      id: asset.id,
      name: asset.content?.metadata?.name,
      uri: asset.content?.metadata?.uri,
      compressed: true,
      tree: asset.compression?.tree,
      leafId: asset.compression?.leaf_id
    }));
  } catch (error) {
    console.error('❌ Get compressed NFTs by owner error:', error);
    throw new Error(`Failed to get compressed NFTs: ${error.message}`);
  }
}

/**
 * Checks if a Merkle tree exists and returns its status
 *
 * @param {string} treeAddress - The Merkle tree address to check
 * @returns {Promise<{exists: boolean, capacity?: number, numMinted?: number}>}
 */
export async function checkMerkleTreeStatus(treeAddress) {
  try {
    const umi = createUmi(SOLANA_RPC_URL).use(mplBubblegum());

    console.log(`🔍 Checking Merkle tree status: ${treeAddress}`);

    // Fetch tree account
    const treeAccount = await umi.rpc.getAccount(umiPublicKey(treeAddress));

    if (!treeAccount.exists) {
      return { exists: false };
    }

    console.log('✅ Merkle tree exists and is active');

    // Note: Getting detailed tree stats requires parsing the account data
    // This is a simplified version
    return {
      exists: true,
      address: treeAddress
    };
  } catch (error) {
    console.error('❌ Check Merkle tree status error:', error);
    return { exists: false };
  }
}
