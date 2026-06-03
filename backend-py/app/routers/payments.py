"""Payment routes — thin controllers over app.services.payment.

Ported 1:1 from backend/src/routes/payment.js. Mounted at /api/payments. Error
shapes match Express: missing fields -> 400, invalid verification -> 400 with
needsRetry, failures -> 500 {success:false, error}.
"""

from __future__ import annotations

import structlog
from fastapi import APIRouter
from fastapi.responses import JSONResponse

from app.config.settings import get_settings
from app.schemas.payment import (
    PaymentCancelRequest,
    PaymentCreateRequest,
    PaymentVerifyRequest,
)
from app.services import payment

router = APIRouter()
log = structlog.get_logger()


def _error(status: int, message: str, **extra: object) -> JSONResponse:
    return JSONResponse(status_code=status, content={"success": False, "error": message, **extra})


def _server_error(context: str, error: Exception) -> JSONResponse:
    """Log full detail server-side; expose it to clients only in development."""
    log.error(context, error=str(error))
    message = str(error) if get_settings().is_development else "Internal server error"
    return _error(500, message)


@router.post("/create")
async def create_payment(body: PaymentCreateRequest):
    if not body.listing_id or not body.buyer_wallet:
        return _error(400, "Missing required fields: listingId and buyerWallet")
    try:
        payment_request = await payment.create_payment_request(body.listing_id, body.buyer_wallet)
        return {"success": True, "paymentRequest": payment_request}
    except Exception as error:  # noqa: BLE001
        return _server_error("payment_create_error", error)


@router.post("/verify")
async def verify_payment(body: PaymentVerifyRequest):
    if not body.signature or not body.listing_id or not body.buyer_wallet:
        return _error(400, "Missing required fields: signature, listingId, and buyerWallet")
    try:
        listing = await payment.fetch_listing(body.listing_id)
        verification = await payment.verify_payment(
            body.signature,
            listing["seller_wallet"],
            listing["price_sol"],
            body.listing_id,
            body.buyer_wallet,
        )
        if not verification.get("valid"):
            return _error(
                400, verification.get("error", "Verification failed"),
                needsRetry=verification.get("needsRetry", False),
            )
        purchase = await payment.complete_purchase(
            body.listing_id,
            body.buyer_wallet,
            body.buyer_user_id,
            body.signature,
            verification["amountTransferred"],
        )
        return {
            "success": True,
            "verification": {
                "valid": True,
                "amountTransferred": verification["amountTransferred"],
                "blockTime": verification.get("blockTime"),
                "slot": verification.get("slot"),
            },
            "purchase": purchase,
        }
    except Exception as error:  # noqa: BLE001
        return _server_error("payment_verify_error", error)


@router.get("/history/{wallet_address}")
async def history(wallet_address: str, type: str = "all"):
    if not wallet_address:
        return _error(400, "Wallet address is required")
    try:
        transactions = await payment.get_transaction_history(wallet_address, type)
        return {"success": True, "transactions": transactions, "count": len(transactions)}
    except Exception as error:  # noqa: BLE001
        return _server_error("payment_history_error", error)


@router.get("/balance/{wallet_address}")
def balance(wallet_address: str):
    # Sync route: the RPC call is blocking, so FastAPI runs it in a threadpool.
    if not wallet_address:
        return _error(400, "Wallet address is required")
    try:
        bal = payment.get_wallet_balance(wallet_address)
        return {"success": True, "walletAddress": wallet_address, "balance": bal}
    except Exception as error:  # noqa: BLE001
        return _server_error("payment_balance_error", error)


@router.get("/listing/{listing_id}")
async def listing_details(listing_id: str):
    if not listing_id:
        return _error(400, "Listing ID is required")
    try:
        listing = await payment.fetch_listing(listing_id)
        return {"success": True, "listing": listing}
    except Exception as error:  # noqa: BLE001
        return _server_error("payment_listing_error", error)


@router.post("/cancel")
async def cancel(body: PaymentCancelRequest):
    # Solana Pay needs no real cancellation — UI-state no-op (payment.js:321-349).
    if not body.listing_id:
        return _error(400, "Listing ID is required")
    return {"success": True, "message": "Payment cancelled (listing remains active)"}
