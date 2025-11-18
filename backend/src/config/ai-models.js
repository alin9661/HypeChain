/**
 * AI Models Configuration
 * Defines all supported models for verification and image generation via OpenRouter
 */

/**
 * Vision Models - Used for product verification (Image-to-Text)
 */
export const VISION_MODELS = {
  // GLM 4.6 - Default, cost-effective Chinese model with excellent vision capabilities
  GLM_4_PLUS: {
    id: 'zhipuai/glm-4-plus',
    name: 'GLM 4.6 Plus',
    provider: 'ZhipuAI',
    capabilities: ['vision', 'json_mode'],
    costPer1kTokens: {
      input: 0.0005,  // $0.0005 per 1K input tokens
      output: 0.0015  // $0.0015 per 1K output tokens
    },
    maxTokens: 8192,
    supportsImages: true,
    recommendedFor: ['product_verification', 'authenticity_check', 'cost_sensitive'],
    description: 'High-performance vision model with strong product identification capabilities',
  },

  // GPT-4o - Latest OpenAI multimodal model with vision
  GPT_4O: {
    id: 'openai/gpt-4o',
    name: 'GPT-4o',
    provider: 'OpenAI',
    capabilities: ['vision', 'high_accuracy', 'multimodal', 'json_mode'],
    costPer1kTokens: {
      input: 0.0025,   // $0.0025 per 1K input tokens
      output: 0.01     // $0.01 per 1K output tokens
    },
    maxTokens: 4096,
    supportsImages: true,
    recommendedFor: ['high_value_items', 'detailed_analysis', 'luxury_goods', 'general_use'],
    description: 'Latest OpenAI model with excellent vision capabilities and balanced cost',
  },

  // GPT-4 Vision - Premium OpenAI model with superior accuracy
  GPT_4_VISION: {
    id: 'openai/gpt-4-vision-preview',
    name: 'GPT-4 Vision',
    provider: 'OpenAI',
    capabilities: ['vision', 'high_accuracy'],
    costPer1kTokens: {
      input: 0.01,   // $0.01 per 1K input tokens
      output: 0.03   // $0.03 per 1K output tokens
    },
    maxTokens: 4096,
    supportsImages: true,
    recommendedFor: ['high_value_items', 'detailed_analysis', 'luxury_goods'],
    description: 'Premium vision model with exceptional accuracy for high-value product verification',
  },

  // Claude 3.5 Sonnet - Anthropic's latest vision model
  CLAUDE_3_5_SONNET: {
    id: 'anthropic/claude-3.5-sonnet',
    name: 'Claude 3.5 Sonnet',
    provider: 'Anthropic',
    capabilities: ['vision', 'long_context', 'detailed_reasoning'],
    costPer1kTokens: {
      input: 0.003,  // $0.003 per 1K input tokens
      output: 0.015  // $0.015 per 1K output tokens
    },
    maxTokens: 8192,
    supportsImages: true,
    recommendedFor: ['detailed_descriptions', 'authenticity_analysis', 'complex_items'],
    description: 'Advanced vision model with strong reasoning capabilities for complex verification tasks',
  },

  // Gemini Pro Vision - Google's multimodal model
  GEMINI_PRO_VISION: {
    id: 'google/gemini-pro-vision',
    name: 'Gemini Pro Vision',
    provider: 'Google',
    capabilities: ['vision', 'multimodal', 'fast_inference'],
    costPer1kTokens: {
      input: 0.00025, // $0.00025 per 1K input tokens
      output: 0.0005  // $0.0005 per 1K output tokens
    },
    maxTokens: 2048,
    supportsImages: true,
    recommendedFor: ['batch_processing', 'cost_optimization', 'fast_verification'],
    description: 'Fast and cost-effective vision model for high-volume verification',
  },
};

/**
 * Image Generation Models - Used for creating marketing images (Text-to-Image)
 */
