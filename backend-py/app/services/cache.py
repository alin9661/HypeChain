"""Redis caching service (async port of Node `services/cache.js`).

Caches AI verification results (24h) and generated image URLs (7d). The client
is a lazily-initialised module-level singleton reused across warm Lambda
invocations.

Caching is strictly optional: when `HACKNYU_REDIS_ENABLED` is false, or Redis is
unreachable, every operation degrades to a no-op that warns and continues — it
must never raise into the request path.
"""

from __future__ import annotations

import hashlib
import json
import logging
from typing import Any

import redis.asyncio as redis

from app.config.settings import get_settings

logger = logging.getLogger(__name__)

# TTLs (seconds) — match the Express service.
VERIFICATION_TTL = 86_400  # 24 hours
IMAGE_URL_TTL = 604_800  # 7 days

# Module-level singleton, lazily initialised and reused warm.
_client: redis.Redis | None = None
_init_attempted = False


def _get_client() -> redis.Redis | None:
    """Return the shared Redis client, or None if caching is disabled/unavailable.

    Initialisation is lazy and attempted only once. Construction failures are
    swallowed (warn-and-continue); connection failures surface later on the
    first command and are handled there.
    """
    global _client, _init_attempted

    if _init_attempted:
        return _client

    _init_attempted = True
    settings = get_settings()

    if not settings.hacknyu_redis_enabled:
        logger.info("[Redis] Caching disabled")
        return None

    try:
        _client = redis.Redis.from_url(
            settings.hacknyu_redis_url,
            decode_responses=True,
            socket_connect_timeout=2,
            socket_timeout=2,
            retry_on_timeout=False,
        )
    except Exception as error:  # noqa: BLE001 — never fail init
        logger.error("[Redis] Initialization error: %s", error)
        _client = None

    return _client


def reset_cache_client() -> None:
    """Reset the module-level singleton. Test-only helper."""
    global _client, _init_attempted
    _client = None
    _init_attempted = False


def _generate_hash(data: Any) -> str:
    """SHA-256 hex digest of `data` (stringified if not already a string)."""
    content = data if isinstance(data, str) else json.dumps(data)
    return hashlib.sha256(content.encode("utf-8")).hexdigest()


def _verification_cache_key(image_data: str, model_id: str) -> str:
    return f"verification:{model_id}:{_generate_hash(image_data)}"


def _image_gen_cache_key(prompt: str, model_id: str) -> str:
    return f"image_gen:{model_id}:{_generate_hash(prompt)}"


async def get_cached_verification(image_data: str, model_id: str) -> dict[str, Any] | None:
    """Return a cached verification result (with `_metadata.cacheHit=True`) or None."""
    client = _get_client()
    if client is None:
        logger.debug("[Redis] Cache not available, skipping")
        return None

    try:
        key = _verification_cache_key(image_data, model_id)
        cached = await client.get(key)
        if cached:
            logger.info("[Redis] Cache HIT for verification (model: %s)", model_id)
            result = json.loads(cached)
            result["_metadata"] = result.get("_metadata") or {}
            result["_metadata"]["cacheHit"] = True
            return result
        logger.info("[Redis] Cache MISS for verification (model: %s)", model_id)
        return None
    except Exception as error:  # noqa: BLE001 — never fail the request
        logger.error("[Redis] Error getting cached verification: %s", error)
        return None


async def cache_verification(
    image_data: str,
    model_id: str,
    result: dict[str, Any],
    ttl: int = VERIFICATION_TTL,
) -> bool:
    """Store a verification result. Returns True on success, False otherwise."""
    client = _get_client()
    if client is None:
        return False

    try:
        key = _verification_cache_key(image_data, model_id)
        await client.set(key, json.dumps(result), ex=ttl)
        logger.info("[Redis] Cached verification result (TTL: %ss)", ttl)
        return True
    except Exception as error:  # noqa: BLE001 — never fail the request
        logger.error("[Redis] Error caching verification: %s", error)
        return False


async def get_cached_image_url(prompt: str, model_id: str) -> str | None:
    """Return a cached generated-image URL or None."""
    client = _get_client()
    if client is None:
        return None

    try:
        key = _image_gen_cache_key(prompt, model_id)
        cached = await client.get(key)
        if cached:
            logger.info("[Redis] Cache HIT for image generation (model: %s)", model_id)
            return cached
        logger.info("[Redis] Cache MISS for image generation (model: %s)", model_id)
        return None
    except Exception as error:  # noqa: BLE001 — never fail the request
        logger.error("[Redis] Error getting cached image: %s", error)
        return None


async def cache_image_url(
    prompt: str,
    model_id: str,
    image_url: str,
    ttl: int = IMAGE_URL_TTL,
) -> bool:
    """Store a generated-image URL. Returns True on success, False otherwise."""
    client = _get_client()
    if client is None:
        return False

    try:
        key = _image_gen_cache_key(prompt, model_id)
        await client.set(key, image_url, ex=ttl)
        logger.info("[Redis] Cached image URL (TTL: %ss)", ttl)
        return True
    except Exception as error:  # noqa: BLE001 — never fail the request
        logger.error("[Redis] Error caching image URL: %s", error)
        return False


async def invalidate_verification(image_data: str, model_id: str) -> bool:
    """Delete a cached verification result. Returns True on success."""
    client = _get_client()
    if client is None:
        return False

    try:
        key = _verification_cache_key(image_data, model_id)
        await client.delete(key)
        logger.info("[Redis] Invalidated verification cache")
        return True
    except Exception as error:  # noqa: BLE001 — never fail the request
        logger.error("[Redis] Error invalidating cache: %s", error)
        return False
