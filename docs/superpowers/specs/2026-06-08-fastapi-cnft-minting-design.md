---
title: Solana on-chain-write service (TypeScript) + FastAPI as canonical API
date: 2026-06-08
revised: 2026-06-09
status: plan (eng review)
supersedes: none
related: docs/superpowers/specs/2026-05-28-backend-fastapi-refactor-design.md
---

# Goal

Give the marketplace compressed-NFT minting (and retire risky hand-built Python
on-chain code) by splitting responsibilities along a tech-fit boundary:

- **FastAPI (`backend-py/`)** stays the canonical API/business backend: request
  validation, AI vision + image gen, IPFS upload, DSQL, payments (on-chain READ),
  activities, Helius webhooks.
- **A dedicated TypeScript "Solana write service"** (carved from Express) owns every
  **server-signed on-chain write**: NFT minting (standard + compressed), evidence-
  locker anchoring, marketplace listing, and one-time Merkle-tree provisioning.

## Why minting is in TypeScript (record this in the docs — user directive)

The Metaplex ecosystem (`umi`, `@metaplex-foundation/mpl-bubblegum`,
`@solana/spl-account-compression`, `mpl-token-metadata`) and Anchor's TS client are
**first-class and battle-tested in JavaScript/TypeScript**. The Python equivalents
are immature or absent: there is **no maintained Python client for Bubblegum or
account-compression**, so compressed minting would mean hand-building Anchor
discriminators + nested `MetadataArgs` Borsh + CPI account ordering from scratch —
the highest-risk code in the system, with no SDK to check against. The existing
Python mint path (`metaplex.py`) already carries that risk for *standard* NFTs.
Rather than double down, all server-signed Solana writes live in one TS service that
uses the proven SDKs. Python keeps what Python is good at (the API/business layer
and on-chain *reads*, which `solders` parses fine).

# Architecture

```
                       Frontend (Next.js / Vercel)
                                  │  NEXT_PUBLIC_API_URL
                                  ▼
        ┌─────────────────────────────────────────────────────────┐
        │  FastAPI  (backend-py)  — canonical API, port 3001/Lambda │
        │  validation · AI verify · image gen · IPFS · DSQL ·       │
        │  payments (on-chain READ) · activities · Helius webhooks  │
        └─────────────────────────────┬───────────────────────────┘
                                       │  server-to-server HTTPS
                                       │  (shared-secret auth header,
                                       │   fail-closed — Helius-webhook pattern)
                                       ▼
        ┌─────────────────────────────────────────────────────────┐
        │  Solana Write Service  (TypeScript, own Lambda/FnURL)     │
        │  HOLDS THE SERVER WALLET KEY (single-homed = safer)       │
        │   POST /anchor-listing  → mint (+verify +list) in one hop │
        │   POST /mint            → mint only                        │
        │   (ops) setup-tree CLI  → provision Merkle tree           │
        │  umi · mpl-bubblegum · mpl-token-metadata · anchor TS      │
        └─────────────────────────────┬───────────────────────────┘
                                       ▼
                                  Solana RPC (devnet → mainnet)
```

## Service boundary (what moves vs stays)

| Capability | Today | After |
|---|---|---|
| NFT mint (standard) | Python `metaplex.py`+`solana.mint_nft` (hand-built, risky) | **TS service** (umi mpl-token-metadata) — Python deleted |
| NFT mint (compressed) | absent | **TS service** (umi mpl-bubblegum) — NEW |
| Evidence-locker anchor (`submit_verification`) | Python `verification.py` build_* (hand-built Borsh) | **TS service** (Anchor TS client) — Python ix-builders deleted |
| Marketplace list (`list_item_on_marketplace`) | Python `solana.py` | **TS service** — Python deleted |
| Merkle tree provisioning | Express `setup-merkle-tree.js` | **TS service** ops CLI (kept/cleaned) |
| Server wallet custody | Python env | **TS service only** (single signer) |
| Payment verify (on-chain READ) | Python `payment.py` `get_transaction` | **stays Python** (reads are low-risk) |
| Everything else (API/AI/IPFS/DB/activities/webhooks) | Python | **stays Python** |

# API contract (FastAPI → Write service)

`POST /anchor-listing` (one round trip per create-listing; FastAPI passes the
business data it already computed):
```
req  { targetWallet, metadataUri, name,
       useCompressedNFT,                       // default true
       verification: { confidenceBps, model, casePrefix },  // for evidence-locker
       listing:      { priceLamports } }
resp { nftMintAddress,        // SPL mint OR cNFT asset_id
       isCompressed,
       mintSignature,
       verifySignature|null,  // best-effort, mirrors Express try/catch
       listSignature|null }
```
- **Failure semantics (preserve Express behavior):** mint is critical (fail the
  request if it fails); `submit_verification` and `list` are best-effort — log and
  continue, returning null signatures, exactly as the Express pipeline did. These
  three are sent as separate signed txs (not one atomic tx), matching today.
