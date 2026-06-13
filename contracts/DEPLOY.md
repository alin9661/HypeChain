# HypeChain Evidence Locker — devnet deployment

Generated via the `solana-program` skill (DEPLOY mode). Anchor 0.30.1.

**Current devnet deployment:** `2pTtzWXELYNXAsXkWq3zgErbYnJTANfq5LmBptdk5uiF`
(matches `Anchor.toml` `[programs.devnet]` and the `declare_id!` in `lib.rs`).

**Target: devnet.** Mainnet is out of scope for the hackathon — when you
do reach for it, this checklist needs an additional explicit confirmation
and a committed-and-tagged source state. Deploying spends SOL and is
effectively irreversible once the upgrade authority is finalized.

---

## Pre-deploy checklist

Clear each box before running the deploy commands. Anything skipped here
turns into a 30-minute debug session later.

- [ ] `anchor --version` reports `0.30.1`. (Install via `avm install 0.30.1 && avm use 0.30.1` if not.)
- [ ] `solana --version` is 1.18.x or newer.
- [ ] You can run `solana balance --url devnet`. Wallet has at least 2 SOL —
      `solana airdrop 2 --url devnet` if not.
- [ ] `cd contracts && ./anchor.sh build` succeeds clean (warnings OK, no errors).
- [ ] `./anchor.sh test` passes (uses the local validator that ships with Anchor).
- [ ] The `init-if-needed` cargo feature is enabled in
      `programs/hypechain-marketplace/Cargo.toml` (already set — verify).
- [ ] Program name is consistent: `Anchor.toml` `[programs.*]` key,
      the `[lib] name` in Cargo.toml, and the `#[program]` module in
      `src/lib.rs` are ALL `hypechain_evidence_locker`. (A mismatch generates
      the IDL under the wrong key and breaks the client.)
- [ ] The repo is committed (so you can correlate the deployed `.so` with
      a known source commit later).

---

## Step-by-step commands

Run from the `contracts/` directory.

> **Toolchain note (anchor 0.30.1 on modern Rust):** the IDL build step
> hardcodes `cargo +nightly`, and anchor-syn 0.30.1 is incompatible with
> nightlies newer than ~2025-03 (`Span::source_file` was removed). Always
> build through the wrapper, which pins a 2024 nightly (and installs it
> on first use):
>
> ```bash
> ./anchor.sh build        # instead of: anchor build
> ./anchor.sh test         # instead of: anchor test
> ```
>
> (Equivalent: `RUSTUP_TOOLCHAIN=nightly-2024-11-01 anchor build`.)
> The committed `Cargo.lock` pins deps compatible with the Solana 1.18.17
> SBF toolchain (cargo 1.75) — see the comment in the program `Cargo.toml`
> before regenerating it.

```bash
# 1. (One-time) Install JS deps for the Mocha test runner.
bun install

# 2. Build the program for the BPF target. Emits target/deploy/*.so and
#    target/idl/hypechain_evidence_locker.json (the IDL the client decodes
#    accounts against — keyed on the #[program] module name).
./anchor.sh build

# 3. Sync declare_id! to the program keypair Anchor generated.
#    Rewrites both lib.rs and Anchor.toml. Commit the resulting diff.
./anchor.sh keys sync

# 4. REBUILD after the sync so the new program ID is baked into the .so.
#    Skipping this is the #1 source of "Program ID mismatch" on deploy.
./anchor.sh build

# 5. (Sanity) Run tests against the local validator one more time.
./anchor.sh test

# 6. Deploy to devnet. ≈30s — emits the program ID it deployed under.
#    That ID must match Anchor.toml's [programs.devnet] entry (it does
#    after `anchor keys sync`).
anchor deploy --provider.cluster devnet

# 7. Confirm the program exists on chain.
solana program show \
  $(solana address -k target/deploy/hypechain_evidence_locker-keypair.json) \
  --url devnet
```

---

## Post-deploy wiring

After step 6 prints the program ID, propagate it everywhere:

1. **`contracts/Anchor.toml`** — already updated by `anchor keys sync`.
   Verify the `[programs.devnet]` entry matches.

2. **`backend/.env`** (and `backend/.env.local`):
   ```bash
   HACKNYU_MARKETPLACE_PROGRAM_ID=<the new program id>
   HACKNYU_CASE_PREFIX=HC-2026-
   ```

3. **`frontend/.env.local`** (the program ID is required in production
   builds — the frontend throws at import when it's unset or still the
   scaffold placeholder):
   ```bash
   NEXT_PUBLIC_HYPECHAIN_PROGRAM_ID=<the new program id>
   # Optional — flip on to use the Anchor purchase flow:
   NEXT_PUBLIC_USE_ANCHOR_PURCHASE=1
   ```

4. **`backend/src/services/evidence-locker-client.js`** and
   **`frontend/lib/anchor-client.ts`** both read `PROGRAM_ID` from env;
   they pick up the new ID automatically on next process start.

5. **Supabase mirror columns** — run
   `supabase_evidence_locker_migration.sql` in the Supabase SQL editor
   (idempotent; safe to re-run).

---

## End-to-end devnet smoke test

This is the proof-of-life ritual after every deploy. Walks the full
Evidence Locker loop and confirms each PDA exists on chain.

**Scripted versions** (no browser needed, both skip-gated on `RUN_DEVNET=1` +
program ID + funded server key):

```bash
# Sell side: custodial mint → verify → list (leaves a live Listed listing)
cd backend-py && RUN_DEVNET=1 uv run pytest tests/test_devnet_smoke.py -v

# Buy side: co-sign → buyer-sign → send; asserts Sold + NFT moved + SOL received.
# Pass a mint with an existing custodial listing, or omit to set one up.
cd backend && RUN_DEVNET=1 node scripts/devnet-buy-smoke.js [nftMint]
```

```bash
# Backend
cd backend && bun dev

# Frontend (new terminal)
cd frontend && bun dev
```

In the browser:

1. Connect Phantom (devnet).
2. Upload a real product photo — full intake flow.
3. Wait for "Listing created" toast.
4. Check the backend logs for these three signatures:
   ```
   ✅ Opened server dossier <pubkey> (<sig>)         # one-time per server wallet
   📝 VerificationProof anchored: mint=... sig=...
   🏪 EvidenceListing created (custodial): ... sig=... # only for custodial listings
   ```
5. Visit https://solscan.io/?cluster=devnet and search the program ID.
   You should see three account types:
   - `Dossier` for the server wallet
   - `VerificationProof` for the listed mint, `confidence_bps > 5000`
   - `EvidenceListing` with `status == Listed`
6. Purchase the listing from a second wallet. Verify on Solscan that
   the listing status flipped to `Sold` and the token moved between
   ATAs.

If any of those don't appear, jump back to the `solana-program` skill
in **DEBUG** mode with the failing log line.

---

## Rollback

Solana has no automatic rollback. If a deploy regresses devnet:

```bash
# Redeploy the previous .so (keep the prior build artifact alongside
# the commit hash it was built from).
git checkout <prior-commit>
./anchor.sh build
anchor deploy --provider.cluster devnet  # same program ID, new bytes
```

The program ID is the same across upgrades because the upgrade
authority owns the program account. As long as you have not run
`solana program set-upgrade-authority --final`, you can keep iterating.

---

## What's deliberately deferred to a follow-up deploy

- **Escrow / delegation pattern** for `purchase_evidence`. Today the
  buyer + seller co-sign; a future deploy can move the NFT into a
  program-owned escrow on `list_evidence` so purchases work without
  the seller online.
- **Compressed NFT (cNFT) support in the program.** cNFTs don't have a
  regular mint pubkey, so `submit_verification` and `list_evidence` are
  skipped for them today. Adding cNFT keying would mean either keying
  on the leaf asset ID or extending the verification PDA to accept
  alternate keys.
- **Multisig examiner** — `Dossier.examiner` is a single pubkey today.
  Swap to a Squads / Realms multisig before mainnet.
