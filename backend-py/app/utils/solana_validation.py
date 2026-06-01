"""Solana + image input validation.

Direct port of ``backend/src/utils/validation.js`` so the FastAPI service
rejects the exact same inputs the Express service rejected. Two concerns:

1. ``is_valid_solana_pubkey`` — a base58 string is a usable *wallet* pubkey.
   The Express version required the key to be **on the ed25519 curve**
   (``PublicKey.isOnCurve``). A PDA (off-curve) is a valid 32-byte address but
   is NOT a wallet a user can sign with, so it must be rejected for the
   ``userWallet`` field. We mirror that semantics exactly.
2. ``validate_base64_image`` — accepts a ``data:image/...;base64,`` URI of an
   allowed MIME type whose decoded payload is <= 5 MB and is valid base64.
"""

from __future__ import annotations

import base64
import binascii
import math
import re
from dataclasses import dataclass

from solders.pubkey import Pubkey

# data:image/<type>;base64,<payload>  — anchored to the start like the JS regex.
_BASE64_IMAGE_RE = re.compile(r"^data:image/(jpeg|jpg|png|webp);base64,")

# 5 MB, matching `maxSize = 5 * 1024 * 1024` in validation.js.
_MAX_IMAGE_BYTES = 5 * 1024 * 1024


def is_valid_solana_pubkey(value: object) -> bool:
    """Return True iff ``value`` is a base58 wallet pubkey **on the ed25519 curve**.

    Mirrors ``isValidSolanaPublicKey``:
      - parseable as a 32-byte base58 pubkey, AND
      - on-curve (rejects PDAs / off-curve addresses, which cannot sign).
    """
    if not isinstance(value, str):
        return False
    try:
        pubkey = Pubkey.from_string(value)
    except (ValueError, TypeError):
        return False
    # PublicKey.isOnCurve(pubkey.toBuffer()) parity — solders exposes this on
    # the Pubkey itself.
    return pubkey.is_on_curve()


@dataclass(frozen=True)
class ImageValidation:
    """Result of ``validate_base64_image``.

    Mirrors the JS object shape: ``{valid, error}`` on failure and
    ``{valid, mimeType, size}`` on success. ``mime_type``/``size`` are None on
    failure; ``error`` is None on success.
    """

    valid: bool
    error: str | None = None
    mime_type: str | None = None
    size: int | None = None


def validate_base64_image(base64_string: object) -> ImageValidation:
    """Validate a ``data:image/...;base64,...`` string.

    Port of ``validateBase64Image``. Byte-size is estimated from the base64
    payload length (``ceil(len * 3 / 4)``) BEFORE decoding — same as the JS,
    so an oversized image is rejected without allocating the full buffer.
    """
    if not isinstance(base64_string, str):
        return ImageValidation(
            valid=False,
            error="Invalid image format. Must be JPEG, PNG, or WebP with base64 encoding",
        )

    match = _BASE64_IMAGE_RE.match(base64_string)
    if not match:
        return ImageValidation(
            valid=False,
            error="Invalid image format. Must be JPEG, PNG, or WebP with base64 encoding",
        )

    mime_type = f"image/{match.group(1)}"
    # `base64String.split(',')[1]` — everything after the first comma.
    parts = base64_string.split(",", 1)
    if len(parts) < 2:
        return ImageValidation(valid=False, error="Invalid base64 encoding")
    base64_data = parts[1]

    # ceil(len * 3 / 4) — base64 expands 3 bytes into 4 chars.
    size_in_bytes = math.ceil((len(base64_data) * 3) / 4)
    if size_in_bytes > _MAX_IMAGE_BYTES:
        mb = size_in_bytes / 1024 / 1024
        return ImageValidation(
            valid=False,
            error=f"Image size ({mb:.2f}MB) exceeds maximum of 5MB",
        )

    # Confirm the payload actually decodes (JS does `Buffer.from(..., 'base64')`;
    # Python's strict decode is a tighter check, which is fine — we only need to
    # reject genuinely malformed base64).
    try:
        base64.b64decode(base64_data, validate=True)
    except (binascii.Error, ValueError):
        return ImageValidation(valid=False, error="Invalid base64 encoding")

    return ImageValidation(valid=True, mime_type=mime_type, size=size_in_bytes)


def base64_to_bytes(base64_string: str) -> bytes:
    """Decode the payload of a ``data:...;base64,...`` string to raw bytes.

    Port of ``base64ToBuffer``. Caller is expected to have validated first.
    """
    base64_data = base64_string.split(",", 1)[1]
    return base64.b64decode(base64_data)
