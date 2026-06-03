"""Explicit, column-enumerated SQL for the DSQL data layer.

Ports the Supabase data access from the Express backend
(`backend/src/routes/listing.js`, `backend/src/services/payment.js`).

Spec §3.6 parity rules enforced here:
  * NO ``SELECT *`` anywhere — every column the HTTP responses consume is
    enumerated and ordered explicitly (the Express code relied on PostgREST
    returning the full row via ``.select()``).
  * The transaction-history endpoint reproduces Supabase PostgREST's embedded
    shape ``{..., "listing": {product_name, image_url, nft_mint_address}}`` via
    a single ``transactions JOIN listings`` with ``json_build_object`` — never
    N+1.
  * ``updated_at`` is set EXPLICITLY in every UPDATE (Supabase used a trigger;
    DSQL has none — spec §3.5 step 1).

All functions accept an ``asyncpg``-compatible connection (duck-typed:
``fetchrow``/``fetch``/``execute``) so unit tests can pass a fake connection
without a live cluster. The OCC-wrapped ``increment_user_volume`` instead takes
the pool-acquire context manager factory so each retry runs a fresh
transaction.
"""

from __future__ import annotations

from decimal import Decimal
from typing import TYPE_CHECKING, Any

from app.db import pool as pool_module
from app.db.occ import retry_on_serialization_error

if TYPE_CHECKING:
    from collections.abc import Callable

# ---------------------------------------------------------------------------
# Column manifests — single source of truth for "every column" (no SELECT *).
# ---------------------------------------------------------------------------

# Order mirrors schema/001_dsql_schema.sql so response field order is stable.
LISTING_COLUMNS: tuple[str, ...] = (
    "id",
    "nft_mint_address",
    "seller_wallet",
    "seller_user_id",
    "product_name",
    "description",
    "category",
    "condition",
    "image_url",
    "metadata_uri",
    "price_sol",
    "price_usdc",
    "status",
    "ai_verified",
    "ai_confidence_score",
    "created_at",
    "updated_at",
    "sold_at",
    "buyer_wallet",
    "buyer_user_id",
    "transaction_signature",
    "views",
    "favorites",
    "is_compressed",
    "merkle_tree_address",
    "leaf_index",
    "guest_email",
    "is_pending_claim",
    "platform_wallet",
    "storage_type",
)

TRANSACTION_COLUMNS: tuple[str, ...] = (
    "id",
    "listing_id",
    "buyer_wallet",
    "seller_wallet",
    "buyer_user_id",
    "seller_user_id",
    "amount_sol",
    "amount_usdc",
    "fee_sol",
    "signature",
    "status",
    "payment_method",
    "blockchain_confirmed",
    "confirmation_time",
    "error_message",
    "created_at",
    "confirmed_at",
    "updated_at",
)

# Order mirrors the activities table in schema/001_dsql_schema.sql.
ACTIVITY_COLUMNS: tuple[str, ...] = (
    "id",
    "event_type",
    "nft_mint_address",
    "product_name",
    "image_url",
    "from_wallet",
    "to_wallet",
    "price_sol",
    "tx_signature",
    "block_time",
    "source",
    "created_at",
)

# Columns the application supplies on INSERT. id + created_at take DB defaults
# (gen_random_uuid() / NOW()). block_time is supplied explicitly (on-chain time).
_ACTIVITY_INSERT_COLUMNS: tuple[str, ...] = (
    "event_type",
    "nft_mint_address",
    "product_name",
    "image_url",
    "from_wallet",
    "to_wallet",
    "price_sol",
    "tx_signature",
    "block_time",
    "source",
)

# Columns supplied by the application on INSERT into listings. The remaining
# columns (id, created_at, updated_at, views, favorites, sold_at, buyer_*,
# transaction_signature, price_usdc) take their DB defaults / NULL — matching
# listing.js's insert payload (listing.js:320-342).
_LISTING_INSERT_COLUMNS: tuple[str, ...] = (
    "nft_mint_address",
    "seller_wallet",
    "seller_user_id",
    "product_name",
    "description",
    "category",
    "condition",
    "image_url",
    "metadata_uri",
    "price_sol",
    "status",
    "ai_verified",
    "ai_confidence_score",
    "guest_email",
    "is_pending_claim",
    "platform_wallet",
    "is_compressed",
    "merkle_tree_address",
    "leaf_index",
)

# Columns the application supplies when recording a confirmed purchase
# (payment.js:258-274 completePurchase). Defaults cover the rest.
_TRANSACTION_INSERT_COLUMNS: tuple[str, ...] = (
    "listing_id",
    "buyer_wallet",
    "seller_wallet",
    "buyer_user_id",
    "seller_user_id",
    "amount_sol",
    "signature",
    "status",
    "payment_method",
    "blockchain_confirmed",
    "confirmed_at",
)


