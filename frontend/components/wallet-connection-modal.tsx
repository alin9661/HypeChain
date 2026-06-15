'use client'

import { useState, useEffect } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { usePrivy } from '@privy-io/react-auth'
import { Button } from '@/components/ui/button'
import { px } from './utils'

interface WalletOption {
  name: 'MetaMask' | 'Phantom'
  icon: React.ReactNode
  detected: boolean
}

interface WalletConnectionModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function WalletConnectionModal({ open, onOpenChange }: WalletConnectionModalProps) {
  const [dontShowAgain, setDontShowAgain] = useState(false)
  const { connectWallet, ready } = usePrivy()

  const walletOptions: WalletOption[] = [
    {
      name: 'Phantom',
      icon: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="10" fill="#AB9FF2"/>
          <path d="M8 10L10 8L12 10L14 8L16 10" stroke="white" strokeWidth="2" strokeLinecap="round"/>
        </svg>
      ),
      detected: typeof window !== 'undefined' && 'solana' in window,
    },
    {
      name: 'MetaMask',
      icon: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="10" fill="#F6851B"/>
          <path d="M12 6L9 12H15L12 6Z" fill="white"/>
          <path d="M12 18L9 12H15L12 18Z" fill="white" opacity="0.7"/>
        </svg>
      ),
      detected: typeof window !== 'undefined' && 'ethereum' in window,
    },
  ]

  useEffect(() => {
    // Check if user dismissed the modal
    const dismissed = localStorage.getItem('wallet-modal-dismissed')
    if (dismissed === 'true') {
      setDontShowAgain(true)
    }
  }, [])

  const handleConnectWallet = () => {
    if (dontShowAgain) {
      localStorage.setItem('wallet-modal-dismissed', 'true')
    }
    connectWallet()
    onOpenChange(false)
  }

  const polyRoundness = 12

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[100]" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[101] w-full max-w-md p-8 bg-card border border-border rounded-lg focus:outline-none"
          style={{
            clipPath: `polygon(${polyRoundness}px 0, calc(100% - ${polyRoundness}px) 0, 100% 0, 100% calc(100% - ${polyRoundness}px), calc(100% - ${polyRoundness}px) 100%, 0 100%, 0 calc(100% - ${polyRoundness}px), 0 ${polyRoundness}px)`,
          }}
        >
          <div className="space-y-6">
            {/* Header */}
            <div className="text-center space-y-2">
              <Dialog.Title className="text-2xl font-mono font-bold text-foreground">
                Connect Your Wallet
              </Dialog.Title>
              <Dialog.Description className="text-sm text-muted-foreground">
                Connect your wallet to buy, sell, and mint verified listings.
              </Dialog.Description>
            </div>

            {/* Wallet Options */}
            <div className="space-y-3">
              {walletOptions.map((wallet) => (
                <div
                  key={wallet.name}
                  className="flex items-center justify-between p-4 bg-secondary border border-border rounded-md hover:border-primary/50 transition-colors cursor-pointer group"
                  style={{
                    clipPath: `polygon(${polyRoundness/2}px 0, calc(100% - ${polyRoundness/2}px) 0, 100% 0, 100% calc(100% - ${polyRoundness/2}px), calc(100% - ${polyRoundness/2}px) 100%, 0 100%, 0 calc(100% - ${polyRoundness/2}px), 0 ${polyRoundness/2}px)`,
                  }}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 flex items-center justify-center">
                      {wallet.icon}
                    </div>
                    <span className="font-mono text-foreground group-hover:text-primary transition-colors">
                      {wallet.name}
                    </span>
                  </div>
                  {wallet.detected && (
                    <span className="text-xs font-mono text-muted-foreground bg-muted px-2 py-1 rounded">
                      Detected
                    </span>
                  )}
                </div>
              ))}
            </div>

            {/* Connect Button */}
            <Button
              onClick={handleConnectWallet}
              disabled={!ready}
              className="w-full"
            >
              [CONNECT WALLET]
            </Button>

            {/* Don't Show Again */}
            <label className="flex items-center justify-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={dontShowAgain}
                onChange={(e) => setDontShowAgain(e.target.checked)}
                className="w-4 h-4 rounded border-border bg-secondary text-primary focus:ring-primary focus:ring-offset-0"
              />
              <span className="text-sm font-mono text-muted-foreground">
                Don't show again
              </span>
            </label>
          </div>

          <Dialog.Close className="absolute right-4 top-4 text-muted-foreground hover:text-foreground transition-colors">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path d="M18 6L6 18M6 6l12 12" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
