'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Navigation } from '@/components/navigation'
import { CaseFileRibbon } from '@/components/case-file-ribbon'
import { RedactedField } from '@/components/redacted-field'
import { Button } from '@/components/ui/button'
import { CreateListingForm } from '@/components/create-listing-form'
import { useWallet, useListings, type NFTListing } from '@/contexts/AppContext'

const listingsNavItems = [
  { name: 'Marketplace', href: '/marketplace' },
  { name: 'Collections', href: '/collections' },
  { name: 'My Listings', href: '/listings' },
  { name: 'Activities', href: '/activities' },
]

type DossierStatus = 'pending' | 'verified'
type FilterKey = 'all' | 'pending' | 'verified'

function deriveStatus(listing: NFTListing): DossierStatus {
  return listing.nft_mint_address ? 'verified' : 'pending'
}

function caseNumber(id: string): string {
  const numeric = id.replace(/[^0-9]/g, '')
  const padded = numeric.length > 0 ? numeric.padStart(6, '0').slice(-6) : id.slice(0, 6).toUpperCase()
  return `HC-${new Date().getFullYear()}-${padded}`
}

function shortAddr(addr: string): string {
  if (addr.length <= 10) return addr
  return `${addr.slice(0, 4)}…${addr.slice(-4)}`
}

