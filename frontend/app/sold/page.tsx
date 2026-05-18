'use client'

import Link from 'next/link'
import { Navigation } from '@/components/navigation'
import { Button } from '@/components/ui/button'

const soldNavItems = [
  { name: 'Marketplace', href: '/marketplace' },
  { name: 'Collections', href: '/collections' },
  { name: 'Activities', href: '/activities' },
]

export default function SoldPage() {
  return (
    <>
      <Navigation items={soldNavItems} showConnectWallet={true} />

      <div className="flex flex-col min-h-screen bg-black">
        <div className="flex-1 flex items-center justify-center px-4 pt-32">
          <div className="text-center max-w-2xl">
            <h1 className="text-4xl sm:text-5xl md:text-6xl font-mono text-white mb-6">
              Sold Items
            </h1>
            <p className="font-mono text-sm sm:text-base text-white/60 text-balance mb-8">
              Track your successful NFT sales and transaction history
            </p>

            <div className="inline-flex items-center gap-2 px-6 py-3 bg-[#D4A82C]/10 border border-[#D4A82C]/30 rounded-md">
              <svg
                className="animate-spin h-5 w-5 text-[#D4A82C]"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
              <span className="font-mono text-[#D4A82C] text-sm uppercase">
                Coming Soon
              </span>
            </div>

            <div className="mt-12">
              <Link href="/marketplace">
                <Button>
                  [Browse Marketplace]
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
