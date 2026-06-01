"""Hand-built Metaplex Token Metadata instruction builder (standard NFTs only).

The Node backend used ``@metaplex-foundation/mpl-token-metadata`` (umi) to mint
NFTs. There is no maintained Python Metaplex SDK, so we hand-build the single
instruction we need — ``CreateMetadataAccountV3`` — plus the standard SPL token
scaffolding (create mint account, initialize mint, create the owner's ATA, mint
one token). This is the **highest-risk module** in PR3: a single wrong byte in
the Borsh layout or a wrong account in the ordering produces an on-chain error
that is hard to diagnose. Everything that determines on-chain behavior is pinned
as a documented constant below and byte-guarded in ``tests/test_metaplex_golden.py``.

cNFT (Bubblegum) minting is intentionally NOT implemented — the design dropped
it. ``mint_nft`` in ``solana.py`` always uses this standard-NFT path.

──────────────────────────────────────────────────────────────────────────────
PINNED PROGRAM ID
──────────────────────────────────────────────────────────────────────────────
Token Metadata program: ``metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s``.
This is the canonical mpl-token-metadata program on mainnet AND devnet. It is a
network-independent constant baked into the SDK; we pin it here.

# TODO(devnet-verify): confirm this program ID against a live devnet mint tx
# (it should appear as the program invoked for the metadata instruction).

──────────────────────────────────────────────────────────────────────────────
METADATA PDA
──────────────────────────────────────────────────────────────────────────────
seeds = [b"metadata", TOKEN_METADATA_PROGRAM_ID, mint], program = TOKEN_METADATA_PROGRAM_ID
This three-seed layout is fixed by the program and must not change.

──────────────────────────────────────────────────────────────────────────────
CreateMetadataAccountV3 INSTRUCTION — BORSH DATA LAYOUT
──────────────────────────────────────────────────────────────────────────────
The instruction data is Borsh-serialized. Field order (from the Rust program's
``CreateMetadataAccountV3InstructionArgs`` / ``CreateMetadataAccountArgsV3``):

  u8     instruction discriminator              = 33  (CreateMetadataAccountV3)
  ── DataV2 ──
  string name                                   (u32 len LE + utf8 bytes)
  string symbol                                 (u32 len LE + utf8 bytes)
  string uri                                    (u32 len LE + utf8 bytes)
  u16    seller_fee_basis_points                (LE)
  option<vec<Creator>> creators                 (1-byte tag; if 1, u32 vec len + items)
      Creator: pubkey address (32) + bool verified (1) + u8 share (1)
  option<Collection> collection                 (1-byte tag; here always 0 = None)
  option<Uses> uses                             (1-byte tag; here always 0 = None)
  ── end DataV2 ──
  bool   is_mutable                             (1 byte)
  option<CollectionDetails> collection_details  (1-byte tag; here always 0 = None)

Borsh ``Option<T>`` = single byte 0 (None) or 1 (Some) followed by T.
Borsh ``bool`` = single byte 0/1. Borsh ``string`` = u32 LE length prefix then
the UTF-8 bytes. All multi-byte integers are little-endian.

# TODO(devnet-verify): a human MUST byte-compare the serialized instruction
# data produced here against the data field of a REAL devnet CreateMetadataAccountV3
# transaction (e.g. via `solana confirm -v <sig>` or an explorer's raw view).
# We have NO captured devnet reference; this layout is built from the Borsh spec
# from first principles. The spec is the source of truth on disagreement, but the
# devnet round-trip is the final ground truth.

──────────────────────────────────────────────────────────────────────────────
CreateMetadataAccountV3 — ACCOUNT ORDERING
──────────────────────────────────────────────────────────────────────────────
  0  metadata               writable, not signer   (the metadata PDA)
  1  mint                    not writable, not signer
  2  mint_authority          not writable, SIGNER
  3  payer                   writable, SIGNER
  4  update_authority        not writable, not signer
  5  system_program          not writable, not signer
  6  rent (sysvar)           not writable, not signer   (optional in v3; included
                                                          for byte-stable parity)
"""

from __future__ import annotations

from dataclasses import dataclass

from solders.instruction import AccountMeta, Instruction
from solders.pubkey import Pubkey
from solders.sysvar import RENT
from solders.system_program import ID as SYSTEM_PROGRAM_ID

# ── Pinned program IDs ──────────────────────────────────────────────────────
TOKEN_METADATA_PROGRAM_ID = Pubkey.from_string(
    "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s"
)

# CreateMetadataAccountV3 instruction discriminator (single u8). The Token
# Metadata program uses a flat u8 enum tag; V3 metadata creation is 33.
CREATE_METADATA_ACCOUNT_V3_DISCRIMINATOR = 33

# Standard NFT royalty — 5% expressed in basis points (umi `percentAmount(5)`).
DEFAULT_SELLER_FEE_BASIS_POINTS = 500

