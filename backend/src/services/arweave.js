import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import { irysUploader } from '@metaplex-foundation/umi-uploader-irys';
import { keypairIdentity } from '@metaplex-foundation/umi';
import { base64ToBuffer } from '../utils/validation.js';
// Custodial keypair loading is centralized in the signer abstraction
// (env | secretsmanager). Never re-decode the env key here.
import { getServerWallet } from './signer.js';

const SOLANA_RPC_URL = process.env.HACKNYU_SOLANA_RPC_URL || 'https://api.devnet.solana.com';

/**
 * Uploads an image to Arweave via Irys (formerly Bundlr)
 * Provides permanent, decentralized storage with pay-once model
 *
 * @param {string} base64Image - Base64-encoded image data
 * @param {string} filename - Filename for the image (default: 'product.png')
 * @returns {Promise<{uri: string, url: string}>} Arweave URI and HTTP URL
 */
export async function uploadImageToArweave(base64Image, filename = 'product.png') {
  try {
    const umi = createUmi(SOLANA_RPC_URL);
    const serverWallet = getServerWallet();
    const umiKeypair = umi.eddsa.createKeypairFromSecretKey(serverWallet.secretKey);
    umi.use(keypairIdentity(umiKeypair));

    // Determine Irys node based on network
    const isDevnet = SOLANA_RPC_URL.includes('devnet');
    const irysAddress = isDevnet
      ? 'https://devnet.irys.xyz'
      : 'https://node2.irys.xyz';

    console.log(`📤 Uploading image to Arweave via Irys (${isDevnet ? 'devnet' : 'mainnet'})...`);

    umi.use(irysUploader({
      address: irysAddress
    }));

    // Convert base64 to buffer
    const imageBuffer = base64ToBuffer(base64Image);
    const mimeType = base64Image.match(/data:([^;]+);/)?.[1] || 'image/png';

    console.log(`   File size: ${(imageBuffer.length / 1024).toFixed(2)} KB`);
    console.log(`   MIME type: ${mimeType}`);

    // Create file object for upload
    const imageFile = {
      buffer: imageBuffer,
      fileName: filename,
      displayName: filename,
      uniqueName: filename,
      contentType: mimeType,
      extension: filename.split('.').pop() || 'png',
      tags: [
        { name: 'Content-Type', value: mimeType },
        { name: 'App-Name', value: 'HypeChain' },
        { name: 'App-Version', value: '1.0.0' }
      ]
    };

    // Upload to Arweave
    const [uri] = await umi.uploader.upload([imageFile]);

    console.log('✅ Image uploaded to Arweave successfully!');
    console.log(`   URI: ${uri}`);
    console.log(`   💾 Permanent storage - no recurring fees`);

    return {
      uri,
      url: uri  // Arweave URIs are already HTTP-accessible
    };
  } catch (error) {
    console.error('❌ Arweave image upload error:', error);

    // Provide helpful error messages
    if (error.message?.includes('Insufficient funds')) {
      throw new Error('Insufficient SOL in server wallet for Arweave upload. Please add more SOL.');
    } else if (error.message?.includes('Network')) {
      throw new Error('Failed to connect to Irys node. Please check your network connection.');
    }

    throw new Error(`Failed to upload image to Arweave: ${error.message}`);
  }
}

/**
 * Uploads NFT metadata JSON to Arweave
 * Provides permanent, immutable metadata storage
 *
 * @param {Object} metadata - NFT metadata object
 * @returns {Promise<{uri: string}>} Arweave URI for metadata
 */
export async function uploadMetadataToArweave(metadata) {
  try {
    const umi = createUmi(SOLANA_RPC_URL);
    const serverWallet = getServerWallet();
    const umiKeypair = umi.eddsa.createKeypairFromSecretKey(serverWallet.secretKey);
    umi.use(keypairIdentity(umiKeypair));

    const isDevnet = SOLANA_RPC_URL.includes('devnet');
    const irysAddress = isDevnet
      ? 'https://devnet.irys.xyz'
      : 'https://node2.irys.xyz';

    console.log('📤 Uploading metadata to Arweave...');

    umi.use(irysUploader({
      address: irysAddress
    }));

    // Add additional metadata fields
    const enrichedMetadata = {
      ...metadata,
      properties: {
        ...metadata.properties,
        category: 'image',
        files: metadata.image ? [{
          uri: metadata.image,
          type: 'image/png'
        }] : []
      },
      collection: metadata.collection || {
        name: 'HypeChain Verified Collection',
        family: 'HypeChain'
      }
    };

    const metadataSize = JSON.stringify(enrichedMetadata).length;
    console.log(`   Metadata size: ${(metadataSize / 1024).toFixed(2)} KB`);

    // Upload metadata JSON
    const uri = await umi.uploader.uploadJson(enrichedMetadata);

    console.log('✅ Metadata uploaded to Arweave successfully!');
    console.log(`   URI: ${uri}`);

    return { uri };
  } catch (error) {
    console.error('❌ Arweave metadata upload error:', error);
    throw new Error(`Failed to upload metadata to Arweave: ${error.message}`);
  }
}

/**
 * Creates and uploads complete NFT metadata with image to Arweave
 * One-stop function for uploading both image and metadata to permanent storage
 *
 * @param {string} imageBase64 - Base64-encoded image
 * @param {string} productName - Name of the NFT
 * @param {string} description - Description of the NFT
 * @param {Array} attributes - Array of trait objects
 * @returns {Promise<{metadataUri: string, imageUrl: string}>}
 */
export async function createAndUploadNFTMetadataArweave(
  imageBase64,
  productName,
  description,
  attributes
) {
  try {
    console.log('🎨 Creating NFT metadata for Arweave...');

    // Upload image first
    const { uri: imageUri } = await uploadImageToArweave(imageBase64, `${productName.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.png`);

    // Create metadata object
    const metadata = {
      name: productName,
      symbol: 'HYPE',
      description,
      image: imageUri,
      attributes,
      properties: {
        category: 'image',
        creators: [{
          address: process.env.HACKNYU_SERVER_WALLET_ADDRESS || 'HypeChain',
          share: 100
        }]
      },
      external_url: process.env.HACKNYU_FRONTEND_URL || 'https://hypechain.com'
    };

    // Upload metadata
    const { uri: metadataUri } = await uploadMetadataToArweave(metadata);

    console.log('✅ Complete NFT package uploaded to Arweave!');
    console.log(`   Total storage: Permanent (no expiration)`);
    console.log(`   Estimated cost: ~$0.005/MB (one-time payment)`);

    return {
      metadataUri,
      imageUrl: imageUri
    };
  } catch (error) {
    console.error('❌ Arweave NFT metadata creation error:', error);
    throw new Error(`Failed to create NFT metadata on Arweave: ${error.message}`);
  }
}

/**
 * Checks Arweave/Irys service status and wallet balance
 * Useful for health checks and monitoring
 *
 * @returns {Promise<{available: boolean, balance?: string, network?: string}>}
 */
export async function checkArweaveStatus() {
  try {
    const umi = createUmi(SOLANA_RPC_URL);
    const serverWallet = getServerWallet();
    const umiKeypair = umi.eddsa.createKeypairFromSecretKey(serverWallet.secretKey);
    umi.use(keypairIdentity(umiKeypair));

    const isDevnet = SOLANA_RPC_URL.includes('devnet');
    const irysAddress = isDevnet
      ? 'https://devnet.irys.xyz'
      : 'https://node2.irys.xyz';

    umi.use(irysUploader({
      address: irysAddress
    }));

    // Try to upload a tiny test blob
    const testData = JSON.stringify({ test: true, timestamp: Date.now() });
    const testUri = await umi.uploader.uploadJson({ test: true });

    console.log('✅ Arweave/Irys service is available');
    console.log(`   Network: ${isDevnet ? 'Devnet' : 'Mainnet'}`);
    console.log(`   Test upload: ${testUri}`);

    return {
      available: true,
      network: isDevnet ? 'devnet' : 'mainnet',
      irysNode: irysAddress
    };
  } catch (error) {
    console.error('❌ Arweave status check failed:', error);

    return {
      available: false,
      error: error.message
    };
  }
}

/**
 * Estimates the cost of uploading data to Arweave
 * Helps with budget planning and cost optimization
 *
 * @param {number} sizeInBytes - Size of data to upload
 * @returns {Promise<{estimatedCost: string, currency: string}>}
 */
export async function estimateArweaveUploadCost(sizeInBytes) {
  try {
    // Arweave pricing is approximately $5-7 per GB (as of 2024)
    // This varies based on network congestion and AR token price
    const costPerGB = 6.0; // USD
    const costPerByte = costPerGB / (1024 * 1024 * 1024);
    const estimatedCostUSD = sizeInBytes * costPerByte;

    console.log(`📊 Arweave cost estimate:`);
    console.log(`   Data size: ${(sizeInBytes / 1024).toFixed(2)} KB`);
    console.log(`   Estimated cost: $${estimatedCostUSD.toFixed(6)} USD (one-time)`);
    console.log(`   Note: Actual cost may vary based on network conditions`);

    return {
      estimatedCost: estimatedCostUSD.toFixed(6),
      currency: 'USD',
      sizeKB: (sizeInBytes / 1024).toFixed(2),
      note: 'One-time payment for permanent storage'
    };
  } catch (error) {
    console.error('❌ Cost estimation error:', error);
    throw new Error(`Failed to estimate upload cost: ${error.message}`);
  }
}
