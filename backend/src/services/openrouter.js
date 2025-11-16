import OpenAI from 'openai';

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';

if (!OPENROUTER_API_KEY) {
  throw new Error('OPENROUTER_API_KEY is not set in environment variables');
}

const openai = new OpenAI({
  apiKey: OPENROUTER_API_KEY,
  baseURL: OPENROUTER_BASE_URL,
  defaultHeaders: {
    'HTTP-Referer': process.env.FRONTEND_URL || 'http://localhost:3000',
    'X-Title': 'HypeChain NFT Marketplace'
  }
});

export async function verifyProduct(base64Image) {
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

  try {
    const response = await openai.chat.completions.create({
      model: 'zhipuai/glm-4-plus',
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: verificationPrompt },
          { type: 'image_url', image_url: { url: base64Image } }
        ]
      }],
      temperature: 0.1,
      max_tokens: 1000,
      response_format: { type: 'json_object' }
    });

    const content = response.choices[0]?.message?.content;
    if (!content) throw new Error('No response from verification model');

    const result = JSON.parse(content);
    if (!result.product_identification || !result.liveness_check || !result.full_description) {
      throw new Error('Invalid verification response format');
    }

    return result;
  } catch (error) {
    console.error('Product verification error:', error);
    throw new Error(`Product verification failed: ${error.message}`);
  }
}

export async function generateMarketingImage(fullDescription) {
  const imagePrompt = `Generate a single, high-quality, photorealistic marketing image of: ${fullDescription}. Place it on a playful crypto/web3-themed background with Solana-purple and green network lines, abstract geometric shapes, and high-tech minimalist aesthetic. 1024x1024 PNG, no text or logos.`;

  const tryGenerate = async () => {
    const response = await openai.images.generate({
      model: 'zhipuai/glm-4-plus',
      prompt: imagePrompt,
      n: 1,
      size: '1024x1024',
      response_format: 'url'
    });
    return response.data[0]?.url;
  };

  try {
    const imageUrl = await tryGenerate();
    if (!imageUrl) throw new Error('No image URL in response');
    return imageUrl;
  } catch (error) {
    console.log('Retrying image generation...');
    const imageUrl = await tryGenerate();
    if (!imageUrl) throw new Error('Image generation failed after retry');
    return imageUrl;
  }
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
