/**
 * Unit tests for API Client
 * Run with: npm test
 */

import ApiClient, { apiClient } from '@/lib/api-client';

// Mock fetch
global.fetch = jest.fn();

describe('ApiClient', () => {
  let client: ApiClient;

  beforeEach(() => {
    client = new ApiClient();
    jest.clearAllMocks();
  });

  describe('healthCheck', () => {
    it('should return health data on success', async () => {
      const mockResponse = {
        status: 'healthy',
        timestamp: '2025-11-16T00:00:00Z',
        uptime: 100,
        environment: 'test',
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await client.healthCheck();

      expect(result.success).toBe(true);
      expect(result.data).toEqual(mockResponse);
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/health'),
        expect.any(Object)
      );
    });

    it('should handle network errors', async () => {
      (global.fetch as jest.Mock).mockRejectedValueOnce(
        new Error('Network error')
      );

      const result = await client.healthCheck();

      expect(result.success).toBe(false);
      expect(result.error).toBe('Network error');
    });
  });

  describe('createListing', () => {
    it('should create listing successfully', async () => {
      const mockRequest = {
        userWallet: '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU',
        productImage: 'data:image/jpeg;base64,abc123',
        optionalPriceSol: 0.5,
      };

      const mockResponse = {
        success: true,
        nft_mint_address: 'ABC123',
        nft_image_url: 'https://ipfs.io/ipfs/xyz',
        product_name: 'Test Product',
        listing_price_sol: 0.5,
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await client.createListing(mockRequest);

      expect(result.success).toBe(true);
      expect(result.data).toEqual(mockResponse);
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/create-listing'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify(mockRequest),
        })
      );
    });

    it('should handle validation errors', async () => {
      const mockRequest = {
        userWallet: 'invalid',
        productImage: 'data:image/jpeg;base64,abc123',
        optionalPriceSol: 0.5,
      };

      const mockError = {
        success: false,
        error: 'Invalid Solana wallet address',
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        json: async () => mockError,
      });

      const result = await client.createListing(mockRequest);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid Solana wallet address');
    });
  });

  describe('validateImage', () => {
    it('should accept valid JPEG image', () => {
      const file = new File(['content'], 'test.jpg', { type: 'image/jpeg' });
      Object.defineProperty(file, 'size', { value: 1024 * 1024 }); // 1MB

      const result = client.validateImage(file);

      expect(result.valid).toBe(true);
    });

    it('should reject oversized images', () => {
      const file = new File(['content'], 'test.jpg', { type: 'image/jpeg' });
      Object.defineProperty(file, 'size', { value: 10 * 1024 * 1024 }); // 10MB

      const result = client.validateImage(file);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('exceeds maximum');
    });

    it('should reject invalid file types', () => {
      const file = new File(['content'], 'test.pdf', { type: 'application/pdf' });
      Object.defineProperty(file, 'size', { value: 1024 * 1024 }); // 1MB

      const result = client.validateImage(file);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('Invalid file type');
    });
  });

  describe('fileToBase64', () => {
    it('should convert file to base64', async () => {
      const file = new File(['test content'], 'test.jpg', { type: 'image/jpeg' });

      // Mock FileReader
      const mockFileReader = {
        readAsDataURL: jest.fn(),
        result: 'data:image/jpeg;base64,dGVzdCBjb250ZW50',
        onload: null as any,
      };

      global.FileReader = jest.fn(() => mockFileReader) as any;

      const promise = client.fileToBase64(file);

      // Trigger onload
      if (mockFileReader.onload) {
        mockFileReader.onload({} as any);
      }

      const result = await promise;

      expect(result).toBe('data:image/jpeg;base64,dGVzdCBjb250ZW50');
      expect(mockFileReader.readAsDataURL).toHaveBeenCalledWith(file);
    });
  });

  describe('singleton instance', () => {
    it('should export a singleton instance', () => {
      expect(apiClient).toBeInstanceOf(ApiClient);
    });

    it('should allow base URL configuration', () => {
      const newUrl = 'https://api.example.com';
      apiClient.setBaseURL(newUrl);

      expect(apiClient.getBaseURL()).toBe(newUrl);
    });
  });
});
