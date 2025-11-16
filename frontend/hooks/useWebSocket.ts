'use client';

import { useEffect, useCallback, useRef } from 'react';
import { WebSocketService } from '@/lib/websocket';
import { useApp } from '@/contexts/AppContext';
import { CreateListingResponse } from '@/lib/api-client';

/**
 * Hook for WebSocket connection with auto-reconnection
 */
export function useWebSocket() {
  const wsRef = useRef<WebSocketService | null>(null);
  const { actions } = useApp();

  useEffect(() => {
    // Initialize WebSocket service
    const ws = WebSocketService.getInstance();
    wsRef.current = ws;

    // Connect to WebSocket
    ws.connect();

    // Subscribe to NFT listing events
    const handleNewListing = (data: any) => {
      console.log('New NFT listing received via WebSocket:', data);

      // Add notification
      actions.addNotification({
        type: 'info',
        message: `New NFT listed: ${data.product_name}`,
      });

      // Add to listings if it's a complete listing object
      if (data.nft_mint_address && data.product_name) {
        actions.addListing({
          id: data.nft_mint_address,
          createdAt: new Date().toISOString(),
          userWallet: data.userWallet || 'Unknown',
          success: true,
          nft_mint_address: data.nft_mint_address,
          nft_image_url: data.nft_image_url,
          product_name: data.product_name,
          listing_price_sol: data.listing_price_sol || 0,
        });
      }
    };

    ws.subscribe('new_listing', handleNewListing);

    // Subscribe to marketplace events
    const handleMarketplaceUpdate = (data: any) => {
      console.log('Marketplace update received:', data);
      actions.addNotification({
        type: 'info',
        message: data.message || 'Marketplace updated',
      });
    };

    ws.subscribe('marketplace_update', handleMarketplaceUpdate);

    // Cleanup on unmount
    return () => {
      ws.unsubscribe('new_listing', handleNewListing);
      ws.unsubscribe('marketplace_update', handleMarketplaceUpdate);
      // Don't disconnect as it's a singleton, other components might use it
    };
  }, [actions]);

  const sendMessage = useCallback((type: string, payload: any) => {
    wsRef.current?.send({ type, payload });
  }, []);

  const isConnected = useCallback(() => {
    return wsRef.current?.isConnected() || false;
  }, []);

  return {
    sendMessage,
    isConnected,
  };
}

/**
 * Hook to monitor WebSocket connection status
 */
export function useWebSocketStatus() {
  const ws = WebSocketService.getInstance();
  const { actions } = useApp();

  useEffect(() => {
    const handleConnect = () => {
      console.log('WebSocket connected');
      actions.addNotification({
        type: 'success',
        message: 'Connected to real-time updates',
      });
    };

    const handleDisconnect = () => {
      console.log('WebSocket disconnected');
      actions.addNotification({
        type: 'warning',
        message: 'Disconnected from real-time updates',
      });
    };

    const handleError = (error: any) => {
      console.error('WebSocket error:', error);
      actions.addNotification({
        type: 'error',
        message: 'WebSocket connection error',
      });
    };

    ws.subscribe('connect', handleConnect);
    ws.subscribe('disconnect', handleDisconnect);
    ws.subscribe('error', handleError);

    return () => {
      ws.unsubscribe('connect', handleConnect);
      ws.unsubscribe('disconnect', handleDisconnect);
      ws.unsubscribe('error', handleError);
    };
  }, [ws, actions]);

  return {
    isConnected: ws.isConnected(),
  };
}
