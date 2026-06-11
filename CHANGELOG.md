# Changelog

All notable changes to HypeChain are recorded here. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

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
