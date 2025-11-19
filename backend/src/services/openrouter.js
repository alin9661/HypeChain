import OpenAI from 'openai';
import {
  getDefaultVisionModel,
  getDefaultImageGenModel,
  getVisionModel,
  getImageGenModel,
  isValidVisionModel,
  isValidImageGenModel,
  estimateVerificationCost,
  estimateImageGenCost
} from '../config/ai-models.js';
import {
  getCachedVerification,
  cacheVerification,
  getCachedImageUrl,
  cacheImageUrl
} from './cache.js';

const OPENROUTER_API_KEY = process.env.HACKNYU_OPENROUTER_API_KEY;
const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';

if (!OPENROUTER_API_KEY) {
  throw new Error('HACKNYU_OPENROUTER_API_KEY is not set in environment variables');
}

const openai = new OpenAI({
  apiKey: OPENROUTER_API_KEY,
  baseURL: OPENROUTER_BASE_URL,
  defaultHeaders: {
    'HTTP-Referer': process.env.HACKNYU_FRONTEND_URL || 'http://localhost:3000',
    'X-Title': 'HypeChain NFT Marketplace'
  }
});

/**
 * Enhanced error handling for OpenRouter API errors
 * @param {Error} error - The error object
 * @returns {string} User-friendly error message
 */
function handleOpenRouterError(error) {
  // Check for specific OpenRouter error codes
  if (error.status === 429) {
    return 'API rate limit exceeded. Please try again in a few moments.';
  }
  if (error.status === 401) {
    return 'Invalid API key. Please check your OpenRouter configuration.';
  }
  if (error.status === 402) {
    return 'Insufficient credits. Please add funds to your OpenRouter account.';
  }
  if (error.status === 503) {
    return 'Model temporarily unavailable. Please try a different model or retry later.';
  }

  // Return original error message for other cases
  return error.message || 'Unknown error occurred';
}

/**
 * Verify product with a specific AI model
 * @param {string} base64Image - Base64-encoded image
 * @param {string} modelId - Model ID to use (optional, defaults to GLM 4.6)
 * @returns {Promise<object>} Verification result
 */
export async function verifyProductWithModel(base64Image, modelId = null) {
  // Get model configuration
  const modelConfig = modelId ? getVisionModel(modelId) : getDefaultVisionModel();

  if (!modelConfig) {
    throw new Error(`Invalid or unsupported vision model: ${modelId}`);
  }

  // Check cache first
  const cachedResult = await getCachedVerification(base64Image, modelConfig.id);
  if (cachedResult) {
    console.log('[OpenRouter] Using cached verification result (saved API call)');
    return cachedResult;
  }

  const verificationPrompt = `You are a luxury goods and streetwear expert. Analyze this image and return ONLY a clean JSON object with the following schema.

Identify the exact Brand, Model, and Colorway.
Provide a 'liveness_score' (0-100) based on visual cues (lighting, shadows, 3D depth, texture realism, reflections) estimating the likelihood this is a real, physical object vs. a screenshot, AI-generated image, or flat graphic.
Extract any visible serial numbers, tags, or unique identifiers.
Provide a detailed full_description including size, condition, and any notable features if visible.

Return JSON in this exact format:
{
  "product_identification": {
    "brand": "string | null",
    "model": "string | null",
    "colorway": "string | null",
    "confidence": "high | medium | low"
  },
  "liveness_check": {
    "liveness_score": 0-100,
    "reason": "detailed explanation"
  },
  "visible_identifiers": {
    "serial_numbers": ["array of strings"],
    "tags": ["array of strings"]
  },
  "full_description": "detailed description"
}`;

  const startTime = Date.now();

  try {
    console.log(`[OpenRouter] Using model: ${modelConfig.name} (${modelConfig.id})`);
    console.log(`[OpenRouter] Estimated cost: $${estimateVerificationCost(modelConfig.id).toFixed(4)}`);

    const response = await openai.chat.completions.create({
      model: modelConfig.id,
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: verificationPrompt },
          { type: 'image_url', image_url: { url: base64Image } }
        ]
      }],
      temperature: 0.1,
      max_tokens: modelConfig.maxTokens || 1000,
      response_format: modelConfig.capabilities.includes('json_mode')
        ? { type: 'json_object' }
        : undefined
    });

    const processingTime = Date.now() - startTime;
    console.log(`[OpenRouter] Verification completed in ${processingTime}ms`);

    const content = response.choices[0]?.message?.content;
    if (!content) throw new Error('No response from verification model');

    // Strip markdown code fences if present (some models wrap JSON in ```json...```)
    let cleanedContent = content.trim();
    if (cleanedContent.startsWith('```json')) {
      cleanedContent = cleanedContent.replace(/^```json\s*/, '').replace(/```\s*$/, '');
    } else if (cleanedContent.startsWith('```')) {
      cleanedContent = cleanedContent.replace(/^```\s*/, '').replace(/```\s*$/, '');
    }

    const result = JSON.parse(cleanedContent.trim());
    if (!result.product_identification || !result.liveness_check || !result.full_description) {
      throw new Error('Invalid verification response format');
    }

    // Add metadata about the verification
    result._metadata = {
      model: modelConfig.name,
      modelId: modelConfig.id,
      provider: modelConfig.provider,
      processingTimeMs: processingTime,
      tokensUsed: response.usage?.total_tokens || 0,
      estimatedCost: estimateVerificationCost(modelConfig.id),
      cacheHit: false
    };

    // Cache the result for 24 hours
    await cacheVerification(base64Image, modelConfig.id, result);

    return result;
  } catch (error) {
    console.error('Product verification error:', error);
    const errorMessage = handleOpenRouterError(error);
    throw new Error(`Product verification failed with ${modelConfig.name}: ${errorMessage}`);
  }
}

