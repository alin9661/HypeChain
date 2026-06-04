"""Activity feed service — write helpers + read queries over the activities table.

Orchestration sits here; the SQL lives in ``app/db/queries.py``. Mirrors the
``increment_user_volume`` pattern: functions take an injectable ``acquire``
context-manager factory (defaulting to the module-level DSQL pool) so unit tests
exercise them against a fake connection with no live cluster.

WRITE PATHS
  * ``record_safe(...)`` is the public write entry point. It is BEST-EFFORT:
    any failure is logged and swallowed, returning False. This is what the
    create-listing and payment-verify routers call (wired in PR5) — logging an
    activity must NEVER break a listing or a payment, exactly like the existing
    best-effort on-chain anchor / marketplace-list steps (spec §3 steps 7-8).
  * ``record(...)`` is the strict variant (propagates errors) used by callers
    that want to know about failures (the webhook counts successful inserts).

A return of True means a row was inserted; False means a duplicate was ignored
(idempotent, via ON CONFLICT) OR — for ``record_safe`` — the write failed and
was swallowed. The webhook only counts True, so a replayed event ingests 0.
"""

from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal
from typing import TYPE_CHECKING, Any

import structlog

from app.db import pool as pool_module
from app.db import queries
from app.schemas import activity as schema

if TYPE_CHECKING:
    from collections.abc import Callable

log = structlog.get_logger()

VALID_EVENT_TYPES = frozenset({"mint", "listing", "sale", "transfer"})

# Hard cap on a provenance / feed page so a pathological NFT history or a huge
# ``limit`` query param can't return an unbounded result set.
MAX_LIMIT = 100
DEFAULT_FEED_LIMIT = 20


def _clamp_limit(limit: int, default: int) -> int:
    if limit <= 0:
        return default
    return min(limit, MAX_LIMIT)


async def record(
    *,
    event_type: str,
    nft_mint_address: str,
    tx_signature: str,
    source: str,
    product_name: str | None = None,
    image_url: str | None = None,
    from_wallet: str | None = None,
    to_wallet: str | None = None,
    price_sol: Decimal | float | int | None = None,
    block_time: datetime | None = None,
    acquire: Callable[[], Any] | None = None,
) -> bool:
    """Insert one activity event. Returns True if inserted, False if duplicate.

    Strict: a DB error propagates. Callers that must not fail the parent flow
    should use :func:`record_safe` instead.
    """
    if event_type not in VALID_EVENT_TYPES:
        raise ValueError(f"unknown event_type: {event_type!r}")
    acquire_cm = acquire if acquire is not None else pool_module.acquire
    activity_row = {
        "event_type": event_type,
        "nft_mint_address": nft_mint_address,
        "product_name": product_name,
        "image_url": image_url,
        "from_wallet": from_wallet,
        "to_wallet": to_wallet,
        "price_sol": price_sol,
        "tx_signature": tx_signature,
        "block_time": block_time if block_time is not None else datetime.now(timezone.utc),
        "source": source,
    }
    async with acquire_cm() as conn:
        inserted = await queries.insert_activity(conn, activity_row)
    return inserted is not None


async def record_safe(**kwargs: Any) -> bool:
    """Best-effort :func:`record` — log and swallow any failure, return False.

    The write entry point for create-listing / payment-verify. A feed-log write
    failure must never surface to the user or roll back the parent operation.
    """
    try:
        return await record(**kwargs)
    except Exception as exc:  # noqa: BLE001 — deliberate best-effort boundary
        log.warning(
            "activity_record_failed",
            error=str(exc),
            event_type=kwargs.get("event_type"),
            nft_mint_address=kwargs.get("nft_mint_address"),
        )
        return False


async def feed(
    *,
    event_type: str | None = None,
    cursor: str | None = None,
    limit: int = DEFAULT_FEED_LIMIT,
    acquire: Callable[[], Any] | None = None,
) -> tuple[list[dict[str, Any]], str | None]:
    """Return one keyset page of the global feed + the next cursor (or None).

    Fetches ``limit + 1`` rows to detect whether more exist without a second
    COUNT query: if the extra row comes back, there's a next page and we emit a
    cursor pointing at the last row of the trimmed page.

    Raises ``ValueError`` (via :func:`schema.decode_cursor`) on a malformed
    cursor so the router can answer 400.
    """
    acquire_cm = acquire if acquire is not None else pool_module.acquire
    limit = _clamp_limit(limit, DEFAULT_FEED_LIMIT)
    before_block_time: datetime | None = None
    before_id: str | None = None
    if cursor:
        before_block_time, before_id = schema.decode_cursor(cursor)

    async with acquire_cm() as conn:
        rows = await queries.get_activities_feed(
            conn,
            event_type=event_type,
            before_block_time=before_block_time,
            before_id=before_id,
            limit=limit + 1,
        )

    has_more = len(rows) > limit
    page = rows[:limit]
    next_cursor = schema.encode_cursor(page[-1]) if has_more and page else None
    return page, next_cursor


async def history(
    nft_mint_address: str,
    *,
    limit: int = MAX_LIMIT,
    acquire: Callable[[], Any] | None = None,
) -> list[dict[str, Any]]:
    """Return the full chain of custody for one NFT (provenance), newest first."""
    acquire_cm = acquire if acquire is not None else pool_module.acquire
    limit = _clamp_limit(limit, MAX_LIMIT)
    async with acquire_cm() as conn:
        return await queries.get_nft_history(conn, nft_mint_address, limit=limit)
