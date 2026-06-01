"""OpenRouter AI service: product verification + NFT image generation.

Async port of Node `services/openrouter.js`, using the `openai` SDK pointed at
the OpenRouter base URL (same custom `base_url` + headers as the Node client).
The client is a lazily-initialised module-level singleton reused across warm
Lambda invocations.

Public surface (parity with Express):
  - verify_product(base64_image)
  - verify_product_with_model(base64_image, model_id=None)
  - generate_marketing_image_with_model(full_description, model_id=None, max_retries=5)
  - download_image_as_base64(image_url)

Caching: verification results 24h, generated image URLs 7d, both content-keyed.
"""

from __future__ import annotations

import asyncio
import base64
import json
import logging
import re
import time
from typing import Any

import httpx
from openai import AsyncOpenAI

from app.config.ai_models import (
    estimate_verification_cost,
    get_default_image_gen_model,
    get_default_vision_model,
    get_image_gen_model,
    get_vision_model,
)
from app.config.settings import get_settings
from app.services import cache

logger = logging.getLogger(__name__)

OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"

_client: AsyncOpenAI | None = None


class VerificationError(Exception):
    """Raised when product verification fails."""


class ImageGenError(Exception):
    """Raised when NFT/marketing image generation fails."""


def _get_client() -> AsyncOpenAI:
    """Return the shared AsyncOpenAI client targeting OpenRouter (lazy singleton)."""
    global _client
    if _client is not None:
        return _client

    settings = get_settings()
    if not settings.hacknyu_openrouter_api_key:
        raise VerificationError(
            "HACKNYU_OPENROUTER_API_KEY is not set in environment variables"
        )

    _client = AsyncOpenAI(
        api_key=settings.hacknyu_openrouter_api_key,
        base_url=OPENROUTER_BASE_URL,
        # Disable SDK-level retries — image generation owns its own
        # retry/backoff loop (parity with the Express service), and verification
        # surfaces errors directly without silent retries.
        max_retries=0,
        default_headers={
            "HTTP-Referer": settings.hacknyu_frontend_url or "http://localhost:3000",
            "X-Title": "HypeChain NFT Marketplace",
        },
    )
    return _client


def reset_client() -> None:
    """Reset the module-level singleton. Test-only helper."""
    global _client
    _client = None


def _handle_openrouter_error(error: Exception) -> str:
    """Map an OpenRouter/OpenAI error to a user-friendly message (parity port)."""
    status = getattr(error, "status_code", None)
    if status == 429:
        return "API rate limit exceeded. Please try again in a few moments."
    if status == 401:
        return "Invalid API key. Please check your OpenRouter configuration."
    if status == 402:
        return "Insufficient credits. Please add funds to your OpenRouter account."
    if status == 503:
        return "Model temporarily unavailable. Please try a different model or retry later."
    return str(error) or "Unknown error occurred"


_VERIFICATION_PROMPT = """You are a luxury goods and streetwear expert. Analyze this image and return ONLY a clean JSON object with the following schema.

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
}"""


def _strip_code_fences(content: str) -> str:
    """Strip leading/trailing markdown code fences some models wrap JSON in."""
    cleaned = content.strip()
    if cleaned.startswith("```json"):
        cleaned = re.sub(r"^```json\s*", "", cleaned)
        cleaned = re.sub(r"```\s*$", "", cleaned)
    elif cleaned.startswith("```"):
        cleaned = re.sub(r"^```\s*", "", cleaned)
        cleaned = re.sub(r"```\s*$", "", cleaned)
    return cleaned.strip()


async def verify_product_with_model(
    base64_image: str,
    model_id: str | None = None,
) -> dict[str, Any]:
    """Verify a product image with a specific vision model.

    Returns the parsed verification result with `product_identification`,
    `liveness_check`, `full_description`, and an appended `_metadata` block.
    Cached for 24h, keyed on the image + model id.
    """
    model_config = get_vision_model(model_id) if model_id else get_default_vision_model()
    if not model_config:
        raise VerificationError(f"Invalid or unsupported vision model: {model_id}")

    cached_result = await cache.get_cached_verification(base64_image, model_config["id"])
    if cached_result:
        logger.info("[OpenRouter] Using cached verification result (saved API call)")
        return cached_result

    client = _get_client()
    start_time = time.monotonic()

    try:
        logger.info(
            "[OpenRouter] Using model: %s (%s)", model_config["name"], model_config["id"]
        )
        logger.info(
            "[OpenRouter] Estimated cost: $%.4f",
            estimate_verification_cost(model_config["id"]),
        )

        response_format = (
            {"type": "json_object"}
            if "json_mode" in model_config["capabilities"]
            else None
        )

        response = await client.chat.completions.create(
            model=model_config["id"],
            messages=[
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": _VERIFICATION_PROMPT},
                        {"type": "image_url", "image_url": {"url": base64_image}},
                    ],
                }
            ],
            temperature=0.1,
            max_tokens=model_config.get("maxTokens") or 1000,
            response_format=response_format,
        )

        processing_time = int((time.monotonic() - start_time) * 1000)
        logger.info("[OpenRouter] Verification completed in %sms", processing_time)

        content = response.choices[0].message.content if response.choices else None
        if not content:
            # Inner errors are rewrapped by the catch below (Node parity).
            raise ValueError("No response from verification model")

        result = json.loads(_strip_code_fences(content))
        if not (
            result.get("product_identification")
            and result.get("liveness_check")
            and result.get("full_description")
        ):
            raise ValueError("Invalid verification response format")

        usage_total = response.usage.total_tokens if response.usage else 0
        result["_metadata"] = {
            "model": model_config["name"],
            "modelId": model_config["id"],
            "provider": model_config["provider"],
            "processingTimeMs": processing_time,
            "tokensUsed": usage_total,
            "estimatedCost": estimate_verification_cost(model_config["id"]),
            "cacheHit": False,
        }

        await cache.cache_verification(base64_image, model_config["id"], result)
        return result
    except Exception as error:  # noqa: BLE001 — wrap with parity message
        logger.error("Product verification error: %s", error)
        message = _handle_openrouter_error(error)
        raise VerificationError(
            f"Product verification failed with {model_config['name']}: {message}"
        ) from error


