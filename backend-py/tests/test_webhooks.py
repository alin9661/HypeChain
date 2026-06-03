"""Tests for the Helius webhook ingest (POST /api/webhooks/helius).

Covers:
  * Auth (fail-closed): missing / wrong header -> 401; secret unset -> 401.
  * Body validation: non-array -> 422; invalid JSON -> 422.
  * Happy path: valid transfer -> 200, ingested count, record called with the
    parsed transfer event.
  * Idempotency: a replay (record returns False via ON CONFLICT) -> ingested 0.
  * Defensive parsing: tx without signature / tokenTransfer without mint skipped.

The handler reads settings at request time; we set the secret via env + clear
the lru_cache so the fail-closed and authorized paths are both exercised.
"""

from __future__ import annotations

from typing import Any

import pytest

from app.config.settings import get_settings
from app.services import activity as activity_service

_SECRET = "topsecret-helius"


@pytest.fixture
def with_secret(monkeypatch: Any):
    """Configure the webhook shared secret and clear the settings cache."""
    monkeypatch.setenv("HACKNYU_HELIUS_WEBHOOK_SECRET", _SECRET)
    get_settings.cache_clear()
    yield _SECRET
    get_settings.cache_clear()


@pytest.fixture
def no_secret(monkeypatch: Any):
    """Ensure the secret is unset (fail-closed) and clear the cache."""
    monkeypatch.delenv("HACKNYU_HELIUS_WEBHOOK_SECRET", raising=False)
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


def _transfer_tx(sig: str = "SIG1") -> dict[str, Any]:
    return {
        "signature": sig,
        "timestamp": 1_748_000_000,
        "tokenTransfers": [
            {"mint": "MINT1", "fromUserAccount": "ALICE", "toUserAccount": "BOB"}
        ],
    }


# ---------------------------------------------------------------------------
# Auth — fail-closed
# ---------------------------------------------------------------------------


async def test_missing_auth_header_401(client: Any, with_secret: str) -> None:
    resp = await client.post("/api/webhooks/helius", json=[_transfer_tx()])
    assert resp.status_code == 401


async def test_wrong_auth_header_401(client: Any, with_secret: str) -> None:
    resp = await client.post(
        "/api/webhooks/helius", json=[_transfer_tx()], headers={"Authorization": "nope"}
    )
    assert resp.status_code == 401


async def test_secret_unset_is_fail_closed_401(client: Any, no_secret: None) -> None:
    # Even with a plausible-looking header, an unconfigured secret rejects.
    resp = await client.post(
        "/api/webhooks/helius", json=[_transfer_tx()], headers={"Authorization": "anything"}
    )
    assert resp.status_code == 401


# ---------------------------------------------------------------------------
# Body validation
# ---------------------------------------------------------------------------


async def test_non_array_body_422(client: Any, with_secret: str) -> None:
    resp = await client.post(
        "/api/webhooks/helius", json={"not": "a list"}, headers={"Authorization": _SECRET}
    )
    assert resp.status_code == 422


async def test_invalid_json_422(client: Any, with_secret: str) -> None:
    resp = await client.post(
        "/api/webhooks/helius",
        content="this is not json",
        headers={"Authorization": _SECRET, "Content-Type": "application/json"},
    )
    assert resp.status_code == 422


# ---------------------------------------------------------------------------
# Happy path + idempotency
# ---------------------------------------------------------------------------


async def test_valid_transfer_ingested_200(client: Any, with_secret: str, monkeypatch: Any) -> None:
    calls: list[dict[str, Any]] = []

    async def fake_record(**kwargs: Any) -> bool:
        calls.append(kwargs)
        return True

    monkeypatch.setattr(activity_service, "record", fake_record)

    resp = await client.post(
        "/api/webhooks/helius", json=[_transfer_tx("SIGX")], headers={"Authorization": _SECRET}
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body == {"success": True, "received": 1, "events": 1, "ingested": 1}

    assert len(calls) == 1
    ev = calls[0]
    assert ev["event_type"] == "transfer"
    assert ev["nft_mint_address"] == "MINT1"
    assert ev["tx_signature"] == "SIGX"
    assert ev["from_wallet"] == "ALICE"
    assert ev["to_wallet"] == "BOB"
    assert ev["source"] == "helius"


async def test_replay_ingests_zero(client: Any, with_secret: str, monkeypatch: Any) -> None:
    # Second delivery: ON CONFLICT DO NOTHING -> record returns False.
    async def fake_record(**_kwargs: Any) -> bool:
        return False

    monkeypatch.setattr(activity_service, "record", fake_record)

    resp = await client.post(
        "/api/webhooks/helius", json=[_transfer_tx()], headers={"Authorization": _SECRET}
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["events"] == 1
    assert body["ingested"] == 0


# ---------------------------------------------------------------------------
# Defensive parsing
# ---------------------------------------------------------------------------


async def test_tx_without_signature_skipped(client: Any, with_secret: str, monkeypatch: Any) -> None:
    calls: list[dict[str, Any]] = []

    async def fake_record(**kwargs: Any) -> bool:
        calls.append(kwargs)
        return True

    monkeypatch.setattr(activity_service, "record", fake_record)

    no_sig = {"timestamp": 1, "tokenTransfers": [{"mint": "M", "toUserAccount": "X"}]}
    resp = await client.post(
        "/api/webhooks/helius",
        json=[no_sig, _transfer_tx("GOOD")],
        headers={"Authorization": _SECRET},
    )
    assert resp.status_code == 200
    assert resp.json()["ingested"] == 1
    assert [c["tx_signature"] for c in calls] == ["GOOD"]


async def test_token_transfer_without_mint_skipped(
    client: Any, with_secret: str, monkeypatch: Any
) -> None:
    calls: list[dict[str, Any]] = []

    async def fake_record(**kwargs: Any) -> bool:
        calls.append(kwargs)
        return True

    monkeypatch.setattr(activity_service, "record", fake_record)

    tx = {
        "signature": "S",
        "timestamp": 1,
        "tokenTransfers": [
            {"fromUserAccount": "A", "toUserAccount": "B"},  # no mint -> skipped
            {"mint": "REAL", "fromUserAccount": "A", "toUserAccount": "B"},
        ],
    }
    resp = await client.post(
        "/api/webhooks/helius", json=[tx], headers={"Authorization": _SECRET}
    )
    assert resp.status_code == 200
    assert resp.json()["ingested"] == 1
    assert calls[0]["nft_mint_address"] == "REAL"