# NFTs in this program carry no symbol (umi default ""), matching the JS mint.
DEFAULT_SYMBOL = ""

# Name field on-chain is capped at 32 bytes by the program; the JS truncated to
# 32 chars (`productName.substring(0, 32)`).
MAX_NAME_LEN = 32


@dataclass(frozen=True)
class Creator:
    """A single Metaplex creator entry. Mirrors umi's `creators[]`."""

    address: Pubkey
    verified: bool
    share: int  # u8, 0..=100; the verified creators' shares sum to 100.


# ── Borsh primitive writers ─────────────────────────────────────────────────
def _borsh_string(value: str) -> bytes:
    """Borsh string: u32 LE length prefix + UTF-8 payload."""
    encoded = value.encode("utf-8")
    return len(encoded).to_bytes(4, "little") + encoded


def _borsh_u16(value: int) -> bytes:
    return value.to_bytes(2, "little")


def _borsh_bool(value: bool) -> bytes:
    return b"\x01" if value else b"\x00"


def _borsh_creator(creator: Creator) -> bytes:
    # Creator = address(32) + verified(bool) + share(u8)
    return bytes(creator.address) + _borsh_bool(creator.verified) + bytes([creator.share & 0xFF])


def _borsh_option_creators(creators: list[Creator] | None) -> bytes:
    """Borsh Option<Vec<Creator>>.

    None -> 0x00. Some -> 0x01 + (u32 LE vec length) + each creator.
    """
    if not creators:
        return b"\x00"
    out = bytearray(b"\x01")
    out += len(creators).to_bytes(4, "little")
    for creator in creators:
        out += _borsh_creator(creator)
    return bytes(out)


def build_create_metadata_v3_data(
    *,
    name: str,
    symbol: str,
    uri: str,
    seller_fee_basis_points: int,
    creators: list[Creator] | None,
    is_mutable: bool,
) -> bytes:
    """Serialize the ``CreateMetadataAccountV3`` instruction *data* field.

    Pure function (no network, no keys) so it can be byte-asserted in the golden
    test. See the module docstring for the authoritative layout. Collection,
    uses, and collection_details are always ``None`` for the standard NFTs this
    backend mints.
    """
    parts = bytearray()
    parts.append(CREATE_METADATA_ACCOUNT_V3_DISCRIMINATOR)  # u8 discriminator

    # DataV2
    parts += _borsh_string(name)
    parts += _borsh_string(symbol)
    parts += _borsh_string(uri)
    parts += _borsh_u16(seller_fee_basis_points)
    parts += _borsh_option_creators(creators)
    parts += b"\x00"  # Option<Collection> = None
    parts += b"\x00"  # Option<Uses> = None

    # CreateMetadataAccountV3 trailing args
    parts += _borsh_bool(is_mutable)
    parts += b"\x00"  # Option<CollectionDetails> = None

    return bytes(parts)


def find_metadata_pda(mint: Pubkey) -> Pubkey:
    """Derive the metadata PDA for ``mint``.

    seeds = [b"metadata", TOKEN_METADATA_PROGRAM_ID, mint].
    """
    pda, _bump = Pubkey.find_program_address(
        [b"metadata", bytes(TOKEN_METADATA_PROGRAM_ID), bytes(mint)],
        TOKEN_METADATA_PROGRAM_ID,
    )
    return pda


def build_create_metadata_v3_ix(
    *,
    mint: Pubkey,
    mint_authority: Pubkey,
    payer: Pubkey,
    update_authority: Pubkey,
    name: str,
    symbol: str,
    uri: str,
    seller_fee_basis_points: int = DEFAULT_SELLER_FEE_BASIS_POINTS,
    creators: list[Creator] | None = None,
    is_mutable: bool = True,
) -> Instruction:
    """Build the full ``CreateMetadataAccountV3`` instruction (data + accounts).

    Account ordering is pinned in the module docstring and must not be reordered.
    """
    metadata = find_metadata_pda(mint)
    data = build_create_metadata_v3_data(
        name=name,
        symbol=symbol,
        uri=uri,
        seller_fee_basis_points=seller_fee_basis_points,
        creators=creators,
        is_mutable=is_mutable,
    )
    accounts = [
        AccountMeta(pubkey=metadata, is_signer=False, is_writable=True),
        AccountMeta(pubkey=mint, is_signer=False, is_writable=False),
        AccountMeta(pubkey=mint_authority, is_signer=True, is_writable=False),
        AccountMeta(pubkey=payer, is_signer=True, is_writable=True),
        AccountMeta(pubkey=update_authority, is_signer=False, is_writable=False),
        AccountMeta(pubkey=SYSTEM_PROGRAM_ID, is_signer=False, is_writable=False),
        AccountMeta(pubkey=RENT, is_signer=False, is_writable=False),
    ]
    return Instruction(
        program_id=TOKEN_METADATA_PROGRAM_ID,
        accounts=accounts,
        data=data,
    )
