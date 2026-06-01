# HypeChain FastAPI Backend — Documentation

Structured with the [Diataxis](https://diataxis.fr/) framework — four kinds of docs for four
reader needs. Start with the tutorial if you're new; jump to reference if you know what you want.

> **Status:** The scaffold, data layer (Aurora DSQL), Solana/Metaplex, and AI/IPFS services are
> built. The routers exposing `create-listing` + `payments` arrive in PR5, so the live HTTP API
> is currently `/health` + `/`. Docs note "Pending (PR5)" where relevant.

## Tutorial — learning-oriented
- [Run the backend locally](tutorial-getting-started.md) — zero to a running server + tests in ~5 min.

## How-to — task-oriented
- [Local development](howto-local-development.md) — dev loop, conventions for adding code.
- [Deploy to AWS Lambda](howto-deploy-lambda.md) — container image, Function URL, env.
- [Configure Aurora DSQL](howto-configure-dsql.md) — provision, IAM grant, apply schema.

## Reference — information-oriented
- [Configuration](reference-configuration.md) — every environment variable.
- [Service & data layer](reference-services.md) — the public API of every module.
- [HTTP API](reference-http-api.md) — routes, response shapes, error contract.

## Explanation — understanding-oriented
- [Architecture](explanation-architecture.md) — layers, request lifecycle, the warm-Lambda model.
- [Design decisions](explanation-design-decisions.md) — FastAPI, Aurora DSQL, Metaplex, the trade-offs.

---
Design record: `../../docs/superpowers/specs/2026-05-28-backend-fastapi-refactor-design.md`.
