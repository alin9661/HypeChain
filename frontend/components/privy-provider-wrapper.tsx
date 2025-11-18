'use client'

import { PrivyProvider } from '@privy-io/react-auth'
import { toSolanaWalletConnectors } from '@privy-io/react-auth/solana'
import type { ReactNode } from 'react'

export function PrivyProviderWrapper({ children }: { children: ReactNode }) {
  const solanaConnectors = toSolanaWalletConnectors({
    shouldAutoConnect: true,
  })

  return (
    <PrivyProvider
      appId={process.env.NEXT_PUBLIC_PRIVY_APP_ID || 'your-privy-app-id'}
      config={{
        appearance: {
          walletChainType: 'ethereum-and-solana',
          walletList: ['metamask', 'phantom'],
          theme: 'dark',
          accentColor: '#FFC700',
          logo: '/icon.svg',
        },
        externalWallets: {
          solana: {
            connectors: solanaConnectors,
          },
        },
        embeddedWallets: {
          createOnLogin: 'off',
        },
        loginMethods: ['wallet'],
      }}
    >
      {children}
    </PrivyProvider>
  )
}
