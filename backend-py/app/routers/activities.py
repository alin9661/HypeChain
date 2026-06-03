"""Activity feed + provenance endpoints.

  GET /api/activities?type=&cursor=&limit=   global, keyset-paginated feed
  GET /api/nft/{mint}/history                 full chain of custody for one NFT

The feed is the natural home for HypeChain's differentiator: a verified physical
item AND its full on-chain ownership chain, which neither StockX/GOAT (no
provenance) nor a pure-NFT marketplace (no physical authentication) can show
together. ``/nft/{mint}/history`` exposes that chain directly.

An empty result is a normal 200 (``activities: []``) — at launch, before there's
real volume, the frontend renders an honest "no activity yet" state rather than
seeded/fake data.
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query

from app.schemas.activity import (
    ActivityFeedResponse,
    NftHistoryResponse,
    to_activity_item,
)
from app.services import activity as activity_service

router = APIRouter()

_VALID_TYPES = activity_service.VALID_EVENT_TYPES


@router.get("/activities", response_model=ActivityFeedResponse)
async def list_activities(
    type: str | None = Query(default=None, description="mint | listing | sale | transfer"),
    cursor: str | None = Query(default=None, description="opaque keyset cursor from nextCursor"),
    limit: int = Query(default=activity_service.DEFAULT_FEED_LIMIT, ge=1, le=activity_service.MAX_LIMIT),
) -> ActivityFeedResponse:
    """Global activity feed, newest first, keyset-paginated."""
    if type is not None and type not in _VALID_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"invalid type '{type}' — expected one of {sorted(_VALID_TYPES)}",
        )
    try:
        rows, next_cursor = await activity_service.feed(event_type=type, cursor=cursor, limit=limit)
    except ValueError as exc:
        # Malformed cursor — a client paging error, not a server fault.
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return ActivityFeedResponse(
        activities=[to_activity_item(r) for r in rows],
        nextCursor=next_cursor,
        hasMore=next_cursor is not None,
    )


@router.get("/nft/{mint}/history", response_model=NftHistoryResponse)
async def nft_history(mint: str) -> NftHistoryResponse:
    """Full chain of custody for one NFT (provenance). Empty list if unknown mint."""
    rows = await activity_service.history(mint)
    return NftHistoryResponse(
        nftMintAddress=mint,
        activities=[to_activity_item(r) for r in rows],
    )