export const IMAGE_GENERATION_MODELS = {
  // GPT-5 Image Mini - Default image generation (OpenAI's latest efficient model)
  GPT_5_IMAGE_MINI: {
    id: 'openai/gpt-5-image-mini',
    name: 'GPT-5 Image Mini',
    provider: 'OpenAI',
    capabilities: ['text_to_image', 'high_quality', 'fast_inference', 'vibrant_colors'],
    costPerImage: 0.04, // $0.04 per image (estimated)
    outputFormat: 'png',
    defaultSize: '1024x1024',
    supportedSizes: ['512x512', '1024x1024', '1024x1792', '1792x1024'],
    recommendedFor: ['nft_marketing', 'blockchain_display', 'futuristic_themes', 'collector_appeal'],
    description: 'Latest efficient OpenAI model optimized for high-resolution NFT artwork with vibrant colors and intricate patterns',
  },

  // GLM 4.6 - Alternative image generation
  GLM_4_PLUS: {
    id: 'zhipuai/glm-4-plus',
    name: 'GLM 4.6 Image Gen',
    provider: 'ZhipuAI',
    capabilities: ['text_to_image', 'photorealistic'],
    costPerImage: 0.05, // $0.05 per image
    outputFormat: 'png',
    defaultSize: '1024x1024',
    supportedSizes: ['512x512', '1024x1024'],
    recommendedFor: ['nft_marketing', 'product_showcase', 'cost_effective'],
    description: 'Cost-effective image generation with good photorealism',
  },

  // DALL-E 3 - Premium OpenAI image generation
  DALL_E_3: {
    id: 'openai/dall-e-3',
    name: 'DALL-E 3',
    provider: 'OpenAI',
    capabilities: ['text_to_image', 'high_quality', 'detailed'],
    costPerImage: 0.08, // $0.08 per 1024x1024 image
    outputFormat: 'png',
    defaultSize: '1024x1024',
    supportedSizes: ['1024x1024', '1024x1792', '1792x1024'],
    recommendedFor: ['premium_listings', 'high_detail', 'artistic'],
    description: 'Premium image generation with exceptional quality and detail',
  },

  // Stable Diffusion XL - Open-source high-quality generation
  STABLE_DIFFUSION_XL: {
    id: 'stability-ai/stable-diffusion-xl',
    name: 'Stable Diffusion XL',
    provider: 'Stability AI',
    capabilities: ['text_to_image', 'customizable', 'open_source'],
    costPerImage: 0.03, // $0.03 per image
    outputFormat: 'png',
    defaultSize: '1024x1024',
    supportedSizes: ['512x512', '768x768', '1024x1024'],
    recommendedFor: ['customization', 'batch_generation', 'cost_conscious'],
    description: 'Flexible open-source model with good quality at low cost',
  },
};

/**
 * Get default vision model
 */
export function getDefaultVisionModel() {
  // Check environment variable first
  const envModelId = process.env.HACKNYU_DEFAULT_VISION_MODEL;
  if (envModelId) {
    const envModel = getVisionModel(envModelId);
    if (envModel) return envModel;
  }
  // Fallback to GPT-4o as default
  return VISION_MODELS.GPT_4O;
}

/**
 * Get default image generation model
 */
export function getDefaultImageGenModel() {
  // Check environment variable first
  const envModelId = process.env.HACKNYU_DEFAULT_IMAGE_GEN_MODEL;
  if (envModelId) {
    const envModel = getImageGenModel(envModelId);
    if (envModel) return envModel;
  }
  // Fallback to GPT-5 Image Mini as default
  return IMAGE_GENERATION_MODELS.GPT_5_IMAGE_MINI;
}

/**
 * Get vision model by ID
 * @param {string} modelId - The model ID (e.g., 'zhipuai/glm-4-plus')
 * @returns {object|null} Model configuration or null if not found
 */
export function getVisionModel(modelId) {
  return Object.values(VISION_MODELS).find(model => model.id === modelId) || null;
}

/**
 * Get image generation model by ID
 * @param {string} modelId - The model ID
 * @returns {object|null} Model configuration or null if not found
 */
