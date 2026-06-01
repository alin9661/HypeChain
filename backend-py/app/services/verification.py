"""On-chain verification anchoring for the HypeChain Evidence Locker program.

Port of ``backend/src/services/verification.js`` + the instruction-builder half
of ``evidence-locker-client.js``. The server wallet acts as the on-chain
*examiner*: the AI verdict is computed off-chain (OpenRouter) and this service
anchors it on-chain so the redacted-field UI can prove the confidence score
wasn't tampered with after the fact.

The PDA seeds, discriminators and Borsh field order MUST stay byte-identical to
``frontend/lib/anchor-client.ts`` and the on-chain program. If you change one,
change all three or every call fails with ``ConstraintSeeds``.

Instruction building here is pure and testable. RPC submission goes through the
``SolanaRpc`` boundary in ``app.services.solana`` so it can be mocked in tests.
"""

from __future__ import annotations

from solders.instruction import AccountMeta, Instruction
from solders.pubkey import Pubkey
from solders.system_program import ID as SYSTEM_PROGRAM_ID

from app.config.settings import get_settings

# ── Program ID + threshold (mirror of the on-chain constant) ────────────────
# Anchor placeholder default — replaced via `anchor keys sync` + deploy. We read
# the deployed program ID from settings, falling back to the same placeholder
# the JS/TS clients use so PDA derivation is consistent across the stack.
_DEFAULT_PROGRAM_ID = "Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS"

# 50% expressed in basis points — mirror of MIN_CONFIDENCE_BPS in the program.
MIN_CONFIDENCE_BPS = 5000


def get_program_id() -> Pubkey:
    """Resolve the Evidence Locker program ID from settings (or placeholder)."""
    settings = get_settings()
    return Pubkey.from_string(settings.hacknyu_marketplace_program_id or _DEFAULT_PROGRAM_ID)


# ── Instruction discriminators — sha256("global:<ix>")[0..8], pinned ────────
# Computed once and pinned (matches anchor-client.ts byte-for-byte).
IX_INIT_DOSSIER = bytes([60, 164, 158, 113, 143, 45, 252, 114])
IX_SUBMIT_VERIFICATION = bytes([30, 19, 8, 156, 126, 43, 28, 175])
IX_LIST_EVIDENCE = bytes([110, 84, 14, 230, 70, 165, 24, 178])


# ── PDA helpers — seeds MUST match the program byte-for-byte ────────────────
def find_dossier_pda(authority: Pubkey) -> Pubkey:
    """seeds = [b"dossier", authority]."""
    pda, _ = Pubkey.find_program_address([b"dossier", bytes(authority)], get_program_id())
    return pda


def find_verification_pda(nft_mint: Pubkey) -> Pubkey:
    """seeds = [b"verification", nft_mint]."""
    pda, _ = Pubkey.find_program_address(
        [b"verification", bytes(nft_mint)], get_program_id()
    )
    return pda


def find_listing_pda(nft_mint: Pubkey) -> Pubkey:
    """seeds = [b"evidence", nft_mint]."""
    pda, _ = Pubkey.find_program_address([b"evidence", bytes(nft_mint)], get_program_id())
    return pda


# ── Borsh fixed-length field helpers ────────────────────────────────────────
def case_prefix_bytes(prefix: str) -> bytes:
    """Build the 8-byte fixed-length case prefix (e.g. "HC-2026-"), zero-padded."""
    out = bytearray(8)
    encoded = prefix.encode("utf-8")
    out[: len(encoded)] = encoded[:8]
    return bytes(out)


def model_name_bytes(name: str) -> bytes:
    """Zero-pad a model identifier (e.g. "VISION-4O") to 32 bytes."""
    out = bytearray(32)
    encoded = name.encode("utf-8")
    out[: len(encoded)] = encoded[:32]
    return bytes(out)


