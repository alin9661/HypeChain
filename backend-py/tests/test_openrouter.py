"""Tests for the OpenRouter AI service + display-name helper.

All OpenRouter HTTP traffic is mocked with respx against the chat-completions
endpoint; the cache is forced disabled so calls aren't short-circuited. Covers:
verification happy path + liveness structure + _metadata, code-fence stripping,
invalid-model + bad-response errors, image-gen success, image-gen retry/backoff,
image download, and product_display_name dedup + fallbacks.
"""

from __future__ import annotations

import httpx
import pytest
import respx

from app.services import cache, openrouter
from app.utils.display_name import product_display_name

CHAT_URL = f"{openrouter.OPENROUTER_BASE_URL}/chat/completions"

VERIFICATION_JSON = {
    "product_identification": {
        "brand": "Nike",
        "model": "Air Jordan 1",
        "colorway": "Chicago",
        "confidence": "high",
    },
    "liveness_check": {"liveness_score": 92, "reason": "Real shadows and texture"},
    "visible_identifiers": {"serial_numbers": ["ABC123"], "tags": ["size 10"]},
    "full_description": "A pair of Nike Air Jordan 1 sneakers in Chicago colorway, size 10.",
}


def _chat_response(content: str) -> httpx.Response:
    return httpx.Response(
        200,
        json={
            "id": "gen-1",
            "object": "chat.completion",
            "choices": [{"index": 0, "message": {"role": "assistant", "content": content}}],
            "usage": {"prompt_tokens": 100, "completion_tokens": 50, "total_tokens": 150},
        },
    )


def _image_response(data_url: str) -> httpx.Response:
    return httpx.Response(
        200,
        json={
            "id": "gen-2",
            "object": "chat.completion",
            "choices": [
                {
                    "index": 0,
                    "message": {
                        "role": "assistant",
                        "content": "",
                        "images": [{"image_url": {"url": data_url}}],
                    },
                }
            ],
            "usage": {"total_tokens": 0},
        },
    )


@pytest.fixture(autouse=True)
def _env(monkeypatch):
    settings = openrouter.get_settings()
    monkeypatch.setattr(settings, "hacknyu_openrouter_api_key", "test-key", raising=False)
    openrouter.reset_client()
    # Force cache disabled so service calls are not short-circuited.
    cache._client = None
    cache._init_attempted = True
    yield
    openrouter.reset_client()
    cache.reset_cache_client()


# --- verification -----------------------------------------------------------


@respx.mock
async def test_verify_product_happy_path_and_metadata():
    import json

    respx.post(CHAT_URL).mock(return_value=_chat_response(json.dumps(VERIFICATION_JSON)))

    result = await openrouter.verify_product("data:image/png;base64,AAAA")

    # Core result structure preserved.
    assert result["product_identification"]["brand"] == "Nike"
    assert result["liveness_check"]["liveness_score"] == 92
    assert "full_description" in result

    # _metadata appended with expected keys.
    meta = result["_metadata"]
    assert meta["modelId"] == "zhipuai/glm-4-plus"  # default vision model from settings
    assert meta["cacheHit"] is False
    assert meta["tokensUsed"] == 150
    assert "estimatedCost" in meta and "processingTimeMs" in meta


@respx.mock
async def test_verify_strips_markdown_code_fences():
    import json

    fenced = "```json\n" + json.dumps(VERIFICATION_JSON) + "\n```"
    respx.post(CHAT_URL).mock(return_value=_chat_response(fenced))

    result = await openrouter.verify_product("data:image/png;base64,AAAA")
    assert result["product_identification"]["model"] == "Air Jordan 1"


@respx.mock
async def test_verify_with_explicit_model():
    import json

    respx.post(CHAT_URL).mock(return_value=_chat_response(json.dumps(VERIFICATION_JSON)))
    result = await openrouter.verify_product_with_model(
        "data:image/png;base64,AAAA", "openai/gpt-4o"
    )
    assert result["_metadata"]["modelId"] == "openai/gpt-4o"
    assert result["_metadata"]["model"] == "GPT-4o"


