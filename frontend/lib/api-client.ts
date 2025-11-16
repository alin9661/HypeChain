/**
 * API Client for HypeChain Backend
 * Centralized HTTP client with error handling, request/response interceptors
 */

export interface ApiError {
  success: false;
  error: string;
  stack?: string;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface CreateListingRequest {
  userWallet: string;
  productImage: string; // Base64 encoded with data URI
  optionalPriceSol?: number;
}

export interface CreateListingResponse {
  success: true;
  nft_mint_address: string;
  nft_image_url: string;
  product_name: string;
  listing_price_sol: number;
}

export interface HealthCheckResponse {
  status: string;
  timestamp: string;
  uptime: number;
  environment: string;
}

export interface ApiInfoResponse {
  name: string;
  version: string;
  description: string;
  endpoints: {
    health: string;
    createListing: string;
    listingInfo: string;
  };
  documentation: string;
}

export interface ListingEndpointInfo {
  endpoint: string;
  method: string;
  description: string;
  requiredFields: {
    userWallet: string;
    productImage: string;
    optionalPriceSol: string;
  };
  example: {
    userWallet: string;
    productImage: string;
    optionalPriceSol: number;
  };
}

// User Management Types
export interface RegisterUserRequest {
  walletAddress: string;
  privyUserId: string;
  chainType: 'ethereum' | 'solana';
  email?: string;
}

export interface UserProfile {
  id: string;
  walletAddress: string;
  chainType: 'ethereum' | 'solana';
  username?: string | null;
  email?: string | null;
  profileImage?: string | null;
  createdAt: string;
  lastLogin?: string | null;
  totalVolume: number;
  isNewUser?: boolean;
}

export interface RegisterUserResponse {
  success: true;
  user: UserProfile;
}

export interface GetUserResponse {
  success: true;
  user: UserProfile;
}

// Payment Types
export interface CreatePaymentRequest {
  listingId: string;
  buyerWallet: string;
}

export interface PaymentRequest {
  recipient: string;
  amount: number;
  splToken: string | null;
  reference: string;
  label: string;
  message: string;
  memo: string;
  listingId: string;
  nftMintAddress: string;
  productName: string;
  imageUrl: string;
}

export interface CreatePaymentResponse {
  success: true;
  paymentRequest: PaymentRequest;
}

export interface VerifyPaymentRequest {
  signature: string;
  listingId: string;
  buyerWallet: string;
  buyerUserId?: string;
}

export interface VerifyPaymentResponse {
  success: true;
  verification: {
    valid: boolean;
    amountTransferred: number;
    blockTime: number;
    slot: number;
  };
  purchase: {
    transaction: Transaction;
    listing: {
      id: string;
      nft_mint_address: string;
      product_name: string;
    };
  };
}

export interface Transaction {
  id: string;
  listing_id: string;
  buyer_wallet: string;
  seller_wallet: string;
  amount_sol: number;
  signature: string;
  status: 'pending' | 'confirmed' | 'failed' | 'refunded';
  created_at: string;
  confirmed_at?: string;
  listing?: {
    product_name: string;
    image_url: string;
    nft_mint_address: string;
  };
}

export interface TransactionHistoryResponse {
  success: true;
  transactions: Transaction[];
  count: number;
}

export interface WalletBalanceResponse {
  success: true;
  walletAddress: string;
  balance: number;
}

export interface Listing {
  id: string;
  nft_mint_address: string;
  seller_wallet: string;
  seller_user_id: string | null;
  product_name: string;
  description: string;
  category: string;
  condition: string;
  image_url: string;
  metadata_uri: string;
  price_sol: number;
  price_usdc: number | null;
  status: 'active' | 'sold' | 'delisted' | 'pending';
  ai_verified: boolean;
  ai_confidence_score: number | null;
  created_at: string;
  updated_at: string;
  sold_at: string | null;
  buyer_wallet: string | null;
  buyer_user_id: string | null;
  transaction_signature: string | null;
  views: number;
  favorites: number;
}

export interface GetListingResponse {
  success: true;
  listing: Listing;
}

class ApiClient {
  private baseURL: string;
  private defaultHeaders: HeadersInit;

  constructor() {
    // Use environment variable with fallback
    this.baseURL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
    this.defaultHeaders = {
      'Content-Type': 'application/json',
    };
  }