/**
 * Verify product (backward compatible - uses default model)
 * @param {string} base64Image - Base64-encoded image
 * @returns {Promise<object>} Verification result
 */
export async function verifyProduct(base64Image) {
  // Use default model for backward compatibility
  return verifyProductWithModel(base64Image, null);
}

/**
 * Generate marketing image with a specific AI model
 * @param {string} fullDescription - Product description
 * @param {string} modelId - Model ID to use (optional, defaults to GLM 4.6)
 * @param {number} maxRetries - Maximum retry attempts (default: 5)
 * @returns {Promise<string>} Image URL
 */
export async function generateMarketingImageWithModel(fullDescription, modelId = null, maxRetries = 5) {
  // Get model configuration
  const modelConfig = modelId ? getImageGenModel(modelId) : getDefaultImageGenModel();

  if (!modelConfig) {
    throw new Error(`Invalid or unsupported image generation model: ${modelId}`);
  }

  const imagePrompt = `Generate a single, high-quality, photorealistic marketing image of: ${fullDescription}. Place it on a playful crypto/web3-themed background with Solana-purple and green network lines, abstract geometric shapes, and high-tech minimalist aesthetic. ${modelConfig.defaultSize} ${modelConfig.outputFormat.toUpperCase()}, no text or logos.`;

  // Check cache first
  const cachedImageUrl = await getCachedImageUrl(imagePrompt, modelConfig.id);
  if (cachedImageUrl) {
    console.log('[OpenRouter] Using cached image URL (saved API call)');
    return cachedImageUrl;
  }

  const startTime = Date.now();

  console.log(`[OpenRouter] Using image model: ${modelConfig.name} (${modelConfig.id})`);
  console.log(`[OpenRouter] Estimated cost: $${modelConfig.costPerImage.toFixed(4)}`);

  // Retry logic with exponential backoff
  const tryGenerate = async (attemptNumber = 1) => {
    try {
      console.log(`[OpenRouter] Image generation attempt ${attemptNumber}/${maxRetries}`);

      // OpenRouter uses chat completions endpoint with modalities for image generation
      const response = await openai.chat.completions.create({
        model: modelConfig.id,
        modalities: ["image", "text"],
        messages: [
          {
            role: "user",
            content: imagePrompt
          }
        ]
      });

      // Extract base64 image from chat response
      const imageData = response.choices[0]?.message?.images?.[0]?.image_url?.url;
      if (!imageData) throw new Error('No image data in response');

      // imageData is already a base64 data URL (data:image/png;base64,...)
      const imageUrl = imageData;

      const processingTime = Date.now() - startTime;
      console.log(`[OpenRouter] Image generated successfully in ${processingTime}ms`);

      // Cache the result for 7 days
      await cacheImageUrl(imagePrompt, modelConfig.id, imageUrl);

      return imageUrl;
    } catch (error) {
      if (attemptNumber >= maxRetries) {
        console.error(`[OpenRouter] Image generation failed after ${maxRetries} attempts`);
        const errorMessage = handleOpenRouterError(error);
        throw new Error(`Image generation failed with ${modelConfig.name}: ${errorMessage}`);
      }

      // Exponential backoff: 1s, 2s, 4s, 8s, 16s
      const backoffMs = Math.min(1000 * Math.pow(2, attemptNumber - 1), 16000);
      console.log(`[OpenRouter] Retrying in ${backoffMs}ms...`);
      await new Promise(resolve => setTimeout(resolve, backoffMs));

      return tryGenerate(attemptNumber + 1);
    }
  };

  return tryGenerate();
}

/**
 * Generate marketing image (backward compatible - uses default model)
 * @param {string} fullDescription - Product description
 * @returns {Promise<string>} Image URL
 */
export async function generateMarketingImage(fullDescription) {
  // Use default model for backward compatibility
  return generateMarketingImageWithModel(fullDescription, null);
}

export async function downloadImageAsBase64(imageUrl) {
  const response = await fetch(imageUrl);
  if (!response.ok) throw new Error(`Failed to download image: ${response.statusText}`);

  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const base64 = buffer.toString('base64');
  const mimeType = response.headers.get('content-type') || 'image/png';

  return `data:${mimeType};base64,${base64}`;
}
