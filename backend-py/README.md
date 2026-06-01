# HypeChain Backend (FastAPI)

Python 3.13 / FastAPI port of the Express backend, deployed as an AWS Lambda
container. Built side-by-side with `../backend` (Express) until parity is proven;
the frontend cuts over by flipping `BACKEND_URL`.

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

## Build status (parallel PRs)

This is built across 5 PRs (see spec §7):

1. **Scaffold** (this PR) — app factory, settings, middleware, health, error contract, Dockerfile.
2. **DSQL data layer** — schema, async pool, OCC-safe writes, queries.
3. **Solana / Metaplex** — standard NFT mint, on-chain verification.
4. **OpenRouter / IPFS / cache** — AI verify + image gen, IPFS upload, Redis.
5. **Integration** — `listings` + `payments` routers, schemas, HTTP-parity harness.

## Deploy

AWS Lambda container image (`Dockerfile`, `public.ecr.aws/lambda/python:3.13`),
handler `app.lambda_handler.handler`. Reuses the existing Function URL / SAM template.
