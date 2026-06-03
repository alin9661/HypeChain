"""Health + root discovery endpoints.

Response shapes are ported verbatim from the Express service (`backend/src/index.js`)
so the HTTP contract is identical — `/health` is hit by Lambda Function URL probes
and local dev, `/` is the API discovery document.
"""

import time
from datetime import datetime, timezone

from fastapi import APIRouter

from app.config.settings import get_settings

router = APIRouter()

# Process start time — Python has no process.uptime(); we capture it at import
# and report elapsed seconds, matching the Express `process.uptime()` semantics.
_PROCESS_START = time.monotonic()


@router.get("/health")
async def health() -> dict:
    settings = get_settings()
    return {
        "status": "healthy",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "uptime": time.monotonic() - _PROCESS_START,
        "environment": settings.node_env,
    }


@router.get("/")
async def root() -> dict:
    return {
        "name": "HypeChain Backend API",
        "version": "1.0.0",
        "description": "AI-Powered NFT Marketplace Backend with Solana Pay",
        "endpoints": {
            "health": "/health",
            "createListing": "POST /api/create-listing",
            "listingInfo": "GET /api/create-listing",
            "createPayment": "POST /api/payments/create",
            "verifyPayment": "POST /api/payments/verify",
            "paymentHistory": "GET /api/payments/history/:walletAddress",
            "walletBalance": "GET /api/payments/balance/:walletAddress",
            "getListingDetails": "GET /api/payments/listing/:listingId",
            "activities": "GET /api/activities",
            "nftHistory": "GET /api/nft/:mint/history",
            "heliusWebhook": "POST /api/webhooks/helius",
        },
        "documentation": "https://github.com/alin9661/HypeChain",
    }