- **Auth:** shared secret in an `Authorization` header, fail-closed (unset secret →
  401), reusing the exact pattern already in `settings.hacknyu_helius_webhook_secret`.
- `/mint` is the thin subset for any caller that only needs a mint.

# Phases

```
A  Build TS Solana write service (carve from Express)        ← blocks all
   • strip Express to: solana.ts/js, compressed-nft, evidence-locker-client
   • add cNFT mint (mpl-bubblegum) + /anchor-listing + /mint HTTP layer
   • move server wallet key here; shared-secret auth (fail-closed)
   • Jest tests + a devnet mint/verify/list round-trip
B  Wire FastAPI → service                                    ← after A
   • new app/services/mint_client.py (httpx, auth header, timeouts, retry)
   • create-listing calls /anchor-listing instead of local solana.* writes
   • DELETE Python write code: metaplex.py, solana.py mint/list/verify writers,
     verification.py ix-builders (keep PDA-read helpers only if still used)
   • settings: un-deprecate merkle/das, add HACKNYU_MINT_SERVICE_URL + secret
C  Devnet verification (HUMAN-gated)                          ← cannot skip
   • full create-listing → pay on devnet; cNFT minted; provenance intact
D  Reduce Express to the service & clean up                  ← original ask, revised
   • delete Express's redundant surface (routes, index API, ipfs/openrouter/
     payment/cache/arweave — all now FastAPI's job)
   • keep only the mint service (its own deploy config)
   • VERSION 0.3.0.0→0.4.0.0; CHANGELOG; update CUTOVER.md; repoint doc/env
     comments; document the JS/Py split (the "Why TS" section above)
   • flag (not fix): dead frontend websocket.ts + NEXT_PUBLIC_WS_URL
```

# Risks / tradeoffs

1. **Extra network hop in create-listing.** One server-to-server call per listing.
   Acceptable: minting already takes seconds (RPC + confirmation); a single intra-
   AWS hop is noise. One combined `/anchor-listing` endpoint avoids chattiness.
2. **Two deployables, not one.** This is a real ops cost, but it's a *focused*
   capability service (server-signed Solana writes), not a duplicate API — a
   legitimate tech-fit boundary (Python API ↔ TS chain writes). NOT the "two full
   backends" tax the earlier plan rejected.
3. **Inter-service auth + wallet custody.** Shared-secret, fail-closed (codebase
   already does this for Helius). Net SECURITY WIN: the server wallet private key
   moves from the Python env to exactly one service instead of being available to
   the whole API.
4. **Partial-failure across 3 txs.** Mint critical, verify/list best-effort —
   preserved from Express. A listing can exist on-chain-minted but not yet
   evidence-anchored; the pipeline already tolerated this.
5. **cNFT reads need DAS later.** No DAS in the request flow today (downstream uses
   the id only as a PDA seed; Express fed `assetId` the same way). Wire Helius DAS
   only when a feature must read a cNFT's on-chain state.
6. **Two languages to maintain.** Mitigated: the TS service is small and stable
   (instruction building changes rarely); the team chose TS deliberately for the
   mature SDK.

# Test strategy

- **TS service (Jest):** unit tests for mint (standard + cNFT) instruction building
  against `umi`'s own builders; asset-id derivation; auth middleware fail-closed;
  a devnet integration test (skipped without RPC + wallet) that mints + verifies +
  lists end to end. umi *is* the reference, so we test wiring, not Borsh bytes.
- **FastAPI:** mock the mint service (respx) — assert create-listing calls
  `/anchor-listing` with the right body, maps the response into the existing JSON
  contract (`test_parity.py` key-sets unchanged), and handles 401/timeout/5xx
  (mint failure → request fails; verify/list nulls → request still succeeds).
- **Contract test:** a shared fixture pins the request/response shape so the two
  services can't drift.
- **Human devnet round-trip (Phase C):** ground truth before mainnet.

# Out of scope

- DAS read path (risk 5).
- Rewriting historical guides under `docs/guides/`.
- Moving payment verification (on-chain read) to TS — stays Python.

# Open sub-decisions (defaulted; override if wrong)

- **D1 Combined `/anchor-listing` endpoint** (default) vs 3 granular endpoints.
  Defaulted to combined for one hop + simpler orchestration.