# ── Instruction builders ─────────────────────────────────────────────────────
def build_init_dossier_ix(
    *, authority: Pubkey, case_prefix: bytes, examiner: Pubkey
) -> Instruction:
    """Open a Dossier PDA for ``authority`` (the examiner identity).

    data = disc(8) + case_prefix(8) + examiner_pubkey(32)
    accounts: authority(signer,w), dossier(w), system_program
    """
    if len(case_prefix) != 8:
        raise ValueError("case_prefix must be exactly 8 bytes")
    dossier = find_dossier_pda(authority)
    data = IX_INIT_DOSSIER + case_prefix + bytes(examiner)
    accounts = [
        AccountMeta(pubkey=authority, is_signer=True, is_writable=True),
        AccountMeta(pubkey=dossier, is_signer=False, is_writable=True),
        AccountMeta(pubkey=SYSTEM_PROGRAM_ID, is_signer=False, is_writable=False),
    ]
    return Instruction(program_id=get_program_id(), accounts=accounts, data=data)


def build_submit_verification_ix(
    *,
    examiner: Pubkey,
    nft_mint: Pubkey,
    dossier_authority: Pubkey,
    confidence_bps: int,
    model_name: bytes,
    liveness_passed: bool,
) -> Instruction:
    """Anchor a verification verdict.

    data = disc(8) + confidence_bps(u16 LE) + model_name(32) + liveness(bool)
    accounts: examiner(signer,w), nft_mint, dossier, verification(w), system_program
    """
    if len(model_name) != 32:
        raise ValueError("model_name must be exactly 32 bytes (zero-pad if shorter)")
    dossier = find_dossier_pda(dossier_authority)
    verification = find_verification_pda(nft_mint)
    data = (
        IX_SUBMIT_VERIFICATION
        + confidence_bps.to_bytes(2, "little")
        + model_name
        + (b"\x01" if liveness_passed else b"\x00")
    )
    accounts = [
        AccountMeta(pubkey=examiner, is_signer=True, is_writable=True),
        AccountMeta(pubkey=nft_mint, is_signer=False, is_writable=False),
        AccountMeta(pubkey=dossier, is_signer=False, is_writable=False),
        AccountMeta(pubkey=verification, is_signer=False, is_writable=True),
        AccountMeta(pubkey=SYSTEM_PROGRAM_ID, is_signer=False, is_writable=False),
    ]
    return Instruction(program_id=get_program_id(), accounts=accounts, data=data)


def build_list_evidence_ix(
    *, seller: Pubkey, nft_mint: Pubkey, price_lamports: int
) -> Instruction:
    """Build the ``list_evidence`` instruction (used by the custodial listing path).

    data = disc(8) + price_lamports(u64 LE)
    accounts (order matters — `authority` aliases `seller`):
      seller(signer,w), nft_mint, dossier(w), authority(=seller), verification,
      listing(w), system_program
    """
    dossier = find_dossier_pda(seller)
    verification = find_verification_pda(nft_mint)
    listing = find_listing_pda(nft_mint)
    data = IX_LIST_EVIDENCE + price_lamports.to_bytes(8, "little")
    accounts = [
        AccountMeta(pubkey=seller, is_signer=True, is_writable=True),
        AccountMeta(pubkey=nft_mint, is_signer=False, is_writable=False),
        AccountMeta(pubkey=dossier, is_signer=False, is_writable=True),
        # `authority` UncheckedAccount — must equal `seller`.
        AccountMeta(pubkey=seller, is_signer=False, is_writable=False),
        AccountMeta(pubkey=verification, is_signer=False, is_writable=False),
        AccountMeta(pubkey=listing, is_signer=False, is_writable=True),
        AccountMeta(pubkey=SYSTEM_PROGRAM_ID, is_signer=False, is_writable=False),
    ]
    return Instruction(program_id=get_program_id(), accounts=accounts, data=data)


def confidence_to_bps(value: object) -> int:
    """Convert an AI confidence into integer basis-points (0..=10_000).

    Port of ``confidenceToBps`` — accepts 0..1, 0..100, or already-bps shapes:
      - non-number / NaN          -> 0
      - <= 1   (fraction)         -> round(value * 10_000)
      - <= 100 (percent)          -> round(value * 100)
      - <= 10_000 (already bps)   -> round(value)
      - otherwise                 -> 10_000 (clamp)
    """
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return 0
    if value != value:  # NaN
        return 0
    if value <= 1:
        return round(value * 10_000)
    if value <= 100:
        return round(value * 100)
    if value <= 10_000:
        return round(value)
    return 10_000
