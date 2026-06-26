-- =====================================================================
-- HypeChain — Amazon Aurora DSQL schema (PR2 of FastAPI refactor)
-- =====================================================================
-- Target: Amazon Aurora DSQL (distributed, PostgreSQL-compatible).
--
-- This is the DSQL-adapted DDL reconstructed from the Supabase reference
-- schema (`supabase_marketplace_schema.sql` +
-- `migrations/001_add_compressed_nft_support.sql`) plus the columns/objects
-- the Express backend actually references. The live Supabase DB is EMPTY
-- (no rows, no live traffic) so this is a clean reconstruction, not a
-- data migration. (Spec §3.5.)
--
-- ---------------------------------------------------------------------
-- SUPABASE OBJECTS INTENTIONALLY DROPPED / RECONSTRUCTED (and why)
-- ---------------------------------------------------------------------
-- * FOREIGN KEYS (listings.seller_user_id -> users.id, buyer_user_id;
--   transactions.listing_id/buyer_user_id/seller_user_id; favorites.*):
--   DROPPED. Aurora DSQL does not support FOREIGN KEY constraints.
--   Referential integrity is enforced APP-SIDE — `listing.js` already looks
--   up `users.id` by wallet and writes NULL for an orphan seller_user_id
--   (see app/db/queries.get_user_id_by_wallet + insert_listing).
--
-- * TRIGGERS (update_listings_updated_at, update_transactions_updated_at,
--   and their function update_updated_at_column()): DROPPED. DSQL does not
--   support triggers. `updated_at` is set EXPLICITLY in every UPDATE
--   statement in app/db/queries.py instead (spec §3.5 step 1).
--
-- * ROW LEVEL SECURITY (all ENABLE ROW LEVEL SECURITY + every POLICY on
--   listings/transactions/favorites): DROPPED. The backend connects with a
--   privileged DSQL role (the Express service used the Supabase service-role
--   key, which already bypassed RLS), so RLS was functionally neutral for
--   the server path. Security delta documented in spec §3.5 step 4. No
--   server read path relied on the guest-claim SELECT policy — guest claims
--   are app-gated, not read via RLS.
--
-- * VIEWS (active_listings, user_stats, compressed_nft_stats,
--   pending_nft_claims): DROPPED. None of the 9 backend routes read these
--   views — every route hits the raw tables directly. Omitted to keep the
--   surface minimal (port-if-used policy, spec §3.5 step 1).
--
-- * FUNCTIONS (mark_listing_as_sold, confirm_transaction, claim_nft,
--   get_merkle_tree_utilization): DROPPED / re-expressed as plain SQL.
--   The backend never invoked mark_listing_as_sold / confirm_transaction
--   as RPCs — completePurchase() (payment.js) issues a direct UPDATE.
--   claim_nft and get_merkle_tree_utilization belong to the dropped cNFT
--   path.
--
-- * increment_user_volume() RPC: NOT recreated as a DB function. It lives
--   ONLY in the live Supabase DB (not in any repo .sql; called at
--   payment.js:298). It is re-expressed APP-SIDE as a single additive
--   UPDATE wrapped in DSQL optimistic concurrency-control retry
--   (app/db/occ.py + queries.increment_user_volume), per spec §3.5 step 2.
--
-- * FAVORITES TABLE: DROPPED. No backend route reads or writes favorites
--   (the `listings.favorites` integer counter is unrelated and kept).
--
-- * gen_random_uuid() defaults: KEPT. Aurora DSQL supports gen_random_uuid()
--   for UUID PK defaults. (If a target cluster rejects it, switch to
--   app-side uuid4() — the insert helpers already accept an explicit id.)
--
-- * cNFT columns (is_compressed, merkle_tree_address, leaf_index) and guest
--   columns (guest_email, is_pending_claim, platform_wallet) plus
--   storage_type: KEPT. The compressed-NFT *minting* path is dropped, but
--   these columns are part of the `listings` row the Express responses
--   return, so they remain for HTTP-contract parity (cNFT cols written as
--   false/NULL).
--
-- * price_sol CHECK: RELAXED from (> 0) to (>= 0). listing.js:307 inserts
--   `optionalPriceSol ?? 0`, i.e. a listing may be created at price 0
--   (pending/guest). The original Supabase CHECK (> 0) would have rejected
--   those inserts; >= 0 matches actual backend behavior. transactions
--   keep CHECK (amount_sol > 0) — a purchase is always for a positive
--   amount.
--
-- * CHECK / NOT NULL / UNIQUE / indexes: KEPT (DSQL supports them).
--   FK-implementing indexes retained as plain b-tree indexes. seller_wallet
--   relaxed to NULL-able (guest listings have no seller wallet —
--   listing.js:322 writes `userWallet || null`).
-- =====================================================================


