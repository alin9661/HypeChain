'use client';

import { useState, useCallback } from 'react';
import {
  apiClient,
  CreateListingRequest,
  CreateListingResponse,
  HealthCheckResponse,
  ApiInfoResponse,
  ListingEndpointInfo,
  ApiResponse,
} from '@/lib/api-client';
import { useApp, NFTListing } from '@/contexts/AppContext';

/**
 * Generic hook for async API calls with loading and error states
 */
export function useAsync<T, Args extends any[]>(
  asyncFunction: (...args: Args) => Promise<ApiResponse<T>>
) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const execute = useCallback(
    async (...args: Args) => {
      setLoading(true);
      setError(null);

      try {
        const response = await asyncFunction(...args);

        if (response.success && response.data) {
          setData(response.data);
          return { success: true, data: response.data };
        } else {
          setError(response.error || 'Unknown error');
          return { success: false, error: response.error };
        }
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown error';
        setError(errorMessage);
        return { success: false, error: errorMessage };
      } finally {
        setLoading(false);
      }
    },
    [asyncFunction]
  );

  const reset = useCallback(() => {
    setData(null);
    setError(null);
    setLoading(false);
  }, []);

  return {
    data,
    loading,
    error,
    execute,
    reset,
  };
}

/**
 * Hook for health check endpoint
 */
export function useHealthCheck() {
  return useAsync<HealthCheckResponse, []>(() => apiClient.healthCheck());
}

/**
 * Hook for API info endpoint
 */
export function useApiInfo() {
  return useAsync<ApiInfoResponse, []>(() => apiClient.getApiInfo());
}

/**
 * Hook for listing endpoint info
 */
export function useListingEndpointInfo() {
  return useAsync<ListingEndpointInfo, []>(() =>
    apiClient.getListingEndpointInfo()
  );
}

/**
 * Hook for creating NFT listings
 */
export function useCreateListing() {
  const { actions } = useApp();
  const [data, setData] = useState<CreateListingResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<string>('');

  const createListing = useCallback(
    async (request: CreateListingRequest) => {
      setLoading(true);
      setError(null);
      setProgress('Validating request...');

      try {
        // Step 1: Validate request
        if (!request.userWallet) {
          throw new Error('Wallet address is required');
        }

        if (!request.productImage) {
          throw new Error('Product image is required');
        }

        setProgress('Sending to backend...');

        // Step 2: Send to backend
        const response = await apiClient.createListing(request);

        if (response.success && response.data) {
          setProgress('NFT created successfully!');
          setData(response.data);

          // Add to global state
          const newListing: NFTListing = {
            ...response.data,
            id: response.data.nft_mint_address,
            createdAt: new Date().toISOString(),
            userWallet: request.userWallet,
          };

          actions.addListing(newListing);

          // Show success notification
          actions.addNotification({
            type: 'success',
            message: `Successfully created NFT: ${response.data.product_name}`,
          });

          return { success: true, data: response.data };
        } else {
          const errorMsg = response.error || 'Failed to create listing';
          setError(errorMsg);

          // Show error notification
          actions.addNotification({
            type: 'error',
            message: errorMsg,
          });

          return { success: false, error: errorMsg };
        }
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown error';
        setError(errorMessage);

        actions.addNotification({
          type: 'error',
          message: errorMessage,
        });

        return { success: false, error: errorMessage };
      } finally {
        setLoading(false);
        setProgress('');
      }
    },
    [actions]
  );

  const reset = useCallback(() => {
    setData(null);
    setError(null);
    setLoading(false);
    setProgress('');
  }, []);

  return {
    data,
    loading,
    error,
    progress,
    createListing,
    reset,
  };
}

/**
 * Hook for image upload with validation
 */
export function useImageUpload() {
  const [preview, setPreview] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleFileChange = useCallback(
    async (selectedFile: File | null) => {
      setError(null);

      if (!selectedFile) {
        setFile(null);
        setPreview(null);
        return { success: false, error: 'No file selected' };
      }

      // Validate image
      const validation = apiClient.validateImage(selectedFile);
      if (!validation.valid) {
        setError(validation.error || 'Invalid image');
        setFile(null);
        setPreview(null);
        return { success: false, error: validation.error };
      }

      try {
        // Convert to base64 for preview
        const base64 = await apiClient.fileToBase64(selectedFile);
        setFile(selectedFile);
        setPreview(base64);
        return { success: true, base64 };
      } catch (err) {
        const errorMsg = 'Failed to process image';
        setError(errorMsg);
        return { success: false, error: errorMsg };
      }
    },
    []
  );

  const reset = useCallback(() => {
    setFile(null);
    setPreview(null);
    setError(null);
  }, []);

  return {
    file,
    preview,
    error,
    handleFileChange,
    reset,
  };
}

/**
 * Hook for managing backend connection status
 */
export function useBackendStatus() {
  const [isOnline, setIsOnline] = useState(false);
  const [checking, setChecking] = useState(false);

  const checkStatus = useCallback(async () => {
    setChecking(true);
    try {
      const response = await apiClient.healthCheck();
      setIsOnline(response.success);
      return response.success;
    } catch {
      setIsOnline(false);
      return false;
    } finally {
      setChecking(false);
    }
  }, []);

  return {
    isOnline,
    checking,
    checkStatus,
  };
}
