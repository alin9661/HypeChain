'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { usePrivy } from '@privy-io/react-auth'
import { useWallet } from '@/contexts/AppContext'

interface WalletDropdownProps {
  address: string
}

export function WalletDropdown({ address }: WalletDropdownProps) {
  const router = useRouter()
  const { logout } = usePrivy()
  const { disconnectWallet } = useWallet()
  const [open, setOpen] = useState(false)

  const truncateAddress = (addr: string) => {
    return `${addr.slice(0, 4)}...${addr.slice(-4)}`
  }

  const handleDisconnect = async () => {
    try {
      await logout()
      disconnectWallet()
      setOpen(false)
      router.push('/')
    } catch (error) {
      console.error('Error disconnecting wallet:', error)
    }
  }

  const handleChangeWallet = async () => {
    try {
      await logout()
      disconnectWallet()
      setOpen(false)
      // After disconnecting, the navigation will automatically show the WalletConnectionModal
    } catch (error) {
      console.error('Error changing wallet:', error)
    }
  }

  const handleNavigation = (path: string) => {
    setOpen(false)
    router.push(path)
  }

  return (
    <DropdownMenu.Root open={open} onOpenChange={setOpen}>
      <DropdownMenu.Trigger asChild>
        <button
          className="uppercase font-mono text-[#D4A82C] text-sm px-4 py-2 border border-[#D4A82C]/30 rounded-md hover:bg-[#D4A82C]/5 transition-colors focus:outline-none focus:ring-2 focus:ring-[#D4A82C]/50"
          aria-label="Wallet menu"
        >
          {truncateAddress(address)}
        </button>
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          className="min-w-[220px] bg-black border border-[#D4A82C]/30 rounded-md shadow-lg z-[200] overflow-hidden"
          sideOffset={8}
          align="end"
        >
          {/* Menu Items */}
          <div className="py-2">
            <DropdownMenu.Item
              className="px-4 py-3 text-sm font-mono text-white/80 hover:text-[#D4A82C] hover:bg-[#D4A82C]/5 cursor-pointer outline-none transition-colors uppercase flex items-center gap-2"
              onSelect={() => handleNavigation('/listings')}
            >
              <InventoryIcon />
              Listings
            </DropdownMenu.Item>

            <DropdownMenu.Item
              className="px-4 py-3 text-sm font-mono text-white/80 hover:text-[#D4A82C] hover:bg-[#D4A82C]/5 cursor-pointer outline-none transition-colors uppercase flex items-center gap-2"
              onSelect={() => handleNavigation('/sold')}
            >
              <SoldIcon />
              Sold
            </DropdownMenu.Item>

            <DropdownMenu.Separator className="h-px bg-[#D4A82C]/20 my-2" />

            <DropdownMenu.Item
              className="px-4 py-3 text-sm font-mono text-white/80 hover:text-[#D4A82C] hover:bg-[#D4A82C]/5 cursor-pointer outline-none transition-colors uppercase flex items-center gap-2"
              onSelect={() => handleNavigation('/settings')}
            >
              <SettingsIcon />
              App Settings
            </DropdownMenu.Item>

            <DropdownMenu.Item
              className="px-4 py-3 text-sm font-mono text-white/80 hover:text-[#D4A82C] hover:bg-[#D4A82C]/5 cursor-pointer outline-none transition-colors uppercase flex items-center gap-2"
              onSelect={handleChangeWallet}
            >
              <ChangeWalletIcon />
              Change Wallet
            </DropdownMenu.Item>

            <DropdownMenu.Item
              className="px-4 py-3 text-sm font-mono text-white/80 hover:text-[#D4A82C] hover:bg-[#D4A82C]/5 cursor-pointer outline-none transition-colors uppercase flex items-center gap-2"
              onSelect={handleDisconnect}
            >
              <DisconnectIcon />
              Disconnect
            </DropdownMenu.Item>
          </div>

          {/* Footer Section */}
          <DropdownMenu.Separator className="h-px bg-[#D4A82C]/20" />

          <div className="py-3 px-4 space-y-3 bg-black/50">
            {/* Social Icons */}
            <div className="flex items-center gap-4 justify-center">
              <a
                href="https://discord.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-white/60 hover:text-[#D4A82C] transition-colors"
                aria-label="Discord"
              >
                <DiscordIcon />
              </a>
              <a
                href="https://twitter.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-white/60 hover:text-[#D4A82C] transition-colors"
                aria-label="X (Twitter)"
              >
                <XIcon />
              </a>
            </div>

            {/* Footer Links */}
            <div className="flex flex-col gap-2 text-center">
              <a
                href="#"
                className="text-xs font-mono text-white/60 hover:text-[#D4A82C] transition-colors"
                onClick={(e) => {
                  e.preventDefault()
                  setOpen(false)
                }}
              >
                List Collection
              </a>
              <a
                href="#"
                className="text-xs font-mono text-white/60 hover:text-[#D4A82C] transition-colors"
                onClick={(e) => {
                  e.preventDefault()
                  setOpen(false)
                }}
              >
                Help Center
              </a>
              <a
                href="#"
                className="text-xs font-mono text-white/60 hover:text-[#D4A82C] transition-colors"
                onClick={(e) => {
                  e.preventDefault()
                  setOpen(false)
                }}
              >
                Careers
              </a>
              <a
                href="#"
                className="text-xs font-mono text-white/60 hover:text-[#D4A82C] transition-colors"
                onClick={(e) => {
                  e.preventDefault()
                  setOpen(false)
                }}
              >
                Terms of Service
              </a>
              <a
                href="#"
                className="text-xs font-mono text-white/60 hover:text-[#D4A82C] transition-colors"
                onClick={(e) => {
                  e.preventDefault()
                  setOpen(false)
                }}
              >
                Privacy Policy
              </a>
            </div>
          </div>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}

// Icon Components
function InventoryIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
    </svg>
  )
}

function SoldIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="10" />
      <path d="M12 6v6l4 2" strokeLinecap="round" />
    </svg>
  )
}

function SettingsIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="3" />
      <path d="M12 1v6m0 6v6M5.64 5.64l4.24 4.24m4.24 4.24l4.24 4.24M1 12h6m6 0h6M5.64 18.36l4.24-4.24m4.24-4.24l4.24-4.24" strokeLinecap="round" />
    </svg>
  )
}

function ChangeWalletIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M21 12V7H5a2 2 0 0 1 0-4h14v4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M3 5v14a2 2 0 0 0 2 2h16v-5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="18" cy="12" r="2" />
    </svg>
  )
}

function DisconnectIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" strokeLinecap="round" strokeLinejoin="round" />
      <polyline points="16 17 21 12 16 7" strokeLinecap="round" strokeLinejoin="round" />
      <line x1="21" y1="12" x2="9" y2="12" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function DiscordIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
      <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515a.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0a12.64 12.64 0 0 0-.617-1.25a.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057a19.9 19.9 0 0 0 5.993 3.03a.078.078 0 0 0 .084-.028a14.09 14.09 0 0 0 1.226-1.994a.076.076 0 0 0-.041-.106a13.107 13.107 0 0 1-1.872-.892a.077.077 0 0 1-.008-.128a10.2 10.2 0 0 0 .372-.292a.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127a12.299 12.299 0 0 1-1.873.892a.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028a19.839 19.839 0 0 0 6.002-3.03a.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419c0-1.333.956-2.419 2.157-2.419c1.21 0 2.176 1.096 2.157 2.42c0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419c0-1.333.955-2.419 2.157-2.419c1.21 0 2.176 1.096 2.157 2.42c0 1.333-.946 2.418-2.157 2.418z"/>
    </svg>
  )
}

function XIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
    </svg>
  )
}
