'use client'

import Link from 'next/link'
import dynamic from 'next/dynamic'
import { Pill } from '@/components/pill'
import { Button } from '@/components/ui/button'
import { Navigation } from '@/components/navigation'
import { useState } from 'react'
import { Leva } from 'leva'
import { ErrorBoundary } from '@/components/error-boundary'
import { VerifyFlowSection } from '@/components/landing/verify-flow-section'
import { EvidenceMovesSection } from '@/components/landing/evidence-moves-section'
import { MarketplaceProofSection } from '@/components/landing/marketplace-proof-section'
import { FinalCtaSection } from '@/components/landing/final-cta-section'
import { DossierShell } from '@/components/landing/dossier-shell'
import { VerifiedTicker } from '@/components/landing/verified-ticker'

// The WebGL hero (react-three-fiber <Canvas>) must mount client-only. R3F's
// reconciler provisions the Canvas store via React context, and that reconciler
// only runs in the browser — server-rendering it leaves useThree/useFBO with a
// null store ("Hooks can only be used within the Canvas component"). ssr:false
// skips the server pass for this subtree. WebGL can't render on the server anyway.
const GL = dynamic(() => import('@/components/gl').then((m) => m.GL), {
  ssr: false,
})

// Annotated to satisfy Navigation's `items: NavItem[]` prop — `[]` alone
// infers `never[]`. Empty by design: the landing nav surface is Connect Wallet only.
const landingNavItems: { name: string; href: string }[] = []

export default function LandingPage() {
  const [hovering, setHovering] = useState(false)
  // Bumped on each Connect Wallet click to fire the directional ripple.
  const [rippleNonce, setRippleNonce] = useState(0)

  return (
    <>
      <Navigation
        items={landingNavItems}
        showConnectWallet={true}
        onConnectWalletClick={() => setRippleNonce((n) => n + 1)}
      />

      <main>
      {/* Hero Section with WebGL Background */}
      <div className="flex flex-col h-svh justify-between bg-black">
        {/* Decorative background — a chunk-load or WebGL failure must degrade
            to the plain black hero, not bubble to the root boundary and
            replace the whole landing page. */}
        <ErrorBoundary fallback={null}>
          <GL hovering={hovering} rippleNonce={rippleNonce} />
        </ErrorBoundary>

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
                onFocus={() => setHovering(true)}
                onBlur={() => setHovering(false)}
              >
                [Join Waitlist]
              </Button>
            </Link>
            <Link href="/marketplace">
              <Button
                variant="outline"
                onMouseEnter={() => setHovering(true)}
                onMouseLeave={() => setHovering(false)}
                onFocus={() => setHovering(true)}
                onBlur={() => setHovering(false)}
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
                onFocus={() => setHovering(true)}
                onBlur={() => setHovering(false)}
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
                onFocus={() => setHovering(true)}
                onBlur={() => setHovering(false)}
              >
                [Marketplace]
              </Button>
            </Link>
          </div>
        </div>
      </div>

      {/* Scroll-told product story below the hero — one continuous case
          file on chart paper. DossierShell paints the ambient layer (grid,
          scanlines, marginalia rails) and tracks the active section via
          the data-dossier-sec markers. The single ticker is a SIBLING
          between sections — never inside VerifyFlowSection's scrub track,
          whose progress math depends on its own rect height. */}
      <DossierShell>
        <div data-dossier-sec="verify">
          <VerifyFlowSection />
        </div>
        <VerifiedTicker />
        <div data-dossier-sec="moves">
          <EvidenceMovesSection />
        </div>
        <div data-dossier-sec="proof">
          <MarketplaceProofSection />
        </div>
        <div data-dossier-sec="cta">
          <FinalCtaSection />
        </div>
      </DossierShell>
      </main>

      <Leva hidden />
    </>
  )
}
