"""Tests for the security hardening: body-size streaming cap + fail-closed env."""

from app.config.settings import Settings

FIVE_MB = 5 * 1024 * 1024


async def test_body_too_large_declared_content_length(client):
    """An honestly-declared oversized body is rejected up front with 413."""
    resp = await client.post("/anything", content=b"x" * (FIVE_MB + 1))
    assert resp.status_code == 413
    assert resp.json() == {"success": False, "error": "Request body too large (max 5MB)"}


async def test_body_too_large_chunked_without_content_length(client):
    """A chunked body with no Content-Length cannot bypass the cap — it is capped
    while streaming (the bypass a header-only check would leave open)."""

    async def stream():
        for _ in range(6):  # ~6MB, streamed; httpx omits Content-Length
            yield b"y" * (1024 * 1024)

    resp = await client.post("/anything", content=stream())
    assert resp.status_code == 413


async def test_small_body_passes_through_middleware(client):
    """A small body flows through the cap to normal routing (404 contract here)."""
    resp = await client.post("/nope", content=b"hello")
    assert resp.status_code == 404
    assert resp.json() == {"success": False, "error": "Endpoint not found", "path": "/nope"}


def test_node_env_is_fail_closed_by_default(monkeypatch):
    """Unset NODE_ENV must default to production (no accidental dev exposure)."""
    monkeypatch.delenv("NODE_ENV", raising=False)
    settings = Settings(_env_file=None)
    assert settings.node_env == "production"
    assert settings.is_development is False