- **D2 Separate Node Lambda** behind a Function URL (default) vs co-located Node in
  the FastAPI container. Defaulted separate — cleaner on AWS, isolates the wallet.
- **D3 Service = all server-signed writes** (mint+verify+list, default) vs mint-only.
  Defaulted all-writes — same risk class, same SDK win, and they share files in
  Express already. Keeps the signing key single-homed.

## GSTACK REVIEW REPORT

| Run | Status | Findings |
|---|---|---|
| Step 0 scope challenge | done | "Replace Express" was 95% done; real gap was cNFT minting. |
| Architecture review (v1) | superseded | Considered Python Bubblegum port; rejected (no SDK, highest risk). |
| Architecture review (v2) | done | Split by tech fit: Python API ↔ TS Solana-write service. All server-signed writes + wallet key move to TS; payments-read stays Python. Clean Conway boundary, not "two backends." |
| Dependency / ecosystem | done | Metaplex/Anchor are first-class in TS, immature in Python → TS is correct for chain writes. |
| Tests | planned | umi-based TS tests + respx-mocked FastAPI + shared contract test + human devnet round-trip. |

VERDICT: PLAN READY. Decisions locked: carve Express into a TS Solana-write
service; ALL minting (standard+cNFT) + evidence-locker + listing move to it; FastAPI
stays canonical API. Sub-decisions D1-D3 defaulted (combined endpoint, separate
Lambda, all-writes) — flag to change. Phase D (Express reduction) is BLOCKED on
Phase C (devnet verify).

UNRESOLVED: exact mint-service deploy target (its own Lambda Function URL assumed);
exact production tree params (devnet sizing resolved below in the V2 addendum; mainnet
sizing decided at Phase C). Royalty basis-points + recipient to confirm (see addendum).

---

# V2 addendum (2026-06-09) — Bubblegum V2 + MPL-Core collection

This addendum supersedes the generic "mpl-bubblegum compressed minting" language above.
The decision is to mint **Bubblegum V2** cNFTs (not V1). The architecture, service
boundary, API contract, auth, failure semantics, and phases above are UNCHANGED — only
the compressed-mint internals and tree provisioning are pinned to V2 here.

## Why V2 (and why now is the cheap time)

- **Clean slate.** No V1 Merkle tree was ever configured (`HACKNYU_MERKLE_TREE_ADDRESS`
  unset → the Express cNFT path never fired). There is therefore **no V1→V2 migration**:
  we provision a V2 tree and mint V2 from day one. V1 and V2 trees are **not
  interchangeable** (V2 uses `LeafSchemaV2` + V2 Merkle trees), so starting clean avoids
  the only migration that would have been painful.
- **No dependency bump.** The installed `@metaplex-foundation/mpl-bubblegum@5.0.2`
  already ships both instruction sets. "Upgrade to V2" = call V2 instructions, not change
  the package.

## V2 instruction mapping (what the TS service calls)

| Purpose | V1 (old Express code) | **V2 (this service)** |
|---|---|---|
| Provision tree | `createTreeConfig` | **`createTreeConfigV2`** |
| Mint cNFT | `mintV1` | **`mintV2`** (with `coreCollection`) |
| Collection | `verifyCollection` (Token-Metadata) | **MPL-Core `createCollectionV2`** (once, ops) |
| Transfer / burn (future) | `transfer` / `burn` | `transferV2` / `burnV2` |

## MPL-Core collection + enforced royalties (DECISION: enabled)

- Create **one** MPL-Core collection (`createCollectionV2`) as a one-time ops step; every
  cNFT mints into it via `mintV2 { coreCollection }`. Groups all HypeChain assets for
  provenance + marketplace recognition.
- Attach the **Royalties plugin** for **on-chain** royalty enforcement — a V2-only
  capability (V1 relied on marketplace goodwill). **Ruleset choice matters** (per
  Metaplex Core royalties-plugin docs):
  - `ProgramAllowList` — **strict**: only whitelisted (royalty-honoring) programs may
    transfer; everything else is blocked. Strongest enforcement; must maintain the list.
  - `ProgramDenyList` — **lenient**: all programs may transfer *except* listed ones.
    Only blocks known offenders.
  - `None` (default) — royalties are **advisory only**; any program can transfer.
- **CONFIRM at spec review (3 config values, not code):**
  1. royalty `basisPoints` — default **500 (5%)**.
  2. royalty **recipient** wallet — default: the server/creator wallet single-homed here.
  3. **ruleset** — default **`ProgramAllowList`** (strict). Cheap to run strict early
     since major marketplaces don't trade V2 cNFTs yet anyway (see risk 7); relax to
     DenyList/None later if external liquidity matters more than enforcement.

