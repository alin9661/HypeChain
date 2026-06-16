'use client';

import React, { createContext, useContext, useState, useCallback, ReactNode, useEffect, useRef } from 'react';
import { usePrivy } from '@privy-io/react-auth';
// HypeChain is a Solana app — wallet identity must come from Privy's Solana
// hook. The base `useWallets()` only surfaces EVM wallets, so a Phantom
// sign-in yields no usable address (see fix: register/create-listing 400s).
import { useWallets as useSolanaWallets } from '@privy-io/react-auth/solana';
import { CreateListingResponse, UserProfile, apiClient } from '@/lib/api-client';

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

  // User Profile
  userProfile: UserProfile | null;
  isRegistering: boolean;
  registrationError: string | null;

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
  userProfile: null,
  isRegistering: false,
  registrationError: null,
  sidebarCollapsed: false,
  theme: 'dark',
  notifications: [],
};

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppState>(initialState);
  const { authenticated, user } = usePrivy();
  const { ready: walletsReady, wallets } = useSolanaWallets();
  const registrationAttempted = useRef<Set<string>>(new Set());

  // Sync Privy wallet state and register user
  useEffect(() => {
    const registerUserAccount = async () => {
      if (authenticated && walletsReady && user && wallets.length > 0) {
        const primaryWallet = wallets[0];
        const address = primaryWallet.address;
        const chainType = 'solana' as const;

        // Guard against a partial/early Privy state: never POST registration
        // with missing fields (the backend rejects with "Missing required
        // fields", which is exactly the 400 this fix targets).
        if (!address || !user.id) {
          return;
        }

        // Update wallet state immediately for UI responsiveness
        setState((prev) => ({
          ...prev,
          wallet: {
            address,
            connected: true,
            balance: prev.wallet.balance,
          },
        }));

        // Check if user is already registered (avoid duplicate API calls)
        if (registrationAttempted.current.has(address)) {
          console.log('[User Registration] User already registered, skipping...');
          return;
        }

        // Mark as attempted to prevent duplicate registrations
        registrationAttempted.current.add(address);

        // Register user with backend
        console.log('[User Registration] Starting registration for:', address);
        setState((prev) => ({ ...prev, isRegistering: true, registrationError: null }));

        try {
          const response = await apiClient.registerUser({
            walletAddress: address,
            privyUserId: user.id,
            chainType: chainType,
            email: user.email?.address,
          });

          if (response.success && response.data) {
            console.log('[User Registration] Success:', response.data.user);

            setState((prev) => ({
              ...prev,
              userProfile: response.data!.user,
              isRegistering: false,
              registrationError: null,
            }));

            // Show welcome notification
            addNotification({
              type: 'success',
              message: response.data.user.isNewUser
                ? '🎉 Welcome! Your account has been created.'
                : '👋 Welcome back!',
            });
          } else {
            throw new Error(response.error || 'Registration failed');
          }
        } catch (error) {
          console.error('[User Registration] Error:', error);

          const errorMsg = error instanceof Error ? error.message : 'Failed to register user';

          setState((prev) => ({
            ...prev,
            isRegistering: false,
            registrationError: errorMsg,
          }));

          addNotification({
            type: 'error',
            message: `Registration failed: ${errorMsg}`,
          });
        }
      } else {
        // Clear user when disconnected
        setState((prev) => ({
          ...prev,
          wallet: {
            address: null,
            connected: false,
            balance: null,
          },
          userProfile: null,
          isRegistering: false,
          registrationError: null,
        }));
      }
    };

    registerUserAccount();
  }, [authenticated, walletsReady, user, wallets]);

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
