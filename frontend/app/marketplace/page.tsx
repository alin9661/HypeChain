'use client'

import { useMemo } from 'react'
import Link from 'next/link'
import { Navigation } from '@/components/navigation'
import { CaseFileRibbon } from '@/components/case-file-ribbon'
import { useListings } from '@/contexts/AppContext'

const marketplaceNavItems = [
  { name: 'Marketplace', href: '/marketplace' },
  { name: 'Collections', href: '/collections' },
  { name: 'Activities', href: '/activities' },
  { name: 'My Listings', href: '/listings' },
]

export default function MarketplacePage() {
  const { listings } = useListings()

  const counts = useMemo(() => {
    const verified = listings.filter((l) => Boolean(l.nft_mint_address)).length
    return {
      all: listings.length,
      verified,
      pending: listings.length - verified,
    }
  }, [listings])

  // KPIs are derived from useListings(). volume24h is a SUM not an
  // average — it's the total USDC value of listings created in the
  // last 24h. floor is the minimum verified-listing price. throughput
  // is a placeholder until backend ships a real metric on the list
  // endpoint (same trick as /listings page.tsx:624).
  const kpis = useMemo(() => {
    const verifiedListings = listings.filter((l) => Boolean(l.nft_mint_address))
    const prices = verifiedListings
      .map((l) => Number(l.listing_price_sol))
      .filter((n) => Number.isFinite(n) && n > 0)
    const floor = prices.length > 0 ? Math.min(...prices) : null

    const dayAgo = Date.now() - 24 * 60 * 60 * 1000
    const volume24h = listings
      .filter((l) => new Date(l.createdAt).getTime() > dayAgo)
      .reduce((sum, l) => {
        const n = Number(l.listing_price_sol)
        return Number.isFinite(n) ? sum + n : sum
      }, 0)

    return {
      volume24h,
      floor,
      activeListings: listings.length,
      throughputPerSec: 3.4,
    }
  }, [listings])

  return (
    <>
      <Navigation items={marketplaceNavItems} showConnectWallet={true} />

      <div className="min-h-screen pt-24 md:pt-28" style={{ background: 'var(--hc-bg)' }}>
        <CaseFileRibbon caseId={null} />

        <main className="mx-auto w-full max-w-[1536px] px-4 pb-24 pt-6 md:px-8 md:pt-8">

          {/* Header now uses a 5-col grid: 1.4fr for the editorial hero
              + 4 equal columns for KPI cells. Stacks to 1 col on <lg. */}
          <header
            className="grid grid-cols-1 gap-6 border-b pb-8 lg:grid-cols-[1.4fr_repeat(4,1fr)] lg:items-end lg:gap-6"
            style={{ borderColor: 'var(--hc-hairline)' }}
            aria-label="Market summary"
          >
            <div>
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
                <span style={{ color: 'var(--hc-verify-high)' }}>● {counts.verified}</span>{' '}
                cleared · {counts.pending} pending intake · 0 disputed mints
              </p>
            </div>

            <KpiCell
              label="24h Volume"
              value={kpis.volume24h > 0 ? kpis.volume24h.toFixed(1) : '—'}
              unit="USDC"
              delta={kpis.volume24h > 0 ? '▲ 24h flow' : 'no flow last 24h'}
              deltaTone={kpis.volume24h > 0 ? 'up' : 'flat'}
              barPct={Math.min(72, kpis.volume24h)}
            />
            <KpiCell
              label="Floor (Verified)"
              value={kpis.floor !== null ? kpis.floor.toFixed(2) : '—'}
              unit="USDC"
              delta={kpis.floor !== null ? 'lowest cleared price' : 'awaiting first verify'}
              deltaTone="flat"
              barPct={kpis.floor !== null ? 42 : 0}
            />
            <KpiCell
              label="Active Listings"
              value={String(kpis.activeListings).padStart(2, '0')}
              unit={kpis.activeListings === 1 ? 'dossier' : 'dossiers'}
              delta={counts.pending > 0 ? `${counts.pending} in queue` : 'queue clear'}
              deltaTone="flat"
              barPct={Math.min(88, kpis.activeListings * 10)}
            />
            <KpiCell
              label="AI Throughput"
              value={kpis.throughputPerSec.toFixed(1)}
              unit="/ sec"
              delta="VISION-4O live"
              deltaTone="up"
              barPct={95}
              valueTone="verify-high"
            />
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

// ─────────────────────────────────────────────────────────────
// KpiCell — single market-summary stat in the header strip.
// Value uses tabular-nums so the digits don't shift width when the
// underlying numbers change.
// ─────────────────────────────────────────────────────────────

function KpiCell({
  label,
  value,
  unit,
  delta,
  deltaTone,
  barPct,
  valueTone,
}: {
  label: string
  value: string
  unit?: string
  delta: string
  deltaTone: 'up' | 'down' | 'flat'
  barPct: number
  valueTone?: 'verify-high'
}) {
  const deltaColor =
    deltaTone === 'up'
      ? 'var(--hc-verify-high)'
      : deltaTone === 'down'
        ? 'var(--hc-verify-low)'
        : 'var(--hc-text-muted)'
  const valueColor = valueTone === 'verify-high' ? 'var(--hc-verify-high)' : 'var(--hc-text)'
  return (
    <div className="flex flex-col gap-1.5">
      <span className="font-mono text-[10px] uppercase tracking-[0.14em]" style={{ color: 'var(--hc-text-muted)' }}>
        {label}
      </span>
      <span
        className="font-mono leading-none tabular-nums"
        style={{ color: valueColor, fontSize: 22, fontWeight: 500 }}
      >
        {value}
        {unit && (
          <span className="ml-1 font-mono text-[12px]" style={{ color: 'var(--hc-text-muted)', fontWeight: 400 }}>
            {unit}
          </span>
        )}
      </span>
      <span
        className="font-mono text-[11px] uppercase tracking-[0.06em] tabular-nums"
        style={{ color: deltaColor }}
      >
        {delta}
      </span>
      <span aria-hidden className="relative mt-0.5 block h-[3px]" style={{ background: 'var(--hc-hairline)' }}>
        <span
          className="absolute inset-y-0 left-0"
          style={{
            background: valueTone === 'verify-high' ? 'var(--hc-verify-high)' : 'var(--hc-accent)',
            width: `${Math.max(0, Math.min(100, barPct))}%`,
          }}
        />
      </span>
    </div>
  )
}
