'use client'

import Link from 'next/link'
import { GL } from '@/components/gl'
import { Pill } from '@/components/pill'
import { Button } from '@/components/ui/button'
import { Navigation } from '@/components/navigation'
import { useState } from 'react'
import { Leva } from 'leva'

const landingNavItems = []

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

          {/* Desktop Buttons */}
          <div className="flex gap-4 justify-center mt-14 max-sm:hidden">
            <Link href="/waitlist">
              <Button
                onMouseEnter={() => setHovering(true)}
                onMouseLeave={() => setHovering(false)}
              >
                [Join Waitlist]
              </Button>
            </Link>
            <Link href="/marketplace">
              <Button
                variant="outline"
                onMouseEnter={() => setHovering(true)}
                onMouseLeave={() => setHovering(false)}
              >
                [Marketplace]
              </Button>
            </Link>
          </div>

          {/* Mobile Buttons */}
          <div className="flex gap-3 justify-center mt-14 sm:hidden">
            <Link href="/waitlist">
              <Button
                size="sm"
                onMouseEnter={() => setHovering(true)}
                onMouseLeave={() => setHovering(false)}
              >
                [Join Waitlist]
              </Button>
            </Link>
            <Link href="/marketplace">
              <Button
                size="sm"
                variant="outline"
                onMouseEnter={() => setHovering(true)}
                onMouseLeave={() => setHovering(false)}
              >
                [Marketplace]
              </Button>
            </Link>
          </div>
        </div>
      </div>

      <Leva hidden />
    </>
  )
}
