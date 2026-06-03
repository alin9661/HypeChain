"""Tests for the create-listing pipeline — service boundaries mocked.

The real service modules (OpenRouter/IPFS/Solana/DSQL) are tested in their own
suites; here we verify the router's orchestration, validation 400s, liveness
400, step-attributed 500s, and the best-effort on-chain warn-not-fail behavior.
"""

from __future__ import annotations

import types

import pytest

import app.db.pool as pool_module
import app.db.queries as queries
import app.routers.listings as listings_mod
import app.services.openrouter as openrouter
import app.services.solana as solana

VALID_VR = {
    "product_identification": {
        "brand": "Nike",
        "model": "Air Max",
        "colorway": "Red",
        "confidence": 0.9,
    },
    "liveness_check": {"liveness_score": 87, "reason": "looks real"},
    "full_description": "A red Nike Air Max sneaker",
    "_metadata": {"modelId": "zhipuai/glm-4-plus", "model": "GLM 4 Plus"},
}


class _FakeAcquire:
    async def __aenter__(self):
        return object()

    async def __aexit__(self, *a):
        return False


@pytest.fixture
def happy_pipeline(monkeypatch):
    """Patch every service boundary for a successful create-listing."""
    monkeypatch.setattr(listings_mod, "is_valid_solana_pubkey", lambda v: True)
    monkeypatch.setattr(
        listings_mod, "validate_base64_image", lambda v: types.SimpleNamespace(valid=True, error=None)
    )

    async def fake_verify(image):
        return VALID_VR

    async def fake_verify_model(image, model_id):
        return VALID_VR

    async def fake_image(prompt, model_id):
        return "data:image/png;base64,AAAA"

    async def fake_ipfs(image_base64, name, description, attributes):
        return {"metadataUri": "ipfs://meta", "imageUrl": "https://gw/img.png"}

    async def fake_get_user(conn, wallet):
        return "user-1"

    async def fake_insert(conn, listing):
        return {"id": "listing-123", **listing}

    monkeypatch.setattr(openrouter, "verify_product", fake_verify)
    monkeypatch.setattr(openrouter, "verify_product_with_model", fake_verify_model)
    monkeypatch.setattr(openrouter, "generate_marketing_image_with_model", fake_image)
    monkeypatch.setattr(listings_mod, "create_and_upload_nft_metadata", fake_ipfs)
    monkeypatch.setattr(solana, "mint_nft", lambda w, uri, name: "MINT_ADDR_123")
    monkeypatch.setattr(queries, "get_user_id_by_wallet", fake_get_user)
    monkeypatch.setattr(queries, "insert_listing", fake_insert)
    monkeypatch.setattr(pool_module, "acquire", lambda: _FakeAcquire())


