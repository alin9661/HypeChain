"""IPFS uploads via the NFT.Storage REST API (httpx port of `services/ipfs.js`).

The Node service used the `nft.storage` SDK's `storeBlob`, which POSTs a single
blob to `https://api.nft.storage/upload` and returns `{ ok, value: { cid } }`.
We reproduce that over httpx so the rest of the pipeline sees the same
`{metadataUri, imageUrl}` shape:

  image (base64) -> upload -> ipfs CID
  metadata JSON (image: ipfs://<cid>) -> upload -> ipfs CID
  -> {metadataUri: gateway-url, imageUrl: gateway-url}
"""

from __future__ import annotations

import base64
import json
import logging
from typing import Any

import httpx

from app.config.settings import get_settings

logger = logging.getLogger(__name__)

NFT_STORAGE_UPLOAD_URL = "https://api.nft.storage/upload"
IPFS_GATEWAY = "https://nftstorage.link/ipfs"


class IPFSError(Exception):
    """Raised when an NFT.Storage upload fails."""


def _decode_base64_image(base64_image: str) -> tuple[bytes, str]:
    """Decode a data URL (or bare base64) into (bytes, mime_type).

    Mirrors the Node `base64ToBuffer` helper: split on the first comma and decode
    the payload; recover the mime type from the `data:<mime>;` prefix when present.
    """
    if "," in base64_image:
        header, payload = base64_image.split(",", 1)
        mime_type = "image/png"
        if header.startswith("data:") and ";" in header:
            mime_type = header[len("data:") : header.index(";")] or "image/png"
    else:
        payload = base64_image
        mime_type = "image/png"

    return base64.b64decode(payload), mime_type


async def _store_blob(client: httpx.AsyncClient, content: bytes, content_type: str) -> str:
    """Upload a single blob to NFT.Storage and return its CID."""
    api_key = get_settings().hacknyu_nft_storage_api_key
    if not api_key:
        raise IPFSError("HACKNYU_NFT_STORAGE_API_KEY is not set in environment variables")

    response = await client.post(
        NFT_STORAGE_UPLOAD_URL,
        content=content,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": content_type,
        },
    )
    response.raise_for_status()
    body = response.json()
    if not body.get("ok"):
        raise IPFSError(f"NFT.Storage upload rejected: {body.get('error')}")
    return body["value"]["cid"]


async def upload_image_to_ipfs(
    base64_image: str,
    client: httpx.AsyncClient | None = None,
) -> dict[str, str]:
    """Upload a base64 image to IPFS. Returns `{cid, url}`."""
    image_bytes, mime_type = _decode_base64_image(base64_image)

    owns_client = client is None
    client = client or httpx.AsyncClient(timeout=60.0)
    try:
        cid = await _store_blob(client, image_bytes, mime_type)
        url = f"{IPFS_GATEWAY}/{cid}"
        logger.info("Image uploaded to IPFS: %s", url)
        return {"cid": cid, "url": url}
    except IPFSError:
        raise
    except Exception as error:  # noqa: BLE001 — wrap with parity message
        logger.error("IPFS image upload error: %s", error)
        raise IPFSError(f"Failed to upload image to IPFS: {error}") from error
    finally:
        if owns_client:
            await client.aclose()


async def upload_metadata_to_ipfs(
    metadata: dict[str, Any],
    client: httpx.AsyncClient | None = None,
) -> dict[str, str]:
    """Upload an NFT metadata JSON object to IPFS. Returns `{uri, cid}`."""
    metadata_json = json.dumps(metadata, indent=2).encode("utf-8")

    owns_client = client is None
    client = client or httpx.AsyncClient(timeout=60.0)
    try:
        cid = await _store_blob(client, metadata_json, "application/json")
        uri = f"{IPFS_GATEWAY}/{cid}"
        logger.info("Metadata uploaded to IPFS: %s", uri)
        return {"uri": uri, "cid": cid}
    except IPFSError:
        raise
    except Exception as error:  # noqa: BLE001 — wrap with parity message
        logger.error("IPFS metadata upload error: %s", error)
        raise IPFSError(f"Failed to upload metadata to IPFS: {error}") from error
    finally:
        if owns_client:
            await client.aclose()


async def create_and_upload_nft_metadata(
    image_base64: str,
    name: str,
    description: str,
    attributes: list[dict[str, Any]],
) -> dict[str, str]:
    """Upload image + metadata to IPFS and return `{metadataUri, imageUrl}`.

    The on-chain `image` field uses an `ipfs://<cid>` URI (matching the Express
    service), while `imageUrl` is the HTTPS gateway URL for display.
    """
    async with httpx.AsyncClient(timeout=60.0) as client:
        try:
            image_result = await upload_image_to_ipfs(image_base64, client=client)
            metadata = {
                "name": name,
                "description": description,
                "image": f"ipfs://{image_result['cid']}",
                "attributes": attributes,
            }
            metadata_result = await upload_metadata_to_ipfs(metadata, client=client)
            return {
                "metadataUri": metadata_result["uri"],
                "imageUrl": image_result["url"],
            }
        except IPFSError:
            raise
        except Exception as error:  # noqa: BLE001 — wrap with parity message
            logger.error("NFT metadata creation error: %s", error)
            raise IPFSError(f"Failed to create NFT metadata: {error}") from error