export function getImageGenModel(modelId) {
  return Object.values(IMAGE_GENERATION_MODELS).find(model => model.id === modelId) || null;
}

/**
 * Validate if a model ID is supported for vision tasks
 * @param {string} modelId - The model ID to validate
 * @returns {boolean} True if model is supported
 */
export function isValidVisionModel(modelId) {
  return getVisionModel(modelId) !== null;
}

/**
 * Validate if a model ID is supported for image generation
 * @param {string} modelId - The model ID to validate
 * @returns {boolean} True if model is supported
 */
export function isValidImageGenModel(modelId) {
  return getImageGenModel(modelId) !== null;
}

/**
 * Get all available vision models
 * @returns {Array} Array of vision model configurations
 */
export function getAllVisionModels() {
  return Object.values(VISION_MODELS);
}

/**
 * Get all available image generation models
 * @returns {Array} Array of image generation model configurations
 */
export function getAllImageGenModels() {
  return Object.values(IMAGE_GENERATION_MODELS);
}

/**
 * Calculate estimated cost for verification
 * @param {string} modelId - Vision model ID
 * @param {number} estimatedTokens - Estimated tokens (default: 2000)
 * @returns {number} Estimated cost in USD
 */
export function estimateVerificationCost(modelId, estimatedTokens = 2000) {
  const model = getVisionModel(modelId);
  if (!model) return 0;

  // Estimate 60% input, 40% output token distribution
  const inputTokens = Math.ceil(estimatedTokens * 0.6);
  const outputTokens = Math.ceil(estimatedTokens * 0.4);

  const inputCost = (inputTokens / 1000) * model.costPer1kTokens.input;
  const outputCost = (outputTokens / 1000) * model.costPer1kTokens.output;

  return inputCost + outputCost;
}

/**
 * Calculate estimated cost for image generation
 * @param {string} modelId - Image generation model ID
 * @param {number} imageCount - Number of images to generate
 * @returns {number} Estimated cost in USD
 */
export function estimateImageGenCost(modelId, imageCount = 1) {
  const model = getImageGenModel(modelId);
  if (!model) return 0;

  return model.costPerImage * imageCount;
}

/**
 * Get model recommendations based on use case
 * @param {string} useCase - Use case: 'high_value', 'cost_effective', 'fast', 'detailed'
 * @returns {object} Recommended models for verification and generation
 */
export function getRecommendedModels(useCase) {
  const recommendations = {
    high_value: {
      vision: VISION_MODELS.GPT_4_VISION,
      imageGen: IMAGE_GENERATION_MODELS.DALL_E_3,
      description: 'Premium models for high-value items requiring maximum accuracy',
    },
    cost_effective: {
      vision: VISION_MODELS.GEMINI_PRO_VISION,
      imageGen: IMAGE_GENERATION_MODELS.STABLE_DIFFUSION_XL,
      description: 'Budget-friendly models with good quality',
    },
    fast: {
      vision: VISION_MODELS.GEMINI_PRO_VISION,
      imageGen: IMAGE_GENERATION_MODELS.GPT_5_IMAGE_MINI,
      description: 'Fast inference for time-sensitive operations',
    },
    detailed: {
      vision: VISION_MODELS.CLAUDE_3_5_SONNET,
      imageGen: IMAGE_GENERATION_MODELS.DALL_E_3,
      description: 'Best for complex items requiring detailed analysis',
    },
    default: {
      vision: VISION_MODELS.GLM_4_PLUS,
      imageGen: IMAGE_GENERATION_MODELS.GPT_5_IMAGE_MINI,
      description: 'Balanced performance and cost',
    },
  };

  return recommendations[useCase] || recommendations.default;
}

export default {
  VISION_MODELS,
  IMAGE_GENERATION_MODELS,
  getDefaultVisionModel,
  getDefaultImageGenModel,
  getVisionModel,
  getImageGenModel,
  isValidVisionModel,
  isValidImageGenModel,
  getAllVisionModels,
  getAllImageGenModels,
  estimateVerificationCost,
  estimateImageGenCost,
  getRecommendedModels,
};