-- =====================================================================
-- USERS TABLE  (RECONSTRUCTED — not present in repo .sql)
-- =====================================================================
-- Inferred from `listing.js` (`SELECT id FROM users WHERE wallet_address = ?`,
-- listing.js:311-318) and the `increment_user_volume(user_id, amount)` RPC
-- (payment.js:298), which adds a SOL amount to a running per-user volume
-- column (named `total_volume` here). `username` / `profile_image` were
-- referenced by the now-dropped active_listings / user_stats views; included
-- for completeness/parity. `email` retained for guest-claim association.
--
-- ASSUMPTIONS A HUMAN SHOULD CONFIRM against the live Supabase `users` table:
--   - PK is `id UUID`.
--   - lookup column is `wallet_address TEXT UNIQUE`.
--   - the volume column the RPC increments is `total_volume NUMERIC`
--     (NOT NULL DEFAULT 0). Confirm the real column name/type before deploy.
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_address TEXT UNIQUE,
  username TEXT,
  profile_image TEXT,
  email TEXT,
  total_volume NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX ASYNC IF NOT EXISTS idx_users_wallet_address ON users(wallet_address);


-- =====================================================================
-- LISTINGS TABLE
-- =====================================================================
-- Base columns from supabase_marketplace_schema.sql + cNFT/guest/storage
-- columns from migrations/001_add_compressed_nft_support.sql, merged into a
-- single CREATE (DSQL has no live rows to ALTER). FK refs -> plain columns.
CREATE TABLE IF NOT EXISTS listings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nft_mint_address TEXT UNIQUE NOT NULL,
  seller_wallet TEXT,                         -- NULL for guest/custodial listings
  seller_user_id UUID,                        -- app-enforced FK -> users.id (NULL if orphan)
  product_name TEXT NOT NULL,
  description TEXT,
  category TEXT,
  condition TEXT,
  image_url TEXT NOT NULL,
  metadata_uri TEXT,
  price_sol NUMERIC NOT NULL CHECK (price_sol >= 0),
  price_usdc NUMERIC,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'sold', 'delisted', 'pending', 'pending_wallet')),
  ai_verified BOOLEAN DEFAULT false,
  ai_confidence_score NUMERIC,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sold_at TIMESTAMPTZ,
  buyer_wallet TEXT,
  buyer_user_id UUID,                         -- app-enforced FK -> users.id
  transaction_signature TEXT,
  views INTEGER DEFAULT 0,
  favorites INTEGER DEFAULT 0,
  -- compressed-NFT support (minting path dropped; cols kept for response parity)
  is_compressed BOOLEAN DEFAULT false,
  merkle_tree_address TEXT,
  leaf_index INTEGER,
  -- guest / custodial support
  guest_email TEXT,
  is_pending_claim BOOLEAN DEFAULT false,
  platform_wallet TEXT,
  -- storage tracking
  storage_type TEXT DEFAULT 'ipfs'
    CHECK (storage_type IN ('ipfs', 'arweave', 'shadow', 'on-chain')),
  -- on-chain references (set best-effort after the marketplace-list step so the
  -- UI can link the EvidenceListing + VerificationProof PDAs to Solscan and prove
  -- the verification verdict wasn't tampered with). NULL until anchored.
  listing_pubkey TEXT,
  verification_proof_pubkey TEXT
);

