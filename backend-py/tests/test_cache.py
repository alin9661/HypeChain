"""Tests for the optional Redis cache service.

Covers the warm-singleton lifecycle, the disabled/unreachable no-op fallback
(must never raise), content-hash key derivation, and hit/miss behaviour against
an in-memory fake Redis.
"""

from __future__ import annotations

import pytest

from app.services import cache


class FakeRedis:
    """Minimal async stand-in for redis.asyncio.Redis."""

    def __init__(self) -> None:
        self.store: dict[str, str] = {}
        self.expirations: dict[str, int] = {}

    async def get(self, key: str) -> str | None:
        return self.store.get(key)

    async def set(self, key: str, value: str, ex: int | None = None) -> bool:
        self.store[key] = value
        if ex is not None:
            self.expirations[key] = ex
        return True

    async def delete(self, key: str) -> int:
        existed = key in self.store
        self.store.pop(key, None)
        self.expirations.pop(key, None)
        return 1 if existed else 0


class RaisingRedis:
    """Fake whose commands always raise — simulates an unreachable server."""

    async def get(self, key: str):
        raise ConnectionError("redis down")

    async def set(self, key: str, value: str, ex: int | None = None):
        raise ConnectionError("redis down")

    async def delete(self, key: str):
        raise ConnectionError("redis down")


@pytest.fixture(autouse=True)
def _reset_cache():
    cache.reset_cache_client()
    yield
    cache.reset_cache_client()


def _install(monkeypatch, client) -> None:
    """Force the cache module to use `client` as its singleton."""
    cache._client = client
    cache._init_attempted = True


# --- disabled / unavailable: every op is a safe no-op -----------------------


async def test_disabled_returns_no_op(monkeypatch):
    settings = cache.get_settings()
    monkeypatch.setattr(settings, "hacknyu_redis_enabled", False, raising=False)
    cache.reset_cache_client()

    # No raise on any operation, and reads return None / writes return False.
    assert await cache.get_cached_verification("img", "m") is None
    assert await cache.cache_verification("img", "m", {"ok": True}) is False
    assert await cache.get_cached_image_url("p", "m") is None
    assert await cache.cache_image_url("p", "m", "url") is False
    assert await cache.invalidate_verification("img", "m") is False


async def test_unreachable_redis_does_not_raise(monkeypatch):
    _install(monkeypatch, RaisingRedis())

    # Commands raise internally but the service swallows and degrades gracefully.
    assert await cache.get_cached_verification("img", "m") is None
    assert await cache.cache_verification("img", "m", {"ok": True}) is False
    assert await cache.get_cached_image_url("p", "m") is None
    assert await cache.cache_image_url("p", "m", "url") is False


# --- hit / miss against a working fake --------------------------------------


async def test_verification_miss_then_hit(monkeypatch):
    fake = FakeRedis()
    _install(monkeypatch, fake)

    assert await cache.get_cached_verification("imgdata", "model-x") is None

    result = {"product_identification": {"brand": "Nike"}, "_metadata": {"cacheHit": False}}
    assert await cache.cache_verification("imgdata", "model-x", result) is True

    hit = await cache.get_cached_verification("imgdata", "model-x")
    assert hit is not None
    assert hit["product_identification"]["brand"] == "Nike"
    # Cache reads flip cacheHit -> True.
    assert hit["_metadata"]["cacheHit"] is True


async def test_verification_ttl_is_24h(monkeypatch):
    fake = FakeRedis()
    _install(monkeypatch, fake)

    await cache.cache_verification("imgdata", "model-x", {"a": 1})
    key = cache._verification_cache_key("imgdata", "model-x")
    assert fake.expirations[key] == cache.VERIFICATION_TTL == 86_400


async def test_image_url_miss_then_hit_with_7d_ttl(monkeypatch):
    fake = FakeRedis()
    _install(monkeypatch, fake)

    assert await cache.get_cached_image_url("prompt", "model-x") is None
    assert await cache.cache_image_url("prompt", "model-x", "data:image/png;base64,AAA") is True

    assert await cache.get_cached_image_url("prompt", "model-x") == "data:image/png;base64,AAA"
    key = cache._image_gen_cache_key("prompt", "model-x")
    assert fake.expirations[key] == cache.IMAGE_URL_TTL == 604_800


# --- content-keyed hashing --------------------------------------------------


def test_keys_are_content_addressed():
    k1 = cache._verification_cache_key("same-image", "glm")
    k2 = cache._verification_cache_key("same-image", "glm")
    k3 = cache._verification_cache_key("other-image", "glm")
    assert k1 == k2
    assert k1 != k3
    assert k1.startswith("verification:glm:")

    img_key = cache._image_gen_cache_key("a prompt", "gpt5")
    assert img_key.startswith("image_gen:gpt5:")


def test_hash_handles_str_and_dict():
    assert cache._generate_hash("x") == cache._generate_hash("x")
    assert cache._generate_hash({"a": 1}) == cache._generate_hash({"a": 1})
    assert cache._generate_hash("x") != cache._generate_hash({"a": 1})
