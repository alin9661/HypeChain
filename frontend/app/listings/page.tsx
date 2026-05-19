'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Navigation } from '@/components/navigation'
import { CaseFileRibbon } from '@/components/case-file-ribbon'
import { Button } from '@/components/ui/button'
import { CreateListingForm } from '@/components/create-listing-form'
import { useWallet, useListings, type NFTListing } from '@/contexts/AppContext'
import { Plus, Package } from 'lucide-react'

const listingsNavItems = [
  { name: 'Marketplace', href: '/marketplace' },
  { name: 'Collections', href: '/collections' },
  { name: 'My Listings', href: '/listings' },
  { name: 'Activities', href: '/activities' },
]

type DossierStatus = 'pending' | 'verified'

function deriveStatus(listing: NFTListing): DossierStatus {
  return listing.nft_mint_address ? 'verified' : 'pending'
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

export default function ListingsPage() {
  const [showForm, setShowForm] = useState(false)
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

          {/*
            ─── LEGACY LISTINGS GRID ───
            The dossier custody log (filter chips + dossier cards + forensic empty
            state + new bottom CTA) lands in the NEXT commit. This commit keeps the
            old grid in place so /listings still renders cleanly during bisect.
          */}
          <div className="mt-12">
            <div className="flex items-center gap-3 mb-6">
              <Package className="w-5 h-5 text-[#D4A82C]" aria-hidden="true" />
              <h2 className="text-2xl font-mono text-white">
                [Your Listings]
              </h2>
            </div>

            {isLoading ? (
              <div className="flex items-center justify-center py-20">
                <div className="text-center">
                  <svg
                    className="animate-spin h-8 w-8 text-[#D4A82C] mx-auto mb-4"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    aria-label="Loading"
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
                  <p className="font-mono text-sm text-white/60">
                    Loading your listings...
                  </p>
                </div>
              </div>
            ) : wallet.connected && listings.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {listings.map((listing) => (
                  <div
                    key={listing.id}
                    className="bg-[#0F0F0F] border border-[#424242] rounded-lg overflow-hidden hover:border-[#D4A82C] transition-colors duration-300 group"
                  >
                    <div className="aspect-square bg-black/50 relative overflow-hidden">
                      {listing.nft_image_url ? (
                        <img
                          src={listing.nft_image_url}
                          alt={listing.product_name}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Package className="w-16 h-16 text-white/20" aria-hidden="true" />
                        </div>
                      )}
                    </div>

                    <div className="p-4">
                      <h3 className="font-mono text-lg text-white mb-2 truncate">
                        {listing.product_name || 'Unnamed Asset'}
                      </h3>

                      <div className="space-y-2 mb-4">
                        <div className="flex justify-between items-center">
                          <span className="font-mono text-xs text-white/50">
                            Price
                          </span>
                          <span className="font-mono text-sm text-[#D4A82C]">
                            {listing.listing_price_sol || '0'} USDC
                          </span>
                        </div>

                        {listing.nft_mint_address && (
                          <div className="flex justify-between items-center">
                            <span className="font-mono text-xs text-white/50">
                              Mint Address
                            </span>
                            <span className="font-mono text-xs text-white/70 truncate max-w-[150px]">
                              {listing.nft_mint_address.slice(0, 4)}...{listing.nft_mint_address.slice(-4)}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-20">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-[#D4A82C]/10 border border-[#D4A82C]/30 mb-4">
                  <Package className="w-8 h-8 text-[#D4A82C]" aria-hidden="true" />
                </div>
                <h3 className="font-mono text-xl text-white mb-2">
                  No listings yet
                </h3>
                <p className="font-mono text-sm text-white/60 mb-6 max-w-md mx-auto">
                  Start creating your listings by clicking the
                  <span className="text-[#D4A82C]"> [Create Listing] </span>
                  button above. {!wallet.connected && "You can connect your wallet later to mint the NFT."}
                </p>
                {!showForm && (
                  <Button onClick={() => setShowForm(true)}>
                    <Plus className="w-5 h-5 mr-2" aria-hidden="true" />
                    [Create Your First Listing]
                  </Button>
                )}
              </div>
            )}
          </div>

          {/* Browse Marketplace CTA (LEGACY — replaced in next commit) */}
          <div className="mt-12 text-center">
            <Link href="/marketplace">
              <Button>
                [Browse Marketplace]
              </Button>
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
