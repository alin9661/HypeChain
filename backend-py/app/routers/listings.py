"""Listing routes — the create-listing pipeline.

Ported from backend/src/routes/listing.js. Mounted at /api. The cNFT branch is
removed (standard NFT only); steps 7-8 (on-chain anchor + marketplace list) are
best-effort (warn-not-fail). Pipeline failures map to typed app.exceptions so the
500 carries the Express step-attribution payload; liveness failure returns 400
with the verbatim `next_steps` detail block.
"""

from __future__ import annotations

from typing import Any

import structlog
from anyio import to_thread
from fastapi import APIRouter
from fastapi.responses import JSONResponse

from app.config.ai_models import is_valid_image_gen_model, is_valid_vision_model
from app.config.settings import get_settings
from app.db import pool as pool_module
from app.db import queries
from app.exceptions import (
    DBError,
    ImageGenError,
    IPFSError,
    MintError,
    VerificationError,
    pipeline_error_response,
)
from app.schemas.listing import CreateListingRequest
from app.services import openrouter, solana, verification
from app.services.ipfs import create_and_upload_nft_metadata
from app.utils.display_name import product_display_name
from app.utils.solana_validation import is_valid_solana_pubkey, validate_base64_image

router = APIRouter()
log = structlog.get_logger()

_LIVENESS_MINIMUM = 50
_NFT_IMAGE_MODEL = "openai/gpt-5-image-mini"


def _bad_request(message: str) -> JSONResponse:
    return JSONResponse(status_code=400, content={"success": False, "error": message})


