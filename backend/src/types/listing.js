// API Request/Response Types
export interface CreateListingRequest {
  userWallet: string;
  productImage: string; // base64 encoded
  optionalPriceSol?: number | null;
}

export interface CreateListingResponse {
  success: boolean;
  nft_mint_address?: string;
  nft_image_url?: string;
  product_name?: string;
  listing_price_sol?: number;
  error?: string;
}

// OpenRouter Verification Response
export interface ProductIdentification {
  brand: string | null;
  model: string | null;
  colorway: string | null;
  confidence: 'high' | 'medium' | 'low';
}

export interface LivenessCheck {
  liveness_score: number; // 0-100
  reason: string;
}

export interface VisibleIdentifiers {
  serial_numbers: string[];
  tags: string[];
}

export interface VerificationResponse {
  product_identification: ProductIdentification;
  liveness_check: LivenessCheck;
  visible_identifiers: VisibleIdentifiers;
  full_description: string;
}

// NFT Metadata
export interface NFTAttribute {
  trait_type: string;
  value: string | number;
}

export interface NFTMetadata {
  name: string;
  description: string;
  image: string;
  attributes: NFTAttribute[];
}

// Marketplace Listing (matches Solana smart contract)
export interface ProductListing {
  seller: string; // Pubkey as string
  nft_mint: string; // Pubkey as string
  price_sol: number;
  is_listed: boolean;
}
