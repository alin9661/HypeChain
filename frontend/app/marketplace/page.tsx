'use client'

import { useMemo } from 'react'
import Link from 'next/link'
import { Navigation } from '@/components/navigation'
import { CaseFileRibbon } from '@/components/case-file-ribbon'
import { RedactedField } from '@/components/redacted-field'
import { useListings, useWallet, type NFTListing } from '@/contexts/AppContext'

const marketplaceNavItems = [
  { name: 'Marketplace', href: '/marketplace' },
  { name: 'Collections', href: '/collections' },
  { name: 'Activities', href: '/activities' },
  { name: 'My Listings', href: '/listings' },
]

// ─────────────────────────────────────────────────────────────
// Marketplace data derivations.
// ─────────────────────────────────────────────────────────────

type Status = 'verified' | 'pending'
type StatusFilter = 'all' | 'verified' | 'pending'
type SortKey = 'price-asc' | 'price-desc' | 'recent' | 'confidence'

function deriveStatus(listing: NFTListing): Status {
  return listing.nft_mint_address ? 'verified' : 'pending'
}

function caseNumber(id: string): string {
  const numeric = id.replace(/[^0-9]/g, '')
  const padded =
    numeric.length > 0
      ? numeric.padStart(6, '0').slice(-6)
      : id.slice(0, 6).toUpperCase()
  return `HC-${new Date().getFullYear()}-${padded}`
}

function shortAddr(addr: string | null | undefined): string {
  if (!addr) return '—'
  if (addr.length <= 10) return addr
  return `${addr.slice(0, 4)}…${addr.slice(-4)}`
}

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

function placeholderConfidence(status: Status, id: string): number | null {
  if (status !== 'verified') return null
  const seed = id.split('').reduce((s, c) => s + c.charCodeAt(0), 0)
  return 92 + (seed % 80) / 10
}

function sortLabel(key: SortKey): string {
  switch (key) {
    case 'price-asc': return 'Price ▲'
    case 'price-desc': return 'Price ▼'
    case 'recent': return 'Recent'
    case 'confidence': return 'AI Confidence'
  }
}

