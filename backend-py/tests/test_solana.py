"""Unit tests for the Solana service layer — no devnet access.

Covers (per spec §6): pubkey validation, base64 image validation (good /
oversized / bad), mint instruction-set shape, custodial vs user-wallet listing
branches, marketplace-program-unset skip, and ``confidence_to_bps`` math. RPC is
mocked behind the ``SolanaRpc`` boundary; the decoded server wallet and settings
are injected so nothing touches the network.
"""

from __future__ import annotations

import base58
import pytest
from solders.keypair import Keypair
from solders.pubkey import Pubkey
from spl.token.constants import TOKEN_PROGRAM_ID

import app.services.solana as solana
from app.config.settings import get_settings
from app.services import metaplex, verification
from app.utils.solana_validation import (
    base64_to_bytes,
    is_valid_solana_pubkey,
    validate_base64_image,
)


# ──────────────────────────────────────────────────────────────────────────────
# Fakes / fixtures
# ──────────────────────────────────────────────────────────────────────────────
class FakeRpc:
    """In-memory stand-in for ``SolanaRpc`` — records sent txs, no network."""

    def __init__(self, *, dossier_exists: bool = True) -> None:
        from solders.hash import Hash

        self._blockhash = Hash.default()
        self.sent: list[object] = []
        self.dossier_exists = dossier_exists

    def get_latest_blockhash(self):
        return self._blockhash

    def get_minimum_balance_for_rent_exemption(self, size: int) -> int:
        return 1_461_600  # realistic rent for a 82-byte mint account

    def get_account_info(self, pubkey):
        return object() if self.dossier_exists else None

    def send_transaction(self, tx) -> str:
        self.sent.append(tx)
        return "FAKE_SIGNATURE_11111111111111111111111111111111"

    def get_balance(self, pubkey) -> int:
        return 2_000_000_000  # 2 SOL


SERVER_KP = Keypair()
SERVER_SECRET_B58 = base58.b58encode(bytes(SERVER_KP)).decode()


@pytest.fixture
def fake_rpc(monkeypatch):
    """Inject a FakeRpc + a known server wallet; reset module singletons."""
    rpc = FakeRpc()
    monkeypatch.setattr(solana, "_rpc", rpc)
    monkeypatch.setattr(solana, "_server_wallet", SERVER_KP)
    # Settings: marketplace program set so listing/verification paths run.
    settings = get_settings()
    monkeypatch.setattr(
        settings,
        "hacknyu_marketplace_program_id",
        "Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS",
    )
    monkeypatch.setattr(settings, "hacknyu_server_wallet_private_key", SERVER_SECRET_B58)
    return rpc


# ──────────────────────────────────────────────────────────────────────────────
# Pubkey validation
# ──────────────────────────────────────────────────────────────────────────────
def test_valid_wallet_pubkey_on_curve():
    # A freshly generated keypair's pubkey is on the ed25519 curve.
    assert is_valid_solana_pubkey(str(Keypair().pubkey()))


def test_invalid_pubkey_garbage():
    assert not is_valid_solana_pubkey("not-a-pubkey")
    assert not is_valid_solana_pubkey("")
    assert not is_valid_solana_pubkey(12345)
    assert not is_valid_solana_pubkey(None)


def test_pda_off_curve_rejected():
    # A PDA is a valid 32-byte address but is off-curve → not a signable wallet.
    pda, _ = Pubkey.find_program_address([b"verification", bytes(Pubkey.default())],
                                         metaplex.TOKEN_METADATA_PROGRAM_ID)
    assert not pda.is_on_curve()
    assert not is_valid_solana_pubkey(str(pda))


# ──────────────────────────────────────────────────────────────────────────────
# Base64 image validation
# ──────────────────────────────────────────────────────────────────────────────
def test_valid_png_image():
    # "PNG" payload — tiny valid base64.
    img = "data:image/png;base64,aGVsbG8="
    result = validate_base64_image(img)
    assert result.valid
    assert result.mime_type == "image/png"
    assert result.size is not None and result.size > 0


@pytest.mark.parametrize("mime", ["jpeg", "jpg", "png", "webp"])
def test_all_allowed_mime_types(mime):
    assert validate_base64_image(f"data:image/{mime};base64,aGVsbG8=").valid


def test_bad_format_rejected():
    assert not validate_base64_image("data:image/gif;base64,aGVsbG8=").valid
    assert not validate_base64_image("not a data uri").valid
    assert not validate_base64_image("data:text/plain;base64,aGVsbG8=").valid


def test_oversized_image_rejected():
    # Build a base64 payload whose estimated decoded size exceeds 5MB.
    # ceil(len*3/4) > 5*1024*1024  →  len > ~6.99M chars.
    payload = "A" * (7 * 1024 * 1024)
    result = validate_base64_image(f"data:image/png;base64,{payload}")
    assert not result.valid
    assert "exceeds maximum of 5MB" in (result.error or "")


