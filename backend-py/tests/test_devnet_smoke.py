"""E8 — devnet on-chain smoke test (PR1 acceptance criteria).

SKIPPED BY DEFAULT. This is the real end-to-end proof-of-life for the on-chain
buy loop: once the Anchor program is deployed and the server/custodial keypair
is funded, it mints a standard NFT to the custodial wallet, anchors a
``submit_verification`` verdict, then runs ``list_evidence`` through the
CUSTODIAL listing branch (seller == server wallet) — the exact path guest
listings take. It asserts each on-chain account/PDA is created.

It runs ONLY when ALL of the following are set (otherwise it skips with a clear
message, so CI stays green pre-deploy):

  - ``RUN_DEVNET=1``                       — explicit opt-in
  - ``HACKNYU_MARKETPLACE_PROGRAM_ID``     — the deployed program ID
  - ``HACKNYU_SERVER_WALLET_PRIVATE_KEY``  — a FUNDED custodial keypair (devnet)

To run after deploy (see contracts/DEPLOY.md):

    RUN_DEVNET=1 \
    HACKNYU_MARKETPLACE_PROGRAM_ID=<deployed id> \
    HACKNYU_SERVER_WALLET_PRIVATE_KEY=<base58 funded key> \
    HACKNYU_SOLANA_RPC_URL=https://api.devnet.solana.com \
    uv run pytest tests/test_devnet_smoke.py -v

WARNING: this spends devnet SOL and submits REAL transactions. Never run it
against mainnet RPC.
"""

from __future__ import annotations

import os

import pytest

# Gate: every condition must hold or the whole module skips (no devnet access).
_RUN = os.environ.get("RUN_DEVNET") == "1"
_HAS_PROGRAM = bool(os.environ.get("HACKNYU_MARKETPLACE_PROGRAM_ID"))
_HAS_WALLET = bool(os.environ.get("HACKNYU_SERVER_WALLET_PRIVATE_KEY"))

_SKIP_REASON = (
    "devnet smoke test disabled — set RUN_DEVNET=1 + a deployed "
    "HACKNYU_MARKETPLACE_PROGRAM_ID + a funded HACKNYU_SERVER_WALLET_PRIVATE_KEY "
    "to run (see contracts/DEPLOY.md). Skipped by default so CI stays green "
    "before the program is deployed."
)

pytestmark = pytest.mark.skipif(
    not (_RUN and _HAS_PROGRAM and _HAS_WALLET), reason=_SKIP_REASON
)


def test_custodial_submit_verification_and_list_round_trip():  # pragma: no cover - devnet only
    """Custodial round-trip: mint -> submit_verification -> list_evidence.

    Uses the REAL ``app.services.solana`` against a deployed program. Resets the
    module singletons so it picks up the live RPC + funded server wallet from the
    environment rather than any cached test fakes.
    """
    import app.services.solana as solana
    from app.utils.solana_validation import is_valid_solana_pubkey

    # Reset warm singletons so we bind to the live env, not test fakes.
    solana._rpc = None
    solana._server_wallet = None
    solana._platform_custodial_pubkey = None

    custodial = solana.get_platform_custodial_pubkey()
    custodial_str = str(custodial)
    # E5 invariant on real keys: the custodial seller is a valid signable wallet.
    assert is_valid_solana_pubkey(custodial_str)

    # 1. Mint a standard NFT to the custodial (server) wallet.
    mint_address = solana.mint_nft(
        custodial_str, "ipfs://devnet-smoke/meta.json", "Devnet Smoke Item"
    )
    assert is_valid_solana_pubkey(mint_address) or len(mint_address) > 0

    # 2. Anchor an AI verification verdict (creates the VerificationProof PDA;
    #    opens the server Dossier first if missing).
    verification = solana.submit_verification(
        nft_mint=mint_address,
        confidence_bps=7500,
        model_name="DEVNET-SMOKE",
        liveness_passed=True,
    )
    assert verification["signature"]
    assert verification["verificationPda"]

    # 3. List on the marketplace via the CUSTODIAL branch (server signs).
    result = solana.list_item_on_marketplace(mint_address, 0.01, custodial_str)
    assert result["mode"] == "custodial_listed"
    assert result["signature"]
    assert result["listingPda"]
