# Explanation: Design decisions

The reasoning behind the choices that shaped this backend, and what each one traded away. The
full record lives in the design spec
(`docs/superpowers/specs/2026-05-28-backend-fastapi-refactor-design.md`); this is the readable
summary.

## FastAPI over Express (the port itself)

The original backend was 9 Express.js routes. The rewrite targets FastAPI (Python 3.13) for an
async-native stack, typed Pydantic validation at the boundary (replacing hand-written
validators), auto-generated OpenAPI docs, and — most importantly — a real test suite (the
Express backend had **zero** tests).

**Parity is the north star.** "Parity" means HTTP-contract parity: same routes, same response
JSON shapes, same env-var names, so the frontend cuts over by flipping one `BACKEND_URL`. It is
built **side-by-side** in `backend-py/` while the Express service keeps running, so rollback is
instant.

- **Trade-off:** a full language rewrite is more work than incremental change, and a faithful
  port carries over the original's quirks (e.g. SOL-vs-USDC wording) rather than fixing them.
  Hardening that diverges from Express was done deliberately and called out (see below).

### Delivered across 5 parallel PRs
The work was split into a scaffold PR plus three **independent** domain PRs (DSQL, Solana,
AI/IPFS) that were built concurrently, then an integration PR. The scaffold declares the full
dependency set up front and owns `app/main.py` + `settings.py`, so the three domain PRs touch
disjoint directories and never conflict. They were verified to compose (all modules import
together, full suite green) before integration.

- **Trade-off:** parallelism needs a clean dependency cut and a scaffold-first ordering; the
  payoff is three domains built at once with no merge conflicts.

## Aurora DSQL over Supabase (the data layer)

The database moved from Supabase (managed Postgres over a REST client) to **Aurora DSQL**
(serverless, distributed, Postgres-compatible). DSQL fits Lambda far better than classic
Postgres: no VPC, no connection-pool exhaustion, a regional IAM-authenticated endpoint.

What DSQL costs you, and how the code absorbs it:

| DSQL constraint | Consequence | Mitigation in code |
|-----------------|-------------|--------------------|
| No `FOREIGN KEY` | Referential integrity isn't DB-enforced | App-side: look up `users.id`, write NULL for an orphan `seller_user_id` |
| Optimistic concurrency control | Read-modify-write can lose updates under contention | `db/occ.py` retries on serialization failure (`40001`); the volume increment is a single additive `UPDATE` |
| Prepared-statement limits | The 2nd query on a connection can error | `statement_cache_size=0` on the asyncpg pool |
| No triggers / RLS | `updated_at`, row security are gone | `updated_at` set explicitly in UPDATEs; backend already uses a privileged connection |
| IAM auth tokens (short-lived) | A long-lived connection's token expires | Token minted per *new* connection (it authenticates setup, not each query) |

Because the response is now serialized from `asyncpg` rows (not Supabase REST JSON), HTTP
parity became a per-field task: explicit column lists (no `SELECT *`), `json_build_object` to
reproduce the nested `listing{...}` history shape, and timestamp/decimal normalization.

- **Trade-off:** bundling a data-layer migration into a runtime port is two hard changes at
  once (an independent review flagged this). It was kept in scope because the live DB is empty
  — no data migration, no production risk — and the work was split into separate PRs to keep it
  bisectable.

## Hand-built Metaplex minting + the golden-tx guard

There is no mature Python Metaplex SDK, so the Token Metadata `CreateMetadataAccountV3`
instruction is built by hand with `solders`. That is the single highest-risk module: one wrong
byte in the Borsh layout or a swapped account and the mint fails on-chain with an opaque error.

The mitigation is a **golden-transaction byte guard** (`tests/test_metaplex_golden.py`): the
serialized instruction data is asserted against an *independently re-derived* Borsh expectation
(built with `struct`, sharing no code path with the builder) plus a pinned golden hex. That
catches builder drift rather than self-agreement. The program ID, discriminator, field order,
and account order are pinned constants.

- **Honest limit:** "verified" here means "matches the Borsh spec," **not** "accepted on
  devnet." Code carries `# TODO(devnet-verify):` markers; a human must byte-compare a Python
  mint against a real devnet transaction before production.
- **Scope cut:** compressed NFTs (Metaplex Bubblegum) were dropped entirely — they were already
  a fallback path and have no Python SDK. The `useCompressedNFT` flag is accepted and ignored.

## Rate limiting moved to infrastructure

App-level `slowapi` was removed: an in-memory limiter is useless across stateless Lambda
instances. Throttling belongs at the AWS Function URL / API Gateway layer.

- **Trade-off:** that throttling is per-function concurrency, not per-IP — this is *removing*
  app-level rate limiting, not replacing it. A Redis-backed limiter or WAF is the follow-up if
  abuse appears.

## Security hardening (where we diverge from Express on purpose)

Three findings from an automated review were fixed even though two were faithful Express ports:
the generic 500 handler returns a static message in production (real error still logged);
`node_env` defaults to `production` (fail-closed); and the body-size cap streams instead of
trusting `Content-Length` (closing a chunked-bypass that Express's parse-time cap didn't have).

## Related
- [Architecture](explanation-architecture.md) · [How-to: Configure Aurora DSQL](howto-configure-dsql.md)
