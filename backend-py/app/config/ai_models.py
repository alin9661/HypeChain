"""AI model registry for OpenRouter (vision verification + image generation).

Direct port of the Node `config/ai-models.js`. Defines every supported model,
their costs, and helpers used by `app/services/openrouter.py` for model lookup,
validation, and cost estimation.

Defaults read from typed settings (`HACKNYU_DEFAULT_VISION_MODEL` /
`HACKNYU_DEFAULT_IMAGE_GEN_MODEL`) and fall back to the same models the Express
service used (GPT-4o for vision, GPT-5 Image Mini for image gen).
"""

from __future__ import annotations

import math
from typing import Any

from app.config.settings import get_settings

# ---------------------------------------------------------------------------
# Vision models — product verification (Image-to-Text)
# ---------------------------------------------------------------------------
VISION_MODELS: dict[str, dict[str, Any]] = {
    "GLM_4_PLUS": {
        "id": "zhipuai/glm-4-plus",
        "name": "GLM 4.6 Plus",
        "provider": "ZhipuAI",
        "capabilities": ["vision", "json_mode"],
        "costPer1kTokens": {"input": 0.0005, "output": 0.0015},
        "maxTokens": 8192,
        "supportsImages": True,
        "recommendedFor": ["product_verification", "authenticity_check", "cost_sensitive"],
        "description": "High-performance vision model with strong product identification capabilities",
    },
    "GPT_4O": {
        "id": "openai/gpt-4o",
        "name": "GPT-4o",
        "provider": "OpenAI",
        "capabilities": ["vision", "high_accuracy", "multimodal", "json_mode"],
        "costPer1kTokens": {"input": 0.0025, "output": 0.01},
        "maxTokens": 4096,
        "supportsImages": True,
        "recommendedFor": ["high_value_items", "detailed_analysis", "luxury_goods", "general_use"],
        "description": "Latest OpenAI model with excellent vision capabilities and balanced cost",
    },
    "GPT_4_VISION": {
        "id": "openai/gpt-4-vision-preview",
        "name": "GPT-4 Vision",
        "provider": "OpenAI",
        "capabilities": ["vision", "high_accuracy"],
        "costPer1kTokens": {"input": 0.01, "output": 0.03},
        "maxTokens": 4096,
        "supportsImages": True,
        "recommendedFor": ["high_value_items", "detailed_analysis", "luxury_goods"],
        "description": "Premium vision model with exceptional accuracy for high-value product verification",
    },
    "CLAUDE_3_5_SONNET": {
        "id": "anthropic/claude-3.5-sonnet",
        "name": "Claude 3.5 Sonnet",
        "provider": "Anthropic",
        "capabilities": ["vision", "long_context", "detailed_reasoning"],
        "costPer1kTokens": {"input": 0.003, "output": 0.015},
        "maxTokens": 8192,
        "supportsImages": True,
        "recommendedFor": ["detailed_descriptions", "authenticity_analysis", "complex_items"],
        "description": "Advanced vision model with strong reasoning capabilities for complex verification tasks",
    },
    "GEMINI_PRO_VISION": {
        "id": "google/gemini-pro-vision",
        "name": "Gemini Pro Vision",
        "provider": "Google",
        "capabilities": ["vision", "multimodal", "fast_inference"],
        "costPer1kTokens": {"input": 0.00025, "output": 0.0005},
        "maxTokens": 2048,
        "supportsImages": True,
        "recommendedFor": ["batch_processing", "cost_optimization", "fast_verification"],
        "description": "Fast and cost-effective vision model for high-volume verification",
    },
}

