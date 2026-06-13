import express from 'express';
import dotenv from 'dotenv';
import { isValidSolanaPublicKey, validateBase64Image } from '../utils/validation.js';
import { db } from '../db/index.js';
import {
  verifyProduct,
  verifyProductWithModel,
  generateMarketingImage,
  generateMarketingImageWithModel,
  downloadImageAsBase64
} from '../services/openrouter.js';
import { isValidVisionModel, isValidImageGenModel } from '../config/ai-models.js';
import { createAndUploadNFTMetadata } from '../services/ipfs.js';
import { mintNFT, listItemOnMarketplace, getServerWalletPublicKey } from '../services/solana.js';
import { mintCompressedNFT } from '../services/compressed-nft.js';
import { submitVerification, confidenceToBps } from '../services/verification.js';

dotenv.config();

const router = express.Router();

/**
 * POST /api/create-listing
 * Creates a new NFT listing with AI verification and image generation
 */
router.post('/create-listing', async (req, res) => {
  try {
    const {
      userWallet,
      userEmail,
      productImage,
      optionalPriceSol,
      verificationModelId,  // Optional: AI model for verification
      imageGenModelId,       // Optional: AI model for image generation
      useCompressedNFT = true,  // Default to compressed NFTs for cost savings
      custodial: custodialFlag = false  // Guest/custodial listing (server holds the NFT)
    } = req.body;

    // A custodial (guest) listing has the platform server wallet as the seller:
    // the NFT mints to it, it signs `list_evidence`, and `cosign-purchase`
    // co-signs `purchase_evidence` as it — the only path where a guest's item is
    // actually sellable (the buyer can't get a missing seller signature).
    const isCustodial = custodialFlag === true || custodialFlag === 'true';

    console.log('🚀 Starting listing creation process...');

    // ========================================
    // STEP 0: Validate Request
    // ========================================
    console.log('📋 Step 0: Validating request...');

    // A self-custody listing must belong to a real user wallet. A custodial
    // (guest) listing instead uses the platform server wallet, so no userWallet
    // is required — but the server keypair must be configured.
    let serverPubkey = null;
    if (isCustodial) {
      try {
        serverPubkey = getServerWalletPublicKey();
      } catch (err) {
        return res.status(503).json({
          success: false,
          error: 'Custodial listings are unavailable: server wallet is not configured',
          code: 'CUSTODIAL_UNAVAILABLE'
        });
      }
    } else {
      if (!userWallet) {
        return res.status(400).json({
          success: false,
          error: 'An account with a wallet is required to create a listing',
          code: 'ACCOUNT_REQUIRED'
        });
      }
      if (!isValidSolanaPublicKey(userWallet)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid Solana wallet address'
        });
      }
    }

    // The single identity that owns the minted NFT and is the on-chain seller.
    // Custodial → the server wallet (sellable via cosign); self-custody → the user.
    const sellerWallet = isCustodial ? serverPubkey : userWallet;

    const imageValidation = validateBase64Image(productImage);
    if (!imageValidation.valid) {
      return res.status(400).json({
        success: false,
        error: imageValidation.error || 'Invalid image'
      });
    }

    // Validate AI model IDs if provided
    if (verificationModelId && !isValidVisionModel(verificationModelId)) {
      return res.status(400).json({
        success: false,
        error: `Invalid verification model ID: ${verificationModelId}`
      });
    }

    if (imageGenModelId && !isValidImageGenModel(imageGenModelId)) {
      return res.status(400).json({
        success: false,
        error: `Invalid image generation model ID: ${imageGenModelId}`
      });
    }

    console.log('✅ Request validation passed');
    if (verificationModelId) {
      console.log(`   Using custom verification model: ${verificationModelId}`);
    }
    if (imageGenModelId) {
      console.log(`   Using custom image gen model: ${imageGenModelId}`);
    }

    // ========================================
    // STEP 1: OpenRouter Verification
    // ========================================
    console.log('🔍 Step 1: Verifying product with AI...');

    // Use model-specific function if model ID provided, otherwise use default
    const verificationResult = verificationModelId
      ? await verifyProductWithModel(productImage, verificationModelId)
      : await verifyProduct(productImage);

    console.log('Verification result:', {
      brand: verificationResult.product_identification.brand,
      model: verificationResult.product_identification.model,
      confidence: verificationResult.product_identification.confidence,
      liveness_score: verificationResult.liveness_check.liveness_score
    });

    // Log AI model metadata if available
    if (verificationResult._metadata) {
      console.log('AI metadata:', {
        model: verificationResult._metadata.model,
        processingTime: `${verificationResult._metadata.processingTimeMs}ms`,
        estimatedCost: `$${verificationResult._metadata.estimatedCost.toFixed(4)}`
      });
    }

    // Check if verification passed the liveness threshold
    if (verificationResult.liveness_check.liveness_score < 50) {
      const livenessScore = verificationResult.liveness_check.liveness_score;
      const reason = verificationResult.liveness_check.reason;

      console.error('❌ VERIFICATION FAILED - Image did not pass authenticity check');
      console.error(`   Liveness Score: ${livenessScore}/100 (minimum required: 50)`);
      console.error(`   Reason: ${reason}`);
      console.error('   NFT image generation CANCELLED - verification must pass first');

      return res.status(400).json({
        success: false,
        error: 'VERIFICATION FAILED: Image authenticity check did not pass',
        details: {
          verification_status: 'FAILED',
          liveness_score: livenessScore,
          minimum_required_score: 50,
          reason: reason,
          explanation: 'The uploaded image appears to be inauthentic. This could be because it is a screenshot, AI-generated image, flat graphic, or lacks physical depth cues like shadows, reflections, and realistic textures.',
          next_steps: [
            'Upload a photo of the actual physical product',
            'Ensure good lighting with visible shadows and reflections',
            'Take photo at an angle showing 3D depth',
            'Avoid screenshots or digital renders',
            'Make sure the image shows real-world context'
          ],
          image_generation_status: 'CANCELLED',
          note: 'NFT image generation will not proceed until verification passes'
        }
      });
    }

    console.log('✅ Product verification passed');
    console.log(`   Liveness Score: ${verificationResult.liveness_check.liveness_score}/100`);

    // ========================================
    // STEP 2: Generate NFT Image
    // ========================================
    console.log('🎨 Step 2: Generating NFT image with GPT-5 Image Mini...');

    // Extract item name from verification result
    const itemName = [
      verificationResult.product_identification.brand,
      verificationResult.product_identification.model,
      verificationResult.product_identification.colorway
    ]
      .filter(Boolean)
      .join(' ') || verificationResult.full_description.substring(0, 50);

    // Create NFT-style prompt using the item name
    const nftPrompt = `Create a vibrant digital NFT artwork of ${itemName}. Style: modern digital art, blockchain aesthetic, 3D rendered, holographic elements, glowing effects, futuristic, premium quality. Background: abstract geometric shapes with Solana purple gradients, neon accents, cyber aesthetic. High resolution, suitable for NFT collection.`;

    console.log('NFT prompt:', nftPrompt);

    // Always use GPT-5 Image Mini for consistent NFT generation
    const generatedImageUrl = await generateMarketingImageWithModel(nftPrompt, 'openai/gpt-5-image-mini');

    console.log('Generated NFT image URL:', generatedImageUrl);

    const generatedImageBase64 = await downloadImageAsBase64(generatedImageUrl);

    console.log('✅ NFT image generated successfully with GPT-5 Image Mini');

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

    // ========================================
    // STEP 3.5: Mint NFT (Compressed or Standard)
    // ========================================
    let nftMintAddress;
    let isCompressed = false;
    let merkleTreeAddress = null;
    let leafIndex = null;

    // Custodial listings MUST be standard NFTs: the cosign-purchase flow
    // transfers a standard SPL token out of the server wallet's ATA, which a
    // compressed NFT (no per-asset mint/ATA) cannot satisfy. Force standard.
    const wantCompressed = useCompressedNFT && !isCustodial;

    if (wantCompressed) {
      console.log('📦 Attempting to mint as Compressed NFT (cNFT)...');
      const treeAddress = process.env.HACKNYU_MERKLE_TREE_ADDRESS;

      if (!treeAddress || treeAddress === 'your_merkle_tree_address_here') {
        console.warn('⚠️  HACKNYU_MERKLE_TREE_ADDRESS not configured.');
        console.warn('   Falling back to standard NFT minting.');

        nftMintAddress = await mintNFT(sellerWallet, metadataUri, productName);
        isCompressed = false;
      } else {
        try {
          const result = await mintCompressedNFT(
            sellerWallet,
            metadataUri,
            productName,
            treeAddress
          );

          nftMintAddress = result.assetId;
          merkleTreeAddress = result.merkleTree;
          leafIndex = result.leafIndex;
          isCompressed = true;

          console.log('✅ Compressed NFT minted successfully!');
          console.log(`   Asset ID: ${nftMintAddress}`);
          console.log(`   💰 Cost saved: ~99.98% vs standard NFT (~$0.001 vs ~$5.00)`);
        } catch (cNFTError) {
          console.error('⚠️  Compressed NFT minting failed:', cNFTError.message);
          console.warn('   Falling back to standard NFT minting...');

          nftMintAddress = await mintNFT(sellerWallet, metadataUri, productName);
          isCompressed = false;
        }
      }
    } else {
      console.log(`📦 Minting as Standard NFT${isCustodial ? ' (custodial)' : ''}...`);
      nftMintAddress = await mintNFT(sellerWallet, metadataUri, productName);
      isCompressed = false;
    }

    console.log('NFT minted:', nftMintAddress);
    console.log(`   Type: ${isCompressed ? 'Compressed NFT (cNFT)' : 'Standard NFT'}`);
    console.log(`✅ NFT minted successfully to ${isCustodial ? 'custodial server wallet' : 'user wallet'}`);

    // ========================================
    // STEP 4: Save Listing to Database
    // ========================================
    console.log('💾 Step 4: Saving listing to database...');

    const listingPrice = optionalPriceSol ?? 0;

    // Resolve the seller's user id (null for a custodial/guest or orphan seller).
    const sellerUserId = isCustodial ? null : await db.getUserIdByWallet(userWallet);

    const listingData = {
      nft_mint_address: nftMintAddress,
      seller_wallet: sellerWallet,
      seller_user_id: sellerUserId,
      product_name: productName,
      description: description,
      category: verificationResult.product_identification.brand || 'Luxury Goods',
      condition: 'Verified Authentic',
      image_url: imageUrl,
      metadata_uri: metadataUri,
      price_sol: listingPrice,
      status: 'active',
      ai_verified: true,
      ai_confidence_score: verificationResult.product_identification.confidence,
      // Custodial/guest listings record the claim email + the custodial wallet so
      // the buyer flow uses cosign and a guest can later claim the proceeds.
      guest_email: isCustodial ? (userEmail || null) : null,
      is_pending_claim: isCustodial,
      platform_wallet: isCustodial ? serverPubkey : null,
      // Add compressed NFT fields
      is_compressed: isCompressed,
      merkle_tree_address: merkleTreeAddress,
      leaf_index: leafIndex
    };

    let listing;
    try {
      listing = await db.insertListing(listingData);
    } catch (dbError) {
      console.error('Database error:', dbError);
      throw new Error(`Failed to save listing to database: ${dbError.message}`);
    }

    console.log('✅ Listing saved to database with ID:', listing.id);

    // ========================================
    // STEP 4.5: Anchor AI verification on-chain
    // ========================================
    // The off-chain AI verdict already passed — now anchor it as a
    // `VerificationProof` PDA so the redacted-field reveal can prove the
    // confidence score wasn't tampered with.  Skipping a standard NFT is
    // currently not supported (cNFT mints don't surface a regular mint
    // pubkey the program can key off of); compressed listings stay in the
    // Supabase-only path until cNFT support lands on-chain.
    let verificationResult2 = null;
    if (!isCompressed && process.env.HACKNYU_MARKETPLACE_PROGRAM_ID) {
      try {
        const confidenceBps = confidenceToBps(
          verificationResult.product_identification.confidence
        );
        const livenessPassed =
          verificationResult.liveness_check.liveness_score >= 50;
        verificationResult2 = await submitVerification({
          nftMint: nftMintAddress,
          confidenceBps,
          modelName:
            verificationResult._metadata?.model?.split('/').pop() || 'VISION',
          livenessPassed,
        });
        console.log('✅ VerificationProof PDA:', verificationResult2.verificationPda);
      } catch (verifyError) {
        console.warn(
          '⚠️ submit_verification failed (on-chain proof not written):',
          verifyError.message
        );
      }
    }

    // ========================================
    // STEP 5: List on Marketplace
    // ========================================
    // listItemOnMarketplace detects mode by comparing sellerWallet to the
    // server wallet: a CUSTODIAL listing (sellerWallet === server) is fully
    // signed server-side here and is immediately purchasable via cosign; a
    // self-custody listing returns an unsigned hint the frontend signs itself.
    let marketplaceResult = null;
    if (verificationResult2 && !isCompressed) {
      console.log('🏪 Step 5: Listing on marketplace...');
      try {
        marketplaceResult = await listItemOnMarketplace(
          nftMintAddress,
          listingPrice,
          sellerWallet
        );
        console.log('Marketplace result:', marketplaceResult);
      } catch (listingError) {
        console.warn('Marketplace listing failed:', listingError.message);
      }
    } else {
      console.log(
        '⏸️  Step 5: Skipping on-chain listing (no proof or compressed NFT)'
      );
    }

    // ========================================
    // Return Success Response
    // ========================================
    const successResponse = {
      success: true,
      listing_id: listing.id,
      nft_mint_address: nftMintAddress,
      nft_image_url: imageUrl,
      product_name: productName,
      listing_price_sol: listingPrice,
      status: 'active',
      is_pending_claim: false,
      message: 'NFT minted and listed successfully!',
      verification: {
        brand: verificationResult.product_identification.brand,
        model: verificationResult.product_identification.model,
        confidence: verificationResult.product_identification.confidence,
        liveness_score: verificationResult.liveness_check.liveness_score
      }
    };

    console.log('🎉 Listing created successfully!');
    console.log('Response:', successResponse);

    return res.status(200).json(successResponse);
  } catch (error) {
    console.error('❌ CRITICAL ERROR - Listing creation failed');
    console.error('Error details:', error);
    console.error('Stack trace:', error instanceof Error ? error.stack : 'No stack trace available');

    // Determine which step failed based on error message
    let failureStep = 'Unknown';
    let verboseExplanation = 'An unexpected error occurred during the listing creation process.';
    let possibleCauses = [];

    const errorMessage = error instanceof Error ? error.message : String(error);

    if (errorMessage.includes('verification') || errorMessage.includes('vision')) {
      failureStep = 'Step 1: AI Verification';
      verboseExplanation = 'The AI vision model failed to verify your product image.';
      possibleCauses = [
        'OpenRouter API key is invalid or expired',
        'Vision model is temporarily unavailable',
        'Image format is not supported by the vision model',
        'Insufficient credits in OpenRouter account',
        'Network connectivity issues with OpenRouter API'
      ];
    } else if (errorMessage.includes('image generation') || errorMessage.includes('Image generation') || errorMessage.includes('GPT-5')) {
      failureStep = 'Step 2: NFT Image Generation';
      verboseExplanation = 'The GPT-5 Image Mini model failed to generate the NFT artwork.';
      possibleCauses = [
        'OpenRouter API key is invalid or expired',
        'GPT-5 Image Mini model is temporarily unavailable',
        'Insufficient credits in OpenRouter account for image generation ($0.04 per image)',
        'Network connectivity issues with OpenRouter API',
        'Image generation request timed out after maximum retries'
      ];
    } else if (errorMessage.includes('IPFS') || errorMessage.includes('nft.storage')) {
      failureStep = 'Step 3: IPFS Upload';
      verboseExplanation = 'Failed to upload the NFT metadata and image to IPFS.';
      possibleCauses = [
        'nft.storage API key is invalid or expired',
        'IPFS upload service is temporarily unavailable',
        'Image file size exceeds IPFS limits',
        'Network connectivity issues with nft.storage'
      ];
    } else if (errorMessage.includes('mint') || errorMessage.includes('NFT') || errorMessage.includes('Solana')) {
      failureStep = 'Step 3: NFT Minting';
      verboseExplanation = 'Failed to mint the NFT on Solana blockchain.';
      possibleCauses = [
        'Solana wallet configuration is invalid',
        'Insufficient USDC for transaction fees',
        'Solana network congestion or downtime',
        'Metaplex minting service issues',
        'Invalid wallet address provided'
      ];
    } else if (errorMessage.includes('database') || errorMessage.includes('Supabase')) {
      failureStep = 'Step 4: Database Storage';
      verboseExplanation = 'Failed to save the listing to the database.';
      possibleCauses = [
        'Supabase connection is invalid or expired',
        'Database schema mismatch',
        'Network connectivity issues with Supabase',
        'Database permissions issue'
      ];
    }

    const errorResponse = {
      success: false,
      error: errorMessage,
      failure_details: {
        failed_at: failureStep,
        explanation: verboseExplanation,
        possible_causes: possibleCauses,
        timestamp: new Date().toISOString(),
        note: 'Please check your API keys, network connection, and service statuses. If using image generation, ensure you have sufficient OpenRouter credits ($0.04 per image).'
      }
    };

    console.error('Returning error response:', errorResponse);
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
    description: 'Create a new NFT listing with AI verification and NFT image generation - account with wallet required',
    requiredFields: {
      productImage: 'Base64 encoded image (max 5MB, JPEG/PNG)',
      userWallet: 'Solana public key of the seller account (required - no guest listings)'
    },
    optionalFields: {
      userEmail: 'Email address for notifications',
      optionalPriceSol: 'Price in USDC (defaults to 0)',
      verificationModelId: 'AI model for verification (defaults to zhipuai/glm-4-plus)',
      imageGenModelId: 'DEPRECATED - NFT images always generated with openai/gpt-5-image-mini'
    },
    supportedVisionModels: [
      'zhipuai/glm-4-plus (default - cost-effective)',
      'openai/gpt-4-vision-preview (premium - high accuracy)',
      'anthropic/claude-3.5-sonnet (advanced reasoning)',
      'google/gemini-pro-vision (fast and cheap)'
    ],
    imageGenerationModel: 'openai/gpt-5-image-mini (fixed - generates NFTified artwork from item name)',
    imageGenerationStyle: 'Digital NFT artwork with blockchain aesthetic, 3D rendered, holographic elements',
    example: {
      userWallet: 'ABC123...',
      productImage: 'data:image/jpeg;base64,...',
      optionalPriceSol: 0.5,
      verificationModelId: 'openai/gpt-4-vision-preview'
    }
  });
});

export default router;
