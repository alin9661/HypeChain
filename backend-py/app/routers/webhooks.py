"""Helius enhanced-webhook ingest for off-platform NFT transfers.

  POST /api/webhooks/helius

Helius POSTs an array of enriched transactions whenever a watched NFT moves.
We extract NFT token transfers and append `transfer` rows to the activities
table so the feed and per-NFT provenance reflect ownership changes that did NOT
flow through create-listing / payment.

SECURITY (fail-closed): this is a PUBLIC write endpoint into the provenance feed
— the data the product's trust pitch rests on. Every request must carry the
shared secret in its ``Authorization`` header (configured on the Helius webhook
and in ``HACKNYU_HELIUS_WEBHOOK_SECRET``). If the secret is unset OR the header
doesn't match, we reject 401 — an unauthenticated path would let anyone forge
transfer history. The comparison is constant-time (``hmac.compare_digest``).

IDEMPOTENCY: Helius delivers at-least-once and retries on non-2xx, so the same
transfer can arrive repeatedly. The DB's UNIQUE(tx_signature, event_type,
nft_mint_address) + ON CONFLICT DO NOTHING makes ingestion idempotent — a replay
inserts nothing and is reported as 0 ingested. We always answer 200 on a
well-formed, authorized payload (even 0 ingested) so Helius doesn't retry-storm.
"""

from __future__ import annotations

import hmac
from datetime import datetime, timezone
from typing import Any

import structlog
from fastapi import APIRouter, HTTPException, Request

from app.config.settings import get_settings
from app.services import activity as activity_service

router = APIRouter()
log = structlog.get_logger()


def _authorized(request: Request) -> bool:
    """Constant-time check of the Authorization header against the shared secret.

    Fail-closed: returns False if the secret is unconfigured, so an
    unauthenticated endpoint can never exist by omission.
    """
    secret = get_settings().hacknyu_helius_webhook_secret
    if not secret:
        return False
    provided = request.headers.get("authorization", "")
    return hmac.compare_digest(provided, secret)


def _parse_transfer_events(tx: dict[str, Any]) -> list[dict[str, Any]]:
    """Extract NFT transfer events from one Helius enhanced transaction.

    Helius enhanced txs carry ``signature``, ``timestamp`` (unix seconds), and
    ``tokenTransfers[]`` with ``mint``/``fromUserAccount``/``toUserAccount``. An
    NFT transfer moves exactly one indivisible token; we treat each token
    transfer carrying a ``mint`` as a candidate and let the per-mint provenance
    speak for itself. ``product_name``/``image_url`` are chain-unknown here
    (left NULL) — the mint address + wallets + tx still render the event.

    Defensive: malformed/partial entries are skipped, not fatal — a single bad
    record in a batch shouldn't drop the whole webhook.
    """
    signature = tx.get("signature")
    if not signature:
        return []
    ts = tx.get("timestamp")
    block_time = (
        datetime.fromtimestamp(ts, tz=timezone.utc)
        if isinstance(ts, (int, float))
        else datetime.now(timezone.utc)
    )

    events: list[dict[str, Any]] = []
    for tt in tx.get("tokenTransfers", []) or []:
        if not isinstance(tt, dict):
            continue
        mint = tt.get("mint")
        if not mint:
            continue
        events.append(
            {
                "event_type": "transfer",
                "nft_mint_address": mint,
                "tx_signature": signature,
                "source": "helius",
                "from_wallet": tt.get("fromUserAccount"),
                "to_wallet": tt.get("toUserAccount"),
                "block_time": block_time,
            }
        )
    return events


@router.post("/helius")
async def helius_ingest(request: Request) -> dict[str, Any]:
    if not _authorized(request):
        # 401 with a generic message — don't hint whether the secret is unset
        # vs. mismatched.
        raise HTTPException(status_code=401, detail="Unauthorized")

    try:
        payload = await request.json()
    except Exception as exc:  # noqa: BLE001 — any JSON parse failure -> 422
        raise HTTPException(status_code=422, detail="Invalid JSON body") from exc

    if not isinstance(payload, list):
        raise HTTPException(status_code=422, detail="Expected a JSON array of transactions")

    ingested = 0
    seen = 0
    for tx in payload:
        if not isinstance(tx, dict):
            continue
        for event in _parse_transfer_events(tx):
            seen += 1
            # record (strict) so a genuine DB error surfaces as 500 and Helius
            # retries; duplicates return False via ON CONFLICT (not an error).
            if await activity_service.record(**event):
                ingested += 1

    log.info("helius_webhook_ingest", received=len(payload), events=seen, ingested=ingested)
    return {"success": True, "received": len(payload), "events": seen, "ingested": ingested}
