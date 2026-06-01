"""Solana Pay service — payment requests, on-chain verification, purchase completion.

Ports ``backend/src/services/payment.js`` onto the FastAPI stack: DB access goes
through :mod:`app.db.queries` (Aurora DSQL) and chain access through
:mod:`app.services.solana`'s mockable ``SolanaRpc``. No Supabase, no direct
web3.js — same external HTTP contract.

The ``verify_payment`` balance-delta parsing reads solders transaction fields;
the exact attribute paths are marked ``TODO(devnet-verify)`` and are exercised in
tests via an injected fake RPC, but should be confirmed against a real devnet tx.
"""

from __future__ import annotations

import time
from typing import Any

from app.db import pool as pool_module
from app.db import queries
from app.services import solana
from app.utils.solana_validation import is_valid_solana_pubkey

LAMPORTS_PER_SOL = 1_000_000_000
_AMOUNT_TOLERANCE_SOL = 0.001  # rounding/fee tolerance (payment.js:189)
_STALE_TX_SECONDS = 5 * 60


class PaymentError(Exception):
    """Raised for payment flow failures that should surface as a 500/error."""


async def fetch_listing(listing_id: str, *, acquire: Any = None) -> dict[str, Any]:
    """Fetch an active listing, or raise (payment.js:34-54).

    Raises PaymentError if not found or not 'active' — the router maps it to the
    Express error shape.
    """
    acquire_cm = acquire if acquire is not None else pool_module.acquire
    async with acquire_cm() as conn:
        listing = await queries.fetch_listing_by_id(conn, listing_id)
    if listing is None:
        raise PaymentError("Listing not found")
    if listing.get("status") != "active":
        raise PaymentError(
            f"Listing is not available for purchase. Status: {listing.get('status')}"
        )
    return listing


def _payment_reference(listing_id: str) -> str:
    return f"hypechain-{listing_id}-{int(time.time() * 1000)}"


async def create_payment_request(
    listing_id: str, buyer_wallet: str, *, acquire: Any = None
) -> dict[str, Any]:
    """Build a Solana Pay request for a listing (payment.js:73-121)."""
    if not is_valid_solana_pubkey(buyer_wallet):
        raise PaymentError("Invalid buyer wallet address")

    listing = await fetch_listing(listing_id, acquire=acquire)

    if not is_valid_solana_pubkey(listing.get("seller_wallet")):
        raise PaymentError("Invalid seller wallet address")

    if buyer_wallet == listing.get("seller_wallet"):
        raise PaymentError("Cannot purchase your own listing")

    return {
        "recipient": listing["seller_wallet"],
        "amount": float(listing["price_sol"]),
        "splToken": None,  # native SOL
        "reference": _payment_reference(listing_id),
        "label": f"HypeChain - {listing['product_name']}",
        "message": f"Purchase {listing['product_name']} NFT",
        "memo": f"listing:{listing_id}",
        "listingId": listing_id,
        "nftMintAddress": listing["nft_mint_address"],
        "productName": listing["product_name"],
        "imageUrl": listing["image_url"],
    }


def _extract_tx_fields(tx: Any) -> dict[str, Any]:
    """Pull the fields verify_payment needs from a solders confirmed-tx object.

    Defensive getattr access keeps this testable with a fake and tolerant of
    solders version differences. TODO(devnet-verify): confirm these attribute
    paths against a real `get_transaction` response on devnet.
    """
    meta = getattr(getattr(tx, "transaction", None), "meta", None) or getattr(tx, "meta", None)
    inner = getattr(tx, "transaction", tx)
    message = getattr(getattr(inner, "transaction", inner), "message", None)
    account_keys = getattr(message, "account_keys", None) or []
    return {
        "err": getattr(meta, "err", None),
        "pre_balances": list(getattr(meta, "pre_balances", []) or []),
        "post_balances": list(getattr(meta, "post_balances", []) or []),
        "account_keys": [str(k) for k in account_keys],
        "block_time": getattr(tx, "block_time", None),
        "slot": getattr(tx, "slot", None),
    }


