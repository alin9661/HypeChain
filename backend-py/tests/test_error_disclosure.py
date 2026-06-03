"""Error-disclosure gating: raw exception strings must not leak in production.

The curated ``failure_details`` block (static explanation + possible causes) is
intentional Express-parity UX and stays. Only the raw ``error`` field — which
wraps the underlying exception message (RPC URLs, DSNs, API bodies) — is gated
behind ``is_development``. Full detail is still logged server-side by the routers.
"""

from __future__ import annotations

import json

import pytest

import app.services.payment as payment
from app.config.settings import get_settings
from app.exceptions import MintError, pipeline_error_response


@pytest.fixture(autouse=True)
def _reset_settings_cache():
    # get_settings is lru_cached; clear around each test so NODE_ENV changes take
    # effect and never leak into other tests.
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


def _body(resp):
    return json.loads(bytes(resp.body))


def test_pipeline_error_hides_raw_detail_in_production(monkeypatch):
    monkeypatch.setenv("NODE_ENV", "production")
    get_settings.cache_clear()
    resp = pipeline_error_response(MintError("rpc https://internal.secret/x failed"))
    body = _body(resp)
    assert "internal.secret" not in body["error"]
    assert "server logs" in body["error"].lower()
    # Curated parity block is preserved.
    assert body["failure_details"]["failed_at"] == "Step 3: NFT Minting"
    assert body["failure_details"]["possible_causes"]


def test_pipeline_error_shows_detail_in_development(monkeypatch):
    monkeypatch.setenv("NODE_ENV", "development")
    get_settings.cache_clear()
    resp = pipeline_error_response(MintError("verbose dev detail xyz"))
    body = _body(resp)
    assert "verbose dev detail xyz" in body["error"]


async def test_payment_500_hides_detail_in_production(client, monkeypatch):
    # Drive a 500 through the /listing route (no buyer dependency) so this test
    # is independent of the buyer-binding change.
    monkeypatch.setenv("NODE_ENV", "production")
    get_settings.cache_clear()

    async def boom(listing_id):
        raise RuntimeError("secret dsn postgres://admin:pw@host/db")

    monkeypatch.setattr(payment, "fetch_listing", boom)
    resp = await client.get("/api/payments/listing/L1")
    assert resp.status_code == 500
    body = resp.json()
    assert "postgres://" not in body["error"]
    assert body["error"] == "Internal server error"
    assert body["success"] is False


async def test_payment_500_shows_detail_in_development(client, monkeypatch):
    monkeypatch.setenv("NODE_ENV", "development")
    get_settings.cache_clear()

    async def boom(listing_id):
        raise RuntimeError("dev-visible detail abc")

    monkeypatch.setattr(payment, "fetch_listing", boom)
    resp = await client.get("/api/payments/listing/L1")
    assert resp.status_code == 500
    assert "dev-visible detail abc" in resp.json()["error"]
