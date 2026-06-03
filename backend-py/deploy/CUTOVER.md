# Frontend cutover runbook

How to move the frontend from the Express backend to the new FastAPI Lambda
(behind a Function URL) with zero-downtime staging validation and a fast
rollback. The cutover is a single `BACKEND_URL` flip — the FastAPI service is a
contract-for-contract port of Express (response key-sets pinned in
`backend-py/tests/test_parity.py`).

> The frontend reads the backend origin from its `BACKEND_URL` /
> `NEXT_PUBLIC_API_URL` env var on Vercel. "Flip `BACKEND_URL`" below means
> updating that env var for the named scope and redeploying the frontend.

## Pre-flight

1. Backend deployed: run `backend-py/deploy/deploy.sh` (with `--apply`) and copy
   the **Function URL** it prints (Step 7).
2. Secrets set on the Lambda per `deploy/SECRETS.md` — including
   `HACKNYU_REDIS_ENABLED=false`, the DSQL endpoint, and (if the provenance
   webhook is live) `HACKNYU_HELIUS_WEBHOOK_SECRET`. Confirm `NODE_ENV` is unset
   or `production`, and `HACKNYU_DATABASE_URL` is **unset**.
3. `HACKNYU_FRONTEND_URL` on the Lambda matches the frontend origin so CORS
   agrees at both the Function URL and app layers.

## Step 1 — Point STAGING frontend at the new Function URL

- Set the **staging/preview** frontend `BACKEND_URL` to the new Function URL.
  Do **not** touch production yet.
- Redeploy the staging frontend.

## Step 2 — Run create-listing / pay on devnet

- Confirm the backend's `HACKNYU_SOLANA_RPC_URL` points at **devnet**.
- From the staging frontend, complete a full create-listing flow (upload ->
  AI verify -> image gen -> IPFS -> mint) and then a payment (create -> verify)
  end to end. Use a throwaway devnet wallet.

## Step 3 — Run the parity smoke

- Run `backend-py/deploy/smoke-test.sh <function-url>`: asserts `GET /` and
  `GET /health` are 200.
- Exercise the commented create-listing -> payment skeleton in that script
  (against devnet) and **diff the response key-sets** against the contract
  constants in `backend-py/tests/test_parity.py`
  (`CREATE_LISTING_SUCCESS_KEYS`, `LIVENESS_DETAIL_KEYS`, `FAILURE_DETAILS_KEYS`).
  If a running Express instance is available, set `EXPRESS_URL` and diff the two
  JSON bodies field-for-field.
- Proceed only if liveness is 200 and the key-sets match exactly.

## Step 4 — Flip PRODUCTION `BACKEND_URL`

- Set the **production** frontend `BACKEND_URL` to the new Function URL
  (update both Production and Preview scopes if they share a value).
- Redeploy the production frontend.
- Immediately re-run `smoke-test.sh <function-url>` and watch CloudWatch logs
  for the Lambda for the first few minutes of real traffic.

## Rollback

If anything regresses after the production flip:

1. Set the production frontend `BACKEND_URL` **back to the Express backend URL**.
2. Redeploy the production frontend.
3. The Lambda can keep running (it has no destructive side effects on the
   Express data path beyond shared external state); investigate with CloudWatch
   logs before re-attempting the cutover.

Because cutover is a pure env-var flip, rollback is also a pure env-var flip —
no backend redeploy is required to revert.

## Notes

- The Function URL uses **buffered** invoke mode (6 MB response cap); the app
  enforces a 5 MB request-body cap to match. Large product images can 413 — use
  a smaller image.
- Throttling lives at the Lambda concurrency layer (no API Gateway). See
  `deploy/THROTTLING.md`.
