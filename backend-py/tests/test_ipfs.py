"""Tests for the NFT.Storage IPFS service (httpx mocked with respx)."""

from __future__ import annotations

import base64
import json

import httpx
import pytest
import respx

from app.services import ipfs

PNG_BYTES = b"\x89PNG\r\n\x1a\nfakepngbody"
DATA_URL = "data:image/png;base64," + base64.b64encode(PNG_BYTES).decode("ascii")


@pytest.fixture(autouse=True)
def _api_key(monkeypatch):
    settings = ipfs.get_settings()
    monkeypatch.setattr(settings, "hacknyu_nft_storage_api_key", "test-key", raising=False)


def _ok(cid: str) -> httpx.Response:
    return httpx.Response(200, json={"ok": True, "value": {"cid": cid}})


@respx.mock
async def test_create_and_upload_returns_expected_uris():
    cids = iter(["imageCID123", "metaCID456"])
    route = respx.post(ipfs.NFT_STORAGE_UPLOAD_URL).mock(
        side_effect=lambda request: _ok(next(cids))
    )

    result = await ipfs.create_and_upload_nft_metadata(
        DATA_URL,
        name="Nike Air Jordan Chicago",
        description="Authentic sneaker",
        attributes=[{"trait_type": "Brand", "value": "Nike"}],
    )

    assert result == {
        "metadataUri": "https://nftstorage.link/ipfs/metaCID456",
        "imageUrl": "https://nftstorage.link/ipfs/imageCID123",
    }

    # Two uploads: image first, then metadata.
    assert route.call_count == 2
    # Bearer auth header is forwarded.
    assert route.calls[0].request.headers["authorization"] == "Bearer test-key"

    # The metadata body references the image by ipfs:// CID and carries fields.
    metadata = json.loads(route.calls[1].request.content)
    assert metadata["image"] == "ipfs://imageCID123"
    assert metadata["name"] == "Nike Air Jordan Chicago"
    assert metadata["attributes"] == [{"trait_type": "Brand", "value": "Nike"}]


@respx.mock
async def test_image_upload_sends_decoded_bytes_and_mime():
    route = respx.post(ipfs.NFT_STORAGE_UPLOAD_URL).mock(return_value=_ok("cidA"))

    result = await ipfs.upload_image_to_ipfs(DATA_URL)

    assert result == {"cid": "cidA", "url": "https://nftstorage.link/ipfs/cidA"}
    sent = route.calls[0].request
    assert sent.content == PNG_BYTES
    assert sent.headers["content-type"] == "image/png"


@respx.mock
async def test_upload_raises_ipfs_error_on_http_failure():
    respx.post(ipfs.NFT_STORAGE_UPLOAD_URL).mock(return_value=httpx.Response(500))

    with pytest.raises(ipfs.IPFSError, match="Failed to upload image to IPFS"):
        await ipfs.upload_image_to_ipfs(DATA_URL)


@respx.mock
async def test_upload_raises_ipfs_error_on_not_ok_body():
    respx.post(ipfs.NFT_STORAGE_UPLOAD_URL).mock(
        return_value=httpx.Response(200, json={"ok": False, "error": "quota"})
    )

    with pytest.raises(ipfs.IPFSError, match="rejected"):
        await ipfs.upload_image_to_ipfs(DATA_URL)


async def test_missing_api_key_raises(monkeypatch):
    settings = ipfs.get_settings()
    monkeypatch.setattr(settings, "hacknyu_nft_storage_api_key", None, raising=False)

    with pytest.raises(ipfs.IPFSError, match="NFT_STORAGE_API_KEY"):
        await ipfs.upload_image_to_ipfs(DATA_URL)


def test_decode_base64_image_handles_bare_and_data_url():
    body, mime = ipfs._decode_base64_image(DATA_URL)
    assert body == PNG_BYTES
    assert mime == "image/png"

    bare = base64.b64encode(PNG_BYTES).decode("ascii")
    body2, mime2 = ipfs._decode_base64_image(bare)
    assert body2 == PNG_BYTES
    assert mime2 == "image/png"