async def test_happy_path_with_wallet(client, happy_pipeline):
    resp = await client.post(
        "/api/create-listing",
        json={"userWallet": "Wallet111", "productImage": "data:image/png;base64,AAAA",
              "optionalPriceSol": 0.5},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["success"] is True
    assert body["nft_mint_address"] == "MINT_ADDR_123"
    assert body["status"] == "active"
    assert body["is_pending_claim"] is False
    assert body["verification"]["brand"] == "Nike"
    assert body["verification"]["liveness_score"] == 87


async def test_guest_flow_pending_wallet(client, happy_pipeline):
    resp = await client.post(
        "/api/create-listing",
        json={"userEmail": "a@b.com", "productImage": "data:image/png;base64,AAAA"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "pending_wallet"
    assert body["is_pending_claim"] is True


async def test_no_wallet_no_email_400(client):
    resp = await client.post("/api/create-listing", json={"productImage": "x"})
    assert resp.status_code == 400
    assert "wallet" in resp.json()["error"].lower()


async def test_invalid_pubkey_400(client, monkeypatch):
    monkeypatch.setattr(listings_mod, "is_valid_solana_pubkey", lambda v: False)
    resp = await client.post(
        "/api/create-listing", json={"userWallet": "bad", "productImage": "x"}
    )
    assert resp.status_code == 400
    assert resp.json()["error"] == "Invalid Solana wallet address"


async def test_invalid_image_400(client, monkeypatch):
    monkeypatch.setattr(listings_mod, "is_valid_solana_pubkey", lambda v: True)
    monkeypatch.setattr(
        listings_mod, "validate_base64_image",
        lambda v: types.SimpleNamespace(valid=False, error="Image too large"),
    )
    resp = await client.post(
        "/api/create-listing", json={"userWallet": "W", "productImage": "x"}
    )
    assert resp.status_code == 400
    assert resp.json()["error"] == "Image too large"


async def test_liveness_fail_400_with_next_steps(client, happy_pipeline, monkeypatch):
    low = {**VALID_VR, "liveness_check": {"liveness_score": 30, "reason": "screenshot"}}

    async def fake_verify(image):
        return low

    monkeypatch.setattr(openrouter, "verify_product", fake_verify)
    resp = await client.post(
        "/api/create-listing",
        json={"userWallet": "W", "productImage": "data:image/png;base64,AAAA"},
    )
    assert resp.status_code == 400
    body = resp.json()
    assert body["details"]["liveness_score"] == 30
    assert isinstance(body["details"]["next_steps"], list) and body["details"]["next_steps"]
    assert body["details"]["image_generation_status"] == "CANCELLED"


@pytest.mark.parametrize(
    ("patch_target", "failed_at"),
    [
        ("verify_product", "Step 1: AI Verification"),
        ("generate_marketing_image_with_model", "Step 2: NFT Image Generation"),
    ],
)
async def test_pipeline_step_attribution(client, happy_pipeline, monkeypatch, patch_target, failed_at):
    async def boom(*a, **k):
        raise RuntimeError("kaboom")

    monkeypatch.setattr(openrouter, patch_target, boom)
    resp = await client.post(
        "/api/create-listing",
        json={"userWallet": "W", "productImage": "data:image/png;base64,AAAA"},
    )
    assert resp.status_code == 500
    assert resp.json()["failure_details"]["failed_at"] == failed_at


async def test_mint_failure_attributed(client, happy_pipeline, monkeypatch):
    def boom(*a, **k):
        raise RuntimeError("rpc down")

    monkeypatch.setattr(solana, "mint_nft", boom)
    resp = await client.post(
        "/api/create-listing",
        json={"userWallet": "W", "productImage": "data:image/png;base64,AAAA"},
    )
    assert resp.status_code == 500
    assert resp.json()["failure_details"]["failed_at"] == "Step 3: NFT Minting"


async def test_db_failure_attributed(client, happy_pipeline, monkeypatch):
    async def boom(*a, **k):
        raise RuntimeError("dsql gone")

    monkeypatch.setattr(queries, "insert_listing", boom)
    resp = await client.post(
        "/api/create-listing",
        json={"userWallet": "W", "productImage": "data:image/png;base64,AAAA"},
    )
    assert resp.status_code == 500
    assert resp.json()["failure_details"]["failed_at"] == "Step 4: Database Storage"


async def test_onchain_best_effort_does_not_fail_request(client, happy_pipeline, monkeypatch):
    # With a program id set, submit_verification raising must NOT fail the listing.
    monkeypatch.setattr(
        listings_mod.get_settings(), "hacknyu_marketplace_program_id", "PROG", raising=False
    )

    def boom(**k):
        raise RuntimeError("on-chain hiccup")

    monkeypatch.setattr(solana, "submit_verification", boom)
    resp = await client.post(
        "/api/create-listing",
        json={"userWallet": "W", "productImage": "data:image/png;base64,AAAA"},
    )
    assert resp.status_code == 200
    assert resp.json()["success"] is True


async def test_get_create_listing_docs(client):
    resp = await client.get("/api/create-listing")
    assert resp.status_code == 200
    assert resp.json()["endpoint"] == "/api/create-listing"
