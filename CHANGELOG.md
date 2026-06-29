# Changelog

All notable changes to HypeChain are recorded here. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [0.8.1.2] - 2026-06-28

A live smoke-test for the deployed waitlist endpoint (Part D verification).
Script only — no application code.

### Added

- **`backend/scripts/verify-live-waitlist.sh`** — hits the public Lambda Function
  URL (no AWS creds) and checks health + signup persistence + an optional
  Bearer-token CSV export. Idempotent: a fixed smoke recipient hits the route's
  dedupe path on re-run instead of piling rows. It requires a **deliverable**
  `SMOKE_EMAIL` (defaults to the admin inbox) and refuses reserved/undeliverable
  TLDs, so a smoke run can't hard-bounce a confirmation once emails are enabled.

## [0.8.0.0] - 2026-06-27

First step of the Supabase decommission: user registration and profiles now run
on the Express backend + Aurora DSQL instead of the Supabase-backed Next.js
routes. Additive only — the frontend still calls Supabase until the cutover, so
nothing changes for users yet.

### Added

- **`POST /api/users/register`** — register a wallet or refresh its last login,
  DSQL-backed. Idempotent (insert-or-stamp), with type-checked input, a chain-type
  whitelist, length caps on every field, and a per-IP rate limit.
- **`GET /api/users/:walletAddress`** — public profile lookup, 404 when not
  registered, per-IP rate limited.
- **`users` table columns** `privy_user_id`, `chain_type`, `last_login`, applied
  to existing clusters via idempotent `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`.

### Security

- The public profile lookup never returns `email` or `last_login`, and register
  only echoes an email on a brand-new signup — so a wallet address can't be used
  to harvest a stored email. (Server-side wallet-ownership proof is a documented
  mainnet follow-up.)

### Fixed

- `apply-dsql-schema.sh` no longer treats a `CREATE TABLE` mentioned in a SQL
  comment as a required table (anchored the table-derivation grep to line start).

## [0.7.1.2] - 2026-06-26

Waitlist signups work in production again, and deploys now keep the database
schema in sync so a newly added table can't silently go missing.

### Fixed

- **Waitlist signup no longer 500s** (`POST /api/waitlist`). The live Aurora DSQL
  cluster was missing the `waitlist` table — the schema had been applied by hand
  once, before that table existed, and never re-applied. Signups record correctly
  again.

### Added

- **Idempotent schema apply** (`backend/scripts/apply-dsql-schema.sh`). Applies
  `schema/001_dsql_schema.sql` to the live cluster and then asserts every table the
  schema defines actually exists, failing loudly if one is missing. The deploy
  script runs it before `sam deploy`, so the database can never drift behind the
  code that depends on it.
- **Optional waitlist export token** passthrough in the deploy script
  (`HACKNYU_WAITLIST_EXPORT_TOKEN`), so `GET /api/waitlist/export` can be enabled
  without editing committed config.

## [0.7.1.1] - 2026-06-26

Fixes the devnet-staging deploy so the backend actually boots and serves the
frontend cross-origin. Found running the first real AWS Lambda deploy.

### Fixed

- **Deploy script no longer fails on the optional Helius secret** (`backend/scripts/deploy-devnet-staging.sh`).
  Parameter overrides are now built as an array; the optional `HeliusWebhookSecret`
  is only passed when set, instead of sending an empty `Key=` that SAM rejects.
- **Added `--resolve-s3` to `sam deploy`.** The image-based Lambda still stages its
  template to S3, so the deploy failed with "S3 Bucket not specified" without it.
- **Pass `MarketplaceProgramId` (the deployed devnet program ID).** The app threw at
  module load (`evidence-locker-client.js`) when it was unset, crash-looping the
  Lambda on every invocation (HTTP 502).
- **Removed the Function URL CORS block (`backend/template.yaml`).** Express `cors()`
  is now the sole CORS owner. With both layers active, every response carried two
  `Access-Control-Allow-Origin` headers, which browsers reject.

## [0.7.1.0] - 2026-06-23

Makes the Express backend actually deployable to AWS: the SAM template now grants
the permissions the app needs and stops shipping secrets in plaintext.

### Added

