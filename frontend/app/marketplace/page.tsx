'use client'

import Link from 'next/link'
import { Navigation } from '@/components/navigation'
import { CaseFileRibbon } from '@/components/case-file-ribbon'

const marketplaceNavItems = [
  { name: 'Marketplace', href: '/marketplace' },
  { name: 'Collections', href: '/collections' },
  { name: 'Activities', href: '/activities' },
  { name: 'My Listings', href: '/listings' },
]

export default function MarketplacePage() {
  return (
    <>
      <Navigation items={marketplaceNavItems} showConnectWallet={true} />

      <div className="min-h-screen pt-24 md:pt-28" style={{ background: 'var(--hc-bg)' }}>
        <CaseFileRibbon caseId={null} />

        <main className="mx-auto w-full max-w-[1536px] px-4 pb-24 pt-6 md:px-8 md:pt-8">

          {/* EDITORIAL HERO
              Per DESIGN.md, Instrument Serif italic is reserved for editorial
              moments only. The marketplace title is one of those moments. */}
          <header
            className="border-b pb-8"
            style={{ borderColor: 'var(--hc-hairline)' }}
            aria-label="Market summary"
          >
            <div
              className="mb-4 flex items-center gap-3 font-mono text-[11px] uppercase tracking-[0.18em]"
              style={{ color: 'var(--hc-text-muted)' }}
            >
              <span
                className="inline-block px-1.5 py-0.5 text-[10px]"
                style={{
                  background: 'var(--hc-accent-tint)',
                  border: '1px solid var(--hc-accent-deep)',
                  color: 'var(--hc-accent)',
                }}
              >
                02
              </span>
              <span>Cleared Dossiers · Public Floor</span>
            </div>
            <h1
              className="italic leading-[1.02] tracking-[-0.01em]"
              style={{
                fontFamily: "'Instrument Serif', 'Sentient', serif",
                fontStyle: 'italic',
                fontWeight: 300,
                fontSize: 'clamp(36px, 5.5vw, 64px)',
                color: 'var(--hc-text)',
              }}
            >
              Verified physical-asset marketplace.
            </h1>
            <p
              className="mt-4 max-w-[60ch] font-mono text-[11px] uppercase tracking-[0.12em]"
              style={{ color: 'var(--hc-text-muted)' }}
            >
              Every listing carries a Certificate of Authenticity issued by VISION-4O.
            </p>
          </header>

          <div
            className="mt-24 flex flex-wrap items-center justify-between gap-5 border-t pt-8"
            style={{ borderColor: 'var(--hc-hairline)' }}
          >
            <div
              className="font-mono text-[11px] uppercase tracking-[0.14em]"
              style={{ color: 'var(--hc-text-muted)' }}
            >
              Hold something worth verifying?{' '}
              <strong className="font-medium" style={{ color: 'var(--hc-text)' }}>
                The intake bay
              </strong>{' '}
              examines real-world assets before mint.
            </div>
            <Link
              href="/listings"
              className="inline-flex h-11 items-center gap-2 px-5 font-mono text-[12px] uppercase tracking-[0.14em] transition-all duration-200 hover:gap-3 hover:text-[var(--hc-accent)]"
              style={{
                color: 'var(--hc-text)',
                background: 'transparent',
                border: '1px solid var(--hc-border)',
                clipPath:
                  'polygon(10px 0, 100% 0, 100% calc(100% - 10px), calc(100% - 10px) 100%, 0 100%, 0 10px)',
              }}
            >
              File New Intake →
            </Link>
          </div>
        </main>
      </div>
    </>
  )
}
