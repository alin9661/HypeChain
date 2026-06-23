'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Navigation } from '@/components/navigation'
import { CaseFileRibbon } from '@/components/case-file-ribbon'
import { Search, ExternalLink, TrendingUp, ShoppingBag, RefreshCw, Package } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { apiClient, type ActivityItem } from '@/lib/api-client'

type ActivityType = 'all' | 'sale' | 'listing' | 'transfer' | 'mint'

const activitiesNavItems = [
  { name: 'Marketplace', href: '/marketplace' },
  { name: 'Collections', href: '/collections' },
  { name: 'Activities', href: '/activities' },
  { name: 'My Listings', href: '/listings' },
]

// Per-type forensic vocabulary. Colors map to design tokens; the rgba mirrors
// the token hexes so the tinted chips stay on-palette (same convention as the
// marketplace StatusPill). No purple — mint reads amber (verify-med).
const TYPE_CONFIG: Record<
  Exclude<ActivityType, 'all'>,
  { verb: string; color: string; bg: string; border: string; Icon: typeof Package }
> = {
  sale: {
    verb: 'Sale',
    color: 'var(--hc-verify-high)',
    bg: 'rgba(0, 229, 160, 0.08)',
    border: 'rgba(0, 229, 160, 0.3)',
    Icon: ShoppingBag,
  },
  listing: {
    verb: 'Listed',
    color: 'var(--hc-accent)',
    bg: 'var(--hc-accent-tint)',
    border: 'var(--hc-accent-deep)',
    Icon: Package,
  },
  transfer: {
    verb: 'Transfer',
    color: 'var(--hc-info)',
    bg: 'rgba(77, 158, 255, 0.08)',
    border: 'rgba(77, 158, 255, 0.3)',
    Icon: RefreshCw,
  },
  mint: {
    verb: 'Mint',
    color: 'var(--hc-verify-med)',
    bg: 'rgba(255, 149, 0, 0.08)',
    border: 'rgba(255, 149, 0, 0.3)',
    Icon: TrendingUp,
  },
}

// Static display-only USDC→SOL estimate. Not a live rate — used only for the
// secondary "≈ ◎" figure next to a price.
const USDC_PER_SOL_ESTIMATE = 182

function shortAddr(addr: string | null | undefined): string {
  if (!addr) return '—'
  if (addr.length <= 10) return addr
  return `${addr.slice(0, 4)}…${addr.slice(-4)}`
}

function formatTimestamp(timestamp: number): string {
  try {
    return formatDistanceToNow(new Date(timestamp), { addSuffix: true })
  } catch {
    return 'Unknown'
  }
}