def _select_list(columns: tuple[str, ...], *, prefix: str = "") -> str:
    """Render an explicit, comma-separated column list (never ``*``)."""
    pre = f"{prefix}." if prefix else ""
    return ", ".join(f"{pre}{c}" for c in columns)


def _placeholders(n: int, *, start: int = 1) -> str:
    return ", ".join(f"${i}" for i in range(start, start + n))


# Precomputed, audited SQL strings. Building them from the manifests keeps the
# "no SELECT *" guarantee mechanical and testable.
_RETURNING = _select_list(LISTING_COLUMNS)
_TX_RETURNING = _select_list(TRANSACTION_COLUMNS)

INSERT_LISTING_SQL = (
    f"INSERT INTO listings ({_select_list(_LISTING_INSERT_COLUMNS)}) "
    f"VALUES ({_placeholders(len(_LISTING_INSERT_COLUMNS))}) "
    f"RETURNING {_RETURNING}"
)

GET_USER_ID_BY_WALLET_SQL = "SELECT id FROM users WHERE wallet_address = $1"

FETCH_LISTING_BY_ID_SQL = f"SELECT {_RETURNING} FROM listings WHERE id = $1"

# Signature dedup — payment verification rejects an already-used tx signature
# (payment.js:210-222). Single indexed lookup.
GET_TRANSACTION_ID_BY_SIGNATURE_SQL = "SELECT id FROM transactions WHERE signature = $1"

# Explicit updated_at = NOW() (Supabase trigger replaced — spec §3.5 step 1).
UPDATE_LISTING_STATUS_SQL = (
    "UPDATE listings "
    "SET status = $2, sold_at = $3, buyer_wallet = $4, buyer_user_id = $5, "
    "    transaction_signature = $6, updated_at = NOW() "
    "WHERE id = $1 "
    f"RETURNING {_RETURNING}"
)

INSERT_TRANSACTION_SQL = (
    f"INSERT INTO transactions ({_select_list(_TRANSACTION_INSERT_COLUMNS)}) "
    f"VALUES ({_placeholders(len(_TRANSACTION_INSERT_COLUMNS))}) "
    f"RETURNING {_TX_RETURNING}"
)

# Additive, OCC-safe seller-volume increment (replaces the increment_user_volume
# RPC — spec §3.5 step 2). updated_at set explicitly.
INCREMENT_USER_VOLUME_SQL = (
    "UPDATE users "
    "SET total_volume = total_volume + $2, updated_at = NOW() "
    "WHERE id = $1 "
    "RETURNING id, total_volume"
)

# Transaction history with the embedded `listing` object, reproducing Supabase
# PostgREST's `listing:listings(product_name, image_url, nft_mint_address)`
# embedding (payment.js:332-352). Single JOIN, ordered created_at DESC.
# `type` filtering (buyer / seller / all) is applied via the WHERE clause built
# in `get_transaction_history`.
_HISTORY_BASE_SQL = (
    "SELECT "
    f"{_select_list(TRANSACTION_COLUMNS, prefix='t')}, "
    "json_build_object("
    "'product_name', l.product_name, "
    "'image_url', l.image_url, "
    "'nft_mint_address', l.nft_mint_address"
    ") AS listing "
    "FROM transactions t "
    "JOIN listings l ON l.id = t.listing_id "
)

# --- activities (feed + provenance) ---

_ACTIVITY_COLS = _select_list(ACTIVITY_COLUMNS)

# Idempotent insert: ON CONFLICT DO NOTHING on the (tx_signature, event_type,
# nft_mint_address) unique key. RETURNING yields the row on a real insert and
# NOTHING on a duplicate — so a caller distinguishes "inserted" from "already
# seen" by whether a row comes back (Helius at-least-once delivery, retried app writes).
INSERT_ACTIVITY_SQL = (
    f"INSERT INTO activities ({_select_list(_ACTIVITY_INSERT_COLUMNS)}) "
    f"VALUES ({_placeholders(len(_ACTIVITY_INSERT_COLUMNS))}) "
    "ON CONFLICT (tx_signature, event_type, nft_mint_address) DO NOTHING "
    f"RETURNING {_ACTIVITY_COLS}"
)

# Provenance: full chain of custody for one NFT, newest first.
FETCH_NFT_HISTORY_SQL = (
    f"SELECT {_ACTIVITY_COLS} FROM activities "
    "WHERE nft_mint_address = $1 "
    "ORDER BY block_time DESC, id DESC LIMIT $2"
)