  /**
   * Generic request handler with error handling
   */
  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<ApiResponse<T>> {
    const url = `${this.baseURL}${endpoint}`;

    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          ...this.defaultHeaders,
          ...options.headers,
        },
      });

      const data = await response.json();

      if (!response.ok) {
        return {
          success: false,
          error: data.error || `HTTP ${response.status}: ${response.statusText}`,
        };
      }

      return {
        success: true,
        data,
      };
    } catch (error) {
      console.error(`API request failed for ${endpoint}:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      };
    }
  }

  /**
   * GET /health - Health check endpoint
   */
  async healthCheck(): Promise<ApiResponse<HealthCheckResponse>> {
    return this.request<HealthCheckResponse>('/health');
  }

  /**
   * GET / - API information
   */
  async getApiInfo(): Promise<ApiResponse<ApiInfoResponse>> {
    return this.request<ApiInfoResponse>('/');
  }

  /**
   * GET /api/create-listing - Get endpoint information
   */
  async getListingEndpointInfo(): Promise<ApiResponse<ListingEndpointInfo>> {
    return this.request<ListingEndpointInfo>('/api/create-listing');
  }

  /**
   * POST /api/create-listing - Create NFT listing
   */
  async createListing(
    data: CreateListingRequest
  ): Promise<ApiResponse<CreateListingResponse>> {
    return this.request<CreateListingResponse>('/api/create-listing', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  /**
   * POST /api/users/register - Register or login user after wallet connection
   */
  async registerUser(
    data: RegisterUserRequest
  ): Promise<ApiResponse<RegisterUserResponse>> {
    // Use the local Next.js API route (not backend server)
    const url = '/api/users/register';

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });

      const responseData = await response.json();

      if (!response.ok) {
        return {
          success: false,
          error: responseData.error || `HTTP ${response.status}: ${response.statusText}`,
        };
      }

      return {
        success: true,
        data: responseData,
      };
    } catch (error) {
      console.error(`API request failed for ${url}:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      };
    }
  }

  /**
   * GET /api/users/[walletAddress] - Get user profile by wallet address
   */
  async getUserProfile(walletAddress: string): Promise<ApiResponse<GetUserResponse>> {
    // Use the local Next.js API route (not backend server)
    const url = `/api/users/${encodeURIComponent(walletAddress)}`;

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      const responseData = await response.json();

      if (!response.ok) {
        return {
          success: false,
          error: responseData.error || `HTTP ${response.status}: ${response.statusText}`,
        };
      }

      return {
        success: true,
        data: responseData,
      };
    } catch (error) {
      console.error(`API request failed for ${url}:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      };
    }
  }

  /**
   * POST /api/payments/create - Create payment request for a listing
   */
  async createPayment(
    data: CreatePaymentRequest
  ): Promise<ApiResponse<CreatePaymentResponse>> {
    return this.request<CreatePaymentResponse>('/api/payments/create', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  /**
   * POST /api/payments/verify - Verify payment transaction
   */
  async verifyPayment(
    data: VerifyPaymentRequest
  ): Promise<ApiResponse<VerifyPaymentResponse>> {
    return this.request<VerifyPaymentResponse>('/api/payments/verify', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  /**
   * GET /api/payments/history/:walletAddress - Get transaction history
   */
  async getTransactionHistory(
    walletAddress: string,
    type: 'buyer' | 'seller' | 'all' = 'all'
  ): Promise<ApiResponse<TransactionHistoryResponse>> {
    return this.request<TransactionHistoryResponse>(
      `/api/payments/history/${encodeURIComponent(walletAddress)}?type=${type}`
    );
  }

  /**
   * GET /api/payments/balance/:walletAddress - Get wallet balance
   */
  async getWalletBalance(
    walletAddress: string
  ): Promise<ApiResponse<WalletBalanceResponse>> {
    return this.request<WalletBalanceResponse>(
      `/api/payments/balance/${encodeURIComponent(walletAddress)}`
    );
  }

  /**
   * GET /api/payments/listing/:listingId - Get listing details
   */
  async getListingDetails(
    listingId: string
  ): Promise<ApiResponse<GetListingResponse>> {
    return this.request<GetListingResponse>(
      `/api/payments/listing/${encodeURIComponent(listingId)}`
    );
  }

  /**
   * Validate image file before upload
   */
  validateImage(file: File): { valid: boolean; error?: string } {
    // Check file size (5MB max)
    const maxSize = 5 * 1024 * 1024; // 5MB
    if (file.size > maxSize) {
      return {
        valid: false,
        error: `Image size (${(file.size / 1024 / 1024).toFixed(2)}MB) exceeds maximum of 5MB`,
      };
    }

    // Check file type
    const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (!validTypes.includes(file.type)) {
      return {
        valid: false,
        error: `Invalid file type. Supported formats: JPEG, PNG, WebP`,
      };
    }

    return { valid: true };
  }

  /**
   * Convert File to base64 data URI
   */
  async fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        resolve(result);
      };
      reader.onerror = (error) => reject(error);
      reader.readAsDataURL(file);
    });
  }

  /**
   * Get base URL for constructing URLs
   */
  getBaseURL(): string {
    return this.baseURL;
  }

  /**
   * Set base URL (useful for testing or environment changes)
   */
  setBaseURL(url: string): void {
    this.baseURL = url;
  }
}

// Export singleton instance
export const apiClient = new ApiClient();

// Export class for testing
export default ApiClient;
