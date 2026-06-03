"""Tests for the payment routes — payment service mocked."""

from __future__ import annotations

import app.services.payment as payment


async def test_create_missing_fields_400(client):
    resp = await client.post("/api/payments/create", json={"listingId": "L1"})
    assert resp.status_code == 400
    assert "Missing required fields" in resp.json()["error"]


async def test_create_success(client, monkeypatch):
    async def fake_create(listing_id, buyer_wallet):
        return {"recipient": "S", "amount": 0.5, "listingId": listing_id}

    monkeypatch.setattr(payment, "create_payment_request", fake_create)
    resp = await client.post(
        "/api/payments/create", json={"listingId": "L1", "buyerWallet": "B"}
    )
    assert resp.status_code == 200
    assert resp.json()["paymentRequest"]["amount"] == 0.5


async def test_verify_missing_fields_400(client):
    resp = await client.post("/api/payments/verify", json={"signature": "s"})
    assert resp.status_code == 400


async def test_verify_invalid_returns_400_needs_retry(client, monkeypatch):
    async def fake_fetch(listing_id):
        return {"seller_wallet": "S", "price_sol": 0.5}

    async def fake_verify(sig, recipient, amount, listing_id, buyer):
        return {"valid": False, "error": "Transaction not found on blockchain", "needsRetry": True}

    monkeypatch.setattr(payment, "fetch_listing", fake_fetch)
    monkeypatch.setattr(payment, "verify_payment", fake_verify)
    resp = await client.post(
        "/api/payments/verify",
        json={"signature": "s", "listingId": "L1", "buyerWallet": "B"},
    )
    assert resp.status_code == 400
    body = resp.json()
    assert body["needsRetry"] is True
    assert "not found" in body["error"].lower()


async def test_verify_valid_completes_purchase(client, monkeypatch):
    async def fake_fetch(listing_id):
        return {"seller_wallet": "S", "price_sol": 0.5}

    async def fake_verify(sig, recipient, amount, listing_id, buyer):
        return {"valid": True, "amountTransferred": 0.5, "blockTime": 1, "slot": 99}

    async def fake_complete(listing_id, buyer, buyer_user_id, sig, amount):
        return {"success": True, "transaction": {"id": "tx1"}, "listing": {"id": listing_id}}

    monkeypatch.setattr(payment, "fetch_listing", fake_fetch)
    monkeypatch.setattr(payment, "verify_payment", fake_verify)
    monkeypatch.setattr(payment, "complete_purchase", fake_complete)
    resp = await client.post(
        "/api/payments/verify",
        json={"signature": "s", "listingId": "L1", "buyerWallet": "B"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["verification"]["amountTransferred"] == 0.5
    assert body["purchase"]["success"] is True


async def test_history_type_filtering(client, monkeypatch):
    seen = {}

    async def fake_history(wallet, type="all"):
        seen["type"] = type
        return [{"id": "tx1", "listing": {"product_name": "X"}}]

    monkeypatch.setattr(payment, "get_transaction_history", fake_history)
    resp = await client.get("/api/payments/history/WALLET?type=seller")
    assert resp.status_code == 200
    body = resp.json()
    assert body["count"] == 1
    assert seen["type"] == "seller"
    assert body["transactions"][0]["listing"]["product_name"] == "X"


async def test_balance(client, monkeypatch):
    monkeypatch.setattr(payment, "get_wallet_balance", lambda w: 1.25)
    resp = await client.get("/api/payments/balance/WALLET")
    assert resp.status_code == 200
    assert resp.json()["balance"] == 1.25


async def test_listing_details(client, monkeypatch):
    async def fake_fetch(listing_id):
        return {"id": listing_id, "product_name": "X", "status": "active"}

    monkeypatch.setattr(payment, "fetch_listing", fake_fetch)
    resp = await client.get("/api/payments/listing/L1")
    assert resp.status_code == 200
    assert resp.json()["listing"]["id"] == "L1"


async def test_cancel_noop(client):
    resp = await client.post("/api/payments/cancel", json={"listingId": "L1"})
    assert resp.status_code == 200
    assert resp.json()["success"] is True


async def test_verify_completePurchase_throws_500(client, monkeypatch):
    async def fake_fetch(listing_id):
        return {"seller_wallet": "S", "price_sol": 0.5}

    async def fake_verify(sig, recipient, amount, listing_id, buyer):
        return {"valid": True, "amountTransferred": 0.5, "blockTime": 1, "slot": 99}

    async def boom(*a, **k):
        raise RuntimeError("db write failed")

    monkeypatch.setattr(payment, "fetch_listing", fake_fetch)
    monkeypatch.setattr(payment, "verify_payment", fake_verify)
    monkeypatch.setattr(payment, "complete_purchase", boom)
    resp = await client.post(
        "/api/payments/verify",
        json={"signature": "s", "listingId": "L1", "buyerWallet": "B"},
    )
    assert resp.status_code == 500
    assert resp.json()["success"] is False