def test_bad_base64_rejected():
    # Right prefix, but payload is not decodable base64.
    result = validate_base64_image("data:image/png;base64,@@@not_base64@@@")
    assert not result.valid
    assert "Invalid base64 encoding" in (result.error or "")


def test_base64_to_bytes_roundtrip():
    assert base64_to_bytes("data:image/png;base64,aGVsbG8=") == b"hello"


# ──────────────────────────────────────────────────────────────────────────────
# Mint instruction set
# ──────────────────────────────────────────────────────────────────────────────
def test_mint_builds_expected_instruction_set():
    server = SERVER_KP
    mint = Keypair()
    target = Keypair().pubkey()
    ixs = solana.build_mint_instructions(
        mint=mint.pubkey(),
        mint_authority=server.pubkey(),
        payer=server.pubkey(),
        target_wallet=target,
        metadata_uri="ipfs://Qm/meta.json",
        name="Vintage Camera",
        rent_lamports=1_461_600,
    )
    # 5 instructions: create_account, init_mint, create_ata, mint_to, create_metadata.
    assert len(ixs) == 5
    # The mint metadata instruction carries the URI we passed.
    assert b"ipfs://Qm/meta.json" in bytes(ixs[4].data)


def test_mint_instruction_programs_in_order():
    server = SERVER_KP
    mint = Keypair()
    ixs = solana.build_mint_instructions(
        mint=mint.pubkey(),
        mint_authority=server.pubkey(),
        payer=server.pubkey(),
        target_wallet=Keypair().pubkey(),
        metadata_uri="ipfs://x",
        name="N",
        rent_lamports=1,
    )
    from solders.system_program import ID as SYS_ID

    program_ids = [str(ix.program_id) for ix in ixs]
    assert program_ids[0] == str(SYS_ID)  # create_account
    assert program_ids[1] == str(TOKEN_PROGRAM_ID)  # initialize_mint
    # 2 = associated token program (create_ata)
    assert program_ids[3] == str(TOKEN_PROGRAM_ID)  # mint_to
    assert program_ids[4] == str(metaplex.TOKEN_METADATA_PROGRAM_ID)  # metadata


def test_mint_name_truncated_to_32():
    server = SERVER_KP
    mint = Keypair()
    long_name = "X" * 100
    ixs = solana.build_mint_instructions(
        mint=mint.pubkey(),
        mint_authority=server.pubkey(),
        payer=server.pubkey(),
        target_wallet=Keypair().pubkey(),
        metadata_uri="ipfs://x",
        name=long_name,
        rent_lamports=1,
    )
    # Metadata ix data: disc(1) + u32 len. Name length must be capped at 32.
    metadata_data = bytes(ixs[4].data)
    name_len = int.from_bytes(metadata_data[1:5], "little")
    assert name_len == 32


def test_mint_nft_returns_mint_address(fake_rpc):
    target = str(Keypair().pubkey())
    mint_addr = solana.mint_nft(target, "ipfs://x", "Item", use_compressed_nft=True)
    # cNFT flag ignored — still a standard mint. Returns a valid base58 pubkey.
    assert Pubkey.from_string(mint_addr)
    assert len(fake_rpc.sent) == 1


# ──────────────────────────────────────────────────────────────────────────────
# Marketplace listing branches
# ──────────────────────────────────────────────────────────────────────────────
def test_listing_skipped_when_program_unset(monkeypatch):
    monkeypatch.setattr(solana, "_server_wallet", SERVER_KP)
    settings = get_settings()
    monkeypatch.setattr(settings, "hacknyu_marketplace_program_id", None)
    result = solana.list_item_on_marketplace(str(Keypair().pubkey()), 1.5, str(Keypair().pubkey()))
    assert result == {"mode": "skipped", "reason": "contract not deployed"}


def test_listing_custodial_branch(fake_rpc):
    nft = str(Keypair().pubkey())
    # seller == server wallet → custodial, server signs.
    result = solana.list_item_on_marketplace(nft, 2.0, str(SERVER_KP.pubkey()))
    assert result["mode"] == "custodial_listed"
    assert result["signature"].startswith("FAKE_SIGNATURE")
    assert "listingPda" in result
    assert len(fake_rpc.sent) == 1


def test_listing_user_wallet_branch(fake_rpc):
    nft = str(Keypair().pubkey())
    seller = str(Keypair().pubkey())  # not the server wallet
    result = solana.list_item_on_marketplace(nft, 1.0, seller)
    assert result["mode"] == "pending_user_signature"
    assert result["seller"] == seller
    assert result["nftMint"] == nft
    # 1 SOL → 1e9 lamports, returned as a string.
    assert result["priceLamports"] == str(1_000_000_000)
    # No tx sent — frontend will build + sign.
    assert len(fake_rpc.sent) == 0


