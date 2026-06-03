'use client'

import { useEffect, useState } from 'react'
import { AppLayout } from '@/components/app-layout'
import { Search, ExternalLink, TrendingUp, ShoppingBag, RefreshCw, Package, ArrowUpRight, ArrowDownRight } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { apiClient, type ActivityItem } from '@/lib/api-client'

type ActivityType = 'all' | 'sale' | 'listing' | 'transfer' | 'mint'

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
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [filterType])

  const filteredActivities = activities.filter((activity) => {
    const q = searchQuery.toLowerCase()
    return (
      (activity.nftName?.toLowerCase().includes(q) ?? false) ||
      (activity.from?.toLowerCase().includes(q) ?? false) ||
      (activity.to?.toLowerCase().includes(q) ?? false) ||
      activity.txHash.toLowerCase().includes(q)
    )
  })

  const stats = {
    totalActivities: activities.length,
    totalVolume: activities.filter((a) => a.type === 'sale').reduce((sum, a) => sum + a.price, 0),
    activeListings: activities.filter((a) => a.type === 'listing').length,
    recentSales: activities.filter((a) => a.type === 'sale' && a.timestamp > Date.now() - 86400000).length,
  }

  const getActivityIcon = (type: string) => {
    switch (type) {
      case 'sale':
        return <ShoppingBag className="h-5 w-5 text-emerald-500" />
      case 'listing':
        return <Package className="h-5 w-5 text-[#D4A82C]" />
      case 'transfer':
        return <RefreshCw className="h-5 w-5 text-blue-500" />
      case 'mint':
        return <TrendingUp className="h-5 w-5 text-purple-500" />
      default:
        return <Package className="h-5 w-5 text-slate-400" />
    }
  }

  const getActivityBadge = (type: string) => {
    const badges = {
      sale: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
      listing: 'bg-[#D4A82C]/10 text-[#D4A82C] border-[#D4A82C]/20',
      transfer: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
      mint: 'bg-purple-500/10 text-purple-500 border-purple-500/20',
    }
    return badges[type as keyof typeof badges] || 'bg-slate-700 text-slate-300 border-slate-600'
  }

  const formatTimestamp = (timestamp: number) => {
    try {
      return formatDistanceToNow(new Date(timestamp), { addSuffix: true })
    } catch {
      return 'Unknown'
    }
  }

  return (
    <AppLayout>
      <div className="space-y-8">
        {/* Hero Section */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold text-white sm:text-4xl">Activity Feed</h1>
              <span className="rounded-full bg-[#D4A82C]/10 px-3 py-1 text-sm font-medium text-[#D4A82C] border border-[#D4A82C]/20">
                {stats.totalActivities} Total
              </span>
            </div>
            <p className="mt-2 text-slate-400">
              Real-time marketplace activities and transactions
            </p>
          </div>
        </div>

        {/* Stats Dashboard */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="group rounded-lg border border-slate-700 bg-slate-800/50 p-6 transition-all duration-300 hover:border-[#D4A82C]/50 hover:bg-slate-800/70">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium uppercase tracking-wider text-slate-400">Total Activities</p>
              <TrendingUp className="h-5 w-5 text-slate-500 transition-colors group-hover:text-[#D4A82C]" />
            </div>
            <p className="mt-2 font-mono text-3xl font-bold text-white">{stats.totalActivities}</p>
          </div>

          <div className="group rounded-lg border border-slate-700 bg-slate-800/50 p-6 transition-all duration-300 hover:border-[#D4A82C]/50 hover:bg-slate-800/70">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium uppercase tracking-wider text-slate-400">Total Volume</p>
              <ArrowUpRight className="h-5 w-5 text-slate-500 transition-colors group-hover:text-emerald-500" />
            </div>
            <p className="mt-2 font-mono text-3xl font-bold text-emerald-500">{stats.totalVolume.toFixed(2)} USDC</p>
          </div>

          <div className="group rounded-lg border border-slate-700 bg-slate-800/50 p-6 transition-all duration-300 hover:border-[#D4A82C]/50 hover:bg-slate-800/70">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium uppercase tracking-wider text-slate-400">Active Listings</p>
              <Package className="h-5 w-5 text-slate-500 transition-colors group-hover:text-[#D4A82C]" />
            </div>
            <p className="mt-2 font-mono text-3xl font-bold text-white">{stats.activeListings}</p>
          </div>

          <div className="group rounded-lg border border-slate-700 bg-slate-800/50 p-6 transition-all duration-300 hover:border-[#D4A82C]/50 hover:bg-slate-800/70">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium uppercase tracking-wider text-slate-400">Recent Sales (24h)</p>
              <ShoppingBag className="h-5 w-5 text-slate-500 transition-colors group-hover:text-emerald-500" />
            </div>
            <p className="mt-2 font-mono text-3xl font-bold text-white">{stats.recentSales}</p>
          </div>
        </div>

        {/* Filter Bar */}
        <div className="flex flex-col gap-4 rounded-lg border border-slate-700 bg-slate-800/50 p-4 sm:flex-row sm:items-center">
          {/* Search */}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search by NFT, address, or transaction..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-900 py-2.5 pl-10 pr-4 text-sm text-white placeholder-slate-400 transition-all focus:border-[#D4A82C] focus:outline-none focus:ring-1 focus:ring-[#D4A82C]"
            />
          </div>

          {/* Filter Chips */}
          <div className="flex flex-wrap gap-2">
            {(['all', 'sale', 'listing', 'transfer', 'mint'] as ActivityType[]).map((type) => (
              <button
                key={type}
                onClick={() => setFilterType(type)}
                className={`rounded-lg px-4 py-2 text-sm font-medium uppercase tracking-wide transition-all duration-300 ${
                  filterType === type
                    ? 'bg-[#D4A82C] text-black shadow-lg shadow-[#D4A82C]/30'
                    : 'bg-slate-700 text-slate-300 hover:bg-slate-600 hover:text-white'
                }`}
              >
                {type}
              </button>
            ))}
          </div>
        </div>

        {/* Activity Feed */}
        <div className="space-y-3">
          {loading ? (
            <div className="flex flex-col items-center justify-center rounded-lg border border-slate-700 bg-slate-800/50 py-16">
              <RefreshCw className="h-10 w-10 animate-spin text-slate-600" />
              <p className="mt-4 text-sm text-slate-500">Loading activity…</p>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center rounded-lg border border-red-500/30 bg-red-500/5 py-16">
              <Package className="h-16 w-16 text-red-500/60" />
              <p className="mt-4 text-lg font-medium text-red-400">Couldn’t load activity</p>
              <p className="mt-1 text-sm text-slate-500">{error}</p>
            </div>
          ) : filteredActivities.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-lg border border-slate-700 bg-slate-800/50 py-16">
              <Package className="h-16 w-16 text-slate-600" />
              {searchQuery || filterType !== 'all' ? (
                <>
                  <p className="mt-4 text-lg font-medium text-slate-400">No matching activity</p>
                  <p className="mt-1 text-sm text-slate-500">Try adjusting your filters or search query</p>
                </>
              ) : (
                <>
                  <p className="mt-4 text-lg font-medium text-slate-400">No activity yet</p>
                  <p className="mt-1 text-sm text-slate-500">
                    List a verified item to start the chain — every mint, listing, sale, and transfer shows up here.
                  </p>
                </>
              )}
            </div>
          ) : (
            filteredActivities.map((activity) => (
              <div
                key={activity.id}
                className="group rounded-lg border border-slate-700 bg-slate-800/50 p-4 transition-all duration-300 hover:border-[#D4A82C]/50 hover:bg-slate-800/70 sm:p-6"
              >
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  {/* Left: NFT Info */}
                  <div className="flex items-center gap-4">
                    {/* NFT Thumbnail */}
                    <div className="relative flex h-16 w-16 flex-shrink-0 items-center justify-center overflow-hidden rounded-lg border border-slate-700 bg-slate-900 sm:h-20 sm:w-20">
                      {activity.nftImage ? (
                        <img
                          src={activity.nftImage}
                          alt={activity.nftName ?? 'NFT'}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <Package className="h-7 w-7 text-slate-600" />
                      )}
                    </div>

                    {/* Details */}
                    <div className="flex-1 space-y-2">
                      <div className="flex items-center gap-2">
                        {getActivityIcon(activity.type)}
                        <span
                          className={`rounded-full border px-2.5 py-1 text-xs font-medium uppercase ${getActivityBadge(
                            activity.type
                          )}`}
                        >
                          {activity.type}
                        </span>
                      </div>
                      <h3 className="font-semibold text-white group-hover:text-[#D4A82C] transition-colors">
                        {activity.nftName ?? `${activity.txHash.slice(0, 6)}…`}
                      </h3>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-400">
                        <div className="flex items-center gap-1.5">
                          <ArrowUpRight className="h-3.5 w-3.5" />
                          <span className="font-mono text-xs">{activity.from ?? '—'}</span>
                        </div>
                        {activity.to && (
                          <>
                            <span>→</span>
                            <div className="flex items-center gap-1.5">
                              <ArrowDownRight className="h-3.5 w-3.5" />
                              <span className="font-mono text-xs">{activity.to}</span>
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Right: Price & Actions */}
                  <div className="flex items-center justify-between gap-6 sm:flex-col sm:items-end sm:justify-start">
                    {/* Price */}
                    {activity.price > 0 && (
                      <div className="text-right">
                        <p className="font-mono text-2xl font-bold text-[#D4A82C]">
                          {activity.price.toFixed(2)} USDC
                        </p>
                        <p className="mt-0.5 text-xs text-slate-500">
                          ${(activity.price * 125).toFixed(2)} USD
                        </p>
                      </div>
                    )}

                    {/* Timestamp & Link */}
                    <div className="flex items-center gap-3 text-sm text-slate-400">
                      <span className="whitespace-nowrap">{formatTimestamp(activity.timestamp)}</span>
                      <a
                        href={`https://explorer.solana.com/tx/${activity.txHash}?cluster=devnet`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 rounded-lg bg-slate-700 px-2.5 py-1.5 text-xs font-medium text-slate-300 transition-all hover:bg-[#D4A82C] hover:text-black"
                      >
                        <span className="font-mono">{activity.txHash}</span>
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Load More Placeholder */}
        {filteredActivities.length > 0 && (
          <div className="flex justify-center pt-4">
            <button className="rounded-lg border border-slate-700 bg-slate-800/50 px-6 py-3 text-sm font-medium uppercase text-white transition-all hover:border-[#D4A82C] hover:bg-slate-800/70 hover:text-[#D4A82C]">
              Load More Activities
            </button>
          </div>
        )}
      </div>
    </AppLayout>
  )
}
