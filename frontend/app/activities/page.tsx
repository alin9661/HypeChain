'use client'

import { useState } from 'react'
import { AppLayout } from '@/components/app-layout'
import { Search, ExternalLink, TrendingUp, ShoppingBag, RefreshCw, Package, ArrowUpRight, ArrowDownRight } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'

// Mock data for placeholder
const MOCK_ACTIVITIES = [
  {
    id: '1',
    type: 'sale',
    nftName: 'Yeezy Foam Runner #3421',
    nftImage: 'https://via.placeholder.com/80x80/1a1a1a/ffc700?text=NFT',
    from: '0x742d35...a5f4',
    to: '0x8f3e29...b7c2',
    price: 2.5,
    timestamp: Date.now() - 1000 * 60 * 15, // 15 min ago
    txHash: '3J98t1...m2k9s',
  },
  {
    id: '2',
    type: 'listing',
    nftName: 'Yeezy 350 Boost #1892',
    nftImage: 'https://via.placeholder.com/80x80/1a1a1a/ffc700?text=NFT',
    from: '0x5a7c31...d8e6',
    to: null,
    price: 3.8,
    timestamp: Date.now() - 1000 * 60 * 45, // 45 min ago
    txHash: '8K42n7...p5j3w',
  },
  {
    id: '3',
    type: 'transfer',
    nftName: 'Yeezy Slide #7653',
    nftImage: 'https://via.placeholder.com/80x80/1a1a1a/ffc700?text=NFT',
    from: '0x1c8f92...e3a7',
    to: '0x6d2b41...f9c8',
    price: 0,
    timestamp: Date.now() - 1000 * 60 * 60 * 2, // 2 hours ago
    txHash: '5N67k2...r8t4m',
  },
  {
    id: '4',
    type: 'mint',
    nftName: 'Yeezy 700 V3 #4321',
    nftImage: 'https://via.placeholder.com/80x80/1a1a1a/ffc700?text=NFT',
    from: '0x9e4a83...c1d5',
    to: '0x9e4a83...c1d5',
    price: 1.2,
    timestamp: Date.now() - 1000 * 60 * 60 * 5, // 5 hours ago
    txHash: '2M89p4...n6k1q',
  },
  {
    id: '5',
    type: 'sale',
    nftName: 'Yeezy 500 Utility #2109',
    nftImage: 'https://via.placeholder.com/80x80/1a1a1a/ffc700?text=NFT',
    from: '0x3f7b62...a8e4',
    to: '0x7c5d41...b2f9',
    price: 4.2,
    timestamp: Date.now() - 1000 * 60 * 60 * 12, // 12 hours ago
    txHash: '7P53m8...k2n5t',
  },
  {
    id: '6',
    type: 'listing',
    nftName: 'Yeezy Knit Runner #8901',
    nftImage: 'https://via.placeholder.com/80x80/1a1a1a/ffc700?text=NFT',
    from: '0x2d9c54...f7a3',
    to: null,
    price: 2.9,
    timestamp: Date.now() - 1000 * 60 * 60 * 18, // 18 hours ago
    txHash: '4L76j9...m3p8r',
  },
]

type ActivityType = 'all' | 'sale' | 'listing' | 'transfer' | 'mint'