CREATE INDEX ASYNC IF NOT EXISTS idx_listings_seller_wallet  ON listings(seller_wallet);
CREATE INDEX ASYNC IF NOT EXISTS idx_listings_seller_user_id ON listings(seller_user_id);
CREATE INDEX ASYNC IF NOT EXISTS idx_listings_buyer_wallet   ON listings(buyer_wallet);
CREATE INDEX ASYNC IF NOT EXISTS idx_listings_buyer_user_id  ON listings(buyer_user_id);
CREATE INDEX ASYNC IF NOT EXISTS idx_listings_status         ON listings(status);
CREATE INDEX ASYNC IF NOT EXISTS idx_listings_created_at     ON listings(created_at);
CREATE INDEX ASYNC IF NOT EXISTS idx_listings_price_sol      ON listings(price_sol);
CREATE INDEX ASYNC IF NOT EXISTS idx_listings_nft_mint       ON listings(nft_mint_address);
CREATE INDEX ASYNC IF NOT EXISTS idx_listings_category       ON listings(category);


-- =====================================================================
-- TRANSACTIONS TABLE
-- =====================================================================
CREATE TABLE IF NOT EXISTS transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id UUID NOT NULL,                   -- app-enforced FK -> listings.id
  buyer_wallet TEXT NOT NULL,
  seller_wallet TEXT NOT NULL,
  buyer_user_id UUID,                         -- app-enforced FK -> users.id
  seller_user_id UUID,                        -- app-enforced FK -> users.id
  amount_sol NUMERIC NOT NULL CHECK (amount_sol > 0),
  amount_usdc NUMERIC,
  fee_sol NUMERIC DEFAULT 0,
  signature TEXT UNIQUE NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'confirmed', 'failed', 'refunded')),
  payment_method TEXT DEFAULT 'SOL'
    CHECK (payment_method IN ('SOL', 'USDC', 'OTHER')),
  blockchain_confirmed BOOLEAN DEFAULT false,
  confirmation_time INTEGER,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  confirmed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX ASYNC IF NOT EXISTS idx_transactions_listing_id     ON transactions(listing_id);
CREATE INDEX ASYNC IF NOT EXISTS idx_transactions_buyer_wallet   ON transactions(buyer_wallet);
CREATE INDEX ASYNC IF NOT EXISTS idx_transactions_seller_wallet  ON transactions(seller_wallet);
CREATE INDEX ASYNC IF NOT EXISTS idx_transactions_buyer_user_id  ON transactions(buyer_user_id);
CREATE INDEX ASYNC IF NOT EXISTS idx_transactions_seller_user_id ON transactions(seller_user_id);
CREATE INDEX ASYNC IF NOT EXISTS idx_transactions_signature      ON transactions(signature);
CREATE INDEX ASYNC IF NOT EXISTS idx_transactions_status         ON transactions(status);
CREATE INDEX ASYNC IF NOT EXISTS idx_transactions_created_at     ON transactions(created_at);


