"""[CRITICAL] Golden byte-guard for the Metaplex CreateMetadataAccountV3 builder.

This module is the highest-risk piece of PR3: a single wrong byte in the Borsh
layout produces an on-chain failure that is painful to diagnose. We have NO
captured devnet reference transaction, so the "golden" expected bytes here are
constructed **independently, from first principles**, directly from the Borsh
spec documented in ``app/services/metaplex.py``. If the builder and this
hand-rolled expectation disagree, the SPEC wins — but see the TODO below.

# TODO(devnet-verify): A HUMAN MUST byte-compare the serialized instruction data
# asserted here against the `data` field of a REAL devnet
# CreateMetadataAccountV3 transaction (`solana confirm -v <sig>`, or an
# explorer's raw instruction view). Until that round-trip is done, "verified"
# means "matches the Borsh spec", NOT "accepted on devnet".

Assumptions a human must confirm against a real devnet mint:
  - Token Metadata program ID = metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s
  - CreateMetadataAccountV3 discriminator = 33 (single u8)
  - DataV2 field order: name, symbol, uri, seller_fee_basis_points,
    Option<Vec<Creator>>, Option<Collection>, Option<Uses>
  - trailing args: is_mutable (bool), Option<CollectionDetails>
  - account order: metadata(w), mint, mint_authority(s), payer(s,w),
    update_authority, system_program, rent
"""

from __future__ import annotations

import struct

from solders.pubkey import Pubkey
from solders.sysvar import RENT
from solders.system_program import ID as SYSTEM_PROGRAM_ID

from app.services.metaplex import (
    CREATE_METADATA_ACCOUNT_V3_DISCRIMINATOR,
    TOKEN_METADATA_PROGRAM_ID,
    Creator,
    build_create_metadata_v3_data,
    build_create_metadata_v3_ix,
    find_metadata_pda,
)

# Deterministic fixed pubkeys (all-different bytes so a swap is detectable).
MINT = Pubkey.from_bytes(bytes([1] * 32))
MINT_AUTHORITY = Pubkey.from_bytes(bytes([2] * 32))
PAYER = Pubkey.from_bytes(bytes([3] * 32))
CREATOR_ADDR = Pubkey.from_bytes(bytes([4] * 32))


def _expected_data_from_spec(
    *,
    name: str,
    symbol: str,
    uri: str,
    sfbp: int,
    creators: list[Creator] | None,
    is_mutable: bool,
) -> bytes:
    """Re-derive the expected bytes independently of the production helpers.

    Built only from ``struct`` + raw concatenation, so it shares no code path
    with ``build_create_metadata_v3_data`` — a real cross-check, not a tautology.
    """

    def borsh_str(s: str) -> bytes:
        b = s.encode("utf-8")
        return struct.pack("<I", len(b)) + b

    out = bytearray()
    out += struct.pack("<B", 33)  # discriminator
    out += borsh_str(name)
    out += borsh_str(symbol)
    out += borsh_str(uri)
    out += struct.pack("<H", sfbp)  # seller_fee_basis_points u16 LE
    if not creators:
        out += b"\x00"  # Option<Vec<Creator>> None
    else:
        out += b"\x01"
        out += struct.pack("<I", len(creators))
        for c in creators:
            out += bytes(c.address)
            out += b"\x01" if c.verified else b"\x00"
            out += struct.pack("<B", c.share)
    out += b"\x00"  # Option<Collection> None
    out += b"\x00"  # Option<Uses> None
    out += b"\x01" if is_mutable else b"\x00"  # is_mutable
    out += b"\x00"  # Option<CollectionDetails> None
    return bytes(out)


def test_discriminator_is_33():
    assert CREATE_METADATA_ACCOUNT_V3_DISCRIMINATOR == 33


def test_program_id_pinned():
    assert str(TOKEN_METADATA_PROGRAM_ID) == "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s"