# ---------------------------------------------------------------------------
# Image generation models — marketing/NFT artwork (Text-to-Image)
# ---------------------------------------------------------------------------
IMAGE_GENERATION_MODELS: dict[str, dict[str, Any]] = {
    "GPT_5_IMAGE_MINI": {
        "id": "openai/gpt-5-image-mini",
        "name": "GPT-5 Image Mini",
        "provider": "OpenAI",
        "capabilities": ["text_to_image", "high_quality", "fast_inference", "vibrant_colors"],
        "costPerImage": 0.04,
        "outputFormat": "png",
        "defaultSize": "1024x1024",
        "supportedSizes": ["512x512", "1024x1024", "1024x1792", "1792x1024"],
        "recommendedFor": [
            "nft_marketing",
            "blockchain_display",
            "futuristic_themes",
            "collector_appeal",
        ],
        "description": "Latest efficient OpenAI model optimized for high-resolution NFT artwork with vibrant colors and intricate patterns",
    },
    "GLM_4_PLUS": {
        "id": "zhipuai/glm-4-plus",
        "name": "GLM 4.6 Image Gen",
        "provider": "ZhipuAI",
        "capabilities": ["text_to_image", "photorealistic"],
        "costPerImage": 0.05,
        "outputFormat": "png",
        "defaultSize": "1024x1024",
        "supportedSizes": ["512x512", "1024x1024"],
        "recommendedFor": ["nft_marketing", "product_showcase", "cost_effective"],
        "description": "Cost-effective image generation with good photorealism",
    },
    "DALL_E_3": {
        "id": "openai/dall-e-3",
        "name": "DALL-E 3",
        "provider": "OpenAI",
        "capabilities": ["text_to_image", "high_quality", "detailed"],
        "costPerImage": 0.08,
        "outputFormat": "png",
        "defaultSize": "1024x1024",
        "supportedSizes": ["1024x1024", "1024x1792", "1792x1024"],
        "recommendedFor": ["premium_listings", "high_detail", "artistic"],
        "description": "Premium image generation with exceptional quality and detail",
    },
    "STABLE_DIFFUSION_XL": {
        "id": "stability-ai/stable-diffusion-xl",
        "name": "Stable Diffusion XL",
        "provider": "Stability AI",
        "capabilities": ["text_to_image", "customizable", "open_source"],
        "costPerImage": 0.03,
        "outputFormat": "png",
        "defaultSize": "1024x1024",
        "supportedSizes": ["512x512", "768x768", "1024x1024"],
        "recommendedFor": ["customization", "batch_generation", "cost_conscious"],
        "description": "Flexible open-source model with good quality at low cost",
    },
}


def get_vision_model(model_id: str | None) -> dict[str, Any] | None:
    """Return the vision model config matching `model_id`, or None."""
    if not model_id:
        return None
    for model in VISION_MODELS.values():
        if model["id"] == model_id:
            return model
    return None


def get_image_gen_model(model_id: str | None) -> dict[str, Any] | None:
    """Return the image-gen model config matching `model_id`, or None."""
    if not model_id:
        return None
    for model in IMAGE_GENERATION_MODELS.values():
        if model["id"] == model_id:
            return model
    return None


def get_default_vision_model() -> dict[str, Any]:
    """Default vision model: env-configured id if valid, else GPT-4o."""
    env_model = get_vision_model(get_settings().hacknyu_default_vision_model)
    if env_model:
        return env_model
    return VISION_MODELS["GPT_4O"]


def get_default_image_gen_model() -> dict[str, Any]:
    """Default image-gen model: env-configured id if valid, else GPT-5 Image Mini."""
    env_model = get_image_gen_model(get_settings().hacknyu_default_image_gen_model)
    if env_model:
        return env_model
    return IMAGE_GENERATION_MODELS["GPT_5_IMAGE_MINI"]


def is_valid_vision_model(model_id: str) -> bool:
    """True if `model_id` is a supported vision model."""
    return get_vision_model(model_id) is not None


def is_valid_image_gen_model(model_id: str) -> bool:
    """True if `model_id` is a supported image-generation model."""
    return get_image_gen_model(model_id) is not None


def get_all_vision_models() -> list[dict[str, Any]]:
    return list(VISION_MODELS.values())


def get_all_image_gen_models() -> list[dict[str, Any]]:
    return list(IMAGE_GENERATION_MODELS.values())


def estimate_verification_cost(model_id: str, estimated_tokens: int = 2000) -> float:
    """Estimate USD cost of a verification call (60% input / 40% output split)."""
    model = get_vision_model(model_id)
    if not model:
        return 0.0

    input_tokens = math.ceil(estimated_tokens * 0.6)
    output_tokens = math.ceil(estimated_tokens * 0.4)

    input_cost = (input_tokens / 1000) * model["costPer1kTokens"]["input"]
    output_cost = (output_tokens / 1000) * model["costPer1kTokens"]["output"]

    return input_cost + output_cost


def estimate_image_gen_cost(model_id: str, image_count: int = 1) -> float:
    """Estimate USD cost of generating `image_count` images with `model_id`."""
    model = get_image_gen_model(model_id)
    if not model:
        return 0.0
    return model["costPerImage"] * image_count
