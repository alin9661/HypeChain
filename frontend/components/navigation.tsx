'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { usePrivy, useWallets } from '@privy-io/react-auth'
import { Menu, X } from 'lucide-react'
import { WalletConnectionModal } from './wallet-connection-modal'
import { WalletConnectButton } from './wallet-connect-button'
import { WalletDropdown } from './wallet-dropdown'
import { useWallet } from '@/contexts/AppContext'

interface NavItem {
  name: string
  href: string
}

interface NavigationProps {
  items: NavItem[]
  showConnectWallet?: boolean
}

export function Navigation({ items, showConnectWallet = true }: NavigationProps) {
  const pathname = usePathname()
  const { wallet } = useWallet()
  const { authenticated } = usePrivy()
  const { wallets } = useWallets()
  const [isWalletModalOpen, setIsWalletModalOpen] = useState(false)
  const [isMenuOpen, setIsMenuOpen] = useState(false)

  // Read wallet state directly from Privy (source of truth)
  const privyWalletAddress = wallets.length > 0 ? wallets[0].address : null
  const isConnected = authenticated && privyWalletAddress !== null
  const displayAddress = privyWalletAddress || wallet.address

  // Close mobile menu on route change or viewport >= lg
  useEffect(() => {
    setIsMenuOpen(false)
  }, [pathname])

  useEffect(() => {
    const mql = window.matchMedia('(min-width: 1024px)')
    const handler = (e: MediaQueryListEvent) => {
      if (e.matches) setIsMenuOpen(false)
    }
    mql.addEventListener('change', handler)
    return () => mql.removeEventListener('change', handler)
  }, [])

  return (
    <div className="fixed z-50 pt-8 md:pt-14 top-0 left-0 w-full bg-black/80 backdrop-blur-md">
      <header className="flex items-center justify-between container mx-auto px-4 md:px-8">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-3 z-50">
          <span className="text-xl font-bold font-mono text-white">
            HypeChain
          </span>
        </Link>

        {/* Desktop Navigation */}
        <nav className="flex max-lg:hidden absolute left-1/2 -translate-x-1/2 items-center justify-center gap-x-10">
          {items.map((item) => {
            const isActive = pathname === item.href
            return (
              <Link
                key={item.name}
                className={`uppercase inline-block font-mono text-sm transition-colors ease-out duration-150 ${
                  isActive
                    ? 'text-[#D4A82C]'
                    : 'text-white/60 hover:text-white/100'
                }`}
                href={item.href}
              >
                {item.name}
              </Link>
            )
          })}
        </nav>

        {/* Right cluster: wallet button + mobile hamburger */}
        <div className="flex items-center gap-3">
          {showConnectWallet && (
            isConnected && displayAddress ? (
              <WalletDropdown address={displayAddress} />
            ) : (
              <WalletConnectButton onClick={() => setIsWalletModalOpen(true)} />
            )
          )}
          <button
            type="button"
            onClick={() => setIsMenuOpen((open) => !open)}
            aria-label={isMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
            aria-expanded={isMenuOpen}
            aria-controls="mobile-nav-menu"
            className="lg:hidden inline-flex h-10 w-10 items-center justify-center transition-colors"
            style={{
              color: isMenuOpen ? 'var(--hc-accent)' : 'var(--hc-text)',
              background: 'transparent',
              border: '1px solid var(--hc-border)',
              clipPath:
                'polygon(6px 0, 100% 0, 100% calc(100% - 6px), calc(100% - 6px) 100%, 0 100%, 0 6px)',
            }}
          >
            {isMenuOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </button>
        </div>
      </header>

      {/* Mobile Menu — vertical column anchored under header */}
      {isMenuOpen && (
        <nav
          id="mobile-nav-menu"
          className="lg:hidden mt-3 mx-4 md:mx-8 animate-in fade-in slide-in-from-top-2 duration-200"
          style={{
            background: 'var(--hc-surface-1)',
            border: '1px solid var(--hc-border)',
          }}
          aria-label="Mobile navigation"
        >
          <ul>
            {items.map((item) => {
              const isActive = pathname === item.href
              return (
                <li key={item.name}>
                  <Link
                    href={item.href}
                    onClick={() => setIsMenuOpen(false)}
                    className="flex items-center justify-between px-5 py-4 font-mono text-[12px] uppercase tracking-[0.14em] transition-colors"
                    style={{
                      color: isActive ? 'var(--hc-accent)' : 'var(--hc-text-body)',
                      borderBottom: '1px solid var(--hc-hairline)',
                    }}
                  >
                    <span>{item.name}</span>
                    <span
                      aria-hidden
                      style={{
                        color: isActive ? 'var(--hc-accent)' : 'var(--hc-text-muted)',
                      }}
                    >
                      →
                    </span>
                  </Link>
                </li>
              )
            })}
          </ul>
        </nav>
      )}

      {/* Wallet Connection Modal */}
      <WalletConnectionModal
        open={isWalletModalOpen}
        onOpenChange={setIsWalletModalOpen}
      />
    </div>
  )
}