export default function ActivitiesPage() {
  const [searchQuery, setSearchQuery] = useState('')
  const [filterType, setFilterType] = useState<ActivityType>('all')
  const [activities, setActivities] = useState<ActivityItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Fetch the live feed. The type chip filters server-side (one indexed query);
  // the free-text search stays client-side over the fetched page. Empty result
  // is the honest day-one state, not seeded data.
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    apiClient
      .getActivities(filterType === 'all' ? undefined : { type: filterType })
      .then((res) => {
        if (cancelled) return
        if (res.success && res.data) {
          setActivities(res.data.activities)
        } else {
          setError(res.error || 'Failed to load activity feed')
          setActivities([])
        }
      })
      .catch((e) => {
        if (cancelled) return
        setError(e instanceof Error ? e.message : 'Failed to load activity feed')
        setActivities([])
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [filterType])

  const filteredActivities = useMemo(() => {
    const q = searchQuery.toLowerCase()
    if (!q) return activities
    return activities.filter(
      (activity) =>
        (activity.nftName?.toLowerCase().includes(q) ?? false) ||
        (activity.from?.toLowerCase().includes(q) ?? false) ||
        (activity.to?.toLowerCase().includes(q) ?? false) ||
        activity.txHash.toLowerCase().includes(q),
    )
  }, [activities, searchQuery])

  const stats = useMemo(
    () => ({
      totalActivities: activities.length,
      totalVolume: activities
        .filter((a) => a.type === 'sale')
        .reduce((sum, a) => sum + a.price, 0),
      activeListings: activities.filter((a) => a.type === 'listing').length,
      recentSales: activities.filter(
        (a) => a.type === 'sale' && a.timestamp > Date.now() - 86_400_000,
      ).length,
    }),
    [activities],
  )

  // Derived from TYPE_CONFIG so adding a type in one place updates the chips too.
  const filters: ActivityType[] = ['all', ...(Object.keys(TYPE_CONFIG) as Exclude<ActivityType, 'all'>[])]

  return (
    <>
      <Navigation items={activitiesNavItems} showConnectWallet={true} />

      <div className="min-h-screen pt-32" style={{ background: 'var(--hc-bg)' }}>
        <CaseFileRibbon caseId={null} />

        <main className="mx-auto w-full max-w-[1536px] px-4 pb-24 pt-8 md:px-8 md:pt-10">
          {/* ─── HEADER ─── */}
          <header
            className="grid grid-cols-1 gap-6 border-b pb-8 lg:grid-cols-[1fr_auto] lg:items-end lg:gap-12"
            style={{ borderColor: 'var(--hc-hairline)' }}
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
                  04
                </span>
                <span>Provenance Ledger · Chain-of-Custody</span>
              </div>
              <h1
                className="font-mono uppercase leading-[0.96] tracking-[-0.02em]"
                style={{
                  fontSize: 'clamp(36px, 6vw, 72px)',
                  color: 'var(--hc-text)',
                  fontWeight: 600,
                }}
              >
                Activity
                <br />
                <span style={{ color: 'var(--hc-accent)' }}>Feed.</span>
              </h1>
              <p
                className="mt-5 max-w-[58ch] font-mono text-[11px] uppercase tracking-[0.12em]"
                style={{ color: 'var(--hc-text-muted)' }}
              >
                <span style={{ color: 'var(--hc-verify-high)' }}>● {stats.totalActivities}</span>{' '}
                events on record · every mint, listing, sale, and transfer is anchored on-chain
              </p>
            </div>
          </header>

          {/* ─── STATS STRIP ─── */}
          <section
            className="mt-6 grid grid-cols-2 sm:grid-cols-4"
            style={{ border: '1px solid var(--hc-hairline)', background: 'var(--hc-surface-1)' }}
            aria-label="Activity statistics"
          >
            <StatCell label="Total Activities" value={String(stats.totalActivities).padStart(2, '0')} />
            <StatCell
              label="Total Volume"
              value={stats.totalVolume > 0 ? `${stats.totalVolume.toLocaleString()} USDC` : '—'}
              tone="verify-high"
            />
            <StatCell label="Active Listings" value={String(stats.activeListings).padStart(2, '0')} accent />
            <StatCell label="Recent Sales · 24h" value={String(stats.recentSales).padStart(2, '0')} live />
          </section>

          {/* ─── FILTER BAR ─── */}
          <section
            className="mt-8 flex flex-col gap-4 p-4 sm:flex-row sm:items-center"
            style={{ background: 'var(--hc-surface-1)', border: '1px solid var(--hc-border)' }}
            aria-label="Filter activity"
          >
            <div
              className="flex flex-1 items-center gap-2 px-3 py-2.5"
              style={{ background: 'var(--hc-bg)', border: '1px solid var(--hc-border)' }}
            >
              <Search className="h-3.5 w-3.5" style={{ color: 'var(--hc-text-muted)' }} aria-hidden />
              <input
                type="text"
                placeholder="NFT / ADDRESS / TX HASH"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="flex-1 bg-transparent font-mono text-[12px] tracking-[0.04em] outline-none placeholder:text-[color:var(--hc-text-muted)]"
                style={{ color: 'var(--hc-text-body)' }}
                aria-label="Search activity"
              />
            </div>

            <div role="group" aria-label="Filter by type" className="flex flex-wrap gap-2">
              {filters.map((type) => (
                <FilterChip
                  key={type}
                  active={filterType === type}
                  onClick={() => setFilterType(type)}
                >
                  {type}
                </FilterChip>
              ))}
            </div>
          </section>

          {/* ─── FEED ─── */}
          <section className="mt-8" aria-label="Activity feed">
            {loading ? (
              <LoadingState />
            ) : error ? (
              <ErrorState message={error} />
            ) : filteredActivities.length === 0 ? (
              <EmptyState filtered={Boolean(searchQuery) || filterType !== 'all'} />
            ) : (
              <div className="flex flex-col gap-3">
                {filteredActivities.map((activity) => (
                  <ActivityRow key={activity.id} activity={activity} />
                ))}
              </div>
            )}
          </section>

          {/* ─── BOTTOM CTA ─── */}
          {filteredActivities.length > 0 && (
            <div
              className="mt-24 flex flex-wrap items-center justify-between gap-5 border-t pt-8"
              style={{ borderColor: 'var(--hc-hairline)' }}
            >
              <div
                className="font-mono text-[11px] uppercase tracking-[0.14em]"
                style={{ color: 'var(--hc-text-muted)' }}
              >
                Looking for the floor?{' '}
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

function StatCell({
  label,
  value,
  accent,
  live,
  tone,
}: {
  label: string
  value: string
  accent?: boolean
  live?: boolean
  tone?: 'verify-high'
}) {
  const valueColor = tone === 'verify-high'
    ? 'var(--hc-verify-high)'
    : accent
      ? 'var(--hc-accent)'
      : 'var(--hc-text)'
  return (
    <div
      className="border-b border-r px-6 py-5 [&:nth-child(2n)]:border-r-0 sm:[&:nth-child(2n)]:border-r sm:[&:nth-child(4n)]:border-r-0"
      style={{ borderColor: 'var(--hc-hairline)' }}
    >
      <div
        className="mb-2 font-mono text-[10px] uppercase tracking-[0.16em]"
        style={{ color: 'var(--hc-text-muted)', fontWeight: 500 }}
      >
        {label}
      </div>
      <div
        className="font-mono tabular-nums tracking-[-0.01em]"
        style={{ color: valueColor, fontWeight: 500, fontSize: live ? 14 : 18 }}
      >
        {live ? (
          <span className="inline-flex items-center gap-2">
            <span
              aria-hidden
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

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className="inline-flex items-center px-3.5 py-2 font-mono text-[11px] uppercase tracking-[0.12em] transition-all duration-150"
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
    </button>
  )
}

function TypePill({ type }: { type: ActivityItem['type'] }) {
  const config = TYPE_CONFIG[type as Exclude<ActivityType, 'all'>] ?? {
    verb: String(type),
    color: 'var(--hc-text-muted)',
    bg: 'transparent',
    border: 'var(--hc-hairline)',
    Icon: Package,
  }
  const { Icon } = config
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.14em]"
      style={{ color: config.color, background: config.bg, border: `1px solid ${config.border}` }}
    >
      <Icon className="h-3 w-3" aria-hidden />
      {config.verb}
    </span>
  )
}

function ActivityRow({ activity }: { activity: ActivityItem }) {
  const config = TYPE_CONFIG[activity.type as Exclude<ActivityType, 'all'>]
  const accent = config?.color ?? 'var(--hc-text-muted)'
  return (
    <article
      className="group flex flex-col gap-4 p-4 transition-all duration-200 hover:-translate-y-0.5 sm:flex-row sm:items-center sm:justify-between sm:p-5"
      style={{ background: 'var(--hc-surface-1)', border: '1px solid var(--hc-border)' }}
    >
      {/* Left: thumbnail + details */}
      <div className="flex min-w-0 items-center gap-4">
        <div
          className="flex h-16 w-16 flex-shrink-0 items-center justify-center overflow-hidden"
          style={{ background: 'var(--hc-surface-2)', border: '1px solid var(--hc-border)' }}
        >
          {activity.nftImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={activity.nftImage}
              alt={activity.nftName ?? 'Asset'}
              loading="lazy"
              decoding="async"
              className="h-full w-full object-cover"
              style={{ filter: 'contrast(1.05) saturate(0.95)' }}
            />
          ) : (
            <Package className="h-6 w-6" style={{ color: 'var(--hc-text-muted)' }} aria-hidden />
          )}
        </div>

        <div className="min-w-0 flex-1 space-y-2">
          <TypePill type={activity.type} />
          <h3
            className="truncate font-mono text-[15px] leading-tight tracking-[-0.005em] transition-colors"
            style={{ color: 'var(--hc-text)', fontWeight: 500 }}
          >
            {activity.nftName ?? `${activity.txHash.slice(0, 6)}…`}
          </h3>
          <div
            className="flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[11px] uppercase tracking-[0.08em]"
            style={{ color: 'var(--hc-text-muted)' }}
          >
            <span style={{ color: 'var(--hc-info)' }}>{shortAddr(activity.from)}</span>
            {activity.to && (
              <>
                <span aria-hidden>→</span>
                <span style={{ color: 'var(--hc-info)' }}>{shortAddr(activity.to)}</span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Right: price + timestamp + explorer */}
      <div className="flex items-center justify-between gap-6 sm:flex-col sm:items-end sm:justify-start sm:gap-2">
        {activity.price > 0 && (
          <div className="text-right">
            <p
              className="font-mono tabular-nums leading-none"
              style={{ color: accent, fontSize: 20, fontWeight: 500 }}
            >
              {activity.price.toLocaleString()} USDC
            </p>
            <p
              className="mt-1 font-mono text-[10px] uppercase tracking-[0.08em] tabular-nums"
              style={{ color: 'var(--hc-text-muted)' }}
            >
              ≈ {(activity.price / USDC_PER_SOL_ESTIMATE).toFixed(3)} ◎
            </p>
          </div>
        )}

        <div className="flex items-center gap-3">
          <span
            className="whitespace-nowrap font-mono text-[10px] uppercase tracking-[0.1em]"
            style={{ color: 'var(--hc-text-muted)' }}
          >
            {formatTimestamp(activity.timestamp)}
          </span>
          <a
            href={`https://explorer.solana.com/tx/${activity.txHash}?cluster=devnet`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.1em] transition-colors hover:text-[var(--hc-accent)]"
            style={{ color: 'var(--hc-text-muted)', border: '1px solid var(--hc-hairline)' }}
            aria-label="View transaction on Solana Explorer"
          >
            {shortAddr(activity.txHash)}
            <ExternalLink className="h-3 w-3" aria-hidden />
          </a>
        </div>
      </div>
    </article>
  )
}

function LoadingState() {
  return (
    <div className="flex items-center justify-center py-20">
      <div className="text-center">
        <span
          aria-hidden
          className="mx-auto mb-4 block h-2 w-2 rounded-full"
          style={{ background: 'var(--hc-accent)', animation: 'hc-live-pulse 1.4s ease-in-out infinite' }}
        />
        <p
          className="font-mono text-[11px] uppercase tracking-[0.16em]"
          style={{ color: 'var(--hc-text-muted)' }}
          role="status"
        >
          Reading provenance ledger…
        </p>
      </div>
    </div>
  )
}

function ErrorState({ message }: { message: string }) {
  return (
    <div
      className="flex flex-col items-center gap-3 px-6 py-20 text-center"
      style={{ background: 'var(--hc-surface-1)', border: '1px solid var(--hc-verify-low)' }}
      role="alert"
    >
      <div
        className="font-mono text-[11px] uppercase tracking-[0.32em]"
        style={{ color: 'var(--hc-verify-low)' }}
      >
        [ L E D G E R · U N R E A C H A B L E ]
      </div>
      <h3
        className="font-mono text-[18px] uppercase tracking-[0.04em]"
        style={{ color: 'var(--hc-text)', fontWeight: 500 }}
      >
        Couldn’t load activity
      </h3>
      <p
        className="max-w-[48ch] font-mono text-[11px] uppercase tracking-[0.08em]"
        style={{ color: 'var(--hc-text-muted)' }}
      >
        {message}
      </p>
    </div>
  )
}

function EmptyState({ filtered }: { filtered: boolean }) {
  return (
    <div
      className="flex flex-col items-center gap-4 px-6 py-24 text-center"
      style={{
        border: '1px dashed var(--hc-border)',
        background:
          'repeating-linear-gradient(135deg, transparent, transparent 24px, rgba(255,255,255,0.012) 24px, rgba(255,255,255,0.012) 25px)',
      }}
    >
      <div
        className="font-mono text-[11px] uppercase tracking-[0.32em]"
        style={{ color: 'var(--hc-text-muted)' }}
      >
        [ N O · A C T I V I T Y ]
      </div>
      <h3
        className="font-mono text-[20px] uppercase tracking-[0.04em]"
        style={{ color: 'var(--hc-text)', fontWeight: 500 }}
      >
        {filtered ? 'No Matching Activity' : 'Ledger Is Empty'}
      </h3>
      <p
        className="max-w-[46ch] font-sans text-[14px] leading-[1.6]"
        style={{ color: 'var(--hc-text-muted)' }}
      >
        {filtered
          ? 'No events match this filter or search. Adjust the type chips or clear the query.'
          : 'List a verified item to start the chain — every mint, listing, sale, and transfer is recorded here.'}
      </p>
      {!filtered && (
        <Link
          href="/listings"
          className="mt-2 inline-flex h-10 items-center gap-2 px-4 font-mono text-[11px] uppercase tracking-[0.14em] transition-all hover:gap-3"
          style={{
            color: 'var(--hc-accent)',
            background: 'var(--hc-accent-tint)',
            border: '1px solid var(--hc-accent-deep)',
          }}
        >
          File an intake →
        </Link>
      )}
    </div>
  )
}
