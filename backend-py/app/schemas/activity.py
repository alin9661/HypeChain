"""Activity feed schemas: response shape, cursor codec, row -> response mapping.

The response shape matches the field names the frontend's activities page
already consumes (``frontend/app/activities/page.tsx``: ``type``, ``nftName``,
``nftImage``, ``from``, ``to``, ``price``, ``timestamp``, ``txHash``) so swapping
``MOCK_ACTIVITIES`` for a real fetch is a drop-in. ``timestamp`` is epoch
milliseconds because the page renders it via ``new Date(timestamp)`` /
``formatDistanceToNow``.

The opaque cursor encodes the keyset ``(block_time, id)`` of the last row so the
client never constructs SQL predicates — it just echoes the ``nextCursor`` back.
"""

from __future__ import annotations

import base64
import binascii
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any

from pydantic import BaseModel, Field

# ``from``/``to`` are Python-reserved-ish / shadow builtins, so the Pydantic
# fields are named ``from_wallet``/``to_wallet`` internally and aliased to the
# wire names the frontend expects.


class ActivityItem(BaseModel):
    """One activity row in the wire shape the frontend renders."""

    id: str
    type: str  # mint | listing | sale | transfer
    nftName: str | None = None
    nftImage: str | None = None
    from_: str | None = Field(default=None, alias="from")
    to: str | None = None
    price: float = 0.0
    timestamp: int  # epoch milliseconds
    txHash: str

    model_config = {"populate_by_name": True}


class ActivityFeedResponse(BaseModel):
    """A page of the global feed plus the cursor to fetch the next page."""

    activities: list[ActivityItem]
    nextCursor: str | None = None
    hasMore: bool = False


class NftHistoryResponse(BaseModel):
    """Full chain of custody for one NFT (the provenance endpoint)."""

    nftMintAddress: str
    activities: list[ActivityItem]


def _block_time_ms(block_time: Any) -> int:
    """Convert a TIMESTAMPTZ (datetime) to epoch milliseconds for the frontend."""
    if isinstance(block_time, datetime):
        return int(block_time.timestamp() * 1000)
    # Fallback: numeric epoch already (seconds or ms) — normalize to ms.
    value = float(block_time)
    return int(value * 1000) if value < 1e12 else int(value)


def to_activity_item(row: dict[str, Any]) -> ActivityItem:
    """Map a DB activities row to the frontend wire shape."""
    price = row.get("price_sol")
    return ActivityItem(
        id=str(row["id"]),
        type=row["event_type"],
        nftName=row.get("product_name"),
        nftImage=row.get("image_url"),
        from_=row.get("from_wallet"),
        to=row.get("to_wallet"),
        price=float(price) if price is not None else 0.0,
        timestamp=_block_time_ms(row["block_time"]),
        txHash=row["tx_signature"],
    )


def encode_cursor(row: dict[str, Any]) -> str:
    """Encode the keyset position of a row into an opaque cursor string.

    Format (pre-base64): ``<block_time ISO-8601>|<id>``. Base64url keeps it
    URL-safe as a query param. The client treats it as opaque.
    """
    block_time = row["block_time"]
    bt = block_time.isoformat() if isinstance(block_time, datetime) else str(block_time)
    raw = f"{bt}|{row['id']}".encode()
    return base64.urlsafe_b64encode(raw).decode()


def decode_cursor(cursor: str) -> tuple[datetime, str]:
    """Decode an opaque cursor back into ``(block_time, id)``.

    Raises ``ValueError`` on any malformed cursor so the router can return a
    clean 400 rather than leaking a 500 / silently ignoring the paging request.
    """
    try:
        raw = base64.urlsafe_b64decode(cursor.encode()).decode()
    except (binascii.Error, UnicodeDecodeError, ValueError) as exc:
        raise ValueError("malformed cursor") from exc
    bt_str, _, id_str = raw.partition("|")
    if not bt_str or not id_str:
        raise ValueError("malformed cursor")
    try:
        block_time = datetime.fromisoformat(bt_str)
    except ValueError as exc:
        raise ValueError("malformed cursor") from exc
    if block_time.tzinfo is None:
        block_time = block_time.replace(tzinfo=timezone.utc)
    return block_time, id_str


# Re-exported so callers can build a price-as-Decimal without importing decimal.
__all__ = [
    "ActivityItem",
    "ActivityFeedResponse",
    "NftHistoryResponse",
    "to_activity_item",
    "encode_cursor",
    "decode_cursor",
    "Decimal",
]