def test_data_matches_independent_borsh_spec_no_creators():
    name, symbol, uri, sfbp = "HypeChain Item", "", "ipfs://Qm123/metadata.json", 500
    got = build_create_metadata_v3_data(
        name=name,
        symbol=symbol,
        uri=uri,
        seller_fee_basis_points=sfbp,
        creators=None,
        is_mutable=True,
    )
    expected = _expected_data_from_spec(
        name=name, symbol=symbol, uri=uri, sfbp=sfbp, creators=None, is_mutable=True
    )
    assert got == expected, f"\n got={got.hex()}\n exp={expected.hex()}"


def test_data_matches_independent_borsh_spec_with_creator():
    creators = [Creator(address=CREATOR_ADDR, verified=True, share=100)]
    got = build_create_metadata_v3_data(
        name="N",
        symbol="SYM",
        uri="ipfs://u",
        seller_fee_basis_points=500,
        creators=creators,
        is_mutable=True,
    )
    expected = _expected_data_from_spec(
        name="N",
        symbol="SYM",
        uri="ipfs://u",
        sfbp=500,
        creators=creators,
        is_mutable=True,
    )
    assert got == expected, f"\n got={got.hex()}\n exp={expected.hex()}"


def test_data_exact_golden_hex_no_creators():
    """Fully-pinned hex so any drift in the layout is caught even if the
    independent re-derivation above were itself wrong. Decoded by hand below.
    """
    got = build_create_metadata_v3_data(
        name="X",
        symbol="",
        uri="ipfs://x",
        seller_fee_basis_points=500,
        creators=None,
        is_mutable=True,
    )
    # 21              discriminator = 33
    # 01000000 58     name: len 1, "X"
    # 00000000        symbol: len 0
    # 08000000 697066733a2f2f78   uri: len 8, "ipfs://x"
    # f401            seller_fee_basis_points = 500 (u16 LE)
    # 00              Option<Vec<Creator>> = None
    # 00              Option<Collection> = None
    # 00              Option<Uses> = None
    # 01              is_mutable = true
    # 00              Option<CollectionDetails> = None
    expected_hex = "2101000000580000000008000000697066733a2f2f78f4010000000100"
    assert got.hex() == expected_hex


def test_string_length_prefix_is_u32_le_multibyte():
    """A 256-char name must encode its length as 4 LE bytes 00 01 00 00."""
    long_name = "A" * 256
    data = build_create_metadata_v3_data(
        name=long_name,
        symbol="",
        uri="",
        seller_fee_basis_points=0,
        creators=None,
        is_mutable=False,
    )
    # discriminator(1) then the u32 length prefix.
    assert data[1:5] == struct.pack("<I", 256) == b"\x00\x01\x00\x00"


def test_metadata_pda_seeds_and_program():
    pda = find_metadata_pda(MINT)
    expected, _bump = Pubkey.find_program_address(
        [b"metadata", bytes(TOKEN_METADATA_PROGRAM_ID), bytes(MINT)],
        TOKEN_METADATA_PROGRAM_ID,
    )
    assert pda == expected


def test_account_ordering_and_flags():
    ix = build_create_metadata_v3_ix(
        mint=MINT,
        mint_authority=MINT_AUTHORITY,
        payer=PAYER,
        update_authority=MINT_AUTHORITY,
        name="X",
        symbol="",
        uri="ipfs://x",
    )
    assert ix.program_id == TOKEN_METADATA_PROGRAM_ID
    metas = ix.accounts
    assert len(metas) == 7

    # 0 metadata PDA — writable, not signer
    assert metas[0].pubkey == find_metadata_pda(MINT)
    assert metas[0].is_writable and not metas[0].is_signer
    # 1 mint — ro, not signer
    assert metas[1].pubkey == MINT
    assert not metas[1].is_writable and not metas[1].is_signer
    # 2 mint_authority — signer, ro
    assert metas[2].pubkey == MINT_AUTHORITY
    assert metas[2].is_signer and not metas[2].is_writable
    # 3 payer — signer, writable
    assert metas[3].pubkey == PAYER
    assert metas[3].is_signer and metas[3].is_writable
    # 4 update_authority — ro, not signer
    assert metas[4].pubkey == MINT_AUTHORITY
    assert not metas[4].is_signer and not metas[4].is_writable
    # 5 system_program
    assert metas[5].pubkey == SYSTEM_PROGRAM_ID
    # 6 rent sysvar
    assert metas[6].pubkey == RENT
