'use client'

import { useMemo } from 'react'
import Link from 'next/link'
import { Navigation } from '@/components/navigation'
import { CaseFileRibbon } from '@/components/case-file-ribbon'
import { useListings, type NFTListing } from '@/contexts/AppContext'

const marketplaceNavItems = [
  { name: 'Marketplace', href: '/marketplace' },
  { name: 'Collections', href: '/collections' },
  { name: 'Activities', href: '/activities' },
  { name: 'My Listings', href: '/listings' },
]

// ─────────────────────────────────────────────────────────────
// Marketplace data derivations.
// Lifted out of the page component so they can be unit-tested
// independently and shared with future components (extracted
// subcomponents, virtualized rows, e2e fixtures).
// ─────────────────────────────────────────────────────────────

type Status = 'verified' | 'pending'
type StatusFilter = 'all' | 'verified' | 'pending'
type SortKey = 'price-asc' | 'price-desc' | 'recent' | 'confidence'

// A listing is verified the instant it has a mint address. Mirrors
// /listings page.tsx:22–24 so both surfaces classify the same row
// identically.
function deriveStatus(listing: NFTListing): Status {
  return listing.nft_mint_address ? 'verified' : 'pending'
}

// HC-YYYY-NNNNNN forensic case number. Mirrors /listings page.tsx:26–30.
// Pads the numeric portion of the id to 6 digits; if the id has no
// digits, takes the first 6 chars uppercased so every case gets a label.
function caseNumber(id: string): string {
  const numeric = id.replace(/[^0-9]/g, '')
  const padded =
    numeric.length > 0
      ? numeric.padStart(6, '0').slice(-6)
      : id.slice(0, 6).toUpperCase()
  return `HC-${new Date().getFullYear()}-${padded}`
}

// 4...4 char ellipsis for wallet/mint addresses. Returns the original
// when the input is null/short. Mirrors /listings page.tsx:32–35.
function shortAddr(addr: string | null | undefined): string {
  if (!addr) return '—'
  if (addr.length <= 10) return addr
  return `${addr.slice(0, 4)}…${addr.slice(-4)}`
}

// UPPERCASE relative time, e.g. "12M AGO" / "3H AGO" / "YESTERDAY".
// Mirrors /listings page.tsx:37–47 so the marketplace and intake bay
// timestamps render identically.
function timeAgo(iso: string): string {
  const d = new Date(iso)
  const diffMs = Date.now() - d.getTime()
  const m = Math.floor(diffMs / 60_000)
  if (m < 1) return 'JUST NOW'
  if (m < 60) return `${m}M AGO`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}H AGO`
  const days = Math.floor(h / 24)
  return days === 1 ? 'YESTERDAY' : `${days}D AGO`
}

// Deterministic placeholder confidence per id. Backend doesn't yet
// expose ai_confidence_score on the list endpoint; once it does, both
// /marketplace and /listings can read the real value and this helper
// goes away. Deterministic-per-id so the value doesn't shuffle on every
// rerender, which would flicker confidence bars during virtual-scroll.
function placeholderConfidence(status: Status, id: string): number | null {
  if (status !== 'verified') return null
  const seed = id.split('').reduce((s, c) => s + c.charCodeAt(0), 0)
  return 92 + (seed % 80) / 10
}

// Suppress unused-symbol warnings — these helpers + types are landed
// in this commit so the next commit (table chrome) can consume them
// without dragging in unrelated logic. Bisect-friendly seam.
void caseNumber
void shortAddr
void timeAgo
void placeholderConfidence
const _unusedTypeReexport: SortKey | undefined = undefined
void _unusedTypeReexport

export default function MarketplacePage() {
  const { listings } = useListings()

  const counts = useMemo(() => {
    const verified = listings.filter((l) => deriveStatus(l) === 'verified').length
    return {
      all: listings.length,
      verified,
      pending: listings.length - verified,
    }
  }, [listings])

  const kpis = useMemo(() => {
    const verifiedListings = listings.filter((l) => deriveStatus(l) === 'verified')
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
