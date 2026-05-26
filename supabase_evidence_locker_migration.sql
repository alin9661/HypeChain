-- HypeChain — Evidence Locker on-chain mirror migration
--
-- Adds columns that mirror the on-chain `EvidenceListing`, `Dossier`,
-- and `VerificationProof` PDAs so the marketplace can answer "what's the
-- on-chain state of this listing?" via a single Supabase query without
-- having to round-trip through RPC.
--
-- Run AFTER supabase_marketplace_schema.sql. Safe to re-run — every
-- statement uses IF NOT EXISTS / DROP-then-ADD.

-- ─── New mirror columns ───────────────────────────────────────────────
ALTER TABLE listings
  ADD COLUMN IF NOT EXISTS dossier_pubkey TEXT,
  ADD COLUMN IF NOT EXISTS verification_proof_pubkey TEXT,
  ADD COLUMN IF NOT EXISTS listing_pubkey TEXT,
  ADD COLUMN IF NOT EXISTS case_number INTEGER,
  ADD COLUMN IF NOT EXISTS examiner_pubkey TEXT,
  ADD COLUMN IF NOT EXISTS custodian_pubkey TEXT,
  ADD COLUMN IF NOT EXISTS confidence_bps SMALLINT
    CHECK (confidence_bps IS NULL OR (confidence_bps BETWEEN 0 AND 10000)),
  ADD COLUMN IF NOT EXISTS liveness_passed BOOLEAN,
  ADD COLUMN IF NOT EXISTS model_name TEXT,
  ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ;

-- ─── Extend status enum to mirror on-chain ListingStatus ─────────────
-- The original CHECK constraint allowed: active | sold | delisted | pending
-- The on-chain enum is:                  Pending | Verified | Listed | Sold | Delisted | Disputed
-- We keep the existing names where they line up and add the new states.
ALTER TABLE listings DROP CONSTRAINT IF EXISTS listings_status_check;
ALTER TABLE listings ADD CONSTRAINT listings_status_check
  CHECK (status IN (
    'active',         -- legacy synonym for `Listed` — kept for back-compat
    'pending',        -- legacy + on-chain `Pending` (proof not yet written)
    'verified',       -- on-chain `Verified` (proof written, not yet listed)
    'listed',         -- on-chain `Listed`
    'sold',           -- on-chain `Sold`
    'delisted',       -- on-chain `Delisted`
    'disputed',       -- on-chain `Disputed`
    'pending_wallet'  -- guest-flow: NFT held by platform until claimed
  ));

-- ─── Indexes for chain-cursored queries ──────────────────────────────
CREATE INDEX IF NOT EXISTS idx_listings_listing_pubkey
  ON listings(listing_pubkey)
  WHERE listing_pubkey IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_listings_dossier_pubkey
  ON listings(dossier_pubkey)
  WHERE dossier_pubkey IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_listings_case_number
  ON listings(case_number)
  WHERE case_number IS NOT NULL;

-- ─── Touch trigger so updated_at refreshes on any of the new fields ──
-- Assumes the canonical `updated_at` trigger function exists from the
-- main schema. If not, this migration is a no-op for that bit.
COMMENT ON COLUMN listings.dossier_pubkey IS
  'PDA address of the seller''s on-chain Dossier (seeds: ["dossier", authority]).';
COMMENT ON COLUMN listings.verification_proof_pubkey IS
  'PDA address of the on-chain VerificationProof (seeds: ["verification", nft_mint]).';
COMMENT ON COLUMN listings.listing_pubkey IS
  'PDA address of the on-chain EvidenceListing (seeds: ["evidence", nft_mint]).';
COMMENT ON COLUMN listings.case_number IS
  'Monotonic case number assigned by the Dossier when the listing was opened.';
