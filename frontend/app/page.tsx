'use client'

import Link from 'next/link'
import { GL } from '@/components/gl'
import { Pill } from '@/components/pill'
import { Button } from '@/components/ui/button'
import { Navigation } from '@/components/navigation'
import { useState } from 'react'
import { Leva } from 'leva'

const landingNavItems = [
  { name: 'Marketplace', href: '/marketplace' },
  { name: 'Collections', href: '/collections' },
  { name: 'Activities', href: '/activities' },
]

export default function LandingPage() {
  const [hovering, setHovering] = useState(false)

  return (
    <>
      <Navigation items={landingNavItems} showConnectWallet={true} />

      {/* Hero Section with WebGL Background */}
      <div className="flex flex-col h-svh justify-between bg-black">
        <GL hovering={hovering} />

        <div className="pb-16 mt-auto text-center relative z-10 px-4">
          <Pill className="mb-6">BETA RELEASE</Pill>
          <h1 className="text-5xl sm:text-6xl md:text-7xl font-mono text-white">
            Unlock your <br />
            marketplace
          </h1>
          <p className="font-mono text-sm sm:text-base text-white/60 text-balance mt-8 max-w-[440px] mx-auto">
            Trade NFTs with AI-powered insights and lightning-fast transactions on Solana
          </p>

          {/* Desktop Button */}
          <Link className="contents max-sm:hidden" href="/dashboard">
            <Button
              className="mt-14"
              onMouseEnter={() => setHovering(true)}
              onMouseLeave={() => setHovering(false)}
            >
              [Join Waitlist]
            </Button>
          </Link>

          {/* Mobile Button */}
          <Link className="contents sm:hidden" href="/dashboard">
            <Button
              size="sm"
              className="mt-14"
              onMouseEnter={() => setHovering(true)}
              onMouseLeave={() => setHovering(false)}
            >
              [Join Waitlist]
            </Button>
          </Link>
        </div>
      </div>

      <Leva hidden />
    </>
  )
}
