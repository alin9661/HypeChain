"""Typed pipeline exceptions + the Express-parity error payload.

Replaces the Express ``errorMessage.includes(...)`` string-matching
(listing.js:455-503) with explicit exception types. Each carries its own
``failed_at`` label, ``explanation`` and ``possible_causes`` so the create-listing
500 response reproduces the Express ``failure_details`` block exactly.

Routers raise these; ``pipeline_error_response`` renders the 500.
"""

from __future__ import annotations

from datetime import datetime, timezone

from fastapi.responses import JSONResponse


class PipelineError(Exception):
    """Base for create-listing pipeline failures.

    Subclasses set ``failed_at`` / ``explanation`` / ``possible_causes`` as class
    attributes (the static mapping the Express keyword-routing produced). The
    instance message is the underlying error string.
    """

    failed_at: str = "Unknown"
    explanation: str = "An unexpected error occurred during the listing creation process."
    possible_causes: list[str] = []


class VerificationError(PipelineError):
    failed_at = "Step 1: AI Verification"
    explanation = "The AI vision model failed to verify your product image."
    possible_causes = [
        "OpenRouter API key is invalid or expired",
        "Vision model is temporarily unavailable",
        "Image format is not supported by the vision model",
        "Insufficient credits in OpenRouter account",
        "Network connectivity issues with OpenRouter API",
    ]


class ImageGenError(PipelineError):
    failed_at = "Step 2: NFT Image Generation"
    explanation = "The image model failed to generate the NFT artwork."
    possible_causes = [
        "OpenRouter API key is invalid or expired",
        "Image generation model is temporarily unavailable",
        "Insufficient credits in OpenRouter account for image generation",
        "Network connectivity issues with OpenRouter API",
        "Image generation request timed out after maximum retries",
    ]


class IPFSError(PipelineError):
    failed_at = "Step 3: IPFS Upload"
    explanation = "Failed to upload the NFT metadata and image to IPFS."
    possible_causes = [
        "nft.storage API key is invalid or expired",
        "IPFS upload service is temporarily unavailable",
        "Image file size exceeds IPFS limits",
        "Network connectivity issues with nft.storage",
    ]


class MintError(PipelineError):
    failed_at = "Step 3: NFT Minting"
    explanation = "Failed to mint the NFT on the Solana blockchain."
    possible_causes = [
        "Solana wallet configuration is invalid",
        "Insufficient SOL for transaction fees",
        "Solana network congestion or downtime",
        "Metaplex minting instruction error",
        "Invalid wallet address provided",
    ]


class DBError(PipelineError):
    failed_at = "Step 4: Database Storage"
    explanation = "Failed to save the listing to the database."
    possible_causes = [
        "Aurora DSQL connection is invalid or expired",
        "Database schema mismatch",
        "IAM auth token / dsql:DbConnectAdmin permission issue",
        "Network connectivity issues with DSQL",
    ]


def pipeline_error_response(exc: Exception) -> JSONResponse:
    """Render the Express-parity 500 with step attribution (listing.js:505-518)."""
    if isinstance(exc, PipelineError):
        failed_at = exc.failed_at
        explanation = exc.explanation
        possible_causes = exc.possible_causes
    else:
        failed_at = "Unknown"
        explanation = "An unexpected error occurred during the listing creation process."
        possible_causes = []

    return JSONResponse(
        status_code=500,
        content={
            "success": False,
            "error": str(exc),
            "failure_details": {
                "failed_at": failed_at,
                "explanation": explanation,
                "possible_causes": possible_causes,
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "note": (
                    "Please check your API keys, network connection, and service "
                    "statuses. If using image generation, ensure you have sufficient "
                    "OpenRouter credits."
                ),
            },
        },
    )
