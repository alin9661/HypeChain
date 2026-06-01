# Tutorial: Run the backend locally

By the end of this tutorial you'll have the HypeChain FastAPI backend running on your machine,
see its live health endpoint and interactive API docs in a browser, and run its test suite —
all in under five minutes. You don't need AWS, a database, or any API keys for this: the app
boots with safe defaults and only needs real credentials when you exercise the AI/Solana/DB
services.

## What you'll need

- **Python 3.13** and **[uv](https://docs.astral.sh/uv/)** (the package manager). Check:
  ```bash
  uv --version && python3 --version
  ```
- This repository cloned locally.

## Step 1: Install dependencies

```bash
cd backend-py
uv sync
```

`uv` reads `uv.lock` and creates a `.venv/` with every dependency pinned. This is the only
install step — no separate virtualenv activation needed; `uv run` uses the env automatically.

## Step 2: Start the server

```bash
uv run uvicorn app.main:app --reload --port 3001
```

You'll see uvicorn report `Uvicorn running on http://127.0.0.1:3001`. **That's your first
result** — the app is live. Leave it running and open a second terminal for the next step.

## Step 3: See it working

Hit the health probe:

```bash
curl -s http://localhost:3001/health
```

```json
{"status":"healthy","timestamp":"2026-06-01T18:00:00.000000+00:00","uptime":3.1,"environment":"production"}
```

Now open **http://localhost:3001/docs** in a browser — FastAPI's interactive OpenAPI UI, where
you can see and call every route. Right now that's `/health` and `/` (the listing/payment
routes arrive in PR5).

> Note `"environment":"production"` — that's the fail-closed default. For verbose errors and
> console logging during development, start the server with `NODE_ENV=development uv run uvicorn ...`.

## Step 4: Run the tests

Stop the server (Ctrl-C) and run:

```bash
uv run pytest
```

You'll see the suite pass (health, middleware, and the DSQL/Solana/AI service tests). This is
the safety net the original Express backend never had.

## What you built

You have the backend running locally, served its live endpoints, browsed its API docs, and run
its tests. Nothing here touched a real external service — the app is designed to boot without
credentials so you can develop against it immediately.

Next:
- [How-to: Local development](howto-local-development.md) — wire up real keys, add a service.
- [Reference: Configuration](reference-configuration.md) — every setting explained.
- [Explanation: Architecture](explanation-architecture.md) — how a request flows.
