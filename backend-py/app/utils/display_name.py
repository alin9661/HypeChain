"""Product display-name helper.

Dedupes the duplicated name-building logic in the Express service
(`listing.js:176` and `listing.js:203`): brand + model + colorway joined with
spaces (falsy parts dropped), falling back to the first 50 chars of
`full_description` when no identification fields are present.
"""

from __future__ import annotations

from typing import Any


def product_display_name(verification_result: dict[str, Any]) -> str:
    """Build a human display name from a verification result.

    Joins brand, model, and colorway (skipping empty/None values). If none are
    present, falls back to the first 50 characters of `full_description`.
    """
    identification = verification_result.get("product_identification") or {}
    parts = [
        identification.get("brand"),
        identification.get("model"),
        identification.get("colorway"),
    ]
    name = " ".join(str(part) for part in parts if part)
    if name:
        return name

    full_description = verification_result.get("full_description") or ""
    return full_description[:50]