- **Lambda execution-role permissions (`backend/template.yaml`).** The function now
  gets least-privilege policies — `secretsmanager:GetSecretValue` on `hypechain/*`,
  `dsql:DbConnectAdmin` on the Aurora DSQL cluster, and (optionally) `kms:Decrypt`
  for a customer-managed key — so it can read its custodial key and connect to the
  database. Previously the auto-generated role had none of these and the Lambda
  could not start.
- **DSQL configuration** wired into the template (`HACKNYU_DSQL_ENDPOINT` /
  `_REGION` / `_DATABASE`), plus `backend/samconfig.toml` with non-secret deploy
  defaults (no secrets stored on disk).

### Changed

- **Custodial wallet key now loads from AWS Secrets Manager at runtime**, not a
  plaintext CloudFormation parameter — the key never lands in a Lambda env var.
  API keys stay `NoEcho` and are passed at deploy time, never committed.
- **Express CORS is fail-closed in production.** With `NODE_ENV=production` and no
  `HACKNYU_FRONTEND_URL`, the app now refuses to boot instead of silently trusting
  `http://localhost:3000`.

### Removed

- Stale **Supabase** parameters from `backend/template.yaml` and the dead Supabase
  Postgres block from `backend/.env.example` (the backend moved to DSQL in v0.6.0.0).
- Deprecated the Railway/Render `BACKEND_DEPLOYMENT.md` in favor of the AWS guide.

## [0.7.0.0] - 2026-06-23

A production waitlist so prospective users can register interest while HypeChain
is pre-production. Signups are collected in the AWS backend (Aurora DSQL), with
an opt-in confirmation email and an admin notification per signup via Amazon
SES, plus a token-protected export for the operator.

### Added

- **Waitlist signup API.** `POST /api/waitlist` validates name + email (and an
  optional Solana wallet and intent), writes the signup to a new DSQL `waitlist`
  table, and returns a server-issued submission id (`HC-W-…`) and intake stamp.
  The insert is idempotent on email (`ON CONFLICT DO NOTHING`) so a re-signup is
  a no-op that reports `alreadyOnList` without a duplicate row or a second email.
- **Transactional email via Amazon SES.** A best-effort email service sends the
  user a single opt-in confirmation and notifies the operator of each signup.
  Sends run after the row is committed and never fail a recorded signup if SES
  is throttled or sandboxed; they are gated by `HACKNYU_WAITLIST_EMAILS_ENABLED`
  and log only the recipient address and outcome, never message contents.
- **Admin export.** `GET /api/waitlist/export` returns the full list as CSV
  (default) or JSON (`?format=json`), guarded by a Bearer token with a
  constant-time compare. It fails closed (500) when the token is unset.
- **Waitlist page wired to the live endpoint.** `/waitlist` now submits to the
  real API and drives its receipt off the server response (including an
  "already on the list" variant), replacing the previous client-side stub. No
  visual changes to the design.
- SAM parameters and an `ses:SendEmail` IAM policy for the new env vars, and a
  Waitlist section in the AWS production deployment guide (SES setup, sandbox
  note, export usage).

### Security

- The CSV export defangs spreadsheet formula injection: a cell beginning with
  `= + - @` (or a tab/CR) is prefixed with an apostrophe so an attacker-supplied
  signup name cannot execute as a formula when an admin opens the export.
- `name` and `wallet` are length-capped at the trust boundary (email was already
  capped), bounding what reaches the database, the admin email, and the export.

## [0.6.1.2] - 2026-06-22

Fixes the production frontend so it stops trying to reach a `localhost` backend.

### Fixed

