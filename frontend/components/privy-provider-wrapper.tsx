'use client'

import { PrivyProvider, type PrivyClientConfig } from '@privy-io/react-auth'
import { toSolanaWalletConnectors } from '@privy-io/react-auth/solana'
import { useMemo, type ReactNode } from 'react'

export function PrivyProviderWrapper({ children }: { children: ReactNode }) {
  // Fail fast on misconfigured production builds: booting a wallet-auth app
  // against the placeholder ID would fail every auth attempt silently at
  // runtime. Dev/test keep the placeholder so local work doesn't need the env.
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID
  if (!appId && process.env.NODE_ENV === 'production') {
    throw new Error(
      'NEXT_PUBLIC_PRIVY_APP_ID is not set — Privy auth cannot initialize in production'
    )
  }

  // Memoize so the connector list and the config object keep a STABLE identity
  // across re-renders. PrivyProvider keys WalletConnect's one-time init off the
  // config reference; a fresh object literal every render makes it re-init
  // ("WalletConnect Core is already initialized... Init() was called 2 times").
  const solanaConnectors = useMemo(
    () => toSolanaWalletConnectors({ shouldAutoConnect: true }),
    []
  )

  const config = useMemo<PrivyClientConfig>(
    () => ({
      appearance: {
        walletChainType: 'ethereum-and-solana',
        walletList: ['metamask', 'phantom'],
        theme: 'dark',
        accentColor: '#EBC658',
        logo: '/icon.svg',
      },
      externalWallets: {
        solana: {
          connectors: solanaConnectors,
        },
      },
      embeddedWallets: {
        ethereum: { createOnLogin: 'off' },
        solana: { createOnLogin: 'off' },
      },
      loginMethods: ['wallet'],
    }),
    [solanaConnectors]
  )

  return (
    <PrivyProvider appId={appId || 'your-privy-app-id'} config={config}>
      {children}
    </PrivyProvider>
  )
}
