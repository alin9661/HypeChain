'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { Navigation } from '@/components/navigation'
import { CaseFileRibbon } from '@/components/case-file-ribbon'
import { Search, Grid3x3, List, ChevronDown, BadgeCheck } from 'lucide-react'

const collectionsNavItems = [
  { name: 'Marketplace', href: '/marketplace' },
  { name: 'Collections', href: '/collections' },
  { name: 'Activities', href: '/activities' },
  { name: 'My Listings', href: '/listings' },
]

// Mock data — no /collections discovery endpoint exists yet. Kept hardcoded so
// the page renders; swapping in a real api-client call is a separate follow-up.
const MOCK_COLLECTIONS = [
  {
    id: '1',
    name: 'Yeezy Boost Collection',
    creator: '0x742d35…a5f4',
    verified: true,
    banner: 'https://via.placeholder.com/400x150/0a0a0a/ebc658?text=Collection+Banner',
    avatar: 'https://via.placeholder.com/80x80/141414/ebc658?text=YB',
    items: 156,
    floorPrice: 2.8,
    totalVolume: 1247.5,
    description: 'Premium Yeezy Boost NFT collection featuring rare and limited edition sneakers.',
  },
  {
    id: '2',
    name: 'Foam Runner Series',
    creator: '0x8f3e29…b7c2',
    verified: true,
    banner: 'https://via.placeholder.com/400x150/0a0a0a/ebc658?text=Collection+Banner',
    avatar: 'https://via.placeholder.com/80x80/141414/ebc658?text=FR',
    items: 89,
    floorPrice: 1.9,
    totalVolume: 843.2,
    description: 'Innovative Foam Runner designs in NFT format.',
  },
  {
    id: '3',
    name: 'Yeezy Slide Vault',
    creator: '0x5a7c31…d8e6',
    verified: false,
    banner: 'https://via.placeholder.com/400x150/0a0a0a/ebc658?text=Collection+Banner',
    avatar: 'https://via.placeholder.com/80x80/141414/ebc658?text=YS',
    items: 234,
    floorPrice: 1.5,
    totalVolume: 2156.8,
    description: 'Complete collection of Yeezy Slide variations and colorways.',
  },
  {
    id: '4',
    name: '700 V3 Archive',
    creator: '0x1c8f92…e3a7',
    verified: true,
    banner: 'https://via.placeholder.com/400x150/0a0a0a/ebc658?text=Collection+Banner',
    avatar: 'https://via.placeholder.com/80x80/141414/ebc658?text=7V',
    items: 67,
    floorPrice: 4.2,
    totalVolume: 567.3,
    description: 'Curated archive of Yeezy 700 V3 masterpieces.',
  },
  {
    id: '5',
    name: '500 Utility Pack',
    creator: '0x9e4a83…c1d5',
    verified: false,
    banner: 'https://via.placeholder.com/400x150/0a0a0a/ebc658?text=Collection+Banner',
    avatar: 'https://via.placeholder.com/80x80/141414/ebc658?text=5U',
    items: 178,
    floorPrice: 2.1,
    totalVolume: 1423.9,
    description: 'Utility-focused Yeezy 500 collection with unique traits.',
  },
  {
    id: '6',
    name: 'Knit Runner Elite',
    creator: '0x3f7b62…a8e4',
    verified: true,
    banner: 'https://via.placeholder.com/400x150/0a0a0a/ebc658?text=Collection+Banner',
    avatar: 'https://via.placeholder.com/80x80/141414/ebc658?text=KR',
    items: 92,
    floorPrice: 3.5,
    totalVolume: 678.4,
    description: 'Elite tier Knit Runner NFTs with rare attributes.',
  },
  {
    id: '7',
    name: 'Desert Boot Genesis',
    creator: '0x2d9c54…f7a3',
    verified: false,
    banner: 'https://via.placeholder.com/400x150/0a0a0a/ebc658?text=Collection+Banner',
    avatar: 'https://via.placeholder.com/80x80/141414/ebc658?text=DB',
    items: 45,
    floorPrice: 5.8,
    totalVolume: 234.6,
    description: 'Genesis collection of Desert Boot NFTs.',
  },
  {
    id: '8',
    name: 'QNTM Collection',
    creator: '0x6d2b41…f9c8',
    verified: true,
    banner: 'https://via.placeholder.com/400x150/0a0a0a/ebc658?text=Collection+Banner',
    avatar: 'https://via.placeholder.com/80x80/141414/ebc658?text=QN',
    items: 128,
    floorPrice: 3.2,
    totalVolume: 987.5,
    description: 'QNTM basketball sneaker NFT collection.',
  },
]

