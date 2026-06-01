"""Solana service — standard NFT minting + marketplace listing + verification.

Port of ``backend/src/services/solana.js`` and the orchestration half of
``backend/src/services/verification.js``, using ``solders`` + ``solana-py``.

Design notes (from the spec):
  - **Standard NFTs only.** ``use_compressed_nft`` is accepted and ignored; the
    cNFT (Bubblegum) path is dropped.
  - **Warm singletons.** The RPC client and decoded server keypair are
    module-level and reused across warm Lambda invocations.
  - **Mockable RPC boundary.** All network access goes through ``get_rpc()``
    which returns a thin ``SolanaRpc`` wrapper; tests monkeypatch the singleton
    so no devnet access is needed. Instruction *building* is pure and tested
    directly.

# TODO(devnet-verify): the end-to-end mint (submit + confirm) has only been
# exercised against mocked RPC. Instruction building is verified against the
# Borsh spec; live submission needs devnet QA before claiming e2e mint works.
"""

from __future__ import annotations

import base58
from solders.hash import Hash
from solders.instruction import Instruction
from solders.keypair import Keypair
from solders.message import Message
from solders.pubkey import Pubkey
from solders.system_program import CreateAccountParams, create_account
from solders.transaction import Transaction
from spl.token.constants import MINT_LEN, TOKEN_PROGRAM_ID
from spl.token.instructions import (
    InitializeMintParams,
    MintToParams,
    create_associated_token_account,
    get_associated_token_address,
    initialize_mint,
    mint_to,
)

from app.config.settings import get_settings
from app.services.metaplex import (
    Creator,
    DEFAULT_SELLER_FEE_BASIS_POINTS,
    DEFAULT_SYMBOL,
    MAX_NAME_LEN,
    build_create_metadata_v3_ix,
)
from app.services.verification import (
    build_list_evidence_ix,
    case_prefix_bytes,
    find_dossier_pda,
    find_listing_pda,
    find_verification_pda,
    model_name_bytes,
)

LAMPORTS_PER_SOL = 1_000_000_000


class SolanaError(RuntimeError):
    """Raised when a Solana RPC / signing operation fails."""


# ──────────────────────────────────────────────────────────────────────────────
# Mockable RPC boundary
# ──────────────────────────────────────────────────────────────────────────────
class SolanaRpc:
    """Thin wrapper over ``solana.rpc.api.Client``.

    Isolates every network call behind one object so tests can substitute a
    fake. Created lazily and reused warm. We import the heavy client lazily so
    importing this module (e.g. for instruction-building tests) is cheap.
    """

    def __init__(self, rpc_url: str) -> None:
        from solana.rpc.api import Client

        self._client = Client(rpc_url, commitment="confirmed")

    def get_latest_blockhash(self) -> Hash:
        return self._client.get_latest_blockhash().value.blockhash

    def get_minimum_balance_for_rent_exemption(self, size: int) -> int:
        return self._client.get_minimum_balance_for_rent_exemption(size).value

    def get_account_info(self, pubkey: Pubkey) -> object | None:
        return self._client.get_account_info(pubkey).value

    def send_transaction(self, tx: Transaction) -> str:
        return str(self._client.send_transaction(tx).value)

    def get_balance(self, pubkey: Pubkey) -> int:
        return self._client.get_balance(pubkey).value


_rpc: SolanaRpc | None = None
_server_wallet: Keypair | None = None


def get_rpc() -> SolanaRpc:
    """Module-level RPC singleton, reused across warm invocations."""
    global _rpc
    if _rpc is None:
        _rpc = SolanaRpc(get_settings().hacknyu_solana_rpc_url)
    return _rpc


def get_server_wallet() -> Keypair:
    """Decode + cache the server wallet keypair from its base58 secret key.

    Mirrors ``getServerWallet`` — decoded once per process to avoid redundant
    base58 decoding (and to keep the secret in heap a shorter aggregate time).
    """
    global _server_wallet
    if _server_wallet is not None:
        return _server_wallet
    secret = get_settings().hacknyu_server_wallet_private_key
    if not secret:
        raise SolanaError("HACKNYU_SERVER_WALLET_PRIVATE_KEY not set")
    try:
        _server_wallet = Keypair.from_bytes(base58.b58decode(secret))
    except Exception as exc:  # noqa: BLE001 — match JS broad catch on bad key
        raise SolanaError("Invalid HACKNYU_SERVER_WALLET_PRIVATE_KEY format") from exc
    return _server_wallet


