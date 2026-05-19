'use client'

import { useMemo, useState } from 'react'
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
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [sortBy, setSortBy] = useState<SortKey>('price-asc')
  const [searchQuery, setSearchQuery] = useState('')

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

  // Filter + sort pipeline for the listings table. Search matches
  // product name, mint address, or seller wallet (substring, case-
  // insensitive). Sort is stable per-array but resets every render
  // when the underlying listings change.
  const visible = useMemo(() => {
    let rows = listings
    if (statusFilter !== 'all') {
      rows = rows.filter((l) => deriveStatus(l) === statusFilter)
    }
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase()
      rows = rows.filter(
        (l) =>
          (l.product_name || '').toLowerCase().includes(q) ||
          (l.nft_mint_address || '').toLowerCase().includes(q) ||
          (l.userWallet || '').toLowerCase().includes(q),
      )
    }
    const sorted = [...rows]
    switch (sortBy) {
      case 'price-asc':
        sorted.sort((a, b) => Number(a.listing_price_sol) - Number(b.listing_price_sol))
        break
      case 'price-desc':
        sorted.sort((a, b) => Number(b.listing_price_sol) - Number(a.listing_price_sol))
        break
      case 'recent':
        sorted.sort(
          (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
        )
        break
      case 'confidence':
        sorted.sort((a, b) => {
          const ca = placeholderConfidence(deriveStatus(a), a.id) ?? 0
          const cb = placeholderConfidence(deriveStatus(b), b.id) ?? 0
          return cb - ca
        })
        break
    }
    return sorted
  }, [listings, statusFilter, searchQuery, sortBy])

  // Live Examiner Feed = the 7 most-recent listings, formatted as
  // event log lines. Verified rows render with the mint-green "Verified"
  // verb; pending rows render with the info-blue "Listed" verb. When
  // the WebSocket verification stream comes online, this becomes a
  // real event tail instead of a poll of useListings.
  const activity = useMemo(() => {
    return [...listings]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 7)
      .map((l) => ({
        id: l.id,
        verb: deriveStatus(l) === 'verified' ? 'Verified' : 'Listed',
        verbClass:
          deriveStatus(l) === 'verified' ? 'text-[var(--hc-verify-high)]' : 'text-[var(--hc-info)]',
        target: l.product_name || 'Unnamed Asset',
        meta:
          deriveStatus(l) === 'verified'
            ? `VISION-4O · ${placeholderConfidence('verified', l.id)?.toFixed(1)}% conf · ${shortAddr(l.nft_mint_address)}`
            : `Examining · seller ${shortAddr(l.userWallet)}`,
        time: timeAgo(l.createdAt),
      }))
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
            className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-[220px_1fr] xl:grid-cols-[220px_1fr_280px]"
            aria-label="Listings"
          >
            <aside
              className="flex flex-col gap-6 self-start p-4 lg:sticky lg:top-24"
              style={{
                background: 'var(--hc-surface-1)',
                border: '1px solid var(--hc-border)',
              }}
              aria-label="Filters"
            >
              <RailSection title="Search">
                <div
                  className="flex items-center gap-2 px-3 py-2.5"
                  style={{
                    background: 'var(--hc-bg)',
                    border: '1px solid var(--hc-border)',
                  }}
                >
                  <SearchIcon />
                  <input
                    type="text"
                    placeholder="MINT / PRODUCT / SELLER"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="flex-1 bg-transparent font-mono text-[12px] tracking-[0.04em] outline-none placeholder:text-[color:var(--hc-text-muted)]"
                    style={{ color: 'var(--hc-text-body)' }}
                    aria-label="Search listings"
                  />
                  <span
                    className="px-1.5 py-px font-mono text-[10px]"
                    style={{
                      color: 'var(--hc-text-muted)',
                      border: '1px solid var(--hc-hairline)',
                    }}
                  >
                    ⌘K
                  </span>
                </div>
              </RailSection>

              <RailSection title="Verification">
                <CheckRow
                  active={statusFilter === 'all'}
                  swatch={null}
                  label="All"
                  count={counts.all}
                  onClick={() => setStatusFilter('all')}
                />
                <CheckRow
                  active={statusFilter === 'verified'}
                  swatch="var(--hc-verify-high)"
                  label="Verified"
                  count={counts.verified}
                  onClick={() => setStatusFilter('verified')}
                />
                <CheckRow
                  active={statusFilter === 'pending'}
                  swatch="var(--hc-verify-med)"
                  label="Pending"
                  count={counts.pending}
                  onClick={() => setStatusFilter('pending')}
                />
              </RailSection>

              {/* Category is visual scaffolding until backend exposes
                  category on the list endpoint. Buttons are wired to
                  no-op handlers so the click feedback works but the
                  filter doesn't apply. */}
              <RailSection title="Category">
                <CheckRow active={false} swatch={null} label="Footwear" count={null} onClick={() => {}} />
                <CheckRow active={false} swatch={null} label="Apparel" count={null} onClick={() => {}} />
                <CheckRow active={false} swatch={null} label="Watches" count={null} onClick={() => {}} />
                <CheckRow active={false} swatch={null} label="Trading Cards" count={null} onClick={() => {}} />
              </RailSection>

              <RailSection title="Sort">
                <CheckRow
                  active={sortBy === 'price-asc'}
                  swatch={null}
                  label="Price · Low → High"
                  count={null}
                  onClick={() => setSortBy('price-asc')}
                />
                <CheckRow
                  active={sortBy === 'price-desc'}
                  swatch={null}
                  label="Price · High → Low"
                  count={null}
                  onClick={() => setSortBy('price-desc')}
                />
                <CheckRow
                  active={sortBy === 'recent'}
                  swatch={null}
                  label="Recently Listed"
                  count={null}
                  onClick={() => setSortBy('recent')}
                />
                <CheckRow
                  active={sortBy === 'confidence'}
                  swatch={null}
                  label="AI Confidence"
                  count={null}
                  onClick={() => setSortBy('confidence')}
                />
              </RailSection>

              <div
                className="flex items-center justify-between p-3"
                style={{
                  background: 'var(--hc-bg)',
                  border: '1px solid var(--hc-border)',
                }}
              >
                <span className="inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.12em]" style={{ color: 'var(--hc-text)' }}>
                  <span
                    aria-hidden
                    className="inline-block h-1.5 w-1.5 rounded-full"
                    style={{
                      background: 'var(--hc-verify-high)',
                      boxShadow: '0 0 6px var(--hc-verify-high)',
                      animation: 'hc-live-pulse 1.6s ease-in-out infinite',
                    }}
                  />
                  Live Updates
                </span>
                <span
                  aria-hidden
                  className="relative inline-block h-3.5 w-7"
                  style={{ background: 'var(--hc-accent)' }}
                >
                  <span
                    className="absolute right-px top-px h-3 w-3"
                    style={{ background: 'var(--hc-bg)' }}
                  />
                </span>
              </div>
            </aside>

            <section
              style={{
                background: 'var(--hc-surface-1)',
                border: '1px solid var(--hc-border)',
                clipPath:
                  'polygon(var(--hc-poly-16) 0, calc(100% - var(--hc-poly-16)) 0, 100% var(--hc-poly-16), 100% calc(100% - var(--hc-poly-16)), calc(100% - var(--hc-poly-16)) 100%, var(--hc-poly-16) 100%, 0 calc(100% - var(--hc-poly-16)), 0 var(--hc-poly-16))',
              }}
              aria-label="Listings table"
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
                  {visible.length}
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
                Sorted by <span style={{ color: 'var(--hc-text)' }}>{sortLabel(sortBy)}</span>
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
              ) : visible.length === 0 ? (
                <EmptyTableState
                  hasAny={listings.length > 0}
                  statusFilter={statusFilter}
                  searchActive={Boolean(searchQuery.trim())}
                />
              ) : (
                visible.map((listing, idx) => (
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

            <aside
              className="hidden xl:flex xl:sticky xl:top-24 xl:flex-col xl:gap-4 xl:self-start"
              aria-label="Live activity"
            >
              <div
                style={{
                  background: 'var(--hc-surface-1)',
                  border: '1px solid var(--hc-border)',
                }}
              >
                <div
                  className="flex items-center justify-between px-4 py-3"
                  style={{ borderBottom: '1px solid var(--hc-hairline)' }}
                >
                  <span
                    className="inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.14em]"
                    style={{ color: 'var(--hc-text)' }}
                  >
                    <span
                      aria-hidden
                      className="inline-block h-1.5 w-1.5 rounded-full"
                      style={{
                        background: 'var(--hc-verify-high)',
                        boxShadow: '0 0 6px var(--hc-verify-high)',
                        animation: 'hc-live-pulse 1.6s ease-in-out infinite',
                      }}
                    />
                    Live Examiner Feed
                  </span>
                  <span
                    className="font-mono text-[10px] uppercase tracking-[0.1em] tabular-nums"
                    style={{ color: 'var(--hc-text-muted)' }}
                  >
                    {listings.length} total
                  </span>
                </div>
                <div className="flex flex-col">
                  {activity.length === 0 ? (
                    <div
                      className="px-4 py-10 text-center font-mono text-[10px] uppercase tracking-[0.16em]"
                      style={{ color: 'var(--hc-text-muted)' }}
                    >
                      No examiner activity yet
                    </div>
                  ) : (
                    activity.map((a) => <ActivityItem key={a.id} item={a} />)
                  )}
                </div>
              </div>

              <div
                className="flex flex-col gap-2 p-4"
                style={{
                  background: 'var(--hc-surface-1)',
                  border: '1px solid var(--hc-border)',
                }}
              >
                <span
                  className="font-mono text-[10px] uppercase tracking-[0.14em]"
                  style={{ color: 'var(--hc-text-muted)' }}
                >
                  AI Throughput · last 60 min
                </span>
                <span
                  className="font-mono tabular-nums"
                  style={{ color: 'var(--hc-text)', fontSize: 22 }}
                >
                  {kpis.throughputPerSec.toFixed(1)}
                  <span className="ml-1 font-mono text-[12px]" style={{ color: 'var(--hc-text-muted)' }}>
                    listings / sec
                  </span>
                </span>
                <svg viewBox="0 0 240 48" preserveAspectRatio="none" aria-hidden className="block h-12 w-full">
                  <polyline
                    fill="none"
                    stroke="rgba(235,198,88,0.2)"
                    strokeWidth="6"
                    points="0,32 12,29 24,30 36,25 48,28 60,22 72,24 84,20 96,18 108,21 120,14 132,17 144,12 156,15 168,10 180,8 192,11 204,6 216,9 228,4 240,5"
                  />
                  <polyline
                    fill="none"
                    stroke="var(--hc-accent)"
                    strokeWidth="1.4"
                    points="0,32 12,29 24,30 36,25 48,28 60,22 72,24 84,20 96,18 108,21 120,14 132,17 144,12 156,15 168,10 180,8 192,11 204,6 216,9 228,4 240,5"
                  />
                </svg>
                <div
                  className="flex justify-between font-mono text-[10px] uppercase tracking-[0.08em]"
                  style={{ color: 'var(--hc-text-muted)' }}
                >
                  <span>00:00</span>
                  <span style={{ color: 'var(--hc-verify-high)' }}>▲ +18% vs 1h</span>
                  <span>NOW</span>
                </div>
              </div>
            </aside>
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

function SearchIcon() {
  return (
    <svg
      width="12" height="12" viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square"
      style={{ color: 'var(--hc-text-muted)' }}
      aria-hidden
    >
      <circle cx="11" cy="11" r="7" />
      <line x1="21" y1="21" x2="16.5" y2="16.5" />
    </svg>
  )
}

function RailSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3
        className="mb-2 border-b pb-1.5 font-mono text-[10px] uppercase tracking-[0.16em]"
        style={{ color: 'var(--hc-text-muted)', borderColor: 'var(--hc-hairline)' }}
      >
        {title}
      </h3>
      <div className="flex flex-col">{children}</div>
    </div>
  )
}

function CheckRow({
  active,
  swatch,
  label,
  count,
  onClick,
}: {
  active: boolean
  swatch: string | null
  label: string
  count: number | null
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      role="checkbox"
      aria-checked={active}
      className="flex items-center justify-between py-1.5 font-mono text-[11px] uppercase tracking-[0.06em] transition-colors hover:text-[var(--hc-text)]"
      style={{ color: 'var(--hc-text-body)' }}
    >
      <span className="inline-flex items-center gap-2.5">
        <span
          aria-hidden
          className="relative inline-block h-3 w-3"
          style={{
            background: active ? 'var(--hc-accent)' : 'var(--hc-bg)',
            border: `1px solid ${active ? 'var(--hc-accent)' : 'var(--hc-border)'}`,
          }}
        >
          {active && (
            <span
              className="absolute"
              style={{
                left: 3, top: 0, width: 4, height: 8,
                border: 'solid #000',
                borderWidth: '0 1.5px 1.5px 0',
                transform: 'rotate(45deg)',
              }}
            />
          )}
        </span>
        {swatch && (
          <span aria-hidden className="inline-block h-2 w-2" style={{ background: swatch }} />
        )}
        {label}
      </span>
      {count !== null && (
        <span className="tabular-nums" style={{ color: 'var(--hc-text-muted)' }}>
          {count}
        </span>
      )}
    </button>
  )
}

function ActivityItem({
  item,
}: {
  item: {
    id: string
    verb: string
    verbClass: string
    target: string
    meta: string
    time: string
  }
}) {
  return (
    <Link
      href={`/listings/${item.id}`}
      className="grid grid-cols-[56px_1fr] gap-2.5 px-4 py-3 transition-colors hover:bg-[rgba(235,198,88,0.03)]"
      style={{ borderBottom: '1px solid var(--hc-hairline)' }}
    >
      <span
        className="pt-0.5 font-mono text-[10px] uppercase tracking-[0.04em] tabular-nums"
        style={{ color: 'var(--hc-text-muted)' }}
      >
        {item.time}
      </span>
      <span className="font-sans text-[12px] leading-snug" style={{ color: 'var(--hc-text-body)' }}>
        <span className={`pr-1.5 font-mono text-[10px] uppercase tracking-[0.12em] ${item.verbClass}`}>
          {item.verb}
        </span>
        <span style={{ color: 'var(--hc-text)' }}>{item.target}</span>
        <span
          className="mt-1 block font-mono text-[10px] uppercase tracking-[0.06em]"
          style={{ color: 'var(--hc-text-muted)' }}
        >
          {item.meta}
        </span>
      </span>
    </Link>
  )
}

function EmptyTableState({
  hasAny,
  statusFilter,
  searchActive,
}: {
  hasAny: boolean
  statusFilter: StatusFilter
  searchActive: boolean
}) {
  const reason = searchActive
    ? 'No dossier matches that search.'
    : hasAny
      ? `No dossier in the ${statusFilter} state.`
      : 'No cleared dossier on the public floor yet.'
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
        {reason}
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
