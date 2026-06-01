# How-to: Local development

Set up a full local dev loop and learn the conventions for adding code. Assumes you've done
the [getting-started tutorial](tutorial-getting-started.md).

## Prerequisites
- Python 3.13 + uv, dependencies installed (`uv sync` in `backend-py/`).
- For exercising real services: an OpenRouter key, an NFT.Storage key, a Solana RPC URL +
  server keypair, and (for DB) a reachable Aurora DSQL cluster.

## Configure your environment

```bash
cp .env.example .env
```

Edit `.env` and set `NODE_ENV=development` plus whatever keys you need. Settings bind by name
(`HACKNYU_OPENROUTER_API_KEY` → `settings.hacknyu_openrouter_api_key`). Unset service keys are
fine until you call that service. Full list: [Reference: Configuration](reference-configuration.md).

## Run the server (hot reload)

```bash
NODE_ENV=development uv run uvicorn app.main:app --reload --port 3001
```

`--reload` restarts on file changes. `NODE_ENV=development` gives you verbose 500 bodies with
stack traces and human-readable console logs.

## Run tests and lint

```bash
uv run pytest                 # full suite
uv run pytest tests/test_dsql.py -q   # one file
uv run ruff check .           # lint
uv run ruff check --fix .     # autofix
```

Tests mock every external boundary (respx for HTTP, fake pool for DSQL, FakeRpc for Solana), so
the suite runs offline and deterministically. No devnet or live DSQL is touched.

## Conventions when adding code

**Read settings via `get_settings()`** — never `os.environ` directly:
```python
from app.config.settings import get_settings

settings = get_settings()
if settings.hacknyu_openrouter_api_key is None:
    raise RuntimeError("HACKNYU_OPENROUTER_API_KEY is required")
```

**External clients are lazy module-level singletons** so warm Lambda invocations reuse the
connection. Follow the existing pattern (e.g. `app/services/openrouter.py::_get_client`,
`app/services/cache.py::_get_client`, `app/db/pool.py::get_pool`):
```python
_client: SomeClient | None = None

def _get_client() -> SomeClient:
    global _client
    if _client is None:
        _client = SomeClient(...)   # built once, on first use
    return _client
```
Provide a `reset_*()` for tests (see `openrouter.reset_client`, `cache.reset_cache_client`).

**Validate required config at call time, not import time** — so the app still boots for health
checks without that key.

**Add a test alongside the code** and mock the boundary (respx / fakes), matching the existing
`tests/test_*.py` files.

## Verification
- `uv run pytest` stays green.
- `uv run ruff check .` is clean.
- `curl localhost:3001/health` returns `"status":"healthy"`.

## Troubleshooting
- **`ModuleNotFoundError`** → run via `uv run ...` (not a bare `python`); `uv sync` first.
- **A service raises "… is required"** → the corresponding `HACKNYU_*` key is unset in `.env`.
- **DB calls fail locally** → you need a real DSQL cluster; see
  [How-to: Configure Aurora DSQL](howto-configure-dsql.md). Service tests don't need one.

## Related
- [Reference: Service & data layer](reference-services.md) · [How-to: Deploy to AWS Lambda](howto-deploy-lambda.md)
