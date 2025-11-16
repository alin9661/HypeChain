import express from 'express';
import { isValidSolanaPublicKey, validateBase64Image } from '../utils/validation.js';
import {
  verifyProduct,
  generateMarketingImage,
  downloadImageAsBase64
} from '../services/openrouter.js';
import { createAndUploadNFTMetadata } from '../services/ipfs.js';
import { mintNFT, listItemOnMarketplace } from '../services/solana.js';

const router = express.Router();

/**
 * POST /api/create-listing
 * Creates a new NFT listing with AI verification and image generation
 */
router.post('/create-listing', async (req, res) => {
  try {
    const { userWallet, productImage, optionalPriceSol } = req.body;

    console.log('🚀 Starting listing creation process...');

    // ========================================
    // STEP 0: Validate Request
    // ========================================
    console.log('📋 Step 0: Validating request...');

    if (!userWallet || !isValidSolanaPublicKey(userWallet)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid Solana wallet address'
      });
    }

    const imageValidation = validateBase64Image(productImage);
    if (!imageValidation.valid) {
      return res.status(400).json({
        success: false,
        error: imageValidation.error || 'Invalid image'
      });
    }

    console.log('✅ Request validation passed');

    // ========================================
    // STEP 1: OpenRouter Verification
    // ========================================
    console.log('🔍 Step 1: Verifying product with AI...');

    const verificationResult = await verifyProduct(productImage);

    console.log('Verification result:', {
      brand: verificationResult.product_identification.brand,
      model: verificationResult.product_identification.model,
      confidence: verificationResult.product_identification.confidence,
      liveness_score: verificationResult.liveness_check.liveness_score
    });

    if (verificationResult.liveness_check.liveness_score < 50) {
      return res.status(400).json({
        success: false,
        error: `Image appears inauthentic: ${verificationResult.liveness_check.reason}`
      });
    }

    console.log('✅ Product verification passed');

    // ========================================
    // STEP 2: Generate Marketing Image
    // ========================================
    console.log('🎨 Step 2: Generating AI marketing image...');

    const generatedImageUrl = await generateMarketingImage(
      verificationResult.full_description
    );

    console.log('Generated image URL:', generatedImageUrl);

    const generatedImageBase64 = await downloadImageAsBase64(generatedImageUrl);

    console.log('✅ Marketing image generated successfully');

    // ========================================
    // STEP 3: Upload to IPFS & Mint NFT
    // ========================================
    console.log('📦 Step 3: Uploading to IPFS and minting NFT...');

    const productName = [
      verificationResult.product_identification.brand,
      verificationResult.product_identification.model,
      verificationResult.product_identification.colorway
    ]
      .filter(Boolean)
      .join(' ') || verificationResult.full_description.substring(0, 50);

    const description = `Authentic ${verificationResult.product_identification.brand || 'luxury'} ${
      verificationResult.product_identification.model || 'item'
    } verified and minted on Solana. ${verificationResult.full_description}`;

    const attributes = [
      {
        trait_type: 'Brand',
        value: verificationResult.product_identification.brand || 'Unknown'
      },
      {
        trait_type: 'Model',
        value: verificationResult.product_identification.model || 'Unknown'
      },
      {
        trait_type: 'Colorway',
        value: verificationResult.product_identification.colorway || 'N/A'
      },
      {
        trait_type: 'Liveness Score',
        value: verificationResult.liveness_check.liveness_score
      },
      {
        trait_type: 'Verification Confidence',
        value: verificationResult.product_identification.confidence
      }
    ];

    const { metadataUri, imageUrl } = await createAndUploadNFTMetadata(
      generatedImageBase64,
      productName,
      description,
      attributes
    );

    console.log('Metadata URI:', metadataUri);
    console.log('Image URL:', imageUrl);

    const nftMintAddress = await mintNFT(userWallet, metadataUri, productName);

    console.log('NFT minted:', nftMintAddress);
    console.log('✅ NFT minted successfully');

    // ========================================
    // STEP 4: List on Marketplace
    // ========================================
    console.log('🏪 Step 4: Listing on marketplace...');

    const listingPrice = optionalPriceSol ?? 0;

    try {
      const listingSignature = await listItemOnMarketplace(
        nftMintAddress,
        listingPrice,
        userWallet
      );

      console.log('Listing signature:', listingSignature);
      console.log('✅ Item listed on marketplace');
    } catch (listingError) {
      console.warn('Marketplace listing failed (contract may not be deployed):', listingError);
    }

    // ========================================
    // Return Success Response
    // ========================================
    const successResponse = {
      success: true,
      nft_mint_address: nftMintAddress,
      nft_image_url: imageUrl,
      product_name: productName,
      listing_price_sol: listingPrice
    };

    console.log('🎉 Listing created successfully!');
    console.log('Response:', successResponse);

    return res.status(200).json(successResponse);
  } catch (error) {
    console.error('❌ Error creating listing:', error);

    const errorResponse = {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    };

    return res.status(500).json(errorResponse);
  }
});

/**
 * GET /api/create-listing
 * Returns API information
 */
router.get('/create-listing', (req, res) => {
  res.json({
    endpoint: '/api/create-listing',
    method: 'POST',
    description: 'Create a new NFT listing with AI verification',
    requiredFields: {
      userWallet: 'Solana public key',
      productImage: 'Base64 encoded image (max 5MB, JPEG/PNG)',
      optionalPriceSol: 'Price in SOL (optional, defaults to 0)'
    },
    example: {
      userWallet: 'ABC123...',
      productImage: 'data:image/jpeg;base64,...',
      optionalPriceSol: 0.5
    }
  });
});

export default router;