export default function MarketplacePage() {
  const { listings, isLoading } = useListings()
  const { wallet } = useWallet()

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

      <style>{`
        .mkt-table { display: grid; }
        .mkt-table .row { display: contents; }
        :root {
          --mkt-cols: 48px minmax(180px, 1.8fr) 110px 125px 100px 80px 100px;
        }
        @media (max-width: 1280px) {
          :root { --mkt-cols: 48px minmax(200px, 2fr) 120px 110px 90px 100px; }
        }
        @media (max-width: 960px) {
          :root { --mkt-cols: 40px minmax(160px, 1.4fr) 110px 100px 100px; }
        }
        @media (max-width: 640px) {
          :root { --mkt-cols: minmax(0, 1fr) 88px 86px; }
        }
        .mkt-table { grid-template-columns: var(--mkt-cols); }
      `}</style>

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

          <section
            className="mt-6"
            style={{
              background: 'var(--hc-surface-1)',
              border: '1px solid var(--hc-border)',
              clipPath:
                'polygon(var(--hc-poly-16) 0, calc(100% - var(--hc-poly-16)) 0, 100% var(--hc-poly-16), 100% calc(100% - var(--hc-poly-16)), calc(100% - var(--hc-poly-16)) 100%, var(--hc-poly-16) 100%, 0 calc(100% - var(--hc-poly-16)), 0 var(--hc-poly-16))',
            }}
            aria-label="Listings"
          >
            <div
              className="flex flex-wrap items-center gap-3 px-4 py-3"
              style={{ borderBottom: '1px solid var(--hc-hairline)' }}
            >
              <span
                className="font-mono text-[11px] uppercase tracking-[0.12em]"
                style={{ color: 'var(--hc-text-muted)' }}
              >
                Showing{' '}
                <span style={{ color: 'var(--hc-accent)' }} className="tabular-nums">
                  {listings.length}
                </span>{' '}
                of{' '}
                <span style={{ color: 'var(--hc-accent)' }} className="tabular-nums">
                  {listings.length}
                </span>
              </span>
              <span aria-hidden className="h-4 w-px" style={{ background: 'var(--hc-hairline)' }} />
              <span
                className="font-mono text-[11px] uppercase tracking-[0.12em]"
                style={{ color: 'var(--hc-text-muted)' }}
              >
                Sorted by <span style={{ color: 'var(--hc-text)' }}>{sortLabel('price-asc')}</span>
              </span>
              <div className="ml-auto flex items-center gap-2">
                <span
                  className="font-mono text-[10px] uppercase tracking-[0.14em]"
                  style={{ color: 'var(--hc-text-muted)' }}
                >
                  Examiner
                </span>
                <span
                  className="font-mono text-[11px] uppercase tracking-[0.12em] tabular-nums"
                  style={{ color: 'var(--hc-text)' }}
                >
                  VISION-4O
                </span>
              </div>
            </div>

            <div className="mkt-table">
              <div className="th col-num">#</div>
              <div className="th">Asset</div>
              <div className="th th-num">Price</div>
              <div className="th col-ai">AI Confidence</div>
              <div className="th col-seller">Seller</div>
              <div className="th col-listed">Listed</div>
              <div className="th">Status</div>

              {isLoading && listings.length === 0 ? (
                <div
                  className="col-span-full px-6 py-16 text-center font-mono text-[11px] uppercase tracking-[0.16em]"
                  style={{ color: 'var(--hc-text-muted)' }}
                >
                  <span
                    aria-hidden
                    className="mr-3 inline-block h-2 w-2 rounded-full"
                    style={{
                      background: 'var(--hc-accent)',
                      animation: 'hc-live-pulse 1.4s ease-in-out infinite',
                    }}
                  />
                  Examining custody log…
                </div>
              ) : listings.length === 0 ? (
                <EmptyTableState />
              ) : (
                listings.map((listing, idx) => (
                  <ListingRow
                    key={listing.id}
                    listing={listing}
                    index={idx + 1}
                    walletConnected={wallet.connected}
                  />
                ))
              )}
            </div>
          </section>

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

      <style>{`
        .mkt-table .th,
        .mkt-table .td {
          padding: 14px 14px;
          display: flex;
          align-items: center;
          border-bottom: 1px solid var(--hc-hairline);
          min-height: 72px;
        }
        .mkt-table .th {
          min-height: 38px;
          padding-top: 12px; padding-bottom: 12px;
          font-family: var(--font-geist-mono, 'Geist Mono'), ui-monospace, monospace;
          font-size: 10px;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: var(--hc-text-muted);
          background: var(--hc-bg);
          border-bottom: 1px solid var(--hc-border);
          cursor: default;
          user-select: none;
        }
        .mkt-table .th-num { justify-content: flex-end; }
        .mkt-table .td-num { justify-content: flex-end; }
        .mkt-table .row:nth-child(odd) .td {
          background: rgba(255,255,255,0.012);
        }
        .mkt-table .row:hover .td {
          background: rgba(235,198,88,0.04);
        }
        .mkt-table .row:last-child .td { border-bottom: none; }
        .mkt-table .col-span-full {
          grid-column: 1 / -1;
          min-height: auto;
        }
        @media (max-width: 1280px) {
          .mkt-table .col-ai { display: none; }
        }
        @media (max-width: 960px) {
          .mkt-table .col-ai,
          .mkt-table .col-seller,
          .mkt-table .col-listed { display: none; }
        }
        @media (max-width: 640px) {
          .mkt-table .col-num,
          .mkt-table .col-ai,
          .mkt-table .col-seller,
          .mkt-table .col-listed { display: none; }
          .mkt-table .asset .thumb { display: none; }
          .mkt-table .th,
          .mkt-table .td {
            padding: 10px 10px;
            min-height: 56px;
          }
        }
      `}</style>
    </>
  )
}

// ─────────────────────────────────────────────────────────────
// Subcomponents
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