# ---------------------------------------------------------------------------
# Query functions. `conn` is duck-typed (asyncpg connection or a test fake).
# ---------------------------------------------------------------------------


async def insert_listing(conn: Any, listing: dict[str, Any]) -> dict[str, Any]:
    """INSERT a listing row, returning the full row (parity with .select().single()).

    ``listing`` keys must cover ``_LISTING_INSERT_COLUMNS``; missing optional
    keys default to ``None`` so callers can omit nullable fields. App-enforced
    integrity: ``seller_user_id`` is whatever the caller resolved (None for an
    orphan / guest), per listing.js:323.
    """
    args = [listing.get(col) for col in _LISTING_INSERT_COLUMNS]
    row = await conn.fetchrow(INSERT_LISTING_SQL, *args)
    return dict(row)


async def get_user_id_by_wallet(conn: Any, wallet_address: str) -> str | None:
    """Resolve ``users.id`` for a wallet, or None if no such user (orphan seller).

    Mirrors listing.js:311-318 (``.select('id').eq('wallet_address', w).single()``
    returning null on miss).
    """
    row = await conn.fetchrow(GET_USER_ID_BY_WALLET_SQL, wallet_address)
    if row is None:
        return None
    return row["id"]


async def fetch_listing_by_id(conn: Any, listing_id: str) -> dict[str, Any] | None:
    """Fetch a single listing by id (full row), or None if not found.

    Mirrors payment.js:34-54 fetchListing. Status gating ('active' only) stays
    in the service layer (PR5), matching the Express split of concerns.
    """
    row = await conn.fetchrow(FETCH_LISTING_BY_ID_SQL, listing_id)
    if row is None:
        return None
    return dict(row)


async def get_transaction_id_by_signature(conn: Any, signature: str) -> str | None:
    """Return an existing transaction's id for this signature, or None.

    Used by payment verification to reject a replayed/already-used signature
    (payment.js:210-222).
    """
    row = await conn.fetchrow(GET_TRANSACTION_ID_BY_SIGNATURE_SQL, signature)
    if row is None:
        return None
    return row["id"]


async def update_listing_status(
    conn: Any,
    listing_id: str,
    *,
    status: str,
    sold_at: Any = None,
    buyer_wallet: str | None = None,
    buyer_user_id: str | None = None,
    transaction_signature: str | None = None,
) -> dict[str, Any] | None:
    """Update a listing's status (and sale fields), returning the updated row.

    Mirrors payment.js:281-290 completePurchase's listing update — sets status,
    sold_at, buyer_wallet, buyer_user_id, transaction_signature. ``updated_at``
    is set explicitly to NOW() (no trigger on DSQL).
    """
    row = await conn.fetchrow(
        UPDATE_LISTING_STATUS_SQL,
        listing_id,
        status,
        sold_at,
        buyer_wallet,
        buyer_user_id,
        transaction_signature,
    )
    if row is None:
        return None
    return dict(row)


async def insert_transaction(conn: Any, tx: dict[str, Any]) -> dict[str, Any]:
    """INSERT a transaction row, returning the full row.

    Mirrors payment.js:258-274 completePurchase's transaction insert. Keys must
    cover ``_TRANSACTION_INSERT_COLUMNS``; missing optional keys default to None.
    """
    args = [tx.get(col) for col in _TRANSACTION_INSERT_COLUMNS]
    row = await conn.fetchrow(INSERT_TRANSACTION_SQL, *args)
    return dict(row)


async def increment_user_volume(
    user_id: str,
    amount: Decimal | float | int,
    *,
    acquire: Callable[[], Any] | None = None,
) -> dict[str, Any] | None:
    """Add ``amount`` to a seller's ``total_volume``, OCC-safe (spec §3.5 step 2).

    Replaces the Supabase ``increment_user_volume`` RPC (payment.js:298). The
    whole UPDATE is wrapped in :func:`app.db.occ.retry_on_serialization_error`
    so a DSQL 40001 abort (lost update under concurrent sellers' purchases)
    triggers a full re-run on a fresh connection/transaction rather than
    silently clobbering the running total.

    The additive ``total_volume = total_volume + $amt`` (NOT read-modify-write
    in Python) is what makes each retried attempt correct.

    Args:
        user_id: seller ``users.id``.
        amount: SOL amount to add.
        acquire: connection-acquire context-manager factory (injectable for
            tests). Defaults to :func:`app.db.pool.acquire`.

    Returns:
        ``{"id", "total_volume"}`` of the updated row, or None if the user row
        does not exist (caller treats a missing seller volume as non-fatal,
        matching payment.js's warn-not-fail behavior).
    """
    acquire_cm = acquire if acquire is not None else pool_module.acquire

    async def _do() -> dict[str, Any] | None:
        async with acquire_cm() as conn:
            row = await conn.fetchrow(INCREMENT_USER_VOLUME_SQL, user_id, amount)
            if row is None:
                return None
            return dict(row)

    return await retry_on_serialization_error(_do)