-- =====================================================================
-- ACTIVITIES TABLE  (NEW — activity feed + on-chain provenance)
-- =====================================================================
-- Append-only event log powering GET /api/activities (global feed) and
-- GET /api/nft/{mint}/history (per-NFT chain of custody — the provenance
-- differentiator: a verified physical item AND its full ownership chain,
-- which neither StockX/GOAT nor a pure-NFT marketplace can show together).
--
-- WRITE SOURCES (all best-effort — a feed-log write must NEVER fail the
-- parent listing/payment flow, mirroring the on-chain anchor steps):
--   * 'app'    — create-listing writes a `mint` + a `listing` row;
--                payment-verify writes a `sale` row (wired in PR5).
--   * 'helius' — the Helius enhanced webhook writes `transfer` rows for
--                off-platform NFT transfers (POST /api/webhooks/helius).
--
-- IDEMPOTENCY: Helius delivers at-least-once, so the same transfer can be
-- POSTed more than once. UNIQUE (tx_signature, event_type, nft_mint_address)
-- + `INSERT ... ON CONFLICT DO NOTHING` makes ingestion idempotent — a
-- replayed event inserts no duplicate row. App-side events share the same
-- guard (a retried create-listing won't double-log its mint).
--
-- The composite key (not tx_signature alone) is deliberate: one transaction
-- can legitimately carry multiple event types / mints (e.g. a mint+listing
-- in the same tx), so uniqueness is per (signature, type, mint).
--
-- DSQL notes: no FK to listings/users (app-enforced); id + created_at use
-- gen_random_uuid()/NOW() defaults (the insert helper also accepts explicit
-- values — spec §3.5). block_time is the ON-CHAIN time (Helius timestamp /
-- the row's created_at for app events), distinct from created_at (ingest time).
CREATE TABLE IF NOT EXISTS activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL
    CHECK (event_type IN ('mint', 'listing', 'sale', 'transfer')),
  nft_mint_address TEXT NOT NULL,
  product_name TEXT,                          -- NULL for chain-only transfers
  image_url TEXT,                             -- NULL for chain-only transfers
  from_wallet TEXT,                           -- NULL for mint origin
  to_wallet TEXT,                             -- NULL for listing (no recipient)
  price_sol NUMERIC,                          -- NULL/0 for transfer/mint
  tx_signature TEXT NOT NULL,
  block_time TIMESTAMPTZ NOT NULL,            -- on-chain time (sort key)
  source TEXT NOT NULL
    CHECK (source IN ('app', 'helius')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),  -- ingest time
  -- Idempotency: at-least-once webhook delivery + retried app writes.
  UNIQUE (tx_signature, event_type, nft_mint_address)
);

-- Feed paging: keyset on (block_time, id) DESC — never OFFSET (the feed only grows).
CREATE INDEX ASYNC IF NOT EXISTS idx_activities_feed     ON activities(block_time, id);
-- Per-type filter chips (sale/listing/transfer/mint) paged by the same keyset.
CREATE INDEX ASYNC IF NOT EXISTS idx_activities_type     ON activities(event_type, block_time, id);
-- Provenance: full chain of custody for one NFT.
CREATE INDEX ASYNC IF NOT EXISTS idx_activities_nft_mint ON activities(nft_mint_address, block_time, id);


-- =====================================================================
-- WAITLIST TABLE  (NEW — pre-production signup capture)
-- =====================================================================
-- Backs POST /api/waitlist (the public signup form at /waitlist) and the
-- admin export at GET /api/waitlist/export. Captures who wants access while
-- HypeChain is pre-production.
--
-- DSQL notes (same constraints as the tables above): no triggers (updated_at
-- set explicitly in any future UPDATE), no FKs, gen_random_uuid()/NOW()
-- defaults. `email` is UNIQUE so a re-signup is a no-op — the route inserts
-- with `ON CONFLICT (email) DO NOTHING`, so a duplicate returns no row and is
-- reported as "already on the list" without raising (and without re-sending
-- the confirmation email). Email is stored normalized (lower-cased, trimmed)
-- by the route so the UNIQUE guard is effectively case-insensitive.
CREATE TABLE IF NOT EXISTS waitlist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  wallet_address TEXT,                          -- optional; speeds first-listing verification
  intent TEXT NOT NULL DEFAULT 'collect'
    CHECK (intent IN ('collect', 'trade', 'verify', 'build')),
  source TEXT NOT NULL DEFAULT 'web',
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'invited', 'converted')),
  confirmation_sent_at TIMESTAMPTZ,             -- set when the SES confirmation is dispatched
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX ASYNC IF NOT EXISTS idx_waitlist_email      ON waitlist(email);
CREATE INDEX ASYNC IF NOT EXISTS idx_waitlist_created_at ON waitlist(created_at);