@router.post("/create-listing")
async def create_listing(body: CreateListingRequest):
    settings = get_settings()

    # ---- Step 0: validate (400s, Express parity) ----
    if not body.user_wallet and not body.user_email:
        return _bad_request("Either a Solana wallet address or email is required")
    if body.user_wallet and not is_valid_solana_pubkey(body.user_wallet):
        return _bad_request("Invalid Solana wallet address")

    image_check = validate_base64_image(body.product_image)
    if not image_check.valid:
        return _bad_request(image_check.error or "Invalid image")

    if body.verification_model_id and not is_valid_vision_model(body.verification_model_id):
        return _bad_request(f"Invalid verification model ID: {body.verification_model_id}")
    if body.image_gen_model_id and not is_valid_image_gen_model(body.image_gen_model_id):
        return _bad_request(f"Invalid image generation model ID: {body.image_gen_model_id}")

    platform_wallet = settings.platform_custodial_wallet
    target_wallet = body.user_wallet or platform_wallet
    is_pending = body.user_wallet is None

    try:
        # ---- Step 1: AI verification ----
        try:
            if body.verification_model_id:
                vr = await openrouter.verify_product_with_model(
                    body.product_image, body.verification_model_id
                )
            else:
                vr = await openrouter.verify_product(body.product_image)
        except Exception as e:  # noqa: BLE001 — attribute to Step 1
            raise VerificationError(str(e)) from e

        liveness = vr["liveness_check"]["liveness_score"]
        if liveness < _LIVENESS_MINIMUM:
            return JSONResponse(
                status_code=400,
                content={
                    "success": False,
                    "error": "VERIFICATION FAILED: Image authenticity check did not pass",
                    "details": {
                        "verification_status": "FAILED",
                        "liveness_score": liveness,
                        "minimum_required_score": _LIVENESS_MINIMUM,
                        "reason": vr["liveness_check"].get("reason"),
                        "explanation": (
                            "The uploaded image appears to be inauthentic. This could be "
                            "because it is a screenshot, AI-generated image, flat graphic, or "
                            "lacks physical depth cues like shadows, reflections, and realistic "
                            "textures."
                        ),
                        "next_steps": [
                            "Upload a photo of the actual physical product",
                            "Ensure good lighting with visible shadows and reflections",
                            "Take photo at an angle showing 3D depth",
                            "Avoid screenshots or digital renders",
                            "Make sure the image shows real-world context",
                        ],
                        "image_generation_status": "CANCELLED",
                        "note": "NFT image generation will not proceed until verification passes",
                    },
                },
            )

        product_name = product_display_name(vr)
        pid = vr["product_identification"]

        # ---- Step 2: NFT image generation ----
        nft_prompt = (
            f"Create a vibrant digital NFT artwork of {product_name}. Style: modern digital "
            "art, blockchain aesthetic, 3D rendered, holographic elements, glowing effects, "
            "futuristic, premium quality. Background: abstract geometric shapes with Solana "
            "purple gradients, neon accents, cyber aesthetic. High resolution."
        )
        try:
            image_base64 = await openrouter.generate_marketing_image_with_model(
                nft_prompt, _NFT_IMAGE_MODEL
            )
        except Exception as e:  # noqa: BLE001 — Step 2
            raise ImageGenError(str(e)) from e

        # ---- Step 3: IPFS ----
        description = (
            f"Authentic {pid.get('brand') or 'luxury'} {pid.get('model') or 'item'} verified "
            f"and minted on Solana. {vr['full_description']}"
        )
        attributes = [
            {"trait_type": "Brand", "value": pid.get("brand") or "Unknown"},
            {"trait_type": "Model", "value": pid.get("model") or "Unknown"},
            {"trait_type": "Colorway", "value": pid.get("colorway") or "N/A"},
            {"trait_type": "Liveness Score", "value": liveness},
            {"trait_type": "Verification Confidence", "value": pid.get("confidence")},
        ]
        try:
            ipfs = await create_and_upload_nft_metadata(
                image_base64, product_name, description, attributes
            )
        except Exception as e:  # noqa: BLE001 — Step 3
            raise IPFSError(str(e)) from e
        metadata_uri = ipfs["metadataUri"]
        image_url = ipfs["imageUrl"]

        # ---- Step 3.5: mint standard NFT (blocking RPC -> threadpool) ----
        try:
            nft_mint_address = await to_thread.run_sync(
                solana.mint_nft, target_wallet, metadata_uri, product_name
            )
        except Exception as e:  # noqa: BLE001 — Step 3 (minting)
            raise MintError(str(e)) from e

        # ---- Step 4: save listing (app-enforced user lookup; no DB FK) ----
        listing_price = body.optional_price_sol if body.optional_price_sol is not None else 0
        try:
            async with pool_module.acquire() as conn:
                seller_user_id = (
                    await queries.get_user_id_by_wallet(conn, body.user_wallet)
                    if body.user_wallet
                    else None
                )
                listing = await queries.insert_listing(
                    conn,
                    {
                        "nft_mint_address": nft_mint_address,
                        "seller_wallet": body.user_wallet,
                        "seller_user_id": seller_user_id,
                        "product_name": product_name,
                        "description": description,
                        "category": pid.get("brand") or "Luxury Goods",
                        "condition": "Verified Authentic",
                        "image_url": image_url,
                        "metadata_uri": metadata_uri,
                        "price_sol": listing_price,
                        "status": "pending_wallet" if is_pending else "active",
                        "ai_verified": True,
                        "ai_confidence_score": pid.get("confidence"),
                        "guest_email": body.user_email if is_pending else None,
                        "is_pending_claim": is_pending,
                        "platform_wallet": target_wallet if is_pending else None,
                        "is_compressed": False,
                        "merkle_tree_address": None,
                        "leaf_index": None,
                    },
                )
        except Exception as e:  # noqa: BLE001 — Step 4
            raise DBError(str(e)) from e

        # ---- Step 4.5: on-chain VerificationProof (best-effort) ----
        proof_written = False
        if settings.hacknyu_marketplace_program_id:
            try:
                confidence_bps = verification.confidence_to_bps(pid.get("confidence"))
                model_name = (vr.get("_metadata", {}).get("modelId") or "").split("/")[-1] or "VISION"
                await to_thread.run_sync(
                    lambda: solana.submit_verification(
                        nft_mint=nft_mint_address,
                        confidence_bps=confidence_bps,
                        model_name=model_name,
                        liveness_passed=liveness >= _LIVENESS_MINIMUM,
                    )
                )
                proof_written = True
            except Exception as verr:  # noqa: BLE001 — warn-not-fail
                log.warning("submit_verification_failed", error=str(verr))

        # ---- Step 5: marketplace listing (best-effort) ----
        if proof_written:
            seller_for_chain = target_wallet if is_pending else body.user_wallet
            try:
                await to_thread.run_sync(
                    solana.list_item_on_marketplace,
                    nft_mint_address,
                    listing_price,
                    seller_for_chain,
                )
            except Exception as lerr:  # noqa: BLE001 — warn-not-fail
                log.warning("marketplace_listing_failed", error=str(lerr))

        # ---- Success ----
        return {
            "success": True,
            "listing_id": listing["id"],
            "nft_mint_address": nft_mint_address,
            "nft_image_url": image_url,
            "product_name": product_name,
            "listing_price_sol": listing_price,
            "status": "pending_wallet" if is_pending else "active",
            "is_pending_claim": is_pending,
            "message": (
                "Listing created! Connect your wallet anytime to claim your NFT."
                if is_pending
                else "NFT minted and listed successfully!"
            ),
            "verification": {
                "brand": pid.get("brand"),
                "model": pid.get("model"),
                "confidence": pid.get("confidence"),
                "liveness_score": liveness,
            },
        }
    except Exception as error:  # noqa: BLE001 — render step-attributed 500
        log.error("create_listing_failed", error=str(error))
        return pipeline_error_response(error)


@router.get("/create-listing")
async def create_listing_info() -> dict[str, Any]:
    """Static endpoint documentation (listing.js:526-563)."""
    return {
        "endpoint": "/api/create-listing",
        "method": "POST",
        "description": (
            "Create a new NFT listing with AI verification and NFT image generation "
            "- wallet optional!"
        ),
        "requiredFields": {
            "productImage": "Base64 encoded image (max 5MB, JPEG/PNG)",
            "userWallet OR userEmail": "Either Solana public key OR email (at least one required)",
        },
        "optionalFields": {
            "userWallet": "Solana public key (NFT held in platform wallet until claimed)",
            "userEmail": "Email address for notifications (required if no wallet)",
            "optionalPriceSol": "Price in SOL (defaults to 0)",
            "verificationModelId": "AI model for verification (defaults to zhipuai/glm-4-plus)",
            "imageGenModelId": "DEPRECATED - NFT images always use openai/gpt-5-image-mini",
        },
        "imageGenerationModel": "openai/gpt-5-image-mini",
        "documentation": "https://github.com/alin9661/HypeChain",
    }
