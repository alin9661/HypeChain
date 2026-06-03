# Request throttling

App-level rate limiting was **intentionally removed** from the backend (see the
design decisions doc). Throttling is therefore applied at the **Lambda
concurrency layer**, not in application code.

## Why concurrency, not an API Gateway usage plan

The deployment is a **direct Lambda Function URL with no API Gateway**
(`backend/template.yaml` documents the reason: API Gateway's 29s integration
timeout cannot serve the 30–90s create-listing flow). API Gateway usage-plan
throttling and per-method rate limits are therefore **not available** — there is
no API Gateway in the request path.

The throttle that *is* available for a Function-URL Lambda is **reserved
concurrency**: a hard cap on how many invocations run simultaneously. Excess
concurrent requests are rejected (HTTP 429) rather than fanning out unbounded.
This protects downstream resources (OpenRouter quota, Solana RPC, DSQL
connections) and caps cost — the closest equivalent to rate limiting for this
topology.

## Mechanism 1 — SAM-managed (preferred, in `backend/template.yaml`)

`backend/template.yaml` is the primary deploy mechanism, so the throttle is wired
there as `ReservedConcurrentExecutions` on the function. It is parameterized via
`ReservedConcurrency` so it can be tuned per environment without editing the
template:

```yaml
Parameters:
  ReservedConcurrency:
    Type: Number
    Default: 20
    Description: >
      Reserved concurrency cap (request throttle). App-level rate limiting was
      removed and there is no API Gateway (Function URL only), so this is the
      throttle layer. Caps simultaneous invocations; excess requests get 429.

Resources:
  HypeChainBackend:
    Type: AWS::Serverless::Function
    Properties:
      ReservedConcurrentExecutions: !Ref ReservedConcurrency
```

Tune `ReservedConcurrency` (default `20`) to your account's unreserved-concurrency
budget and expected load. `sam deploy --guided` prompts for it and persists the
answer in `samconfig.toml`.

> Note: `backend/template.yaml` on `main` currently describes the **Node/Express**
> Lambda (Supabase params, `nodejs20` image tag). The `ReservedConcurrentExecutions`
> wiring is the deploy-prep change; the env-var/parameter surface still needs the
> Express->FastAPI/DSQL migration (separate workstream). The throttle property
> itself is runtime-agnostic and applies to whichever image the function runs.

## Mechanism 2 — script / CLI (for the direct deploy path)

When deploying out-of-band with `deploy/deploy.sh` instead of SAM, set the same
cap with `--reserved-concurrency N` (or `RESERVED_CONCURRENCY=N`). Under the hood
that is:

```bash
aws lambda put-function-concurrency \
  --function-name <name> \
  --reserved-concurrent-executions <N> \
  --region <region>
```

(`deploy.sh` only runs this under `--apply`; in dry-run it just prints it.)

## Verifying

```bash
aws lambda get-function-concurrency \
  --function-name <name> \
  --region <region>
```

Reports the `ReservedConcurrentExecutions` currently in effect.