## Tree provisioning params (DECISION: devnet-first, CLI-parameterized)

- Phase C devnet round-trip uses a small throwaway tree: **`maxDepth=14`,
  `maxBufferSize=64`, `canopyDepth=11`** → capacity ≈ **16,384** cNFTs; proof size
  small enough for composability; rent negligible on devnet.
- The setup-tree ops CLI takes **`--depth / --buffer / --canopy`** (sane defaults above)
  so mainnet sizing is a flag, not a code change. **Mainnet params decided at Phase C**
  once the round-trip works (candidate: depth 20 / canopy 14 for ~1M capacity + small
  proofs — confirm against rent budget then).

## Decompression: permanently unavailable (ACCEPTED)

- **V2 cNFTs cannot be decompressed** to regular on-chain NFTs — ever (decompression is
  V1-only). Accepted: provenance assets are not meant to become standalone SPL NFTs.
  Recorded so no future feature assumes a decompression escape hatch.

## New / changed risks (V2-specific)

7. **External marketplaces do NOT trade V2 cNFTs yet (corroborated; formally
   unverified).** Verification was blocked by a persistent upstream rate limit, but
   multiple primary sources agree (and one verifier vote landed, 1-0):
   - Metaplex's own `bubblegum-v2` docs (Feb 2026): **Magic Eden and Tensor are "Not yet
     supported"** for V2 cNFTs on *both* axes — display/read and transfer/trade. The docs
     advise verifying platform compatibility before shipping user-facing features.
   - Magic Eden help center: ME **"will no longer index new compressed NFT collections"**
     — actively narrowing cNFT support; native in-app cNFT *transfer* requires external
     tools.
   - ME's NFT detail page surfaces owner + royalties but **not** ownership/transfer
     history — i.e. external marketplaces don't surface provenance at all.
   - Tensor docs mention cNFTs generically ("Legacy or Compressed") but have **no
     V2-specific content** → V2 tradeability unconfirmed there.
   **Implication — not blocking, but eyes-open:** HypeChain's in-app provenance UI is the
   primary (and differentiated) surface; external marketplaces don't even show provenance.
   But **secondary-market liquidity for V2 cNFTs on ME/Tensor is unavailable today** — a
   real go-to-market constraint to weigh before the mainnet flip (Phase D), not before the
   devnet build (Phases A–C). Re-verify when the rate limit clears; revisit V1-vs-V2 only
   if external liquidity becomes a launch requirement.
8. **Enforced royalties via ProgramDenyList is only as strong as the denylist.** On-chain
   enforcement blocks listed programs from transferring; marketplaces not on the list can
   still trade royalty-free. Document the chosen ruleSet posture at mainnet.
9. **DAS-indexer dependence is liveness, not custody (DE-RISKED).** Findings extracted
   from authoritative sources (`docs.rs/spl-account-compression`, Metaplex
   `digital-asset-rpc-infrastructure`, Anza RPC-history docs, `solana-developers/
   compressed-nfts`) — *not yet adversarially verified; verification phase blocked by a
   persistent upstream rate limit*:
   - **Trust-minimized provenance:** SPL Account Compression has an on-chain `VerifyLeaf`
     instruction; a DAS proof (`getAssetProof`) can be recomputed to a root and checked
     against the on-chain root. Clients can *verify* the indexer, not just trust it — a
     good fit for a provenance product. (Design note: surface this verification in the
     provenance UI later; out of scope for Phase A.)
   - **Ledger-recoverable:** cNFT data is logged in ledger transactions; a fresh indexer
     can be backfilled from the ledger (Geyser/`ledger-tool`/BigTable). A DAS outage
     degrades reads, it does not lose provenance data.
   - **Self-host fallback exists but is heavy:** Metaplex's open-source
     `digital-asset-rpc-infrastructure` (Ingester + JSON-RPC) needs a no-vote validator +
     Plerkle Geyser + Redis + Postgres. Viable disaster-recovery option, not a cheap
     default. **Phase A uses a managed DAS provider (Helius)**; self-host is a documented
     contingency, not built now.

## Test additions (extend the Test strategy above)

- V2 instruction building (`createTreeConfigV2`, `mintV2` with `coreCollection`) asserted
  against umi's own builders — umi is the reference, so we test wiring not Borsh bytes.
- MPL-Core `createCollectionV2` builds with the Royalties plugin + ProgramDenyList present
  and the configured basisPoints.
- Asset-id derivation for `LeafSchemaV2`.
- Devnet integration test mints a V2 cNFT into the collection and reads it back via DAS
  `getAsset` (confirming the indexer sees V2 leaves) — still skipped without RPC+wallet.
