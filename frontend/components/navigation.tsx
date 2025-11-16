'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

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

  return (
    <div className="fixed z-50 pt-8 md:pt-14 top-0 left-0 w-full bg-black/80 backdrop-blur-md">
      <header className="flex items-center justify-between container mx-auto px-4 md:px-8">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-3 z-50">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-[#FFC700] to-[#FFD700] shadow-lg">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              className="h-6 w-6 text-black"
              aria-hidden="true"
            >
              <path
                d="M13 2L3 14h8l-1 8 10-12h-8l1-8z"
                fill="currentColor"
              />
            </svg>
          </div>
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
                    ? 'text-[#FFC700]'
                    : 'text-white/60 hover:text-white/100'
                }`}
                href={item.href}
              >
                {item.name}
              </Link>
            )
          })}
        </nav>

        {/* Connect Wallet / Sign In */}
        {showConnectWallet && (
          <>
            <Link
              className="uppercase max-lg:hidden transition-colors ease-out duration-150 font-mono text-[#FFC700] hover:text-[#FFC700]/80 text-sm"
              href="/dashboard"
            >
              Connect Wallet
            </Link>

            {/* Mobile Connect Wallet */}
            <Link
              href="/dashboard"
              className="lg:hidden uppercase font-mono text-[#FFC700] hover:text-[#FFC700]/80 text-sm"
            >
              Connect Wallet
            </Link>
          </>
        )}
      </header>
    </div>
  )
}