type Collection = (typeof MOCK_COLLECTIONS)[number]
type ViewMode = 'grid' | 'list'
type SortOption = 'volume' | 'floor' | 'items' | 'name'

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: 'volume', label: 'Total Volume' },
  { value: 'floor', label: 'Floor Price' },
  { value: 'items', label: 'Items Count' },
  { value: 'name', label: 'Name (A–Z)' },
]

function caseLabel(id: string): string {
  return `COL-${id.padStart(3, '0')}`
}

export default function CollectionsPage() {
  const [searchQuery, setSearchQuery] = useState('')
  const [viewMode, setViewMode] = useState<ViewMode>('grid')
  const [sortBy, setSortBy] = useState<SortOption>('volume')
  const [sortOpen, setSortOpen] = useState(false)
  const sortRef = useRef<HTMLDivElement>(null)

  // Dismiss the sort menu on outside-click or Escape (listbox dismissal contract).
  useEffect(() => {
    if (!sortOpen) return
    function onDocPointer(e: MouseEvent) {
      if (sortRef.current && !sortRef.current.contains(e.target as Node)) setSortOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setSortOpen(false)
    }
    document.addEventListener('mousedown', onDocPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDocPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [sortOpen])

  const collections = useMemo(() => {
    const q = searchQuery.toLowerCase()
    return MOCK_COLLECTIONS.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.creator.toLowerCase().includes(q) ||
        c.description.toLowerCase().includes(q),
    ).sort((a, b) => {
      switch (sortBy) {
        case 'volume':
          return b.totalVolume - a.totalVolume
        case 'floor':
          return b.floorPrice - a.floorPrice
        case 'items':
          return b.items - a.items
        case 'name':
          return a.name.localeCompare(b.name)
        default:
          return 0
      }
    })
  }, [searchQuery, sortBy])

  const stats = useMemo(
    () => ({
      totalCollections: MOCK_COLLECTIONS.length,
      verified: MOCK_COLLECTIONS.filter((c) => c.verified).length,
      totalFloorValue: MOCK_COLLECTIONS.reduce((sum, c) => sum + c.floorPrice * c.items, 0),
      totalVolume: MOCK_COLLECTIONS.reduce((sum, c) => sum + c.totalVolume, 0),
    }),
    [],
  )

  return (
    <>
      <Navigation items={collectionsNavItems} showConnectWallet={true} />

      <div className="min-h-screen pt-32" style={{ background: 'var(--hc-bg)' }}>
        <CaseFileRibbon caseId={null} />

        <main className="mx-auto w-full max-w-[1536px] px-4 pb-24 pt-8 md:px-8 md:pt-10">
          {/* ─── HEADER ─── */}
          <header
            className="grid grid-cols-1 gap-6 border-b pb-8 lg:grid-cols-[1.4fr_repeat(3,1fr)] lg:items-end lg:gap-6"
            style={{ borderColor: 'var(--hc-hairline)' }}
            aria-label="Collections summary"
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
                  01
                </span>
                <span>Curated Sets · Verified Creators</span>
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
                Curated asset collections.
              </h1>
              <p
                className="mt-4 max-w-[60ch] font-mono text-[11px] uppercase tracking-[0.12em]"
                style={{ color: 'var(--hc-text-muted)' }}
              >
                <span style={{ color: 'var(--hc-verify-high)' }}>● {stats.verified}</span>{' '}
                verified · {stats.totalCollections - stats.verified} unverified · curated by examiner
              </p>
            </div>

            <KpiCell
              label="Collections"
              value={String(stats.totalCollections).padStart(2, '0')}
              unit={stats.totalCollections === 1 ? 'set' : 'sets'}
              delta={`${stats.verified} verified`}
              deltaTone="flat"
              barPct={Math.min(88, stats.totalCollections * 10)}
            />
            <KpiCell
              label="Combined Floor"
              value={stats.totalFloorValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}
              unit="USDC"
              delta="across all items"
              deltaTone="flat"
              barPct={48}
            />
            <KpiCell
              label="Trading Volume"
              value={stats.totalVolume.toLocaleString(undefined, { maximumFractionDigits: 0 })}
              unit="USDC"
              delta="all-time cleared"
              deltaTone="up"
              barPct={92}
              valueTone="verify-high"
            />
          </header>

          {/* ─── CONTROLS BAR ─── */}
          <section
            className="mt-6 flex flex-col gap-4 p-4 sm:flex-row sm:items-center"
            style={{ background: 'var(--hc-surface-1)', border: '1px solid var(--hc-border)' }}
            aria-label="Collection controls"
          >
            <div
              className="flex flex-1 items-center gap-2 px-3 py-2.5"
              style={{ background: 'var(--hc-bg)', border: '1px solid var(--hc-border)' }}
            >
              <Search className="h-3.5 w-3.5" style={{ color: 'var(--hc-text-muted)' }} aria-hidden />
              <input
                type="text"
                placeholder="NAME / CREATOR"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="flex-1 bg-transparent font-mono text-[12px] tracking-[0.04em] outline-none placeholder:text-[color:var(--hc-text-muted)]"
                style={{ color: 'var(--hc-text-body)' }}
                aria-label="Search collections"
              />
            </div>

            {/* Sort dropdown */}
            <div className="relative" ref={sortRef}>
              <button
                type="button"
                onClick={() => setSortOpen((o) => !o)}
                className="flex h-[42px] items-center gap-2 px-4 font-mono text-[11px] uppercase tracking-[0.1em] transition-colors"
                style={{
                  background: 'var(--hc-bg)',
                  border: '1px solid var(--hc-border)',
                  color: 'var(--hc-text)',
                }}
                aria-haspopup="listbox"
                aria-expanded={sortOpen}
              >
                <span style={{ color: 'var(--hc-text-muted)' }}>Sort:</span>
                <span>{SORT_OPTIONS.find((o) => o.value === sortBy)?.label}</span>
                <ChevronDown
                  className={`h-3.5 w-3.5 transition-transform ${sortOpen ? 'rotate-180' : ''}`}
                  aria-hidden
                />
              </button>
              {sortOpen && (
                <div
                  className="absolute right-0 top-full z-20 mt-2 w-52 p-1"
                  style={{ background: 'var(--hc-surface-2)', border: '1px solid var(--hc-border)' }}
                  role="listbox"
                >
                  {SORT_OPTIONS.map((option) => {
                    const active = sortBy === option.value
                    return (
                      <button
                        key={option.value}
                        type="button"
                        role="option"
                        aria-selected={active}
                        onClick={() => {
                          setSortBy(option.value)
                          setSortOpen(false)
                        }}
                        className={`flex w-full items-center px-3 py-2 text-left font-mono text-[11px] uppercase tracking-[0.08em] transition-colors ${active ? '' : 'hover:bg-[rgba(235,198,88,0.06)]'}`}
                        style={{
                          color: active ? 'var(--hc-accent)' : 'var(--hc-text-body)',
                          background: active ? 'var(--hc-accent-tint)' : undefined,
                        }}
                      >
                        {option.label}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>

            {/* View toggle */}
            <div
              className="flex items-center gap-1 p-1"
              style={{ background: 'var(--hc-bg)', border: '1px solid var(--hc-border)' }}
            >
              <ViewToggleButton
                active={viewMode === 'grid'}
                onClick={() => setViewMode('grid')}
                label="Grid view"
              >
                <Grid3x3 className="h-4 w-4" aria-hidden />
              </ViewToggleButton>
              <ViewToggleButton
                active={viewMode === 'list'}
                onClick={() => setViewMode('list')}
                label="List view"
              >
                <List className="h-4 w-4" aria-hidden />
              </ViewToggleButton>
            </div>
          </section>

          {/* ─── CONTENT ─── */}
          <section className="mt-8" aria-label="Collections">
            {collections.length === 0 ? (
              <EmptyState searchActive={Boolean(searchQuery)} onClear={() => setSearchQuery('')} />
            ) : viewMode === 'grid' ? (
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-3">
                {collections.map((c) => (
                  <CollectionCard key={c.id} collection={c} />
                ))}
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {collections.map((c) => (
                  <CollectionRow key={c.id} collection={c} />
                ))}
              </div>
            )}
          </section>

          {/* ─── BOTTOM CTA ─── */}
          {collections.length > 0 && (
            <div
              className="mt-24 flex flex-wrap items-center justify-between gap-5 border-t pt-8"
              style={{ borderColor: 'var(--hc-hairline)' }}
            >
              <div
                className="font-mono text-[11px] uppercase tracking-[0.14em]"
                style={{ color: 'var(--hc-text-muted)' }}
              >
                Want the full floor?{' '}
                <strong className="font-medium" style={{ color: 'var(--hc-text)' }}>
                  The marketplace
                </strong>{' '}
                lists every cleared dossier.
              </div>
              <Link
                href="/marketplace"
                className="inline-flex h-11 items-center gap-2 px-5 font-mono text-[12px] uppercase tracking-[0.14em] transition-all duration-200 hover:gap-3 hover:text-[var(--hc-accent)]"
                style={{
                  color: 'var(--hc-text)',
                  background: 'transparent',
                  border: '1px solid var(--hc-border)',
                  clipPath:
                    'polygon(10px 0, 100% 0, 100% calc(100% - 10px), calc(100% - 10px) 100%, 0 100%, 0 10px)',
                }}
              >
                View Marketplace →
              </Link>
            </div>
          )}
        </main>
      </div>
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

function ViewToggleButton({
  active,
  onClick,
  label,
  children,
}: {
  active: boolean
  onClick: () => void
  label: string
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={active}
      className="inline-flex items-center justify-center p-2 transition-colors"
      style={{
        color: active ? 'var(--hc-accent)' : 'var(--hc-text-muted)',
        background: active ? 'var(--hc-accent-tint)' : 'transparent',
        border: `1px solid ${active ? 'var(--hc-accent)' : 'transparent'}`,
      }}
    >
      {children}
    </button>
  )
}

function VerifiedPill({ verified }: { verified: boolean }) {
  if (!verified) {
    return (
      <span
        className="inline-flex items-center px-2 py-1 font-mono text-[9px] uppercase tracking-[0.14em]"
        style={{ color: 'var(--hc-text-muted)', border: '1px solid var(--hc-hairline)' }}
      >
        Unverified
      </span>
    )
  }
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2 py-1 font-mono text-[9px] uppercase tracking-[0.14em]"
      style={{
        color: 'var(--hc-verify-high)',
        background: 'rgba(0, 229, 160, 0.08)',
        border: '1px solid rgba(0, 229, 160, 0.3)',
      }}
    >
      <BadgeCheck className="h-3 w-3" aria-hidden />
      Verified
    </span>
  )
}

function ManifestCell({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div>
      <p className="font-mono text-[9px] uppercase tracking-[0.14em]" style={{ color: 'var(--hc-text-muted)' }}>
        {label}
      </p>
      <p
        className="mt-1 font-mono text-[13px] tabular-nums"
        style={{ color: tone ?? 'var(--hc-text)', fontWeight: 500 }}
      >
        {value}
      </p>
    </div>
  )
}

function CollectionCard({ collection }: { collection: Collection }) {
  return (
    <article
      className="group relative flex flex-col transition-all duration-200 hover:-translate-y-0.5"
      style={{ background: 'var(--hc-surface-1)', border: '1px solid var(--hc-border)' }}
    >
      {/* Forensic corner notch */}
      <span
        aria-hidden
        className="absolute -right-px -top-px h-4 w-4"
        style={{
          background: 'var(--hc-bg)',
          borderLeft: '1px solid var(--hc-border)',
          borderBottom: '1px solid var(--hc-border)',
          clipPath: 'polygon(100% 0, 0 0, 100% 100%)',
        }}
      />

      {/* Strip: case label + verified */}
      <div
        className="flex items-center justify-between gap-3 px-3.5 py-2"
        style={{ background: 'var(--hc-surface-2)', borderBottom: '1px solid var(--hc-hairline)' }}
      >
        <span
          className="font-mono text-[10px] uppercase tracking-[0.12em] tabular-nums"
          style={{ color: 'var(--hc-accent)', fontWeight: 500 }}
        >
          {caseLabel(collection.id)}
        </span>
        <VerifiedPill verified={collection.verified} />
      </div>

      {/* Banner */}
      <div className="relative h-32 overflow-hidden" style={{ background: 'var(--hc-surface-2)' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={collection.banner}
          alt={collection.name}
          loading="lazy"
          decoding="async"
          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
          style={{ filter: 'contrast(1.05) saturate(0.95)' }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2"
          style={{ background: 'linear-gradient(180deg, transparent 0%, rgba(0,0,0,0.85) 100%)' }}
        />
      </div>

      {/* Body */}
      <div className="flex flex-1 flex-col p-5">
        <div className="flex items-start gap-3">
          <div
            className="h-11 w-11 flex-shrink-0 overflow-hidden"
            style={{ background: 'var(--hc-surface-2)', border: '1px solid var(--hc-border)' }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={collection.avatar} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
          </div>
          <div className="min-w-0">
            <h3
              className="truncate font-mono text-[15px] leading-tight tracking-[-0.005em] transition-colors group-hover:text-[var(--hc-accent)]"
              style={{ color: 'var(--hc-text)', fontWeight: 500 }}
            >
              {collection.name}
            </h3>
            <p className="mt-1 font-mono text-[11px] uppercase tracking-[0.08em]" style={{ color: 'var(--hc-text-muted)' }}>
              by <span style={{ color: 'var(--hc-info)' }}>{collection.creator}</span>
            </p>
          </div>
        </div>

        <p
          className="mt-3 line-clamp-2 font-sans text-[13px] leading-[1.5]"
          style={{ color: 'var(--hc-text-muted)' }}
        >
          {collection.description}
        </p>

        <div
          className="mt-4 grid grid-cols-3 gap-3 p-3"
          style={{ background: 'var(--hc-bg)', border: '1px solid var(--hc-hairline)' }}
        >
          <ManifestCell label="Items" value={String(collection.items)} />
          <ManifestCell label="Floor" value={collection.floorPrice.toFixed(1)} tone="var(--hc-accent)" />
          <ManifestCell
            label="Volume"
            value={collection.totalVolume.toLocaleString(undefined, { maximumFractionDigits: 0 })}
            tone="var(--hc-verify-high)"
          />
        </div>

        <div
          className="mt-4 flex items-center justify-between border-t pt-3"
          style={{ borderColor: 'var(--hc-hairline)' }}
        >
          <Link
            href="/marketplace"
            className="inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.14em] transition-all hover:gap-3"
            style={{ color: 'var(--hc-accent)', fontWeight: 500 }}
          >
            View Collection <span>→</span>
          </Link>
          <span className="font-mono text-[10px] uppercase tracking-[0.12em]" style={{ color: 'var(--hc-text-muted)' }}>
            {collection.items} items
          </span>
        </div>
      </div>
    </article>
  )
}

function CollectionRow({ collection }: { collection: Collection }) {
  return (
    <article
      className="group flex items-center gap-5 p-4 transition-all duration-200 hover:-translate-y-0.5"
      style={{ background: 'var(--hc-surface-1)', border: '1px solid var(--hc-border)' }}
    >
      <div
        className="relative h-20 w-32 flex-shrink-0 overflow-hidden"
        style={{ background: 'var(--hc-surface-2)', border: '1px solid var(--hc-border)' }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={collection.banner}
          alt={collection.name}
          loading="lazy"
          decoding="async"
          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
          style={{ filter: 'contrast(1.05) saturate(0.95)' }}
        />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2.5">
          <h3
            className="truncate font-mono text-[15px] tracking-[-0.005em] transition-colors group-hover:text-[var(--hc-accent)]"
            style={{ color: 'var(--hc-text)', fontWeight: 500 }}
          >
            {collection.name}
          </h3>
          <VerifiedPill verified={collection.verified} />
        </div>
        <p className="mt-1 font-mono text-[11px] uppercase tracking-[0.08em]" style={{ color: 'var(--hc-text-muted)' }}>
          {caseLabel(collection.id)} <span className="px-1 opacity-40">·</span> by{' '}
          <span style={{ color: 'var(--hc-info)' }}>{collection.creator}</span>
        </p>
        <p className="mt-1 line-clamp-1 font-sans text-[13px]" style={{ color: 'var(--hc-text-muted)' }}>
          {collection.description}
        </p>
      </div>

      <div className="hidden items-center gap-8 sm:flex">
        <ManifestCell label="Items" value={String(collection.items)} />
        <ManifestCell label="Floor" value={`${collection.floorPrice.toFixed(1)} USDC`} tone="var(--hc-accent)" />
        <ManifestCell
          label="Volume"
          value={`${collection.totalVolume.toLocaleString(undefined, { maximumFractionDigits: 0 })} USDC`}
          tone="var(--hc-verify-high)"
        />
      </div>
    </article>
  )
}

function EmptyState({ searchActive, onClear }: { searchActive: boolean; onClear: () => void }) {
  return (
    <div
      className="flex flex-col items-center gap-4 px-6 py-24 text-center"
      style={{
        border: '1px dashed var(--hc-border)',
        background:
          'repeating-linear-gradient(135deg, transparent, transparent 24px, rgba(255,255,255,0.012) 24px, rgba(255,255,255,0.012) 25px)',
      }}
    >
      <div className="font-mono text-[11px] uppercase tracking-[0.32em]" style={{ color: 'var(--hc-text-muted)' }}>
        [ N O · C O L L E C T I O N ]
      </div>
      <h3
        className="font-mono text-[20px] uppercase tracking-[0.04em]"
        style={{ color: 'var(--hc-text)', fontWeight: 500 }}
      >
        No Collections Found
      </h3>
      <p className="max-w-[44ch] font-sans text-[14px] leading-[1.6]" style={{ color: 'var(--hc-text-muted)' }}>
        {searchActive
          ? 'No curated set matches that search. Clear the query to see every collection.'
          : 'No collections are catalogued yet.'}
      </p>
      {searchActive && (
        <button
          type="button"
          onClick={onClear}
          className="mt-2 inline-flex h-10 items-center gap-2 px-4 font-mono text-[11px] uppercase tracking-[0.14em] transition-all hover:gap-3"
          style={{
            color: 'var(--hc-accent)',
            background: 'var(--hc-accent-tint)',
            border: '1px solid var(--hc-accent-deep)',
          }}
        >
          Clear Search →
        </button>
      )}
    </div>
  )
}
