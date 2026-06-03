"""Pydantic request models for the payment endpoints.

Aliases match the camelCase wire names from payment.js. Missing-field validation
returns Express's 400 shape via explicit checks in the router (parity), so these
models keep fields Optional and let the router enforce required-ness.
"""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field


class PaymentCreateRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    listing_id: str | None = Field(default=None, alias="listingId")
    buyer_wallet: str | None = Field(default=None, alias="buyerWallet")


class PaymentVerifyRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    signature: str | None = None
    listing_id: str | None = Field(default=None, alias="listingId")
    buyer_wallet: str | None = Field(default=None, alias="buyerWallet")
    buyer_user_id: str | None = Field(default=None, alias="buyerUserId")


class PaymentCancelRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    listing_id: str | None = Field(default=None, alias="listingId")
