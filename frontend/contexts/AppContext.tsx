'use client';

import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { CreateListingResponse } from '@/lib/api-client';

// Types
export interface NFTListing extends CreateListingResponse {
  id: string;
  createdAt: string;
  userWallet: string;
}

export interface WalletState {
  address: string | null;
  connected: boolean;
  balance: number | null;
}

export interface AppState {
  // NFT Listings
  listings: NFTListing[];
  isLoadingListings: boolean;
  listingsError: string | null;

  // Wallet
  wallet: WalletState;

  // UI State
  sidebarCollapsed: boolean;
  theme: 'light' | 'dark';

  // Notifications
  notifications: Notification[];
}

export interface Notification {
  id: string;
  type: 'success' | 'error' | 'info' | 'warning';
  message: string;
  timestamp: string;
}

interface AppContextType {
  state: AppState;
  actions: {
    // Listings
    addListing: (listing: NFTListing) => void;
    setListings: (listings: NFTListing[]) => void;
    setLoadingListings: (loading: boolean) => void;
    setListingsError: (error: string | null) => void;

    // Wallet
    connectWallet: (address: string, balance?: number) => void;
    disconnectWallet: () => void;
    updateBalance: (balance: number) => void;

    // UI
    toggleSidebar: () => void;
    setSidebarCollapsed: (collapsed: boolean) => void;
    setTheme: (theme: 'light' | 'dark') => void;

    // Notifications
    addNotification: (notification: Omit<Notification, 'id' | 'timestamp'>) => void;
    removeNotification: (id: string) => void;
    clearNotifications: () => void;
  };
}

const AppContext = createContext<AppContextType | undefined>(undefined);

const initialState: AppState = {
  listings: [],
  isLoadingListings: false,
  listingsError: null,
  wallet: {
    address: null,
    connected: false,
    balance: null,
  },
  sidebarCollapsed: false,
  theme: 'dark',
  notifications: [],
};

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppState>(initialState);

  // Listings actions
  const addListing = useCallback((listing: NFTListing) => {
    setState((prev) => ({
      ...prev,
      listings: [listing, ...prev.listings],
    }));
  }, []);

  const setListings = useCallback((listings: NFTListing[]) => {
    setState((prev) => ({
      ...prev,
      listings,
    }));
  }, []);

  const setLoadingListings = useCallback((loading: boolean) => {
    setState((prev) => ({
      ...prev,
      isLoadingListings: loading,
    }));
  }, []);

  const setListingsError = useCallback((error: string | null) => {
    setState((prev) => ({
      ...prev,
      listingsError: error,
    }));
  }, []);

  // Wallet actions
  const connectWallet = useCallback((address: string, balance?: number) => {
    setState((prev) => ({
      ...prev,
      wallet: {
        address,
        connected: true,
        balance: balance ?? null,
      },
    }));
  }, []);

  const disconnectWallet = useCallback(() => {
    setState((prev) => ({
      ...prev,
      wallet: {
        address: null,
        connected: false,
        balance: null,
      },
    }));
  }, []);

  const updateBalance = useCallback((balance: number) => {
    setState((prev) => ({
      ...prev,
      wallet: {
        ...prev.wallet,
        balance,
      },
    }));
  }, []);

  // UI actions
  const toggleSidebar = useCallback(() => {
    setState((prev) => ({
      ...prev,
      sidebarCollapsed: !prev.sidebarCollapsed,
    }));
  }, []);

  const setSidebarCollapsed = useCallback((collapsed: boolean) => {
    setState((prev) => ({
      ...prev,
      sidebarCollapsed: collapsed,
    }));
  }, []);

  const setTheme = useCallback((theme: 'light' | 'dark') => {
    setState((prev) => ({
      ...prev,
      theme,
    }));
  }, []);

  // Notification actions
  const addNotification = useCallback(
    (notification: Omit<Notification, 'id' | 'timestamp'>) => {
      const newNotification: Notification = {
        ...notification,
        id: `${Date.now()}-${Math.random()}`,
        timestamp: new Date().toISOString(),
      };

      setState((prev) => ({
        ...prev,
        notifications: [...prev.notifications, newNotification],
      }));

      // Auto-remove after 5 seconds
      setTimeout(() => {
        removeNotification(newNotification.id);
      }, 5000);
    },
    []
  );

  const removeNotification = useCallback((id: string) => {
    setState((prev) => ({
      ...prev,
      notifications: prev.notifications.filter((n) => n.id !== id),
    }));
  }, []);

  const clearNotifications = useCallback(() => {
    setState((prev) => ({
      ...prev,
      notifications: [],
    }));
  }, []);

  const value: AppContextType = {
    state,
    actions: {
      addListing,
      setListings,
      setLoadingListings,
      setListingsError,
      connectWallet,
      disconnectWallet,
      updateBalance,
      toggleSidebar,
      setSidebarCollapsed,
      setTheme,
      addNotification,
      removeNotification,
      clearNotifications,
    },
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
}

// Convenience hooks
export function useListings() {
  const { state, actions } = useApp();
  return {
    listings: state.listings,
    isLoading: state.isLoadingListings,
    error: state.listingsError,
    addListing: actions.addListing,
    setListings: actions.setListings,
  };
}

export function useWallet() {
  const { state, actions } = useApp();
  return {
    wallet: state.wallet,
    connectWallet: actions.connectWallet,
    disconnectWallet: actions.disconnectWallet,
    updateBalance: actions.updateBalance,
  };
}

export function useNotifications() {
  const { state, actions } = useApp();
  return {
    notifications: state.notifications,
    addNotification: actions.addNotification,
    removeNotification: actions.removeNotification,
    clearNotifications: actions.clearNotifications,
  };
}
