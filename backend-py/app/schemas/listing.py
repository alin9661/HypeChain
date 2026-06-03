"""Pydantic request model for the listing endpoint.

Field aliases match the camelCase wire names the frontend sends (listing.js:34-42).
Semantic validation (valid pubkey, base64 image, model ids, at-least-one of
wallet/email) is done in the router so it returns the Express **400** shapes
verbatim rather than Pydantic's 422 — preserving HTTP-contract parity.
"""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field


class CreateListingRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    user_wallet: str | None = Field(default=None, alias="userWallet")
    user_email: str | None = Field(default=None, alias="userEmail")
    product_image: str | None = Field(default=None, alias="productImage")
    optional_price_sol: float | None = Field(default=None, alias="optionalPriceSol")
    verification_model_id: str | None = Field(default=None, alias="verificationModelId")
    image_gen_model_id: str | None = Field(default=None, alias="imageGenModelId")
    # cNFT dropped — accepted and ignored (defaults true to match the old wire).
    use_compressed_nft: bool = Field(default=True, alias="useCompressedNFT")
