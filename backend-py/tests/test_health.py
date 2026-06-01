"""Health + root endpoint tests — verify the ported HTTP contract and error shape."""

import pytest


async def test_health_ok(client):
    resp = await client.get("/health")
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "healthy"
    assert "timestamp" in body
    assert "uptime" in body
    assert "environment" in body


async def test_root_discovery(client):
    resp = await client.get("/")
    assert resp.status_code == 200
    body = resp.json()
    assert body["name"] == "HypeChain Backend API"
    # Endpoint discovery map must list the ported routes.
    assert body["endpoints"]["createListing"] == "POST /api/create-listing"
    assert body["endpoints"]["verifyPayment"] == "POST /api/payments/verify"


async def test_404_contract(client):
    """Unmatched routes must return the Express 404 shape, not FastAPI's default."""
    resp = await client.get("/does-not-exist")
    assert resp.status_code == 404
    body = resp.json()
    assert body == {"success": False, "error": "Endpoint not found", "path": "/does-not-exist"}


async def test_security_headers_present(client):
    resp = await client.get("/health")
    assert resp.headers.get("X-Content-Type-Options") == "nosniff"
    assert resp.headers.get("X-Frame-Options") == "DENY"


@pytest.mark.parametrize("path", ["/health", "/"])
async def test_no_server_error(client, path):
    resp = await client.get(path)
    assert resp.status_code != 500