function StatusPill({ status }: { status: Status }) {
  const config =
    status === 'verified'
      ? {
          label: 'Verified',
          color: 'var(--hc-verify-high)',
          bg: 'rgba(0, 229, 160, 0.08)',
          border: 'rgba(0, 229, 160, 0.3)',
          dotShadow: '0 0 6px rgba(0, 229, 160, 0.6)',
          pulse: false,
        }
      : {
          label: 'Pending',
          color: 'var(--hc-verify-med)',
          bg: 'rgba(255, 149, 0, 0.08)',
          border: 'rgba(255, 149, 0, 0.3)',
          dotShadow: 'none',
          pulse: true,
        }
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.14em]"
      style={{
        color: config.color,
        background: config.bg,
        border: `1px solid ${config.border}`,
      }}
    >
      <span
        aria-hidden
        className="inline-block h-1 w-1 rounded-full"
        style={{
          background: config.color,
          boxShadow: config.dotShadow,
          animation: config.pulse ? 'hc-live-pulse 1.2s ease-in-out infinite' : undefined,
        }}
      />
      {config.label}
    </span>
  )
}

function ConfidenceBar({
  pct,
  tone,
  label,
}: {
  pct: number | null
  tone: 'high' | 'med' | 'low' | 'pending'
  label: string
}) {
  const color =
    tone === 'high'
      ? 'var(--hc-verify-high)'
      : tone === 'med'
        ? 'var(--hc-verify-med)'
        : tone === 'low'
          ? 'var(--hc-verify-low)'
          : 'var(--hc-text-muted)'
  return (
    <div className="flex w-full flex-col gap-1">
      <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.06em]" style={{ color: 'var(--hc-text-muted)' }}>
        <span>{label}</span>
        <span className="tabular-nums" style={{ color, fontSize: 11 }}>
          {pct !== null ? `${pct.toFixed(1)}%` : '— %'}
        </span>
      </div>
      <div aria-hidden className="relative h-[3px]" style={{ background: 'var(--hc-hairline)' }}>
        <span
          className="absolute inset-y-0 left-0"
          style={{
            background: color,
            width: pct !== null ? `${Math.max(0, Math.min(100, pct))}%` : '0%',
          }}
        />
      </div>
    </div>
  )
}