async def verify_payment(
    signature: str,
    expected_recipient: str,
    expected_amount: float,
    listing_id: str,
    *,
    acquire: Any = None,
    rpc: Any = None,
) -> dict[str, Any]:
    """Verify a SOL payment on-chain (payment.js:131-241).

    Returns ``{valid, ...}``. On a not-yet-found tx returns ``needsRetry: True``.
    """
    rpc_client = rpc if rpc is not None else solana.get_rpc()
    try:
        tx = rpc_client.get_transaction(signature)
        if tx is None:
            return {
                "valid": False,
                "error": "Transaction not found on blockchain",
                "needsRetry": True,
            }

        fields = _extract_tx_fields(tx)

        if fields["err"] is not None:
            return {"valid": False, "error": f"Transaction failed: {fields['err']}"}

        # Recipient balance delta = amount received.
        amount_transferred = 0.0
        recipient_found = False
        keys = fields["account_keys"]
        for i, key in enumerate(keys):
            if key == expected_recipient:
                recipient_found = True
                pre = fields["pre_balances"][i] if i < len(fields["pre_balances"]) else 0
                post = fields["post_balances"][i] if i < len(fields["post_balances"]) else 0
                amount_transferred = (post - pre) / LAMPORTS_PER_SOL
                break

        if not recipient_found:
            return {"valid": False, "error": "Recipient wallet not found in transaction"}

        expected = float(expected_amount)
        if abs(amount_transferred - expected) > _AMOUNT_TOLERANCE_SOL:
            return {
                "valid": False,
                "error": (
                    f"Amount mismatch. Expected: {expected} SOL, "
                    f"Received: {amount_transferred} SOL"
                ),
            }

        block_time = fields["block_time"]
        if block_time is not None and (int(time.time()) - block_time) > _STALE_TX_SECONDS:
            # Warn-not-reject, matching payment.js:204-207.
            pass

        # Reject a replayed signature.
        acquire_cm = acquire if acquire is not None else pool_module.acquire
        async with acquire_cm() as conn:
            existing = await queries.get_transaction_id_by_signature(conn, signature)
        if existing is not None:
            return {"valid": False, "error": "Transaction signature already used"}

        return {
            "valid": True,
            "amountTransferred": amount_transferred,
            "blockTime": block_time,
            "slot": fields["slot"],
        }
    except Exception as error:  # noqa: BLE001 — parity with the JS catch
        return {
            "valid": False,
            "error": str(error),
            "needsRetry": "not found" in str(error).lower(),
        }


async def complete_purchase(
    listing_id: str,
    buyer_wallet: str,
    buyer_user_id: str | None,
    signature: str,
    amount_sol: float,
    *,
    acquire: Any = None,
) -> dict[str, Any]:
    """Record the transaction + mark the listing sold (payment.js:252-324)."""
    acquire_cm = acquire if acquire is not None else pool_module.acquire
    listing = await fetch_listing(listing_id, acquire=acquire)

    from datetime import datetime, timezone

    now_iso = datetime.now(timezone.utc).isoformat()

    async with acquire_cm() as conn:
        tx_record = await queries.insert_transaction(
            conn,
            {
                "listing_id": listing_id,
                "buyer_wallet": buyer_wallet,
                "seller_wallet": listing["seller_wallet"],
                "buyer_user_id": buyer_user_id,
                "seller_user_id": listing.get("seller_user_id"),
                "amount_sol": amount_sol,
                "signature": signature,
                "status": "confirmed",
                "payment_method": "SOL",
                "blockchain_confirmed": True,
                "confirmed_at": now_iso,
            },
        )
        await queries.update_listing_status(
            conn,
            listing_id,
            status="sold",
            sold_at=now_iso,
            buyer_wallet=buyer_wallet,
            buyer_user_id=buyer_user_id,
            transaction_signature=signature,
        )

    # Best-effort seller volume (OCC-safe). Never fail the purchase (payment.js:303-306).
    seller_user_id = listing.get("seller_user_id")
    if seller_user_id:
        try:
            await queries.increment_user_volume(seller_user_id, amount_sol, acquire=acquire)
        except Exception:  # noqa: BLE001 — warn-not-fail
            pass

    return {
        "success": True,
        "transaction": tx_record,
        "listing": {
            "id": listing_id,
            "nft_mint_address": listing["nft_mint_address"],
            "product_name": listing["product_name"],
        },
    }


async def get_transaction_history(
    wallet_address: str, type: str = "all", *, acquire: Any = None
) -> list[dict[str, Any]]:
    """Wallet transaction history with embedded listing (payment.js:332-365)."""
    acquire_cm = acquire if acquire is not None else pool_module.acquire
    async with acquire_cm() as conn:
        return await queries.get_transaction_history(conn, wallet_address, type=type)


def get_wallet_balance(wallet_address: str, *, rpc: Any = None) -> float:
    """SOL balance for a wallet (payment.js:372-381)."""
    if not is_valid_solana_pubkey(wallet_address):
        raise PaymentError("Invalid wallet address")
    from solders.pubkey import Pubkey

    rpc_client = rpc if rpc is not None else solana.get_rpc()
    lamports = rpc_client.get_balance(Pubkey.from_string(wallet_address))
    return lamports / LAMPORTS_PER_SOL