async def get_transaction_history(
    conn: Any,
    wallet_address: str,
    *,
    type: str = "all",
) -> list[dict[str, Any]]:
    """Fetch a wallet's transaction history with the embedded `listing` object.

    Reproduces Supabase PostgREST's embedded shape exactly (payment.js:332-360):
    each row is the full transaction plus a nested
    ``listing: {product_name, image_url, nft_mint_address}``.

    ``type`` selects the filter, mirroring the Express branches:
      * ``"buyer"``  -> WHERE buyer_wallet  = $1
      * ``"seller"`` -> WHERE seller_wallet = $1
      * ``"all"``    -> WHERE buyer_wallet = $1 OR seller_wallet = $1

    Single JOIN, ordered by created_at DESC — never N+1.
    """
    if type == "buyer":
        where = "WHERE t.buyer_wallet = $1 "
    elif type == "seller":
        where = "WHERE t.seller_wallet = $1 "
    else:
        where = "WHERE t.buyer_wallet = $1 OR t.seller_wallet = $1 "

    sql = _HISTORY_BASE_SQL + where + "ORDER BY t.created_at DESC"
    rows = await conn.fetch(sql, wallet_address)
    return [dict(r) for r in rows]


async def insert_activity(conn: Any, activity: dict[str, Any]) -> dict[str, Any] | None:
    """Idempotently INSERT an activity event, returning the row — or None on dup.

    ``activity`` keys must cover ``_ACTIVITY_INSERT_COLUMNS``; missing optional
    keys default to None. A duplicate (same tx_signature + event_type +
    nft_mint_address) hits ``ON CONFLICT DO NOTHING`` and returns None, so the
    caller can report "already ingested" without raising — the property that
    makes Helius's at-least-once webhook delivery safe to replay.
    """
    args = [activity.get(col) for col in _ACTIVITY_INSERT_COLUMNS]
    row = await conn.fetchrow(INSERT_ACTIVITY_SQL, *args)
    return dict(row) if row is not None else None


async def get_activities_feed(
    conn: Any,
    *,
    event_type: str | None = None,
    before_block_time: Any = None,
    before_id: str | None = None,
    limit: int = 20,
) -> list[dict[str, Any]]:
    """Keyset-paginated global activity feed, newest first.

    Pagination is keyset (NOT OFFSET): a cursor is the ``(block_time, id)`` of
    the last row seen, and the next page is everything strictly "less than" it
    in ``(block_time DESC, id DESC)`` order. This stays O(log n) as the feed
    grows, where OFFSET would scan-and-discard an ever-larger prefix.

    The row-value comparison ``(block_time, id) < ($ts, $id)`` is the standard
    keyset predicate — ``id`` breaks ties when two events share a block_time.

    Args mirror the optional query params: ``event_type`` filters the feed to
    one type (the frontend's sale/listing/transfer/mint chips); ``before_*`` is
    the decoded cursor; ``limit`` caps the page.
    """
    conds: list[str] = []
    args: list[Any] = []
    if event_type is not None:
        args.append(event_type)
        conds.append(f"event_type = ${len(args)}")
    if before_block_time is not None and before_id is not None:
        args.append(before_block_time)
        ts_idx = len(args)
        args.append(before_id)
        id_idx = len(args)
        conds.append(f"(block_time, id) < (${ts_idx}, ${id_idx})")
    where = (" WHERE " + " AND ".join(conds)) if conds else ""
    args.append(limit)
    limit_idx = len(args)
    sql = (
        f"SELECT {_ACTIVITY_COLS} FROM activities{where} "
        f"ORDER BY block_time DESC, id DESC LIMIT ${limit_idx}"
    )
    rows = await conn.fetch(sql, *args)
    return [dict(r) for r in rows]


async def get_nft_history(
    conn: Any, nft_mint_address: str, *, limit: int = 100
) -> list[dict[str, Any]]:
    """Full chain of custody for one NFT (the provenance endpoint), newest first."""
    rows = await conn.fetch(FETCH_NFT_HISTORY_SQL, nft_mint_address, limit)
    return [dict(r) for r in rows]