def test_price_lamports_rounding(fake_rpc):
    seller = str(Keypair().pubkey())
    result = solana.list_item_on_marketplace(str(Keypair().pubkey()), 0.5, seller)
    assert result["priceLamports"] == str(500_000_000)


# ──────────────────────────────────────────────────────────────────────────────
# Verification anchoring
# ──────────────────────────────────────────────────────────────────────────────
def test_submit_verification_happy(fake_rpc):
    nft = str(Keypair().pubkey())
    result = solana.submit_verification(
        nft_mint=nft, confidence_bps=7500, model_name="VISION-4O", liveness_passed=True
    )
    assert result["signature"].startswith("FAKE_SIGNATURE")
    assert "verificationPda" in result
    # dossier already exists in FakeRpc → only the submit tx is sent.
    assert len(fake_rpc.sent) == 1


def test_submit_verification_creates_dossier_when_missing(monkeypatch):
    rpc = FakeRpc(dossier_exists=False)
    monkeypatch.setattr(solana, "_rpc", rpc)
    monkeypatch.setattr(solana, "_server_wallet", SERVER_KP)
    settings = get_settings()
    monkeypatch.setattr(
        settings, "hacknyu_marketplace_program_id",
        "Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS",
    )
    solana.submit_verification(
        nft_mint=str(Keypair().pubkey()),
        confidence_bps=6000,
        model_name="M",
        liveness_passed=False,
    )
    # init_dossier tx + submit_verification tx.
    assert len(rpc.sent) == 2


@pytest.mark.parametrize("bad", [-1, 10_001, 1.5, "5000", True, None])
def test_submit_verification_rejects_bad_bps(fake_rpc, bad):
    with pytest.raises(solana.SolanaError):
        solana.submit_verification(
            nft_mint=str(Keypair().pubkey()),
            confidence_bps=bad,
            model_name="M",
            liveness_passed=True,
        )


# ──────────────────────────────────────────────────────────────────────────────
# confidence_to_bps math
# ──────────────────────────────────────────────────────────────────────────────
@pytest.mark.parametrize(
    "value,expected",
    [
        (0.0, 0),
        (0.5, 5000),
        (1.0, 10000),
        (50, 5000),  # percent
        (99.5, 9950),
        (100, 10000),
        (7500, 7500),  # already bps
        (10000, 10000),
        (20000, 10000),  # clamp
        ("nope", 0),
        (None, 0),
        (True, 0),  # bool is not a number here
        (float("nan"), 0),
    ],
)
def test_confidence_to_bps(value, expected):
    assert verification.confidence_to_bps(value) == expected


# ──────────────────────────────────────────────────────────────────────────────
# Verification + listing instruction parity (vs anchor-client.ts byte layout)
# ──────────────────────────────────────────────────────────────────────────────
def test_submit_verification_ix_data_layout():
    examiner = Keypair().pubkey()
    nft = Keypair().pubkey()
    ix = verification.build_submit_verification_ix(
        examiner=examiner,
        nft_mint=nft,
        dossier_authority=examiner,
        confidence_bps=5000,
        model_name=verification.model_name_bytes("VISION-4O"),
        liveness_passed=True,
    )
    data = bytes(ix.data)
    # disc(8) + u16(5000)=0x8813 LE + 32 model bytes + bool(1)
    assert data[:8] == verification.IX_SUBMIT_VERIFICATION
    assert data[8:10] == (5000).to_bytes(2, "little")
    assert len(data[10:42]) == 32
    assert data[42] == 1
    assert len(ix.accounts) == 5
    assert ix.accounts[0].is_signer  # examiner signs


def test_list_evidence_ix_account_order():
    seller = Keypair().pubkey()
    nft = Keypair().pubkey()
    ix = verification.build_list_evidence_ix(seller=seller, nft_mint=nft, price_lamports=999)
    data = bytes(ix.data)
    assert data[:8] == verification.IX_LIST_EVIDENCE
    assert data[8:16] == (999).to_bytes(8, "little")
    metas = ix.accounts
    assert len(metas) == 7
    # seller appears at index 0 (signer) and again at index 3 (authority alias).
    assert metas[0].pubkey == seller and metas[0].is_signer
    assert metas[3].pubkey == seller and not metas[3].is_signer


def test_model_name_bytes_padding():
    assert verification.model_name_bytes("M") == b"M" + b"\x00" * 31
    assert len(verification.model_name_bytes("X" * 50)) == 32


def test_case_prefix_bytes_padding():
    assert verification.case_prefix_bytes("HC-2026-") == b"HC-2026-"
    assert len(verification.case_prefix_bytes("HC-2026-")) == 8
    assert verification.case_prefix_bytes("AB") == b"AB" + b"\x00" * 6
