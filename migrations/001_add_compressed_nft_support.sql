-- Migration: Add Compressed NFT Support
-- Description: Adds columns to support compressed NFTs (cNFTs) and Arweave storage
-- Date: 2025-11-16
-- Author: HypeChain Team

-- =====================================================
-- ADD COMPRESSED NFT COLUMNS TO LISTINGS TABLE
-- =====================================================

-- Add compressed NFT support columns
ALTER TABLE listings ADD COLUMN IF NOT EXISTS is_compressed BOOLEAN DEFAULT false;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS merkle_tree_address TEXT;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS leaf_index INTEGER;

-- Add guest user support columns (if not already exists)
ALTER TABLE listings ADD COLUMN IF NOT EXISTS guest_email TEXT;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS is_pending_claim BOOLEAN DEFAULT false;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS platform_wallet TEXT;

-- Add storage type tracking
ALTER TABLE listings ADD COLUMN IF NOT EXISTS storage_type TEXT DEFAULT 'ipfs' CHECK (storage_type IN ('ipfs', 'arweave', 'shadow', 'on-chain'));

-- Update status column to include 'pending_wallet' option
ALTER TABLE listings DROP CONSTRAINT IF EXISTS listings_status_check;
ALTER TABLE listings ADD CONSTRAINT listings_status_check
  CHECK (status IN ('active', 'sold', 'delisted', 'pending', 'pending_wallet'));

-- =====================================================
-- CREATE INDEXES FOR COMPRESSED NFT QUERIES
-- =====================================================

-- Index for compressed NFT lookups
CREATE INDEX IF NOT EXISTS idx_listings_compressed ON listings(is_compressed);

-- Index for Merkle tree queries (useful for tree management)
CREATE INDEX IF NOT EXISTS idx_listings_merkle_tree ON listings(merkle_tree_address);

-- Index for guest email lookups (for claiming NFTs)
CREATE INDEX IF NOT EXISTS idx_listings_guest_email ON listings(guest_email) WHERE guest_email IS NOT NULL;

-- Index for pending claims
CREATE INDEX IF NOT EXISTS idx_listings_pending_claim ON listings(is_pending_claim) WHERE is_pending_claim = true;

-- Index for storage type (for analytics)
CREATE INDEX IF NOT EXISTS idx_listings_storage_type ON listings(storage_type);

-- Composite index for compressed NFT + tree lookups (optimizes queries)
CREATE INDEX IF NOT EXISTS idx_listings_compressed_tree ON listings(is_compressed, merkle_tree_address) WHERE is_compressed = true;

-- =====================================================
-- ADD COMMENTS FOR NEW COLUMNS
-- =====================================================

COMMENT ON COLUMN listings.is_compressed IS 'Whether NFT is a compressed NFT (cNFT) or standard NFT';
COMMENT ON COLUMN listings.merkle_tree_address IS 'Merkle tree address for compressed NFTs (null for standard NFTs)';
COMMENT ON COLUMN listings.leaf_index IS 'Leaf index in Merkle tree for compressed NFTs (null for standard NFTs)';
COMMENT ON COLUMN listings.guest_email IS 'Email address for guest users who have not connected a wallet';
COMMENT ON COLUMN listings.is_pending_claim IS 'Whether NFT is held in platform wallet pending user wallet connection';
COMMENT ON COLUMN listings.platform_wallet IS 'Platform custodial wallet address holding NFT for guest users';
COMMENT ON COLUMN listings.storage_type IS 'Type of decentralized storage used: ipfs, arweave, shadow, or on-chain';

-- =====================================================
-- UPDATE EXISTING LISTINGS (BACKFILL)
-- =====================================================

-- Mark all existing listings as standard NFTs (not compressed)
UPDATE listings
SET is_compressed = false,
    storage_type = 'ipfs'
WHERE is_compressed IS NULL;

-- =====================================================
-- CREATE VIEW FOR COMPRESSED NFT STATISTICS
-- =====================================================

CREATE OR REPLACE VIEW compressed_nft_stats AS
SELECT
  merkle_tree_address,
  COUNT(*) as total_nfts_in_tree,
  COUNT(DISTINCT seller_wallet) as unique_sellers,
  SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active_listings,
  SUM(CASE WHEN status = 'sold' THEN 1 ELSE 0 END) as sold_listings,
  AVG(price_sol) as avg_price_sol,
  MIN(created_at) as first_mint_date,
  MAX(created_at) as latest_mint_date
FROM listings
WHERE is_compressed = true
GROUP BY merkle_tree_address;

COMMENT ON VIEW compressed_nft_stats IS 'Statistics for compressed NFTs grouped by Merkle tree';

-- =====================================================
-- CREATE VIEW FOR GUEST USER PENDING CLAIMS
-- =====================================================

CREATE OR REPLACE VIEW pending_nft_claims AS
SELECT
  id,
  nft_mint_address,
  guest_email,
  product_name,
  image_url,
  created_at,
  is_compressed,
  storage_type,
  CASE
    WHEN is_compressed THEN 'Compressed NFT'
    ELSE 'Standard NFT'
  END as nft_type
FROM listings
WHERE is_pending_claim = true
  AND status = 'pending_wallet'
ORDER BY created_at DESC;

COMMENT ON VIEW pending_nft_claims IS 'NFTs waiting to be claimed by guest users';