function timeAgo(iso: string): string {
  const d = new Date(iso)
  const diffMs = Date.now() - d.getTime()
  const m = Math.floor(diffMs / 60_000)
  if (m < 1) return 'JUST NOW'
  if (m < 60) return `${m} M AGO`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h} H AGO`
  const days = Math.floor(h / 24)
  return days === 1 ? 'YESTERDAY' : `${days} D AGO`
}

function intakeTimestamp(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', {
    timeZone: 'America/New_York',
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

export default function ListingsPage() {
  const [showForm, setShowForm] = useState(false)
  const [filter, setFilter] = useState<FilterKey>('all')
  const { wallet } = useWallet()
  const { listings, isLoading } = useListings()

  const counts = useMemo(() => {
    const pending = listings.filter((l) => deriveStatus(l) === 'pending').length
    const verified = listings.length - pending
    return { all: listings.length, pending, verified }
  }, [listings])

  const totalTvl = useMemo(() => {
    return listings.reduce((sum, l) => {
      const n = Number(l.listing_price_sol)
      return Number.isFinite(n) ? sum + n : sum
    }, 0)
  }, [listings])

  const lastIntakeLabel = useMemo(() => {
    if (listings.length === 0) return '—'
    const latest = listings.reduce((a, b) =>
      new Date(a.createdAt) > new Date(b.createdAt) ? a : b
    )
    return timeAgo(latest.createdAt)
  }, [listings])

  const filtered = useMemo(() => {
    if (filter === 'all') return listings
    return listings.filter((l) => deriveStatus(l) === filter)
  }, [listings, filter])

  return (
    <>
      <Navigation items={listingsNavItems} showConnectWallet={true} />

      <div className="min-h-screen pt-32" style={{ background: 'var(--hc-bg)' }}>
        <CaseFileRibbon caseId={null} />

        <main className="mx-auto w-full max-w-[1536px] px-4 pb-24 pt-8 md:px-8 md:pt-10">
          {/* ─── HEADER STRIP ─── */}
          <header
            className="grid grid-cols-1 gap-6 border-b pb-8 lg:grid-cols-[1fr_auto] lg:items-end lg:gap-12"
            style={{ borderColor: 'var(--hc-hairline)' }}
          >
            <div>
              <div className="mb-4 flex items-center gap-3 font-mono text-[11px] uppercase tracking-[0.18em]" style={{ color: 'var(--hc-text-muted)' }}>
                <span
                  className="inline-block px-1.5 py-0.5 text-[10px]"
                  style={{
                    background: 'var(--hc-accent-tint)',
                    border: '1px solid var(--hc-accent-deep)',
                    color: 'var(--hc-accent)',
                  }}
                >
                  03
                </span>
                <span>Intake Bay · Seller Zone</span>
              </div>
              <h1
                className="font-mono uppercase leading-[0.96] tracking-[-0.02em]"
                style={{
                  fontSize: 'clamp(40px, 7vw, 88px)',
                  color: 'var(--hc-text)',
                  fontWeight: 600,
                }}
              >
                Evidence
                <br />
                <span style={{ color: 'var(--hc-accent)' }}>Intake.</span>
              </h1>
              <p className="mt-5 max-w-[56ch] font-sans text-base leading-[1.55]" style={{ color: 'var(--hc-text-body)' }}>
                File a real-world asset into custody.{' '}
                <strong className="font-medium" style={{ color: 'var(--hc-text)' }}>
                  VISION-4O
                </strong>{' '}
                examines provenance, materials, and condition, then issues a Certificate of Authenticity before mint.
                Wallet connection is optional during intake — chain-of-custody is established when you connect.
              </p>
            </div>
            <div className="lg:justify-self-end">
              <Button
                onClick={() => setShowForm((open) => !open)}
                aria-label="File new intake — wallet optional"
                title="File a new intake. Wallet connection optional."
              >
                <span className="relative inline-block h-3.5 w-3.5" aria-hidden="true">
                  <span className="absolute left-0 right-0 top-1/2 h-[1.5px] -translate-y-1/2 bg-current" />
                  <span className="absolute bottom-0 left-1/2 top-0 w-[1.5px] -translate-x-1/2 bg-current" />
                </span>
                {showForm ? 'Close Intake' : 'File New Intake'}
              </Button>
            </div>
          </header>

          {/* ─── STATS STRIP ─── */}
          <section
            className="mt-6 grid grid-cols-2 sm:grid-cols-5"
            style={{ border: '1px solid var(--hc-hairline)', background: 'var(--hc-surface-1)' }}
            aria-label="Intake bay statistics"
          >
            <StatCell label="Examiner" value="VISION-4O" />
            <StatCell label="Queue" value={String(counts.pending).padStart(2, '0')} accent />
            <StatCell label="In Custody" value={String(listings.length).padStart(2, '0')} />
            <StatCell label="Total TVL" value={totalTvl > 0 ? `${totalTvl.toLocaleString()} USDC` : '—'} />
            <StatCell label="Last Intake" value={lastIntakeLabel} live />
          </section>

          {/* ─── WALLET PANEL (only when disconnected) ─── */}
          {!wallet.connected && (
            <section
              className="mt-8 grid grid-cols-1 gap-6 px-7 py-6 lg:grid-cols-[1fr_auto] lg:items-center lg:gap-12"
              style={{
                background: 'var(--hc-surface-1)',
                border: '1px solid var(--hc-border)',
                borderLeft: '2px solid var(--hc-accent)',
              }}
              aria-labelledby="wallet-panel-title"
            >
              <div>
                <div className="mb-2 flex items-center gap-3 font-mono text-[11px] uppercase tracking-[0.14em]" style={{ color: 'var(--hc-accent)' }}>
                  <span
                    className="px-1.5 py-0.5 text-[10px]"
                    style={{
                      background: 'var(--hc-accent-tint)',
                      border: '1px solid var(--hc-accent-deep)',
                    }}
                  >
                    Optional
                  </span>
                  Chain-of-Custody Deferred
                </div>
                <h3
                  className="mb-3 font-mono text-[17px] uppercase tracking-[-0.01em]"
                  id="wallet-panel-title"
                  style={{ color: 'var(--hc-text)', fontWeight: 500 }}
                >
                  File now. Sign later.
                </h3>
                <p className="mb-5 max-w-[56ch] font-sans text-[14px] leading-[1.55]" style={{ color: 'var(--hc-text-body)' }}>
                  Intake runs without a wallet — VISION-4O still verifies your asset and issues a draft certificate.
                  Mint addresses stay redacted until you connect a Solana wallet and establish on-chain custody.
                </p>
                <div className="flex flex-wrap gap-2">
                  <PanelChip>Create Intakes Immediately</PanelChip>
                  <PanelChip>Connect Anytime</PanelChip>
                  <PanelChip>Claim NFT When Ready</PanelChip>
                </div>
              </div>
              {/* The actual wallet-connect button lives in <Navigation>. This is a visual nudge. */}
              <div className="lg:justify-self-end">
                <div
                  className="inline-flex h-12 items-center gap-2 px-5 font-mono text-[12px] uppercase tracking-[0.14em]"
                  style={{
                    color: 'var(--hc-text-muted)',
                    background: 'var(--hc-bg)',
                    border: '1px solid var(--hc-hairline)',
                    clipPath:
                      'polygon(10px 0, 100% 0, 100% calc(100% - 10px), calc(100% - 10px) 100%, 0 100%, 0 10px)',
                  }}
                >
                  Use top-right Connect →
                </div>
              </div>
            </section>
          )}

          {/* ─── INTAKE FORM (collapsed by default) ─── */}
          {showForm && (
            <section
              className="mt-8 animate-in fade-in slide-in-from-top-2 duration-300"
              style={{ background: 'var(--hc-surface-1)', border: '1px solid var(--hc-border)' }}
              aria-labelledby="intake-title"
            >
              <header
                className="flex items-center justify-between px-6 py-4"
                style={{
                  background: 'var(--hc-surface-2)',
                  borderBottom: '1px solid var(--hc-hairline)',
                }}
              >
                <div
                  className="flex items-center gap-3 font-mono text-[12px] uppercase tracking-[0.14em]"
                  id="intake-title"
                  style={{ color: 'var(--hc-text)', fontWeight: 500 }}
                >
                  <span
                    aria-hidden
                    className="inline-block h-2 w-2"
                    style={{
                      background: 'var(--hc-accent)',
                      clipPath: 'polygon(50% 0, 100% 50%, 50% 100%, 0 50%)',
                    }}
                  />
                  File New Intake
                  <span className="font-normal" style={{ color: 'var(--hc-text-muted)' }}>
                    · DRAFT
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="font-mono text-[11px] uppercase tracking-[0.12em] transition-colors hover:text-[#D4A82C]"
                  style={{ color: 'var(--hc-text-muted)' }}
                  aria-label="Close intake form"
                >
                  [× Close]
                </button>
              </header>
              <div className="p-6">
                <CreateListingForm />
              </div>
            </section>
          )}

          {/* ─── CUSTODY LOG ─── */}
          <section className="mt-16" aria-labelledby="custody-log-title">
            <header
              className="mb-6 flex flex-wrap items-end justify-between gap-5 border-b pb-5"
              style={{ borderColor: 'var(--hc-hairline)' }}
            >
              <div>
                <div className="mb-3 font-mono text-[11px] uppercase tracking-[0.18em]" style={{ color: 'var(--hc-text-muted)' }}>
                  [04] Custody Log
                </div>
                <div className="flex items-baseline gap-4">
                  <h2
                    className="font-mono text-[28px] uppercase tracking-[-0.01em]"
                    id="custody-log-title"
                    style={{ color: 'var(--hc-text)', fontWeight: 500 }}
                  >
                    In Custody
                  </h2>
                  <span
                    className="self-center px-2 py-1 font-mono text-[12px] tracking-[0.14em]"
                    style={{
                      background: 'var(--hc-accent-tint)',
                      border: '1px solid var(--hc-accent-deep)',
                      color: 'var(--hc-accent)',
                      fontWeight: 500,
                    }}
                  >
                    {String(filtered.length).padStart(2, '0')} ITEMS
                  </span>
                </div>
              </div>
              <div role="tablist" aria-label="Filter custody log" className="flex flex-wrap gap-2">
                <FilterChip active={filter === 'all'} count={counts.all} onClick={() => setFilter('all')}>
                  All
                </FilterChip>
                <FilterChip active={filter === 'pending'} count={counts.pending} onClick={() => setFilter('pending')}>
                  Pending
                </FilterChip>
                <FilterChip active={filter === 'verified'} count={counts.verified} onClick={() => setFilter('verified')}>
                  Verified
                </FilterChip>
              </div>
            </header>

            {isLoading ? (
              <LoadingState />
            ) : filtered.length === 0 ? (
              <EmptyState
                hasAny={listings.length > 0}
                filterKey={filter}
                onCreate={() => setShowForm(true)}
              />
            ) : (
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-3">
                {filtered.map((listing) => (
                  <DossierCard
                    key={listing.id}
                    listing={listing}
                    walletConnected={wallet.connected}
                  />
                ))}
              </div>
            )}
          </section>

          {/* ─── BOTTOM CTA ─── */}
          <div
            className="mt-24 flex flex-wrap items-center justify-between gap-5 border-t pt-8"
            style={{ borderColor: 'var(--hc-hairline)' }}
          >
            <div className="font-mono text-[11px] uppercase tracking-[0.14em]" style={{ color: 'var(--hc-text-muted)' }}>
              Looking for browsable inventory?{' '}
              <strong className="font-medium" style={{ color: 'var(--hc-text)' }}>
                The public marketplace
              </strong>{' '}
              shows every cleared dossier.
            </div>
            <Link
              href="/marketplace"
              className="inline-flex h-11 items-center gap-2 px-5 font-mono text-[12px] uppercase tracking-[0.14em] transition-all duration-200 hover:gap-3 hover:text-[#D4A82C]"
              style={{
                color: 'var(--hc-text)',
                background: 'transparent',
                border: '1px solid var(--hc-border)',
                clipPath:
                  'polygon(10px 0, 100% 0, 100% calc(100% - 10px), calc(100% - 10px) 100%, 0 100%, 0 10px)',
              }}
            >
              View Public Marketplace →
            </Link>
          </div>
        </main>
      </div>
    </>
  )
}

// ─────────────────────────────────────────────────────────────
// Subcomponents
// ─────────────────────────────────────────────────────────────

function StatCell({
  label,
  value,
  accent,
  live,
}: {
  label: string
  value: string
  accent?: boolean
  live?: boolean
}) {
  return (
    <div
      className="border-b border-r px-6 py-5 last:border-r-0 sm:border-b-0 [&:nth-child(2n)]:border-r-0 sm:[&:nth-child(2n)]:border-r"
      style={{ borderColor: 'var(--hc-hairline)' }}
    >
      <div
        className="mb-2 font-mono text-[10px] uppercase tracking-[0.16em]"
        style={{ color: 'var(--hc-text-muted)', fontWeight: 500 }}
      >
        {label}
      </div>
      <div
        className="font-mono text-lg tabular-nums tracking-[-0.01em]"
        style={{
          color: accent ? 'var(--hc-accent)' : 'var(--hc-text)',
          fontWeight: 500,
          fontSize: live ? 14 : 18,
        }}
      >
        {live ? (
          <span className="inline-flex items-center gap-2">
            <span
              className="inline-block h-1.5 w-1.5 rounded-full"
              style={{
                background: 'var(--hc-verify-high)',
                boxShadow: '0 0 6px rgba(0, 229, 160, 0.5)',
              }}
            />
            {value}
          </span>
        ) : (
          value
        )}
      </div>
    </div>
  )
}

function PanelChip({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="inline-flex items-center gap-2 px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.1em]"
      style={{
        color: 'var(--hc-text-muted)',
        background: 'var(--hc-bg)',
        border: '1px solid var(--hc-hairline)',
        clipPath:
          'polygon(4px 0, 100% 0, 100% calc(100% - 4px), calc(100% - 4px) 100%, 0 100%, 0 4px)',
      }}
    >
      <span style={{ color: 'var(--hc-verify-high)', fontWeight: 600 }}>✓</span>
      {children}
    </span>
  )
}

function FilterChip({
  active,
  count,
  onClick,
  children,
}: {
  active: boolean
  count: number
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className="inline-flex items-center gap-2 px-3.5 py-2 font-mono text-[11px] uppercase tracking-[0.12em] transition-all duration-150"
      style={{
        color: active ? 'var(--hc-accent)' : 'var(--hc-text-muted)',
        background: active ? 'var(--hc-accent-tint)' : 'transparent',
        border: `1px solid ${active ? 'var(--hc-accent)' : 'var(--hc-hairline)'}`,
        clipPath:
          'polygon(5px 0, 100% 0, 100% calc(100% - 5px), calc(100% - 5px) 100%, 0 100%, 0 5px)',
        fontWeight: 500,
      }}
    >
      {children}
      <span
        className="px-1.5 py-px font-mono text-[10px]"
        style={{
          color: active ? 'var(--hc-accent)' : 'var(--hc-text-muted)',
          background: 'var(--hc-bg)',
          border: `1px solid ${active ? 'var(--hc-accent-deep)' : 'var(--hc-hairline)'}`,
        }}
      >
        {String(count).padStart(2, '0')}
      </span>
    </button>
  )
}

function StatusPill({ status }: { status: DossierStatus }) {
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
      className="inline-flex items-center gap-1.5 px-2 py-1 font-mono text-[9px] uppercase tracking-[0.14em]"
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

function DossierCard({
  listing,
  walletConnected,
}: {
  listing: NFTListing
  walletConnected: boolean
}) {
  const status = deriveStatus(listing)
  const caseLabel = caseNumber(listing.id)
  // Mint cell pends if the listing has no mint OR the wallet is disconnected.
  // This is what drives the typewriter-unredact reveal on wallet connect.
  const mintAddress = listing.nft_mint_address
  const mintPending = !mintAddress || !walletConnected
  const mintValue = mintAddress ? shortAddr(mintAddress) : '—'
  const pricePending = status === 'pending'
  const priceValue = listing.listing_price_sol
    ? `${listing.listing_price_sol} USDC`
    : '0 USDC'

  return (
    <article
      className="group relative flex flex-col transition-all duration-200 hover:-translate-y-0.5"
      style={{
        background: 'var(--hc-surface-1)',
        border: '1px solid var(--hc-border)',
      }}
    >
      {/* Forensic corner notch */}
      <span
        aria-hidden
        className="absolute -right-px -top-px h-4 w-4 transition-colors duration-200"
        style={{
          background: 'var(--hc-bg)',
          borderLeft: '1px solid var(--hc-border)',
          borderBottom: '1px solid var(--hc-border)',
          clipPath: 'polygon(100% 0, 0 0, 100% 100%)',
        }}
      />

      {/* Strip: case# + status */}
      <div
        className="flex items-center justify-between gap-3 px-3.5 py-2"
        style={{
          background: 'var(--hc-surface-2)',
          borderBottom: '1px solid var(--hc-hairline)',
        }}
      >
        <span
          className="font-mono text-[10px] uppercase tracking-[0.12em] tabular-nums"
          style={{ color: 'var(--hc-accent)', fontWeight: 500 }}
        >
          {caseLabel}
        </span>
        <StatusPill status={status} />
      </div>

      {/* Photo */}
      <div
        className="relative aspect-square overflow-hidden"
        style={{ background: 'linear-gradient(135deg, #0a0a0a 0%, #141414 100%)' }}
      >
        {listing.nft_image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={listing.nft_image_url}
            alt={listing.product_name || 'Evidence photo'}
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
            style={{ filter: 'contrast(1.05) saturate(0.95)' }}
          />
        ) : (
          <div
            className="flex h-full w-full items-center justify-center text-center font-mono text-[11px] uppercase tracking-[0.16em]"
            style={{ color: 'var(--hc-text-muted)' }}
          >
            [ Evidence Photo ]
          </div>
        )}
        <span
          className="absolute left-2 top-2 px-1.5 py-1 font-mono text-[9px] uppercase tracking-[0.16em]"
          style={{
            color: 'var(--hc-text)',
            background: 'rgba(0, 0, 0, 0.65)',
            border: '1px solid var(--hc-border)',
            backdropFilter: 'blur(6px)',
            fontWeight: 500,
          }}
        >
          EVID 01
        </span>
        <span
          className="absolute bottom-2 right-2 px-1.5 py-1 font-mono text-[9px] uppercase tracking-[0.14em]"
          style={{
            color: 'var(--hc-text-muted)',
            background: 'rgba(0, 0, 0, 0.65)',
            border: '1px solid var(--hc-hairline)',
            backdropFilter: 'blur(6px)',
          }}
        >
          VISION-4O · {status === 'verified' ? '98.4%' : '…'}
        </span>
        {/* Bottom gradient strip */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 flex h-[26px] items-end justify-between px-2 pb-1.5 font-mono text-[9px] uppercase tracking-[0.14em]"
          style={{
            background: 'linear-gradient(180deg, transparent 0%, rgba(0,0,0,0.85) 100%)',
            color: 'var(--hc-text-body)',
            fontWeight: 500,
          }}
        >
          <span>{status === 'verified' ? 'Authentication Cleared' : 'Examination in progress'}</span>
          <span style={{ color: status === 'verified' ? 'var(--hc-verify-high)' : 'var(--hc-verify-med)' }}>
            {status === 'verified' ? '98.4% CONF' : 'CONF PENDING'}
          </span>
        </div>
      </div>

      {/* Body */}
      <div className="flex flex-1 flex-col p-5">
        <h3
          className="mb-4 font-mono text-[15px] leading-[1.25] tracking-[-0.005em] line-clamp-2"
          style={{ color: 'var(--hc-text)', fontWeight: 500 }}
        >
          {listing.product_name || 'Unnamed Asset'}
        </h3>

        <table className="mb-5 w-full border-collapse">
          <tbody>
            <ManifestRow label="Price">
              {pricePending ? (
                <RedactedField pending value="" widthCh={9} />
              ) : (
                <span style={{ color: 'var(--hc-accent)', fontWeight: 500, fontSize: 13 }}>{priceValue}</span>
              )}
            </ManifestRow>
            <ManifestRow label="Mint">
              {mintAddress ? (
                <RedactedField
                  pending={mintPending}
                  value={mintValue}
                  widthCh={Math.max(12, mintValue.length)}
                  className="text-[11px]"
                />
              ) : (
                <RedactedField pending value="" widthCh={12} />
              )}
            </ManifestRow>
            <ManifestRow label="Intake">
              <span style={{ color: 'var(--hc-text)' }}>{intakeTimestamp(listing.createdAt)} EST</span>
            </ManifestRow>
            <ManifestRow label="Examiner">
              <span style={{ color: 'var(--hc-text)' }}>VISION-4O</span>
            </ManifestRow>
          </tbody>
        </table>

        <div
          className="mt-auto flex items-center justify-between border-t pt-3"
          style={{ borderColor: 'var(--hc-hairline)' }}
        >
          <Link
            href={`/listings/${listing.id}`}
            className="inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.14em] transition-all hover:gap-3"
            style={{ color: 'var(--hc-accent)', fontWeight: 500 }}
          >
            View Dossier <span>→</span>
          </Link>
          <span
            className="font-mono text-[10px] uppercase tracking-[0.12em]"
            style={{ color: 'var(--hc-text-muted)' }}
          >
            {timeAgo(listing.createdAt)}
          </span>
        </div>
      </div>
    </article>
  )
}

function ManifestRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <tr style={{ borderBottom: '1px dashed var(--hc-hairline)' }}>
      <td
        className="py-1.5 pr-2 font-mono text-[11px] uppercase tracking-[0.14em]"
        style={{ color: 'var(--hc-text-muted)', width: '38%', fontWeight: 500 }}
      >
        {label}
      </td>
      <td
        className="py-1.5 text-right font-mono text-[11px] tabular-nums"
        style={{ color: 'var(--hc-text)' }}
      >
        {children}
      </td>
    </tr>
  )
}

function LoadingState() {
  return (
    <div className="flex items-center justify-center py-20">
      <div className="text-center">
        <div
          className="mx-auto mb-4 h-8 w-8 animate-spin border-2 border-t-transparent"
          style={{ borderColor: 'var(--hc-accent)', borderTopColor: 'transparent' }}
          aria-label="Loading"
          role="status"
        />
        <p className="font-mono text-[11px] uppercase tracking-[0.16em]" style={{ color: 'var(--hc-text-muted)' }}>
          Examining custody log…
        </p>
      </div>
    </div>
  )
}

function EmptyState({
  hasAny,
  filterKey,
  onCreate,
}: {
  hasAny: boolean
  filterKey: FilterKey
  onCreate: () => void
}) {
  const isFilterEmpty = hasAny && filterKey !== 'all'
  const title = isFilterEmpty ? 'No Matches in This Filter' : 'Custody Log Empty'
  const copy = isFilterEmpty
    ? `No intake currently in the ${filterKey} state. Switch the filter to view other dossiers.`
    : 'No evidence has been filed yet. Start an intake — VISION-4O will examine the asset and issue a draft certificate before mint.'
  return (
    <div
      className="px-6 py-24 text-center"
      style={{
        border: '1px dashed var(--hc-border)',
        background:
          'repeating-linear-gradient(135deg, transparent, transparent 24px, rgba(255,255,255,0.012) 24px, rgba(255,255,255,0.012) 25px)',
      }}
    >
      <div className="mb-5 font-mono text-[11px] uppercase tracking-[0.32em]" style={{ color: 'var(--hc-text-muted)' }}>
        [ N O · E V I D E N C E ]
      </div>
      <h3
        className="mb-4 font-mono text-[22px] uppercase tracking-[0.04em]"
        style={{ color: 'var(--hc-text)', fontWeight: 500 }}
      >
        {title}
      </h3>
      <p className="mx-auto mb-7 max-w-[44ch] font-sans text-[14px] leading-[1.6]" style={{ color: 'var(--hc-text-muted)' }}>
        {copy}
      </p>
      {!isFilterEmpty && (
        <Button onClick={onCreate}>
          <span className="relative inline-block h-3.5 w-3.5" aria-hidden="true">
            <span className="absolute left-0 right-0 top-1/2 h-[1.5px] -translate-y-1/2 bg-current" />
            <span className="absolute bottom-0 left-1/2 top-0 w-[1.5px] -translate-x-1/2 bg-current" />
          </span>
          File First Intake
        </Button>
      )}
    </div>
  )
}
