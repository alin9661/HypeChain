"""Shared pytest fixtures.

The scaffold ships a minimal async test client over the FastAPI app. Domain PRs
extend this with their own fixtures (mocked OpenRouter/IPFS via respx, fixture
Solana RPC responses, a test DSQL pool).
"""

import httpx
import pytest

from app.main import app


@pytest.fixture
async def client():
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac
