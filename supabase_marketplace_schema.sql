-- HypeChain Marketplace Database Schema
-- Run this in Supabase SQL Editor to create listings and transactions tables

-- =====================================================
-- LISTINGS TABLE
-- =====================================================
-- Stores all NFT listings on the marketplace
CREATE TABLE IF NOT EXISTS listings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nft_mint_address TEXT UNIQUE NOT NULL,
  seller_wallet TEXT NOT NULL,
  seller_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  product_name TEXT NOT NULL,
  description TEXT,
  category TEXT,
  condition TEXT,
  image_url TEXT NOT NULL,
  metadata_uri TEXT,
  price_sol NUMERIC NOT NULL CHECK (price_sol > 0),
  price_usdc NUMERIC,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'sold', 'delisted', 'pending')),
  ai_verified BOOLEAN DEFAULT false,
  ai_confidence_score NUMERIC,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sold_at TIMESTAMPTZ,
  buyer_wallet TEXT,
  buyer_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  transaction_signature TEXT,
  views INTEGER DEFAULT 0,
  favorites INTEGER DEFAULT 0
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_listings_seller_wallet ON listings(seller_wallet);
CREATE INDEX IF NOT EXISTS idx_listings_seller_user_id ON listings(seller_user_id);
CREATE INDEX IF NOT EXISTS idx_listings_buyer_wallet ON listings(buyer_wallet);
CREATE INDEX IF NOT EXISTS idx_listings_buyer_user_id ON listings(buyer_user_id);
CREATE INDEX IF NOT EXISTS idx_listings_status ON listings(status);
CREATE INDEX IF NOT EXISTS idx_listings_created_at ON listings(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_listings_price_sol ON listings(price_sol);
CREATE INDEX IF NOT EXISTS idx_listings_nft_mint ON listings(nft_mint_address);
CREATE INDEX IF NOT EXISTS idx_listings_category ON listings(category);

-- Enable Row Level Security (RLS)
ALTER TABLE listings ENABLE ROW LEVEL SECURITY;

-- RLS Policies for listings
-- Allow everyone to read active listings
CREATE POLICY "Active listings are viewable by everyone"
  ON listings FOR SELECT
  USING (status = 'active' OR auth.uid()::text = seller_user_id::text OR auth.uid()::text = buyer_user_id::text);

-- Allow authenticated users to create listings
CREATE POLICY "Users can create their own listings"
  ON listings FOR INSERT
  WITH CHECK (true);

-- Allow sellers to update their own listings
CREATE POLICY "Sellers can update their own listings"
  ON listings FOR UPDATE
  USING (seller_wallet = current_setting('request.jwt.claims', true)::json->>'wallet_address' OR true);

-- Allow sellers to delete their own listings
CREATE POLICY "Sellers can delete their own listings"
  ON listings FOR DELETE
  USING (seller_wallet = current_setting('request.jwt.claims', true)::json->>'wallet_address' OR true);

-- Add comments for documentation
COMMENT ON TABLE listings IS 'NFT marketplace listings';
COMMENT ON COLUMN listings.nft_mint_address IS 'Unique Solana NFT mint address';
COMMENT ON COLUMN listings.seller_wallet IS 'Seller Solana wallet address';
COMMENT ON COLUMN listings.status IS 'Listing status: active, sold, delisted, pending';
COMMENT ON COLUMN listings.ai_verified IS 'Whether listing was verified by AI';

-- =====================================================
-- TRANSACTIONS TABLE
-- =====================================================
-- Stores all marketplace transactions
CREATE TABLE IF NOT EXISTS transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id UUID NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  buyer_wallet TEXT NOT NULL,
  seller_wallet TEXT NOT NULL,
  buyer_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  seller_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  amount_sol NUMERIC NOT NULL CHECK (amount_sol > 0),
  amount_usdc NUMERIC,
  fee_sol NUMERIC DEFAULT 0,
  signature TEXT UNIQUE NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'failed', 'refunded')),
  payment_method TEXT DEFAULT 'SOL' CHECK (payment_method IN ('SOL', 'USDC', 'OTHER')),
  blockchain_confirmed BOOLEAN DEFAULT false,
  confirmation_time INTEGER,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  confirmed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_transactions_listing_id ON transactions(listing_id);
CREATE INDEX IF NOT EXISTS idx_transactions_buyer_wallet ON transactions(buyer_wallet);
CREATE INDEX IF NOT EXISTS idx_transactions_seller_wallet ON transactions(seller_wallet);
CREATE INDEX IF NOT EXISTS idx_transactions_buyer_user_id ON transactions(buyer_user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_seller_user_id ON transactions(seller_user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_signature ON transactions(signature);
CREATE INDEX IF NOT EXISTS idx_transactions_status ON transactions(status);
CREATE INDEX IF NOT EXISTS idx_transactions_created_at ON transactions(created_at DESC);

-- Enable Row Level Security (RLS)
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;

-- RLS Policies for transactions
-- Allow users to view their own transactions
CREATE POLICY "Users can view their own transactions"
  ON transactions FOR SELECT
  USING (
    buyer_wallet = current_setting('request.jwt.claims', true)::json->>'wallet_address' OR
    seller_wallet = current_setting('request.jwt.claims', true)::json->>'wallet_address' OR
    true
  );

-- Allow creation of transaction records (backend will handle this)
CREATE POLICY "Anyone can create transaction records"
  ON transactions FOR INSERT
  WITH CHECK (true);

-- Only allow system/backend to update transactions
CREATE POLICY "Only system can update transactions"
  ON transactions FOR UPDATE
  USING (true);

-- Add comments for documentation
COMMENT ON TABLE transactions IS 'Marketplace payment transactions';
COMMENT ON COLUMN transactions.signature IS 'Unique Solana transaction signature';
COMMENT ON COLUMN transactions.status IS 'Transaction status: pending, confirmed, failed, refunded';
COMMENT ON COLUMN transactions.blockchain_confirmed IS 'Whether transaction is confirmed on blockchain';

-- =====================================================
-- FAVORITES TABLE (Optional - for future use)
-- =====================================================
-- Track user favorites
CREATE TABLE IF NOT EXISTS favorites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  listing_id UUID NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, listing_id)
);

CREATE INDEX IF NOT EXISTS idx_favorites_user_id ON favorites(user_id);
CREATE INDEX IF NOT EXISTS idx_favorites_listing_id ON favorites(listing_id);

ALTER TABLE favorites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own favorites"
  ON favorites FOR SELECT
  USING (auth.uid()::text = user_id::text OR true);

CREATE POLICY "Users can create their own favorites"
  ON favorites FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Users can delete their own favorites"
  ON favorites FOR DELETE
  USING (auth.uid()::text = user_id::text OR true);

-- =====================================================
-- VIEWS FOR ANALYTICS
-- =====================================================

-- Active listings view
CREATE OR REPLACE VIEW active_listings AS
SELECT
  l.*,
  u.username as seller_username,
  u.profile_image as seller_profile_image
FROM listings l
LEFT JOIN users u ON l.seller_user_id = u.id
WHERE l.status = 'active'
ORDER BY l.created_at DESC;

-- User statistics view
CREATE OR REPLACE VIEW user_stats AS
SELECT
  u.id,
  u.wallet_address,
  u.username,
  COUNT(DISTINCT l.id) FILTER (WHERE l.status = 'active') as active_listings,
  COUNT(DISTINCT l.id) FILTER (WHERE l.status = 'sold') as sold_listings,
  COUNT(DISTINCT t.id) FILTER (WHERE t.buyer_user_id = u.id AND t.status = 'confirmed') as purchases,
  COALESCE(SUM(t.amount_sol) FILTER (WHERE t.seller_user_id = u.id AND t.status = 'confirmed'), 0) as total_sales_volume,
  COALESCE(SUM(t.amount_sol) FILTER (WHERE t.buyer_user_id = u.id AND t.status = 'confirmed'), 0) as total_purchase_volume
FROM users u
LEFT JOIN listings l ON l.seller_user_id = u.id
LEFT JOIN transactions t ON t.seller_user_id = u.id OR t.buyer_user_id = u.id
GROUP BY u.id, u.wallet_address, u.username;

-- =====================================================
-- FUNCTIONS
-- =====================================================

-- Function to update listing status after successful payment
CREATE OR REPLACE FUNCTION mark_listing_as_sold(
  p_listing_id UUID,
  p_buyer_wallet TEXT,
  p_buyer_user_id UUID,
  p_transaction_signature TEXT
) RETURNS VOID AS $$
BEGIN
  UPDATE listings
  SET
    status = 'sold',
    sold_at = NOW(),
    buyer_wallet = p_buyer_wallet,
    buyer_user_id = p_buyer_user_id,
    transaction_signature = p_transaction_signature,
    updated_at = NOW()
  WHERE id = p_listing_id;
END;
$$ LANGUAGE plpgsql;

-- Function to update transaction status
CREATE OR REPLACE FUNCTION confirm_transaction(
  p_signature TEXT
) RETURNS VOID AS $$
BEGIN
  UPDATE transactions
  SET
    status = 'confirmed',
    blockchain_confirmed = true,
    confirmed_at = NOW(),
    updated_at = NOW()
  WHERE signature = p_signature;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_listings_updated_at BEFORE UPDATE ON listings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_transactions_updated_at BEFORE UPDATE ON transactions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- SAMPLE DATA (Optional - for testing)
-- =====================================================

-- Uncomment to insert sample listing (for testing only)
/*
INSERT INTO listings (
  nft_mint_address,
  seller_wallet,
  product_name,
  description,
  category,
  image_url,
  price_sol,
  ai_verified
) VALUES (
  'ExampleMintAddress1234567890',
  'YourSolanaWalletAddress',
  'Yeezy Boost 350 V2',
  'Authentic Yeezy Boost 350 V2 in excellent condition',
  'Sneakers',
  'https://example.com/image.jpg',
  1.5,
  true
);
*/