- **The deployed site no longer fails every API call against `localhost`.** In a
  production build with no `NEXT_PUBLIC_API_URL` set, the API client now targets
  the same origin (so the app's own Vercel API routes resolve) instead of an
  unreachable `http://localhost:3001`, which was throwing `ERR_CONNECTION_CLOSED`
  in the browser console. The WebSocket client follows the same rule and stays
  idle in production unless a URL is configured. Development is unchanged
  (`localhost:3001`), and an explicit `NEXT_PUBLIC_API_URL` always wins.

## [0.6.1.1] - 2026-06-19

The Collections and Activities pages now match the rest of the app — the same
Case-File Ribbon, financial-terminal layout, and Verified Yellow palette as the
marketplace and listings, instead of the old slate/rounded card style.

### Changed

- **Collections page restyled to the design system.** Adopts the Navigation +
  Case-File Ribbon chassis, polygon clip-path corners, `--hc-*` tokens, an
  Instrument Serif header, a KPI strip, and forensic collection cards (grid +
  list). Search, sort, and the grid/list toggle are preserved; the sort menu now
  dismisses on Escape and outside-click.
- **Activities feed restyled to the design system.** Same chassis, with a stats
  strip, per-type status chips (sale / listed / transfer / mint), and restyled
  loading, empty, and error states. The live `getActivities` data flow is
  unchanged.

### Fixed

- The Activities feed now shows a real error state when the feed request fails,
  instead of silently rendering an empty feed.
- Below-the-fold images on both pages load lazily; the activity filter chips
  report `aria-pressed` instead of an unfulfilled tablist role.

### Added

- Unit tests covering both pages (render states, search, sort, filters, and the
  formatting helpers) — the frontend suite is now 95 tests.

## [0.6.1.0] - 2026-06-16

QA pass on the production site: the wallet-connect and listing flows now work
end to end on Solana, and a status-bar timestamp no longer breaks page
hydration.

### Fixed

- **Connecting a wallet and creating a listing now work on Solana.** Connecting
  Phantom no longer fails with "Missing required fields," and filing a listing
  no longer returns a 400. The app now reads your connected wallet from Privy's
  Solana hook (it had been reading the Ethereum-only hook), so your Solana
  address and account registration go through correctly.
- **A failed registration now retries a few times, then stops cleanly.** A
  transient network or server error during account registration is retried a
  bounded number of times instead of either getting stuck until a page reload
  or hammering a down backend on every re-render. Reconnecting a wallet always
  re-registers it, so you can't get stranded connected-but-without-a-profile.
- **The status ribbon no longer triggers a hydration error on load.** The live
  INTAKE clock renders a stable placeholder on first paint and then fills in,
  removing the React hydration mismatch on listing pages.

### Changed

- **Connect Wallet now opens Privy's built-in modal**, restricted to Phantom /
  Solana to match the Solana-only backend — so you can't connect a wallet that
  can't transact.

### Removed

- The bespoke custom wallet modal whose wallet-option rows were non-functional
  (only its single button worked); the built-in modal above replaces it.

## [0.6.0.0] - 2026-06-13

Backend consolidated onto a single Express service on Aurora DSQL; the FastAPI
service and Supabase are retired. New web3-product surfaces and on-chain
correctness fixes round out the marketplace.

### Added

- **Express is the single backend, on Aurora DSQL.** Ported the FastAPI DSQL
  data layer to Node (`backend/src/db/{pool,queries,occ,index}.js`):
  node-postgres pool with DSQL IAM-token auth + TLS, no cached prepared
  statements, OCC retry on serialization failures, and a fail-closed local-PG
  escape hatch. `listing.js` + `payment.js` now read/write DSQL via a shared
  `db` facade (Supabase client removed).
- **Activities feed, provenance & Helius webhook ported to Express** —
  `GET /api/activities` (keyset-paginated), `GET /api/nft/:mint/history`, and
  `POST /api/webhooks/helius` (fail-closed constant-time HMAC, idempotent insert).
- **Custodial guest listings** — `create-listing` accepts `custodial: true`,
  unifying mint target + on-chain seller + co-sign signer on one real server
  keypair so a guest's item is actually sellable (P0 fix).
- **On-chain references persisted** — `listing_pubkey` + `verification_proof_pubkey`
  columns; the create-listing response now returns `marketplace_mode` + both PDAs.
- **Portfolio** (`/portfolio`) and **transaction history** (`/transactions`)
  pages; both added to the sidebar.
- **Rate limiting** (per-IP, fail-closed) on create-listing + payments, and an
  **X-Request-Id** correlation middleware.

### Changed

- `flag_dispute` no longer permits `Delisted → Disputed` (would lock a listing
  forever); blocks both `Sold` and `Delisted` (new `DisputeNotAllowed`).
- Purchase button: DESIGN.md compliance — inset-glow instead of `hover:scale`,
  caret reveal instead of the pulse spinner.

### Removed

- **`backend-py/` (FastAPI) and Supabase** — superseded by Express-on-DSQL.
  Removed the `@supabase/supabase-js` backend dependency and the root
  `supabase_marketplace_schema.sql` (DSQL schema lives in `backend/schema/`).

### Tests

- Backend suite 89/89 pass (DSQL data layer, activities/webhook, custodial
  branching, on-chain refs, rate-limit/request-id). New contract regression
  tests (SelfPurchase, Delisted-cannot-dispute) added as source.

### Deferred (follow-ups)

- Privy JWT auth middleware, Sentry, and server-key → AWS Secrets Manager.
- Frontend collections backend, notifications, share/SEO, USD display.
- Frontend `app/api/users/*` still use Supabase directly — migrate to Express
  user endpoints before fully decommissioning Supabase.

## [0.5.0.0] - 2026-06-12

The buy loop is live on-chain. The Evidence Locker program is deployed to
devnet and the full custodial purchase flow — co-sign, buy, NFT delivered —
is proven end-to-end and enabled in production.

### Added

- **Evidence Locker program deployed to devnet** under program ID
  `2pTtzWXELYNXAsXkWq3zgErbYnJTANfq5LmBptdk5uiF`. Builds go through
  `contracts/anchor.sh` (pins the nightly toolchain anchor 0.30.1 needs);
  `contracts/DEPLOY.md` documents the full deploy + smoke ritual.
- **Custodial co-sign purchases** — buyers can now complete real on-chain
  purchases of custodially-held listings. `POST /api/payments/cosign-purchase`
  builds the entire transaction server-side, validates it against the
  chain-authoritative listing PDA (status, seller, price, custody), and
  partial-signs as the custodial seller. The server never signs
  client-supplied bytes.
- **The buyer never signs unverified bytes either** — the frontend decodes
  the co-signed transaction and asserts every instruction is allowlisted,
  exactly one `purchase_evidence` exists at the displayed price, and no stray
  transfers ride along; it also aborts before the wallet popup if the shown
  price disagrees with the on-chain price.
- Skip-gated devnet smoke tests prove the loop against the real program:
  sell side (`backend-py/tests/test_devnet_smoke.py`: mint → verify → list)
  and buy side (`backend/scripts/devnet-buy-smoke.js`: co-sign → buy →
  Sold, NFT moved, exact lamports received).

### Changed

- **Breaking: creating a listing now requires an account wallet.** Both
  backends reject `create-listing` without a user wallet (400
  `ACCOUNT_REQUIRED`), and `seller_wallet` is never NULL. The custodial
  co-sign flow remains the buy path for existing custodial inventory.
- Purchase finalization is ACID-aligned with the chain as source of truth:
  `verifyPayment` is idempotent (an interrupted purchase recovers by retry
  instead of dying on "signature already used"), the co-sign service
  read-repairs DB rows the chain already marked Sold, and a
  `CUSTODIAL_KEY_DRIFT` error hard-fails rather than letting a buyer pay
  without receiving the NFT when backend signing keys diverge.
- Misconfigured deploys fail loud everywhere: backend-py refuses to start,
  the Express service refuses to build instructions, and the frontend build
  throws when the marketplace program ID is unset or still the Anchor
  scaffold placeholder.
- backend-py submits transactions devnet-safely: sends confirm before
  returning (fixes a race where `list_evidence` ran before the verification
  account existed), with a 30s RPC timeout and 2s confirmation polling that
  respects the public devnet rate caps.

### Fixed

- Guest listings no longer persist a NULL `seller_wallet` that broke payment
  creation for every custodial purchase.
- A co-sign endpoint outage (code-less 404) aborts the purchase with a clear
  message instead of silently downgrading to a pay-without-NFT transfer.
- Purchase button shows the charge currency correctly (SOL, not USDC),
  surfaces blockhash expiry as a friendly "please retry", and uses the
  design-system tokens instead of hardcoded colors.

### For contributors

- Production env propagation: 7 Solana variables in Vercel (program IDs, RPC
  URLs, custodial key, `NEXT_PUBLIC_USE_ANCHOR_PURCHASE=1`).
- Pre-merge review pipeline (6 specialists + adversarial + red team) fixed 5
  critical findings before landing; deferred items tracked in TODOS.md.

## [0.4.1.0] - 2026-06-11

### Fixed

- Landing page no longer crashes with "R3F: Hooks can only be used within the
  Canvas component" — the WebGL hero now loads client-only, where WebGL
  actually runs.
- Connecting a wallet no longer re-initializes WalletConnect on every
  re-render ("Init() was called 2 times"), which could drop or duplicate
  wallet sessions.
- The console error "Encountered a script tag while rendering React
  component" is gone on every page: the unmaintained next-themes package was
  replaced with a built-in theme provider that applies your saved theme
  before first paint without tripping React 19.
- Embedded-wallet creation is now correctly declared off for both Ethereum
  and Solana (the previous setting was silently ignored by the Privy SDK).
- The light/dark toggle in the header now reflects what is actually on
  screen for "System" users — the first click changes the theme instead of
  doing nothing visible.

### Changed

- Dark is now the default appearance, including before any scripts run —
  matching the financial-terminal design. Light and System remain selectable
  in Settings, sync across tabs, and survive another tab clearing storage.
- A WebGL or network failure in the landing hero now degrades to the plain
  black background instead of replacing the whole page with an error screen.
- Production builds now fail fast with a clear message when the Privy app ID
  is missing, instead of silently booting an app where no one can sign in.

### Infrastructure

- Frontend test suite repaired and expanded: 3 previously-broken suites fixed
  and 27 tests added covering the theme provider (including executing the
  pre-paint script), the Privy provider config, and the header toggle —
  5 suites / 59 tests, all green.
- `@solana/spl-token` is now declared in `frontend/package.json` instead of
  relying on another package hoisting it — installs no longer break when the
  dependency tree shifts.

## [0.4.0.0] - 2026-06-04

### Added

- **FastAPI backend (`backend-py/`)** — a Python 3.13 / FastAPI port of the
  Express API, deployed as an AWS Lambda container via the `mangum` adapter. Keeps
  HTTP parity with the Express backend (parity harness in `tests/test_parity.py`)
  and is the target the frontend cuts over to by flipping `BACKEND_URL`. Aurora
  DSQL (asyncpg + IAM auth) replaces Supabase; OpenRouter, NFT.Storage, and
  solders/solana-py back the AI, IPFS, and Solana service layers. uv manages deps.
- **On-chain activities / provenance feed** — `GET /api/activities` and a
  per-mint `GET /api/nft/{mint}/history`, backed by an idempotent activities
  table (UNIQUE + `ON CONFLICT DO NOTHING`).
- **Helius transfer-ingest webhook** — `POST /api/webhooks/helius`, fail-closed:
  returns 401 when `HACKNYU_HELIUS_WEBHOOK_SECRET` is unset or the request header
  doesn't match.
- **Deploy prep** (`backend-py/deploy/`) — `deploy.sh` (build → ECR → Lambda,
  guarded with a dry-run/confirmation so nothing runs without an explicit go),
  `smoke-test.sh`, and `SECRETS.md` / `CUTOVER.md` / `THROTTLING.md` checklists.
  All AWS-authenticated steps are operator-run.
- Full [Diataxis](https://diataxis.fr/) docs for the FastAPI backend in
  `backend-py/docs/` (tutorial / how-to / reference / explanation), plus a
  pytest suite covering the service, data, and router layers.

### Security

- **Payment buyer-binding (HIGH)** — `verify_payment` now requires the claimed
  buyer to be a funding source of the transaction (a negative balance delta
  covering the amount). Defeats hijacking a payment signature where a different
  account paid the recipient.
- **Error-disclosure gating (MEDIUM)** — 500 responses from the payments router
  and the pipeline error handler expose raw exception text only when
  `is_development`; production returns a generic message and logs detail server-side.
- **Fail-closed local-DB escape hatch** — `HACKNYU_DATABASE_URL` is honored only
  when `NODE_ENV=development`; set in any other environment, the pool refuses to open.

### Changed

- Frontend activities page (`frontend/app/activities/page.tsx`) and API client
  (`frontend/lib/api-client.ts`) wired to the new provenance feed.

## [0.3.0.0] - 2026-05-27

### Added

- Solana Evidence Locker on-chain program — sellers now have a real
  case file backed by Anchor PDAs (`Dossier` per seller, `VerificationProof`
  per mint, `EvidenceListing` per mint). Listings can no longer be created
  without an AI verdict anchored on-chain at or above the confidence
  threshold (default 50 %). Six instructions: `init_dossier`,
  `submit_verification`, `list_evidence`, `delist_evidence`,
  `purchase_evidence`, `flag_dispute`.
- Anchor Mocha test suite covers every instruction (happy path + at
  least one failure case per instruction).
- Frontend Anchor client (`frontend/lib/anchor-client.ts`) — pure
  `@solana/web3.js` (no `@coral-xyz/anchor` dependency) with PDA helpers,
  six typed instruction builders, and Borsh decoders for all three
  account types.
- Backend examiner service (`backend/src/services/verification.js`)
  anchors the AI verdict on-chain right after the OpenRouter call
  passes, so the redacted-field reveal can prove the confidence score
  wasn't tampered with.
- Supabase mirror columns: `dossier_pubkey`, `verification_proof_pubkey`,
  `listing_pubkey`, `case_number`, `examiner_pubkey`, `custodian_pubkey`,
  `confidence_bps`, `liveness_passed`, `model_name`, `verified_at`.
  `status` CHECK constraint extended to mirror the on-chain `ListingStatus`
  enum.
- `contracts/DEPLOY.md` — devnet deploy walkthrough with pre-deploy
  checklist, post-deploy wiring, and deliberately-deferred scope.
- AWS SAM / Lambda deployment scaffold for the backend
  (`backend/template.yaml`, `Dockerfile`, `lambda.js`,
  `scripts/smoke-lambda.sh`).
- Jest test dependencies installed for the frontend so the existing
  `__tests__/` suites can actually run.

### Changed

- `backend/src/services/solana.js` `listItemOnMarketplace` — replaced
  the TODO stub with a two-mode flow (custodial server-signed vs
  user-wallet pending-signature).
- `frontend/components/purchase-button.tsx` — added a feature-flagged
  Anchor `purchase_evidence` path behind `NEXT_PUBLIC_USE_ANCHOR_PURCHASE`.
  Default off until devnet deploy + co-sign endpoint land.

## [0.2.0.0] - 2026-05-25

### Added

- Landing page now tells a four-section product story below the WebGL hero,
  so visitors who scroll past the particle field actually learn what
  HypeChain does and what trades on the marketplace.
- New cinematic verify-flow section pins to the viewport and scrubs through
  three steps (Intake → AI Examination → Mint) as you scroll, with a
  static-stacked fallback for mobile and reduced-motion users.
- Evidence Locker section showcases the three signature design moves:
  Case-File Ribbon vocabulary, Redaction Bars with typewriter unredact on
  scroll-in, and a static Mint Certificate card.
- Marketplace proof band reads from `useListings()` and renders either a
  live KPI strip + recent verified rows (when data is populated) or a
  graceful "the verified floor is open" invitation when the data layer is
  empty.
- Final CTA band closes the scroll story with brass bullion + outline
  buttons mirroring the hero.
- Three new reusable hooks — `useReducedMotion`, `useInView`,
  `useScrollProgress` — power the scroll-story system without adding any
  third-party scroll/animation dependencies.
- Reveal wrapper component provides SSR-safe one-shot scroll reveals via a
  tri-state (pristine / hidden / revealed) model that avoids the classic
  above-the-fold flash on hydration.
- Pure scrub-math helpers (`clamp01`, `progressToStep`, `subProgress`) with
  Jest test scaffold so the math powering the cinematic scroll can be
  unit-tested independent of the DOM.

### Changed

- Landing page `app/page.tsx` wraps the existing hero in `<main>` and
  appends the four new sections in order. WebGL hero and
  `components/gl/` are untouched.
- `landingNavItems` gains an explicit `{ name: string; href: string }[]`
  type annotation so it satisfies `Navigation`'s `items` prop instead of
  inferring `never[]`.

### Fixed

- Polygon-corner CSS variable mismatch across all seven `.hc-poly`
  elements in landing scope. The new components originally set
  `--poly-roundness` but the `.hc-poly` class in `globals.css` reads
  `--hc-poly-r`, so every corner silently fell back to the 6 px default
  instead of the intended 16 px (step cards), 6 px (artifacts), and 4 px
  (rail numerals). Renamed the variable everywhere.
- Verify-flow StepRail segment fill no longer jumps backward at step
  boundaries. The active segment width is now driven by in-step
  `subProgress` (0..1 within the current step) instead of global
  `progress`, and the CSS transition on the active segment is dropped so
  the fill tracks the scroll position exactly.
- Verify-flow sticky panel padding (`pt-24`) clears the 84 px fixed
  Navigation that pins above it, so the section's Pill + headline render
  in front of the nav instead of behind it.