# ──────────────────────────────────────────────────────────────────────────────
# NFT minting (standard NFT, hand-built)
# ──────────────────────────────────────────────────────────────────────────────
def build_mint_instructions(
    *,
    mint: Pubkey,
    mint_authority: Pubkey,
    payer: Pubkey,
    target_wallet: Pubkey,
    metadata_uri: str,
    name: str,
    rent_lamports: int,
) -> list[Instruction]:
    """Build the standard-NFT mint instruction set (pure, no network).

    Equivalent to umi ``createNft`` decomposed into raw instructions:
      1. create_account        — allocate the mint account (rent-exempt, MINT_LEN)
      2. initialize_mint       — 0 decimals, mint_authority = server wallet
      3. create_ata            — associated token account owned by target_wallet
      4. mint_to               — mint exactly 1 token (NFT supply) to the ATA
      5. create_metadata_v3    — Token Metadata account (royalty 5%, creator=server)

    The server wallet is the mint authority, update authority and the sole
    verified 100%-share creator, matching the JS mint.
    """
    truncated_name = name[:MAX_NAME_LEN]
    ata = get_associated_token_address(owner=target_wallet, mint=mint)

    create_mint_acct_ix = create_account(
        CreateAccountParams(
            from_pubkey=payer,
            to_pubkey=mint,
            lamports=rent_lamports,
            space=MINT_LEN,
            owner=TOKEN_PROGRAM_ID,
        )
    )
    init_mint_ix = initialize_mint(
        InitializeMintParams(
            program_id=TOKEN_PROGRAM_ID,
            mint=mint,
            decimals=0,
            mint_authority=mint_authority,
            freeze_authority=mint_authority,
        )
    )
    create_ata_ix = create_associated_token_account(
        payer=payer, owner=target_wallet, mint=mint
    )
    mint_to_ix = mint_to(
        MintToParams(
            program_id=TOKEN_PROGRAM_ID,
            mint=mint,
            dest=ata,
            mint_authority=mint_authority,
            amount=1,
        )
    )
    metadata_ix = build_create_metadata_v3_ix(
        mint=mint,
        mint_authority=mint_authority,
        payer=payer,
        update_authority=mint_authority,
        name=truncated_name,
        symbol=DEFAULT_SYMBOL,
        uri=metadata_uri,
        seller_fee_basis_points=DEFAULT_SELLER_FEE_BASIS_POINTS,
        creators=[Creator(address=mint_authority, verified=True, share=100)],
        is_mutable=True,
    )
    return [create_mint_acct_ix, init_mint_ix, create_ata_ix, mint_to_ix, metadata_ix]


def mint_nft(
    target_wallet: str,
    metadata_uri: str,
    name: str,
    use_compressed_nft: bool = False,  # noqa: ARG001 — accepted + ignored (cNFT dropped)
) -> str:
    """Mint a standard NFT to ``target_wallet`` and return the base58 mint address.

    Port of ``mintNFT``. The server wallet pays + signs; a fresh mint keypair is
    generated and co-signs the account creation. Returns the mint address.
    """
    server_wallet = get_server_wallet()
    rpc = get_rpc()
    target = Pubkey.from_string(target_wallet)
    mint_keypair = Keypair()

    try:
        rent = rpc.get_minimum_balance_for_rent_exemption(MINT_LEN)
        instructions = build_mint_instructions(
            mint=mint_keypair.pubkey(),
            mint_authority=server_wallet.pubkey(),
            payer=server_wallet.pubkey(),
            target_wallet=target,
            metadata_uri=metadata_uri,
            name=name,
            rent_lamports=rent,
        )
        blockhash = rpc.get_latest_blockhash()
        message = Message.new_with_blockhash(
            instructions, server_wallet.pubkey(), blockhash
        )
        tx = Transaction([server_wallet, mint_keypair], message, blockhash)
        rpc.send_transaction(tx)
    except SolanaError:
        raise
    except Exception as exc:  # noqa: BLE001 — match JS broad catch + rewrap
        raise SolanaError(f"Failed to mint NFT: {exc}") from exc

    return str(mint_keypair.pubkey())