async def test_verify_invalid_model_raises():
    with pytest.raises(openrouter.VerificationError, match="Invalid or unsupported vision model"):
        await openrouter.verify_product_with_model("img", "not-a-real-model")


@respx.mock
async def test_verify_invalid_response_format_raises():
    # Missing liveness_check / product_identification -> format error.
    respx.post(CHAT_URL).mock(return_value=_chat_response('{"foo": "bar"}'))
    with pytest.raises(openrouter.VerificationError, match="failed"):
        await openrouter.verify_product("img")


@respx.mock
async def test_verify_maps_429_to_rate_limit_message():
    respx.post(CHAT_URL).mock(return_value=httpx.Response(429, json={"error": "rate"}))
    with pytest.raises(openrouter.VerificationError, match="rate limit"):
        await openrouter.verify_product("img")


# --- image generation -------------------------------------------------------


@respx.mock
async def test_generate_image_success():
    data_url = "data:image/png;base64,GENERATED"
    respx.post(CHAT_URL).mock(return_value=_image_response(data_url))

    result = await openrouter.generate_marketing_image_with_model(
        "Nike Air Jordan 1 Chicago", "openai/gpt-5-image-mini"
    )
    assert result == data_url


@respx.mock
async def test_generate_image_retries_then_succeeds(monkeypatch):
    # Make backoff instant so the test is fast.
    sleeps: list[float] = []

    async def fake_sleep(seconds):
        sleeps.append(seconds)

    monkeypatch.setattr(openrouter.asyncio, "sleep", fake_sleep)

    data_url = "data:image/png;base64,GENERATED"
    responses = [
        httpx.Response(503, json={"error": "unavailable"}),
        httpx.Response(503, json={"error": "unavailable"}),
        _image_response(data_url),
    ]
    respx.post(CHAT_URL).mock(side_effect=responses)

    result = await openrouter.generate_marketing_image_with_model(
        "Nike Air Jordan 1 Chicago", "openai/gpt-5-image-mini", max_retries=5
    )
    assert result == data_url
    # Two backoffs before the 3rd attempt succeeded: 1s then 2s (exponential).
    assert sleeps == [1.0, 2.0]


@respx.mock
async def test_generate_image_exhausts_retries_and_raises(monkeypatch):
    async def fake_sleep(seconds):
        return None

    monkeypatch.setattr(openrouter.asyncio, "sleep", fake_sleep)
    respx.post(CHAT_URL).mock(return_value=httpx.Response(503, json={"error": "x"}))

    with pytest.raises(openrouter.ImageGenError, match="Image generation failed"):
        await openrouter.generate_marketing_image_with_model(
            "desc", "openai/gpt-5-image-mini", max_retries=3
        )


async def test_generate_image_invalid_model_raises():
    with pytest.raises(openrouter.ImageGenError, match="Invalid or unsupported"):
        await openrouter.generate_marketing_image_with_model("desc", "nope")


@respx.mock
async def test_download_image_as_base64():
    respx.get("https://cdn.example/img.png").mock(
        return_value=httpx.Response(
            200, content=b"rawbytes", headers={"content-type": "image/jpeg"}
        )
    )
    result = await openrouter.download_image_as_base64("https://cdn.example/img.png")
    assert result.startswith("data:image/jpeg;base64,")


# --- display-name dedup -----------------------------------------------------


def test_display_name_joins_brand_model_colorway():
    vr = {
        "product_identification": {
            "brand": "Nike",
            "model": "Air Jordan 1",
            "colorway": "Chicago",
        }
    }
    assert product_display_name(vr) == "Nike Air Jordan 1 Chicago"


def test_display_name_filters_falsy_parts():
    vr = {
        "product_identification": {"brand": "Rolex", "model": None, "colorway": ""}
    }
    assert product_display_name(vr) == "Rolex"


def test_display_name_falls_back_to_full_description():
    long_desc = "x" * 120
    vr = {
        "product_identification": {"brand": None, "model": None, "colorway": None},
        "full_description": long_desc,
    }
    out = product_display_name(vr)
    assert out == long_desc[:50]
    assert len(out) == 50


def test_display_name_empty_everything():
    assert product_display_name({"product_identification": {}}) == ""
    assert product_display_name({}) == ""