export default function ActivitiesPage() {
  const [searchQuery, setSearchQuery] = useState('')
  const [filterType, setFilterType] = useState<ActivityType>('all')

  const filteredActivities = MOCK_ACTIVITIES.filter(activity => {
    const matchesSearch =
      activity.nftName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      activity.from.toLowerCase().includes(searchQuery.toLowerCase()) ||
      activity.to?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      activity.txHash.toLowerCase().includes(searchQuery.toLowerCase())

    const matchesFilter = filterType === 'all' || activity.type === filterType

    return matchesSearch && matchesFilter
  })

  const stats = {
    totalActivities: MOCK_ACTIVITIES.length,
    totalVolume: MOCK_ACTIVITIES.filter(a => a.type === 'sale').reduce((sum, a) => sum + a.price, 0),
    activeListings: MOCK_ACTIVITIES.filter(a => a.type === 'listing').length,
    recentSales: MOCK_ACTIVITIES.filter(a => a.type === 'sale' && a.timestamp > Date.now() - 86400000).length,
  }

  const getActivityIcon = (type: string) => {
    switch (type) {
      case 'sale':
        return <ShoppingBag className="h-5 w-5 text-emerald-500" />
      case 'listing':
        return <Package className="h-5 w-5 text-[#FFC700]" />
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
      listing: 'bg-[#FFC700]/10 text-[#FFC700] border-[#FFC700]/20',
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
              <span className="rounded-full bg-[#FFC700]/10 px-3 py-1 text-sm font-medium text-[#FFC700] border border-[#FFC700]/20">
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
          <div className="group rounded-lg border border-slate-700 bg-slate-800/50 p-6 transition-all duration-300 hover:border-[#FFC700]/50 hover:bg-slate-800/70">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium uppercase tracking-wider text-slate-400">Total Activities</p>
              <TrendingUp className="h-5 w-5 text-slate-500 transition-colors group-hover:text-[#FFC700]" />
            </div>
            <p className="mt-2 font-mono text-3xl font-bold text-white">{stats.totalActivities}</p>
          </div>

          <div className="group rounded-lg border border-slate-700 bg-slate-800/50 p-6 transition-all duration-300 hover:border-[#FFC700]/50 hover:bg-slate-800/70">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium uppercase tracking-wider text-slate-400">Total Volume</p>
              <ArrowUpRight className="h-5 w-5 text-slate-500 transition-colors group-hover:text-emerald-500" />
            </div>
            <p className="mt-2 font-mono text-3xl font-bold text-emerald-500">{stats.totalVolume.toFixed(2)} SOL</p>
          </div>

          <div className="group rounded-lg border border-slate-700 bg-slate-800/50 p-6 transition-all duration-300 hover:border-[#FFC700]/50 hover:bg-slate-800/70">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium uppercase tracking-wider text-slate-400">Active Listings</p>
              <Package className="h-5 w-5 text-slate-500 transition-colors group-hover:text-[#FFC700]" />
            </div>
            <p className="mt-2 font-mono text-3xl font-bold text-white">{stats.activeListings}</p>
          </div>

          <div className="group rounded-lg border border-slate-700 bg-slate-800/50 p-6 transition-all duration-300 hover:border-[#FFC700]/50 hover:bg-slate-800/70">
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
              className="w-full rounded-lg border border-slate-700 bg-slate-900 py-2.5 pl-10 pr-4 text-sm text-white placeholder-slate-400 transition-all focus:border-[#FFC700] focus:outline-none focus:ring-1 focus:ring-[#FFC700]"
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
                    ? 'bg-[#FFC700] text-black shadow-lg shadow-[#FFC700]/30'
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
          {filteredActivities.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-lg border border-slate-700 bg-slate-800/50 py-16">
              <Package className="h-16 w-16 text-slate-600" />
              <p className="mt-4 text-lg font-medium text-slate-400">No activities found</p>
              <p className="mt-1 text-sm text-slate-500">Try adjusting your filters or search query</p>
            </div>
          ) : (
            filteredActivities.map((activity) => (
              <div
                key={activity.id}
                className="group rounded-lg border border-slate-700 bg-slate-800/50 p-4 transition-all duration-300 hover:border-[#FFC700]/50 hover:bg-slate-800/70 sm:p-6"
              >
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  {/* Left: NFT Info */}
                  <div className="flex items-center gap-4">
                    {/* NFT Thumbnail */}
                    <div className="relative h-16 w-16 flex-shrink-0 overflow-hidden rounded-lg border border-slate-700 bg-slate-900 sm:h-20 sm:w-20">
                      <img
                        src={activity.nftImage}
                        alt={activity.nftName}
                        className="h-full w-full object-cover"
                      />
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
                      <h3 className="font-semibold text-white group-hover:text-[#FFC700] transition-colors">
                        {activity.nftName}
                      </h3>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-400">
                        <div className="flex items-center gap-1.5">
                          <ArrowUpRight className="h-3.5 w-3.5" />
                          <span className="font-mono text-xs">{activity.from}</span>
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
                        <p className="font-mono text-2xl font-bold text-[#FFC700]">
                          {activity.price.toFixed(2)} SOL
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
                        className="inline-flex items-center gap-1 rounded-lg bg-slate-700 px-2.5 py-1.5 text-xs font-medium text-slate-300 transition-all hover:bg-[#FFC700] hover:text-black"
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
            <button className="rounded-lg border border-slate-700 bg-slate-800/50 px-6 py-3 text-sm font-medium uppercase text-white transition-all hover:border-[#FFC700] hover:bg-slate-800/70 hover:text-[#FFC700]">
              Load More Activities
            </button>
          </div>
        )}
      </div>
    </AppLayout>
  )
}
