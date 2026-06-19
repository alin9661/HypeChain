# AWS Production Deployment Guide

> **Scope:** Deploy HypeChain entirely on AWS — Express backend on Lambda, Aurora DSQL, Next.js frontend on Amplify — running against **Solana devnet (no real funds)** but engineered and operated to **mainnet-grade safety standards**.
>
> **Why this framing:** Staying on devnet means a bug costs nothing. Applying mainnet-grade discipline now (KMS-pattern key handling, authenticated + rate-limited write endpoints, idempotency, server-side reconciliation, full observability, IaC, staging) means the eventual flip to real funds is a short, known path — not a rewrite. The few things that *only* matter with real money (money-transmitter licensing, HSM/MPC custody, finalizing mainnet upgrade authority) are listed in [§9 Deferred gates](#9-deferred-gates--required-before-real-funds) and are explicitly **out of scope** here.

---

## Table of contents

1. [Target architecture](#1-target-architecture)
2. [Prerequisites — code changes before you deploy](#2-prerequisites--code-changes-before-you-deploy)
3. [AWS account foundation](#3-aws-account-foundation)
4. [Secrets, database, and RPC](#4-secrets-database-and-rpc)
5. [Deploy the backend (Express on Lambda)](#5-deploy-the-backend-express-on-lambda)
6. [Deploy the frontend (Amplify) + edge](#6-deploy-the-frontend-amplify--edge)
7. [Observability, staging, and runbooks](#7-observability-staging-and-runbooks)
8. [Concepts & insights not covered by the codebase](#8-concepts--insights-not-covered-by-the-codebase)
9. [Deferred gates — required before real funds](#9-deferred-gates--required-before-real-funds)
10. [Verification checklist](#10-verification-checklist)

---

## 1. Target architecture

```
 Users
   │  HTTPS (your domain, ACM cert)
   ▼
 CloudFront ──────────────► AWS WAF (rate limit, bot, geo)
   │ default behavior              │
   ▼                               ▼
 Next.js SSR origin           /api/* behavior
 (AWS Amplify Hosting)        ──► Lambda Function URL (Express, serverless-http)
                                    │
                                    ├─► Aurora DSQL        (IAM-token auth via execution role)
                                    ├─► Secrets Manager+KMS (custodial key, API keys)
                                    ├─► Solana devnet RPC   (paid Helius/Triton devnet endpoint)
                                    ├─► OpenRouter / nft.storage (egress)
                                    └─► CloudWatch Logs + Metrics + X-Ray
 Solana devnet: Evidence Locker program (program ID 2pTt…), upgradeable
```

**Component choices and why:**

| Component | Choice | Rationale |
|---|---|---|
| Backend | Express on **Lambda** (container image, Function URL) | `backend/template.yaml` + `backend/Dockerfile` already target this. Function URL (not API Gateway) avoids the 29 s gateway timeout that would break the 30–90 s `create-listing` flow. |
| Database | **Aurora DSQL** | Serverless, IAM-token auth (no password to leak), scales to zero. Express **now** ships a DSQL data layer (`backend/src/db/`, schema `backend/schema/001_dsql_schema.sql`); Supabase is removed from `backend/src/` (`.env.example`/`template.yaml` cleanup still pending) — see [§2.1](#21-migrate-the-express-backend-from-supabase-to-aurora-dsql--done). |
| Frontend | **Amplify Hosting** | Native Next.js 16 App Router + SSR support. CloudFront+S3 alone only works for static export — this app uses `next start`. |
| Network | **Solana devnet** | No real funds. Existing program `2pTtzWXELYNXAsXkWq3zgErbYnJTANfq5LmBptdk5uiF`. |
| Secrets | **Secrets Manager + KMS** | Custodial key + API keys never live in plaintext env or CloudFormation. |

---

## 2. Prerequisites — code changes before you deploy

These are engineering changes the codebase needs before a clean AWS deploy. Each is worth doing on devnet as mainnet-grade practice. Treat this as a pre-deploy checklist.

> **Status (2026-06-15):** §2.1 (DSQL migration) and the rate-limit half of §2.3 have **landed on `main`** (v0.6.0.0, PRs #44/#46–#51). Remaining pre-deploy code: §2.2 (KMS signer), the Privy-auth half of §2.3, §2.4 correctness items, and §2.5 frontend hygiene. These are tracked as follow-up PRs.

### 2.1 Migrate the Express backend from Supabase to Aurora DSQL ✅ DONE
**Landed (v0.6.0.0).** Express now ships a full DSQL data layer and Supabase is removed from `backend/src/` (the `backend/.env.example` and `backend/template.yaml` Supabase params are stale and still need cleanup):
- [x] DSQL data layer for Express: `backend/src/db/{pool.js, occ.js, queries.js, index.js}` (lazy singleton pool, OCC retry on SQLSTATE 40001, explicit column-enumerated queries, data-access facade). Ported from `backend-py/app/db/`.
- [x] Added `pg` + `@aws-sdk/dsql-signer` with **bun**; `@supabase/supabase-js` removed.
- [x] `listing.js` + `payment.js` route every DB call through the facade; no `supabase` / `HACKNYU_POSTGRES_*` left under `backend/src/`.
- [x] Schema applied at `backend/schema/001_dsql_schema.sql` (users / listings / transactions / activities; app-enforced FKs).
- [x] `backend/.env.example` rewritten for DSQL (`HACKNYU_DSQL_ENDPOINT`, `AWS_REGION`, IAM-token auth, no DB password); local `HACKNYU_DATABASE_URL` escape hatch is fail-closed in production.
- [x] Pool uses a lazy module-level singleton, statement cache disabled (DSQL requirement), mints the IAM token per connection. Regression-guard tests in `backend/test/db.test.js`; `bun test` green (89 pass).

### 2.2 Custodial key → Secrets Manager + KMS ⛔ BLOCKER
`HACKNYU_SERVER_WALLET_PRIVATE_KEY` is plaintext env today and is decoded on every request. On devnet the key is worthless, but adopt the secure pattern now so the mainnet flip is a key swap, not a re-architecture.

- [ ] Load the key from Secrets Manager at cold start, decode once, cache in memory, **never log it** (`backend/src/services/solana.js` `getServerWallet()`).
- [ ] Wrap signing behind a `signer` abstraction so swapping to HSM/MPC later is a one-file change (see [§9](#9-deferred-gates--required-before-real-funds)).

### 2.3 Authenticate + rate-limit the cosign endpoint ⛔ BLOCKER (rate-limit ✅ landed)
`POST /api/payments/cosign-purchase` drains the paid RPC budget and drives the custodial signer.

- [x] Per-IP + per-listing rate limiting landed (`backend/src/middleware/rate-limit.js`, PR #49). Note: in-memory store is per-instance; move to a shared store / AWS WAF rate rules for multi-instance (see [§6.3](#63-domain-tls-and-waf)).
- [ ] Require a verified **Privy session token** on write endpoints; verify server-side against Privy's JWKS. (The frontend already uses Privy; the backend just doesn't check it yet.) — **follow-up PR**.

### 2.4 Correctness fixes worth doing now (from `TODOS.md`)
- [ ] **Bind payment verification to a Solana Pay reference pubkey** (closes a replay/spoof surface).
- [ ] **Idempotency keys on mutating endpoints** — `create-listing` can double-mint on retry.
- [ ] **Single source of truth for instruction discriminators** — frontend + backend hardcode the same 6 independently; regenerate from the IDL.
- [ ] **Cluster consistency check** — assert via genesis hash that frontend, backend, and program ID all point at the same cluster.
- [ ] **Server-side reconciler** — DB finalization currently rides on the buyer's browser; add a scheduled Lambda (EventBridge) that read-repairs DB rows against chain-authoritative listing state.

### 2.5 Frontend build hygiene
- [ ] Remove `typescript: { ignoreBuildErrors: true }` from `frontend/next.config.mjs` and fix the underlying TS errors so the build catches regressions in the purchase path.
- [ ] Port the security headers from `frontend/vercel.json` into `next.config.mjs` `headers()` — **Amplify does not read `vercel.json`**.

---

## 3. AWS account foundation

```bash
# Use a dedicated account, ideally isolated in an AWS Organization.
# Authenticate with short-lived SSO creds — never long-lived root/admin keys.
aws sso login --profile hypechain-prod
export AWS_PROFILE=hypechain-prod
export AWS_REGION=us-east-1   # pin ONE region for DSQL, Lambda, Secrets, KMS, Amplify
```

Enable from day one (immutable audit trail for anything touching the custodial secret):

```bash
aws cloudtrail create-trail --name hypechain-trail --s3-bucket-name <log-bucket> --is-multi-region-trail
aws guardduty create-detector --enable
# Enable AWS Config via the console or a config-recorder template.
```

Create a **least-privilege deploy role** for CI/local deploys; do not deploy with admin. Pin the region — DSQL availability and latency to your RPC provider should drive the choice.

---

## 4. Secrets, database, and RPC

### 4.1 KMS + Secrets Manager (do this before the Lambda)

```bash
# Dedicated CMK for the custodial workload
aws kms create-key --description "HypeChain custodial" --tags TagKey=app,TagValue=hypechain
aws kms create-alias --alias-name alias/hypechain-custodial --target-key-id <key-id>

# Secrets, all encrypted with the CMK above
aws secretsmanager create-secret --name hypechain/server-wallet \
  --secret-string '<devnet-base58-key>' --kms-key-id alias/hypechain-custodial
for s in openrouter nft-storage helius privy; do
  aws secretsmanager create-secret --name "hypechain/$s" \
    --secret-string '<value>' --kms-key-id alias/hypechain-custodial
done
```

The Lambda execution role gets `secretsmanager:GetSecretValue` + `kms:Decrypt` scoped to **only** these resources. Write a rotation runbook now (see [§8.1](#8-concepts--insights-not-covered-by-the-codebase)) — practice it on devnet.

### 4.2 Aurora DSQL

```bash
aws dsql create-cluster --tags app=hypechain   # note the cluster endpoint
```

- Apply the schema `backend/schema/001_dsql_schema.sql` (no FKs/triggers/RLS, adds the `activities` table) via a one-off bootstrap script or a throwaway Lambda.
- Grant the Lambda execution role `dsql:DbConnectAdmin` scoped to the cluster (the pool connects as the `admin` DSQL user). **No DB password anywhere.**
- Verify the pool spec: lazy singleton, statement cache disabled, IAM token minted per connection.

### 4.3 Paid devnet RPC

Public `api.devnet.solana.com` rate-limits at ~40 req / 10 s / method — too low for transaction confirms + the activity feed. Provision a **paid devnet endpoint** (Helius, Triton, or QuickNode), DAS-capable if you keep compressed-NFT reads. Store the URL in `hypechain/helius` (or Amplify env for the client), never in source.

---

## 5. Deploy the backend (Express on Lambda)

The SAM template (`backend/template.yaml`) and Dockerfile (`backend/Dockerfile`) already build an **arm64 Lambda container** (`public.ecr.aws/lambda/nodejs:20`, bun deps, handler `src/lambda.handler`) behind a **Function URL**. Keep this — do not add API Gateway.

**Template changes needed:**
- Drop the Supabase parameters; add DSQL endpoint + region.
- Switch secret parameters from `NoEcho` plaintext to **runtime Secrets Manager reads** (preferred — keeps secrets out of CloudFormation) or `{{resolve:secretsmanager:...}}` dynamic references.
- Attach execution-role policies: `secretsmanager:GetSecretValue`, `kms:Decrypt`, `dsql:DbConnectAdmin`, CloudWatch Logs.

**Environment (devnet):**
```
HACKNYU_SOLANA_NETWORK=devnet
HACKNYU_MARKETPLACE_PROGRAM_ID=2pTtzWXELYNXAsXkWq3zgErbYnJTANfq5LmBptdk5uiF
HACKNYU_DSQL_ENDPOINT=<cluster-id>.dsql.<region>.on.aws   # pool.js throws if unset
HACKNYU_DSQL_REGION=us-east-1
HACKNYU_SOLANA_RPC_URL=<paid devnet RPC>
HACKNYU_DAS_RPC_URL=<paid devnet DAS RPC>
HACKNYU_REDIS_ENABLED=false          # ioredis leaks across warm Lambda invocations
HACKNYU_FRONTEND_URL=https://<your-amplify-domain>
```

**Deploy:**
```bash
cd backend
sam build
sam deploy --guided     # prompts for params, pushes to ECR, creates/updates the Lambda
# Capture the Function URL from the stack outputs.
```

Tune `ReservedConcurrency` to cap RPC spend, and set `Timeout` for the slow `create-listing` path (the 900 s max is intentional headroom).

---

## 6. Deploy the frontend (Amplify) + edge

### 6.1 Amplify Hosting
- Create an Amplify app from the repo; **app root `frontend/`**, framework Next.js (SSR).
- Build with **bun** (`bun install`, `bun run build`) — never pnpm (project standard).

### 6.2 Amplify environment variables (set in console, not committed)
```
NEXT_PUBLIC_API_URL=<Lambda Function URL>          # no trailing slash
NEXT_PUBLIC_PRIVY_APP_ID=<privy app id>
NEXT_PUBLIC_SOLANA_RPC_URL=<paid devnet RPC>
NEXT_PUBLIC_HYPECHAIN_PROGRAM_ID=2pTtzWXELYNXAsXkWq3zgErbYnJTANfq5LmBptdk5uiF
NEXT_PUBLIC_SOLANA_NETWORK=devnet
NEXT_PUBLIC_USE_ANCHOR_PURCHASE=1
```
The app's production guards throw if the Privy app id or program id are unset/placeholder — keep them; they catch a misconfigured build.

### 6.3 Domain, TLS, and WAF
- Route 53 hosted zone + ACM certificate.
- Apex/subdomain → Amplify; optionally `api.` → the Function URL (front it with CloudFront if you want one domain + WAF on the API).
- **AWS WAF** on the public edge: managed rule sets, **rate-based rules on `/api/payments/*`**, bot control. This is the enforcement layer behind [§2.3](#23-authenticate--rate-limit-the-cosign-endpoint--blocker).

---

## 7. Observability, staging, and runbooks

### 7.1 Observability (before users, not after the first incident)
- CloudWatch dashboards: Lambda errors / throttles / duration, DSQL connection errors, RPC failure rate, cosign endpoint 4xx/5xx.
- Alarms → SNS on: 5xx spike on payment routes, custodial-wallet SOL balance below threshold (devnet faucet top-up), **`CUSTODIAL_KEY_DRIFT` errors** (signer vs on-chain seller disagree — a money-safety signal even on devnet), Lambda throttling.
- Add request IDs to structured logs (log-injection escaping already exists in `payment.js`) and ship to a queryable store.

### 7.2 Staging discipline
Stand up a **second identical AWS stack** via the same IaC — separate DSQL cluster, separate throwaway devnet key. Changes flow staging → prod. This is the "as if mainnet" muscle.

### 7.3 Program on devnet
- No mainnet deploy. Keep the existing devnet program upgradeable so you can iterate.
- If you rebuild it (e.g. the encoding fixes in §2.4), redeploy to **devnet** per `contracts/DEPLOY.md` (`./anchor.sh` pins nightly-2024-11-01 + Anchor 0.30.1 → `anchor keys sync` → test → `anchor deploy --provider.cluster devnet`), then re-propagate the program ID to backend env, Amplify env, and `Anchor.toml`.
- Ensure `init_dossier` has run for the (now KMS-backed) devnet server wallet.

---

## 8. Concepts & insights not covered by the codebase

These are mandatory operational concepts the repo never addresses. Apply all of them on this devnet deploy.

1. **Key & secret rotation runbook.** No rotation procedure exists for the server wallet, RPC keys, OpenRouter/nft.storage keys, or Privy secrets. Define who rotates, how, and what breaks during rotation — and practice it on devnet.
2. **Financial reconciliation mindset.** Even with devnet SOL, build ledger discipline: reconcile on-chain settlement vs DB state and handle partial failures (SOL moved but DB write failed). The §2.4 reconciler is the seed.
3. **Idempotency everywhere.** Retries and Lambda re-invokes must never double-act (double-mint, double-purchase).
4. **RPC cost & rate-limit budgeting.** The blocking multi-confirm `create-listing` and the activity feed burn RPC. Add caching, backoff, and a spend cap — paid devnet still meters.
5. **Incident response & kill-switch.** Runbook for "custodial key suspected compromised" (pause cosign, rotate) plus a feature flag to disable purchases. Define a DSQL backup/restore plan.
6. **Load & failure testing.** None exists. Test Lambda cold-start under concurrency, DSQL connection limits, and RPC failover before opening to users.
7. **Cost monitoring.** AWS Budgets + cost-anomaly alarms across Lambda, DSQL, RPC, and Amplify.
8. **Data protection & PII.** Privy supplies user identities; the `activities` table records provenance. Know what PII you store and your retention policy before users arrive.
9. **API / program compatibility policy.** A single IDL source of truth so a program upgrade can't silently break in-flight clients (ties to the discriminator-drift fix).
10. **Observability as a feature.** Dashboards and alarms exist before users, not after the first outage.

---

## 9. Deferred gates — required before real funds

**Out of scope for this devnet deploy.** Revisit every item before any mainnet move:

1. **Custody ≈ money transmission.** Holding users' funds and signing transfers can trigger state MTL / FinCEN MSB registration + KYC/AML. **Get legal counsel before mainnet.** A non-custodial model (user always signs from their own wallet) sidesteps most of this and is worth weighing then.
2. **HSM/MPC custody for the real key.** Single-key custody of real funds is the top risk; mainnet needs Fireblocks / Turnkey / Squads multisig, hot/cold separation, and per-transaction value limits. (A devnet key was already lost once — proof the pattern matters.)
3. **Mainnet upgrade-authority finalization.** Squads multisig (recommended) or `solana program set-upgrade-authority --final`. A single hot key as mainnet upgrade authority is the anti-pattern.
4. **Mainnet economics & fee strategy.** Priority fees, compute-unit pricing, PDA/ATA rent, and a marketplace fee (`HACKNYU_MERCHANT_WALLET_ADDRESS` is currently unused).
5. **ToS, Privacy Policy, risk disclosures.** Required before taking real funds; users must consent to the custodial model and crypto-loss risk.
6. **AI-verification liability.** A wrong AI "verification" that costs a user real money is a liability surface needing disclaimers and an operational dispute process (the program has `flag_dispute`; there is no process around it).

---

## 10. Verification checklist

Each stage gates the next.

- [ ] **DSQL port (§2.1):** `cd backend && bun test` green (incl. the DSQL guard tests in `backend/test/db.test.js`); `grep -rE 'supabase|HACKNYU_POSTGRES' backend/src` returns nothing live, and `@supabase/supabase-js` is gone from `backend/package.json`.
- [ ] **Backend hardening (§2.2–2.4):** full buy loop runs on devnet (`cd backend && RUN_DEVNET=1 node scripts/devnet-buy-smoke.js`) with the key loaded from Secrets Manager, the cosign endpoint auth-gated + rate-limited, and a retried `create-listing` producing exactly one mint.
- [ ] **DSQL (§4.2):** a Lambda using only the execution role (no password) runs `SELECT 1` against the cluster.
- [ ] **Backend (§5):** `curl <FunctionURL>/health` → `{status, environment:"production"}`; cosign without a valid Privy token → 401; with one → builds a tx.
- [ ] **Frontend (§6):** Amplify build succeeds with `ignoreBuildErrors` off; site loads, Privy wallet connect works, the program-id guard did not throw.
- [ ] **Program (§7.3):** `solana program show 2pTtzWXELYNXAsXkWq3zgErbYnJTANfq5LmBptdk5uiF --url devnet` confirms the deploy; `init_dossier` confirmed for the KMS-backed devnet server wallet.
- [ ] **Ops (§7.1–7.2):** dashboards populate; a forced 5xx fires the SNS alarm; a change promoted staging → prod proves the pipeline.
- [ ] **End-to-end:** a real **devnet** purchase by a test wallet completes — SOL buyer→seller, NFT seller→buyer, DB flips to Sold, activity feed records it, CloudWatch clean. This is the done bar for this scope.
- [ ] **Before any future mainnet move:** revisit [§9](#9-deferred-gates--required-before-real-funds) — those are the go/no-go gates that do not apply here.
