import OpenAI from 'openai';
import { VerificationResponse } from '@/types/listing';

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';

if (!OPENROUTER_API_KEY) {
  throw new Error('OPENROUTER_API_KEY is not set in environment variables');
}

// Initialize OpenAI client configured for OpenRouter
const openai = new OpenAI({
  apiKey: OPENROUTER_API_KEY,
  baseURL: OPENROUTER_BASE_URL,
  defaultHeaders: {
    'HTTP-Referer': process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000',
    'X-Title': 'HypeChain NFT Marketplace'
  }
});

/**
 * Verifies product authenticity using GLM 4.6 vision model
 */
export async function verifyProduct(base64Image: string): Promise<VerificationResponse> {
  const verificationPrompt = `You are a luxury goods and streetwear expert. Analyze this image and return ONLY a clean JSON object with the following schema.

Identify the exact Brand, Model, and Colorway.
Provide a 'liveness_score' (0-100) based on visual cues (lighting, shadows, 3D depth, texture realism, reflections) estimating the likelihood this is a real, physical object vs. a screenshot, AI-generated image, or flat graphic. This is a best-effort guess; consider factors like blur, artifacts, or unnatural edges.
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

  try {
    const response = await openai.chat.completions.create({
      model: 'zhipuai/glm-4-plus', // GLM 4.6
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: verificationPrompt },
            {
              type: 'image_url',
              image_url: {
                url: base64Image
              }
            }
          ]
        }
      ],
      temperature: 0.1,
      max_tokens: 1000,
      response_format: { type: 'json_object' }
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('No response from verification model');
    }

    // Parse and validate the JSON response
    const verificationResult = JSON.parse(content) as VerificationResponse;

    // Validate required fields
    if (!verificationResult.product_identification ||
        !verificationResult.liveness_check ||
        !verificationResult.full_description) {
      throw new Error('Invalid verification response format');
    }

    return verificationResult;
  } catch (error) {
    console.error('Product verification error:', error);
    throw new Error(`Product verification failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Generates marketing image using GLM 4.6 image generation
 */
export async function generateMarketingImage(fullDescription: string): Promise<string> {
  const imagePrompt = `Generate a single, high-quality, photorealistic marketing image of the following product: ${fullDescription}.

The product must be the central focus, displayed prominently and realistically. Place it on a playful, crypto/web3-themed background. The background should be abstract and clean, featuring elements like:

- Subtle, glowing Solana-purple and green network lines forming blockchain-like patterns
- Soft, abstract geometric shapes (like interconnected blocks or nodes)
- A high-tech, minimalist aesthetic with faint digital grid overlays

Ensure the image is 1024x1024 pixels, in PNG format, with no compression artifacts. Do NOT include any text, logos, or human figures on the background or product.`;

  try {
    const response = await openai.images.generate({
      model: 'zhipuai/glm-4-plus', // GLM 4.6 for image generation
      prompt: imagePrompt,
      n: 1,
      size: '1024x1024',
      response_format: 'url'
    });

    const imageUrl = response.data[0]?.url;
    if (!imageUrl) {
      throw new Error('No image URL in response');
    }

    return imageUrl;
  } catch (error) {
    console.error('Image generation error:', error);

    // Retry once on failure
    try {
      console.log('Retrying image generation...');
      const retryResponse = await openai.images.generate({
        model: 'zhipuai/glm-4-plus',
        prompt: imagePrompt,
        n: 1,
        size: '1024x1024',
        response_format: 'url'
      });

      const retryImageUrl = retryResponse.data[0]?.url;
      if (!retryImageUrl) {
        throw new Error('No image URL in retry response');
      }

      return retryImageUrl;
    } catch (retryError) {
      console.error('Image generation retry failed:', retryError);
      throw new Error(`Image generation failed after retry: ${retryError instanceof Error ? retryError.message : 'Unknown error'}`);
    }
  }
}

/**
 * Downloads image from URL and converts to base64
 */
export async function downloadImageAsBase64(imageUrl: string): Promise<string> {
  try {
    const response = await fetch(imageUrl);
    if (!response.ok) {
      throw new Error(`Failed to download image: ${response.statusText}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const base64 = buffer.toString('base64');
    const mimeType = response.headers.get('content-type') || 'image/png';

    return `data:${mimeType};base64,${base64}`;
  } catch (error) {
    console.error('Image download error:', error);
    throw new Error(`Failed to download generated image: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}
