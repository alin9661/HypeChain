# HypeChain Backend (FastAPI)

Python 3.13 / FastAPI port of the Express backend, deployed as an AWS Lambda
container. Keeps HTTP parity with `../backend` (Express) and adds an on-chain
activities / provenance feed and a Helius transfer-ingest webhook on top. The
frontend cuts over by flipping `BACKEND_URL`; the Express backend stays until
that cutover lands.

Design spec: [`../docs/superpowers/specs/2026-05-28-backend-fastapi-refactor-design.md`](../docs/superpowers/specs/2026-05-28-backend-fastapi-refactor-design.md)

## Documentation

Full [Diataxis](https://diataxis.fr/) docs live in [`docs/`](docs/README.md):

- **Tutorial:** [Run the backend locally](docs/tutorial-getting-started.md)
- **How-to:** [Local development](docs/howto-local-development.md) · [Deploy to AWS Lambda](docs/howto-deploy-lambda.md) · [Configure Aurora DSQL](docs/howto-configure-dsql.md)
- **Reference:** [Configuration](docs/reference-configuration.md) · [Service & data layer](docs/reference-services.md) · [HTTP API](docs/reference-http-api.md)
- **Explanation:** [Architecture](docs/explanation-architecture.md) · [Design decisions](docs/explanation-design-decisions.md)

## Stack

- **FastAPI** + **uvicorn** (dev) / **mangum** (Lambda adapter)
- **Pydantic v2** + **pydantic-settings** for typed requests + env
- **Aurora DSQL** via **asyncpg** + **boto3** (IAM auth) — replaces Supabase
- **OpenRouter** (AI vision + image gen), **NFT.Storage** (IPFS), **solders/solana-py** (Solana)
- **uv** for dependency management

## Local development

```bash
cd backend-py
uv sync                 # install deps (creates .venv from uv.lock)
cp .env.example .env    # fill in keys
uv run uvicorn app.main:app --reload --port 3001
```

Open `http://localhost:3001/docs` for the OpenAPI UI, `/health` for the probe.

## Tests

```bash
uv run pytest
```

## What shipped

Built and merged across the refactor (see spec §7):

1. **Scaffold** — app factory, settings, middleware, health, error contract, Dockerfile.
2. **DSQL data layer** — schema, async pool, OCC-safe writes, queries.
3. **Solana / Metaplex** — standard NFT mint, on-chain verification.
4. **OpenRouter / IPFS / cache** — AI verify + image gen, IPFS upload, Redis.
5. **Integration** — `listings` + `payments` routers, schemas, HTTP-parity harness.
6. **Activities + provenance** — `activities` feed router and per-mint
   `/api/nft/{mint}/history`, fed by a fail-closed Helius `webhooks` ingest endpoint.
7. **Buy-loop hardening (v0.5.0.0)** — `/api/create-listing` now requires
   `user_wallet` (`400 ACCOUNT_REQUIRED`, Express parity; the guest/custodial
   intake path is removed, so `seller_wallet` is never NULL);
   `send_transaction` confirms before returning (commitment `confirmed`,
   2s polling, 30s timeout — devnet caps each RPC method at ~40 req/10s);
   startup fails closed via `require_marketplace_program_id()` when
   `HACKNYU_MARKETPLACE_PROGRAM_ID` is unset or still the scaffold
   placeholder outside dev/test.

Routes: `/`, `/health`, `/api/create-listing`, `/api/payments/*` (6),
`/api/activities`, `/api/nft/{mint}/history`, `/api/webhooks/helius`.
(The custodial co-sign purchase endpoint, `POST /api/payments/cosign-purchase`,
ships in the Express backend only — see [`../backend/README.md`](../backend/README.md).)

## Deploy

AWS Lambda container image (`Dockerfile`, `public.ecr.aws/lambda/python:3.13`),
handler `app.lambda_handler.handler`. Reuses the existing Function URL / SAM template.
Deploy scripts and checklists live in [`deploy/`](deploy/): `deploy.sh`,
`smoke-test.sh`, [`SECRETS.md`](deploy/SECRETS.md), [`CUTOVER.md`](deploy/CUTOVER.md),
[`THROTTLING.md`](deploy/THROTTLING.md). All AWS-authenticated steps are operator-run.