-- =====================================================
-- CREATE FUNCTION TO CLAIM NFT (FOR FUTURE USE)
-- =====================================================

CREATE OR REPLACE FUNCTION claim_nft(
  p_listing_id UUID,
  p_user_wallet TEXT,
  p_guest_email TEXT
)
RETURNS BOOLEAN AS $$
DECLARE
  v_listing_exists BOOLEAN;
BEGIN
  -- Check if listing exists and belongs to the guest email
  SELECT EXISTS(
    SELECT 1
    FROM listings
    WHERE id = p_listing_id
      AND guest_email = p_guest_email
      AND is_pending_claim = true
  ) INTO v_listing_exists;

  IF NOT v_listing_exists THEN
    RETURN false;
  END IF;

  -- Update listing to mark as claimed
  UPDATE listings
  SET
    seller_wallet = p_user_wallet,
    is_pending_claim = false,
    status = 'active',
    updated_at = NOW()
  WHERE id = p_listing_id;

  RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION claim_nft IS 'Allows guest users to claim their NFTs after connecting a wallet';

-- =====================================================
-- CREATE FUNCTION TO GET MERKLE TREE UTILIZATION
-- =====================================================

CREATE OR REPLACE FUNCTION get_merkle_tree_utilization(
  p_tree_address TEXT,
  p_tree_capacity INTEGER DEFAULT 16384
)
RETURNS TABLE (
  tree_address TEXT,
  nfts_minted BIGINT,
  capacity INTEGER,
  utilization_pct NUMERIC,
  remaining_capacity INTEGER,
  status TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    p_tree_address as tree_address,
    COUNT(*) as nfts_minted,
    p_tree_capacity as capacity,
    ROUND((COUNT(*)::NUMERIC / p_tree_capacity::NUMERIC) * 100, 2) as utilization_pct,
    (p_tree_capacity - COUNT(*)::INTEGER) as remaining_capacity,
    CASE
      WHEN COUNT(*) >= p_tree_capacity THEN 'FULL'
      WHEN COUNT(*)::NUMERIC / p_tree_capacity::NUMERIC > 0.9 THEN 'CRITICAL'
      WHEN COUNT(*)::NUMERIC / p_tree_capacity::NUMERIC > 0.75 THEN 'WARNING'
      ELSE 'OK'
    END as status
  FROM listings
  WHERE merkle_tree_address = p_tree_address
    AND is_compressed = true;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_merkle_tree_utilization IS 'Returns utilization statistics for a Merkle tree';

-- =====================================================
-- CREATE RLS POLICIES FOR NEW COLUMNS
-- =====================================================

-- Allow guest users to view their pending claims
CREATE POLICY IF NOT EXISTS "Guest users can view their pending claims"
  ON listings FOR SELECT
  USING (
    (is_pending_claim = true AND guest_email = current_setting('request.jwt.claims', true)::json->>'email')
    OR auth.uid()::text = seller_user_id::text
    OR status = 'active'
  );

-- =====================================================
-- MIGRATION VALIDATION
-- =====================================================

-- Verify all columns were added successfully
DO $$
DECLARE
  v_missing_columns TEXT[];
BEGIN
  SELECT ARRAY_AGG(column_name)
  INTO v_missing_columns
  FROM (
    SELECT unnest(ARRAY[
      'is_compressed',
      'merkle_tree_address',
      'leaf_index',
      'guest_email',
      'is_pending_claim',
      'platform_wallet',
      'storage_type'
    ]) AS column_name
  ) expected
  WHERE column_name NOT IN (
    SELECT column_name::TEXT
    FROM information_schema.columns
    WHERE table_name = 'listings'
  );

  IF v_missing_columns IS NOT NULL THEN
    RAISE EXCEPTION 'Migration failed: Missing columns: %', array_to_string(v_missing_columns, ', ');
  ELSE
    RAISE NOTICE 'Migration completed successfully!';
    RAISE NOTICE 'All columns added to listings table';
    RAISE NOTICE 'Indexes created for compressed NFT queries';
    RAISE NOTICE 'Views created for analytics';
    RAISE NOTICE 'Helper functions created for NFT claiming and tree management';
  END IF;
END $$;

-- =====================================================
-- USAGE EXAMPLES (FOR REFERENCE)
-- =====================================================

/*
-- Example 1: Query all compressed NFTs
SELECT * FROM listings WHERE is_compressed = true;

-- Example 2: Get compressed NFT statistics
SELECT * FROM compressed_nft_stats;

-- Example 3: View pending claims
SELECT * FROM pending_nft_claims;

-- Example 4: Check Merkle tree utilization
SELECT * FROM get_merkle_tree_utilization('your_tree_address_here', 16384);

-- Example 5: Claim an NFT (from application)
SELECT claim_nft(
  'listing-uuid-here',
  'user-wallet-address',
  'user@example.com'
);

-- Example 6: Find all NFTs in a specific Merkle tree
SELECT
  product_name,
  nft_mint_address,
  leaf_index,
  created_at
FROM listings
WHERE merkle_tree_address = 'your_tree_address'
  AND is_compressed = true
ORDER BY leaf_index;

-- Example 7: Compare storage types
SELECT
  storage_type,
  COUNT(*) as total_nfts,
  AVG(price_sol) as avg_price,
  SUM(CASE WHEN status = 'sold' THEN 1 ELSE 0 END) as sold_count
FROM listings
GROUP BY storage_type;
*/