function ListingRow({
  listing,
  index,
  walletConnected,
}: {
  listing: NFTListing
  index: number
  walletConnected: boolean
}) {
  const status = deriveStatus(listing)
  const isPending = status === 'pending'
  const confidence = placeholderConfidence(status, listing.id)
  const seller = shortAddr(listing.userWallet)
  const priceValue = `${Number(listing.listing_price_sol || 0).toLocaleString()} USDC`
  // Mint is redacted while either: the listing has no mint address yet
  // (still under examination), OR the wallet isn't connected (chain-of-
  // custody not yet established for this viewer). Mirrors /listings
  // page.tsx DossierCard convention so the typewriter unredact fires on
  // the same trigger across both surfaces.
  const mintAddress = listing.nft_mint_address
  const mintPending = !mintAddress || !walletConnected
  const mintValue = mintAddress ? shortAddr(mintAddress) : '—'

  return (
    <Link
      href={`/listings/${listing.id}`}
      className="row group cursor-pointer"
      aria-label={`Open dossier for ${listing.product_name || 'asset'}`}
    >
      <div className="td col-num">
        <span className="font-mono text-[11px] tabular-nums" style={{ color: 'var(--hc-text-muted)' }}>
          {String(index).padStart(2, '0')}
        </span>
      </div>

      <div className="td asset">
        <div className="flex w-full min-w-0 items-center gap-3">
          <div
            className="thumb h-10 w-10 flex-shrink-0 overflow-hidden"
            style={{
              background: 'var(--hc-surface-2)',
              border: '1px solid var(--hc-border)',
            }}
          >
            {listing.nft_image_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={listing.nft_image_url}
                alt=""
                className="h-full w-full object-cover"
                style={{ filter: 'contrast(1.05) saturate(0.95)' }}
              />
            ) : (
              <div
                className="flex h-full w-full items-center justify-center font-mono text-[8px] uppercase tracking-[0.12em]"
                style={{ color: 'var(--hc-text-muted)' }}
              >
                EVID
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1 overflow-hidden">
            <div
              className="truncate font-sans text-[13px] leading-tight transition-colors group-hover:text-[var(--hc-text)]"
              style={{ color: 'var(--hc-text-body)' }}
            >
              {listing.product_name || 'Unnamed Asset'}
            </div>
            <div
              className="mt-1 truncate font-mono text-[10px] uppercase tracking-[0.08em]"
              style={{ color: 'var(--hc-text-muted)' }}
            >
              {caseNumber(listing.id)} <span className="opacity-40 px-1">·</span>{' '}
              <span style={{ color: 'var(--hc-info)' }}>{seller}</span>{' '}
              <span className="opacity-40 px-1">·</span>{' '}
              Mint:{' '}
              {mintAddress ? (
                <RedactedField
                  pending={mintPending}
                  value={mintValue}
                  widthCh={Math.max(7, mintValue.length)}
                  className="text-[10px]"
                />
              ) : (
                <RedactedField pending value="" widthCh={7} className="text-[10px]" />
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="td td-num">
        <div className="flex flex-col items-end gap-0.5">
          <span
            className="font-mono tabular-nums"
            style={{
              color: isPending ? 'var(--hc-text-muted)' : 'var(--hc-text)',
              fontSize: 13,
              fontWeight: 500,
            }}
          >
            {isPending ? (
              <RedactedField pending value="" widthCh={7} className="text-[12px]" />
            ) : (
              priceValue
            )}
          </span>
          {!isPending && (
            <span className="font-mono text-[10px] tabular-nums" style={{ color: 'var(--hc-text-muted)' }}>
              ≈ {(Number(listing.listing_price_sol) / 182).toFixed(3)} ◎
            </span>
          )}
        </div>
      </div>

      <div className="td col-ai">
        <ConfidenceBar
          pct={confidence}
          tone={isPending ? 'pending' : 'high'}
          label={isPending ? 'EXAMINING…' : 'VISION-4O'}
        />
      </div>

      <div className="td col-seller">
        <span className="font-mono text-[11px] tabular-nums" style={{ color: 'var(--hc-info)' }}>
          {seller}
        </span>
      </div>

      <div className="td col-listed">
        <span className="font-mono text-[10px] uppercase tracking-[0.06em]" style={{ color: 'var(--hc-text-muted)' }}>
          {timeAgo(listing.createdAt)}
        </span>
      </div>

      <div className="td">
        <StatusPill status={status} />
      </div>
    </Link>
  )
}

function EmptyTableState() {
  return (
    <div
      className="col-span-full flex flex-col items-center gap-4 px-6 py-20 text-center"
      style={{
        background:
          'repeating-linear-gradient(135deg, transparent, transparent 24px, rgba(255,255,255,0.012) 24px, rgba(255,255,255,0.012) 25px)',
      }}
    >
      <div
        className="font-mono text-[11px] uppercase tracking-[0.32em]"
        style={{ color: 'var(--hc-text-muted)' }}
      >
        [ N O · D O S S I E R ]
      </div>
      <h3
        className="font-mono text-[18px] uppercase tracking-[0.04em]"
        style={{ color: 'var(--hc-text)', fontWeight: 500 }}
      >
        Floor is empty
      </h3>
      <p
        className="max-w-[44ch] font-sans text-[13px] leading-[1.55]"
        style={{ color: 'var(--hc-text-muted)' }}
      >
        No cleared dossier on the public floor yet.
      </p>
      <Link
        href="/listings"
        className="mt-2 inline-flex h-10 items-center gap-2 px-4 font-mono text-[11px] uppercase tracking-[0.14em] transition-all hover:gap-3"
        style={{
          color: 'var(--hc-accent)',
          background: 'var(--hc-accent-tint)',
          border: '1px solid var(--hc-accent-deep)',
        }}
      >
        Browse the intake bay →
      </Link>
    </div>
  )
}