async def verify_product(base64_image: str) -> dict[str, Any]:
    """Verify a product image with the default vision model."""
    return await verify_product_with_model(base64_image, None)


async def generate_marketing_image_with_model(
    full_description: str,
    model_id: str | None = None,
    max_retries: int = 5,
) -> str:
    """Generate a marketing/NFT image and return a base64 data-URL.

    Uses OpenRouter's chat-completions image modality. Retries with exponential
    backoff (1s, 2s, 4s, 8s, 16s capped). Cached for 7d, keyed on prompt + model.
    """
    model_config = get_image_gen_model(model_id) if model_id else get_default_image_gen_model()
    if not model_config:
        raise ImageGenError(f"Invalid or unsupported image generation model: {model_id}")

    image_prompt = (
        f"Generate a single, high-quality, photorealistic marketing image of: "
        f"{full_description}. Place it on a playful crypto/web3-themed background with "
        f"Solana-purple and green network lines, abstract geometric shapes, and high-tech "
        f"minimalist aesthetic. {model_config['defaultSize']} "
        f"{model_config['outputFormat'].upper()}, no text or logos."
    )

    cached_image_url = await cache.get_cached_image_url(image_prompt, model_config["id"])
    if cached_image_url:
        logger.info("[OpenRouter] Using cached image URL (saved API call)")
        return cached_image_url

    client = _get_client()
    start_time = time.monotonic()

    logger.info(
        "[OpenRouter] Using image model: %s (%s)", model_config["name"], model_config["id"]
    )
    logger.info("[OpenRouter] Estimated cost: $%.4f", model_config["costPerImage"])

    attempt = 1
    while True:
        try:
            logger.info(
                "[OpenRouter] Image generation attempt %s/%s", attempt, max_retries
            )

            # OpenRouter image generation uses chat completions with image modality.
            # `modalities` is an OpenRouter extension passed through via extra_body.
            response = await client.chat.completions.create(
                model=model_config["id"],
                messages=[{"role": "user", "content": image_prompt}],
                extra_body={"modalities": ["image", "text"]},
            )

            image_data = _extract_image_url(response)
            if not image_data:
                raise ImageGenError("No image data in response")

            processing_time = int((time.monotonic() - start_time) * 1000)
            logger.info(
                "[OpenRouter] Image generated successfully in %sms", processing_time
            )

            await cache.cache_image_url(image_prompt, model_config["id"], image_data)
            return image_data
        except Exception as error:  # noqa: BLE001 — retry/backoff then wrap
            if attempt >= max_retries:
                logger.error(
                    "[OpenRouter] Image generation failed after %s attempts", max_retries
                )
                message = _handle_openrouter_error(error)
                raise ImageGenError(
                    f"Image generation failed with {model_config['name']}: {message}"
                ) from error

            backoff_ms = min(1000 * (2 ** (attempt - 1)), 16000)
            logger.info("[OpenRouter] Retrying in %sms...", backoff_ms)
            await asyncio.sleep(backoff_ms / 1000)
            attempt += 1


def _extract_image_url(response: Any) -> str | None:
    """Pull the base64 data-URL out of an OpenRouter image chat response.

    Shape: choices[0].message.images[0].image_url.url. The `images` field is an
    OpenRouter extension absent from the typed SDK, so read it defensively from
    the message's extra fields / dict form.
    """
    if not getattr(response, "choices", None):
        return None
    message = response.choices[0].message

    images = getattr(message, "images", None)
    if images is None:
        extra = getattr(message, "model_extra", None) or {}
        images = extra.get("images")
    if not images:
        return None

    first = images[0]
    if isinstance(first, dict):
        return (first.get("image_url") or {}).get("url")

    image_url = getattr(first, "image_url", None)
    if isinstance(image_url, dict):
        return image_url.get("url")
    return getattr(image_url, "url", None)


async def generate_marketing_image(full_description: str) -> str:
    """Generate a marketing image with the default image-gen model."""
    return await generate_marketing_image_with_model(full_description, None)


async def download_image_as_base64(image_url: str) -> str:
    """Download an image URL and return it as a `data:<mime>;base64,...` URL."""
    async with httpx.AsyncClient(timeout=60.0) as client:
        response = await client.get(image_url)
        if response.status_code >= 400:
            raise ImageGenError(
                f"Failed to download image: {response.reason_phrase}"
            )
        mime_type = response.headers.get("content-type") or "image/png"
        encoded = base64.b64encode(response.content).decode("ascii")
        return f"data:{mime_type};base64,{encoded}"
