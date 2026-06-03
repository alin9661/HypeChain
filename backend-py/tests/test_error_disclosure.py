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
    monkeypatch.setenv("NODE_ENV", "production")
    get_settings.cache_clear()

    async def fake_fetch(listing_id):
        return {"seller_wallet": "S", "price_sol": 0.5}

    async def fake_verify(sig, recipient, amount, listing_id, buyer):
        return {"valid": True, "amountTransferred": 0.5, "blockTime": 1, "slot": 9}

    async def boom(*a, **k):
        raise RuntimeError("secret dsn postgres://admin:pw@host/db")

    monkeypatch.setattr(payment, "fetch_listing", fake_fetch)
    monkeypatch.setattr(payment, "verify_payment", fake_verify)
    monkeypatch.setattr(payment, "complete_purchase", boom)
    resp = await client.post(
        "/api/payments/verify",
        json={"signature": "s", "listingId": "L1", "buyerWallet": "B"},
    )
    assert resp.status_code == 500
    body = resp.json()
    assert "postgres://" not in body["error"]
    assert body["error"] == "Internal server error"
    assert body["success"] is False