# ──────────────────────────────────────────────────────────────────────────────
# Marketplace listing — custodial vs user-wallet (listing.js:399 parity)
# ──────────────────────────────────────────────────────────────────────────────
def list_item_on_marketplace(
    nft_mint: str, price_sol: float, seller: str
) -> dict[str, object]:
    """Two-mode marketplace listing (port of ``listItemOnMarketplace``).

    - **skipped**: ``HACKNYU_MARKETPLACE_PROGRAM_ID`` unset → no-op (program not
      deployed).
    - **custodial_listed**: seller == server wallet → server signs `list_evidence`.
    - **pending_user_signature**: seller is a user wallet → return a hint object;
      the frontend builds + signs the tx itself.

    Requires a ``VerificationProof`` PDA to already exist for ``nft_mint``
    (call ``submit_verification`` first).
    """
    if not get_settings().hacknyu_marketplace_program_id:
        return {"mode": "skipped", "reason": "contract not deployed"}

    mint_pk = Pubkey.from_string(nft_mint)
    listing_pda = find_listing_pda(mint_pk)
    price_lamports = round(price_sol * LAMPORTS_PER_SOL)

    server_wallet = get_server_wallet()
    seller_pk = Pubkey.from_string(seller)
    is_custodial = seller_pk == server_wallet.pubkey()

    if not is_custodial:
        return {
            "mode": "pending_user_signature",
            "listingPda": str(listing_pda),
            "programId": get_settings().hacknyu_marketplace_program_id,
            "seller": seller,
            "nftMint": nft_mint,
            "priceLamports": str(price_lamports),
        }

    # Custodial path — server signs the full listing tx.
    rpc = get_rpc()
    ix = build_list_evidence_ix(
        seller=server_wallet.pubkey(),
        nft_mint=mint_pk,
        price_lamports=price_lamports,
    )
    blockhash = rpc.get_latest_blockhash()
    message = Message.new_with_blockhash([ix], server_wallet.pubkey(), blockhash)
    tx = Transaction([server_wallet], message, blockhash)
    signature = rpc.send_transaction(tx)

    return {
        "mode": "custodial_listed",
        "listingPda": str(listing_pda),
        "signature": signature,
    }


# ──────────────────────────────────────────────────────────────────────────────
# Verification anchoring orchestration (port of verification.js)
# ──────────────────────────────────────────────────────────────────────────────
def ensure_server_dossier() -> dict[str, object]:
    """Ensure the server wallet has a Dossier PDA open on-chain.

    Cheap to call — checks ``get_account_info`` first and only sends the
    ``init_dossier`` tx if the PDA is missing. The server wallet IS the examiner
    in v1. (The JS in-flight-promise dedupe is unnecessary here: synchronous RPC
    calls under the GIL don't interleave the check/send the way concurrent JS
    promises did.)
    """
    from app.services.verification import build_init_dossier_ix

    rpc = get_rpc()
    wallet = get_server_wallet()
    dossier_pda = find_dossier_pda(wallet.pubkey())

    if rpc.get_account_info(dossier_pda) is not None:
        return {"dossierPda": str(dossier_pda), "created": False}

    ix = build_init_dossier_ix(
        authority=wallet.pubkey(),
        case_prefix=case_prefix_bytes(get_settings().hacknyu_case_prefix),
        examiner=wallet.pubkey(),
    )
    blockhash = rpc.get_latest_blockhash()
    message = Message.new_with_blockhash([ix], wallet.pubkey(), blockhash)
    tx = Transaction([wallet], message, blockhash)
    rpc.send_transaction(tx)
    return {"dossierPda": str(dossier_pda), "created": True}


def submit_verification(
    *,
    nft_mint: str,
    confidence_bps: int,
    model_name: str,
    liveness_passed: bool,
) -> dict[str, str]:
    """Anchor an AI verification verdict on-chain (port of ``submitVerification``).

    Validates ``confidence_bps`` is an int in 0..=10_000, ensures the server
    dossier exists, then submits the ``submit_verification`` instruction. Returns
    ``{signature, verificationPda}``.
    """
    from app.services.verification import build_submit_verification_ix

    if (
        isinstance(confidence_bps, bool)
        or not isinstance(confidence_bps, int)
        or confidence_bps < 0
        or confidence_bps > 10_000
    ):
        raise SolanaError("confidence_bps must be an integer in 0..=10000")

    ensure_server_dossier()

    rpc = get_rpc()
    wallet = get_server_wallet()
    mint_pk = Pubkey.from_string(nft_mint)
    verification_pda = find_verification_pda(mint_pk)

    ix = build_submit_verification_ix(
        examiner=wallet.pubkey(),
        nft_mint=mint_pk,
        dossier_authority=wallet.pubkey(),
        confidence_bps=confidence_bps,
        model_name=model_name_bytes(model_name),
        liveness_passed=liveness_passed,
    )
    blockhash = rpc.get_latest_blockhash()
    message = Message.new_with_blockhash([ix], wallet.pubkey(), blockhash)
    tx = Transaction([wallet], message, blockhash)
    signature = rpc.send_transaction(tx)

    return {"signature": signature, "verificationPda": str(verification_pda)}


def get_balance(address: str) -> float:
    """Return the SOL balance of ``address`` (port of ``getBalance``; 0 on error)."""
    try:
        rpc = get_rpc()
        lamports = rpc.get_balance(Pubkey.from_string(address))
        return lamports / LAMPORTS_PER_SOL
    except Exception:  # noqa: BLE001 — JS returns 0 on any error
        return 0.0
