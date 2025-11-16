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
