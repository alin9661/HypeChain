'use client'

import { useState } from 'react'
import { AppLayout } from '@/components/app-layout'
import { Search, Grid3x3, List, ChevronDown, BadgeCheck, TrendingUp, Package, DollarSign } from 'lucide-react'

// Mock data for placeholder
const MOCK_COLLECTIONS = [
  {
    id: '1',
    name: 'Yeezy Boost Collection',
    creator: '0x742d35...a5f4',
    verified: true,
    banner: 'https://via.placeholder.com/400x150/1a1a1a/ffc700?text=Collection+Banner',
    avatar: 'https://via.placeholder.com/80x80/1a1a1a/ffc700?text=YB',
    items: 156,
    floorPrice: 2.8,
    totalVolume: 1247.5,
    description: 'Premium Yeezy Boost NFT collection featuring rare and limited edition sneakers.',
  },
  {
    id: '2',
    name: 'Foam Runner Series',
    creator: '0x8f3e29...b7c2',
    verified: true,
    banner: 'https://via.placeholder.com/400x150/1a1a1a/ffc700?text=Collection+Banner',
    avatar: 'https://via.placeholder.com/80x80/1a1a1a/ffc700?text=FR',
    items: 89,
    floorPrice: 1.9,
    totalVolume: 843.2,
    description: 'Innovative Foam Runner designs in NFT format.',
  },
  {
    id: '3',
    name: 'Yeezy Slide Vault',
    creator: '0x5a7c31...d8e6',
    verified: false,
    banner: 'https://via.placeholder.com/400x150/1a1a1a/ffc700?text=Collection+Banner',
    avatar: 'https://via.placeholder.com/80x80/1a1a1a/ffc700?text=YS',
    items: 234,
    floorPrice: 1.5,
    totalVolume: 2156.8,
    description: 'Complete collection of Yeezy Slide variations and colorways.',
  },
  {
    id: '4',
    name: '700 V3 Archive',
    creator: '0x1c8f92...e3a7',
    verified: true,
    banner: 'https://via.placeholder.com/400x150/1a1a1a/ffc700?text=Collection+Banner',
    avatar: 'https://via.placeholder.com/80x80/1a1a1a/ffc700?text=7V',
    items: 67,
    floorPrice: 4.2,
    totalVolume: 567.3,
    description: 'Curated archive of Yeezy 700 V3 masterpieces.',
  },
  {
    id: '5',
    name: '500 Utility Pack',
    creator: '0x9e4a83...c1d5',
    verified: false,
    banner: 'https://via.placeholder.com/400x150/1a1a1a/ffc700?text=Collection+Banner',
    avatar: 'https://via.placeholder.com/80x80/1a1a1a/ffc700?text=5U',
    items: 178,
    floorPrice: 2.1,
    totalVolume: 1423.9,
    description: 'Utility-focused Yeezy 500 collection with unique traits.',
  },
  {
    id: '6',
    name: 'Knit Runner Elite',
    creator: '0x3f7b62...a8e4',
    verified: true,
    banner: 'https://via.placeholder.com/400x150/1a1a1a/ffc700?text=Collection+Banner',
    avatar: 'https://via.placeholder.com/80x80/1a1a1a/ffc700?text=KR',
    items: 92,
    floorPrice: 3.5,
    totalVolume: 678.4,
    description: 'Elite tier Knit Runner NFTs with rare attributes.',
  },
  {
    id: '7',
    name: 'Desert Boot Genesis',
    creator: '0x2d9c54...f7a3',
    verified: false,
    banner: 'https://via.placeholder.com/400x150/1a1a1a/ffc700?text=Collection+Banner',
    avatar: 'https://via.placeholder.com/80x80/1a1a1a/ffc700?text=DB',
    items: 45,
    floorPrice: 5.8,
    totalVolume: 234.6,
    description: 'Genesis collection of Desert Boot NFTs.',
  },
  {
    id: '8',
    name: 'QNTM Collection',
    creator: '0x6d2b41...f9c8',
    verified: true,
    banner: 'https://via.placeholder.com/400x150/1a1a1a/ffc700?text=Collection+Banner',
    avatar: 'https://via.placeholder.com/80x80/1a1a1a/ffc700?text=QN',
    items: 128,
    floorPrice: 3.2,
    totalVolume: 987.5,
    description: 'QNTM basketball sneaker NFT collection.',
  },
]

type ViewMode = 'grid' | 'list'
type SortOption = 'volume' | 'floor' | 'items' | 'name'

export default function CollectionsPage() {
  const [searchQuery, setSearchQuery] = useState('')
  const [viewMode, setViewMode] = useState<ViewMode>('grid')
  const [sortBy, setSortBy] = useState<SortOption>('volume')
  const [sortOpen, setSortOpen] = useState(false)

  const filteredAndSortedCollections = MOCK_COLLECTIONS.filter(
    (collection) =>
      collection.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      collection.creator.toLowerCase().includes(searchQuery.toLowerCase()) ||
      collection.description.toLowerCase().includes(searchQuery.toLowerCase())
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

  const stats = {
    totalCollections: MOCK_COLLECTIONS.length,
    totalFloorValue: MOCK_COLLECTIONS.reduce((sum, c) => sum + c.floorPrice * c.items, 0),
    totalVolume: MOCK_COLLECTIONS.reduce((sum, c) => sum + c.totalVolume, 0),
  }

  const sortOptions: { value: SortOption; label: string }[] = [
    { value: 'volume', label: 'Total Volume' },
    { value: 'floor', label: 'Floor Price' },
    { value: 'items', label: 'Items Count' },
    { value: 'name', label: 'Name (A-Z)' },
  ]

  return (
    <AppLayout>
      <div className="space-y-8">
        {/* Hero Section */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold text-white sm:text-4xl">Collections</h1>
              <span className="rounded-full bg-[#FFC700]/10 px-3 py-1 text-sm font-medium text-[#FFC700] border border-[#FFC700]/20">
                {stats.totalCollections} Total
              </span>
            </div>
            <p className="mt-2 text-slate-400">
              Discover curated NFT collections from verified creators
            </p>
          </div>
        </div>

        {/* Stats Header */}
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="group rounded-lg border border-slate-700 bg-slate-800/50 p-6 transition-all duration-300 hover:border-[#FFC700]/50 hover:bg-slate-800/70">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium uppercase tracking-wider text-slate-400">Total Collections</p>
              <Package className="h-5 w-5 text-slate-500 transition-colors group-hover:text-[#FFC700]" />
            </div>
            <p className="mt-2 font-mono text-3xl font-bold text-white">{stats.totalCollections}</p>
          </div>

          <div className="group rounded-lg border border-slate-700 bg-slate-800/50 p-6 transition-all duration-300 hover:border-[#FFC700]/50 hover:bg-slate-800/70">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium uppercase tracking-wider text-slate-400">Combined Floor Value</p>
              <DollarSign className="h-5 w-5 text-slate-500 transition-colors group-hover:text-[#FFC700]" />
            </div>
            <p className="mt-2 font-mono text-3xl font-bold text-[#FFC700]">{stats.totalFloorValue.toFixed(0)} USDC</p>
          </div>

          <div className="group rounded-lg border border-slate-700 bg-slate-800/50 p-6 transition-all duration-300 hover:border-[#FFC700]/50 hover:bg-slate-800/70">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium uppercase tracking-wider text-slate-400">Total Trading Volume</p>
              <TrendingUp className="h-5 w-5 text-slate-500 transition-colors group-hover:text-emerald-500" />
            </div>
            <p className="mt-2 font-mono text-3xl font-bold text-emerald-500">{stats.totalVolume.toFixed(0)} USDC</p>
          </div>
        </div>

        {/* Controls Bar */}
        <div className="flex flex-col gap-4 rounded-lg border border-slate-700 bg-slate-800/50 p-4 sm:flex-row sm:items-center">
          {/* Search */}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search collections by name or creator..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-900 py-2.5 pl-10 pr-4 text-sm text-white placeholder-slate-400 transition-all focus:border-[#FFC700] focus:outline-none focus:ring-1 focus:ring-[#FFC700]"
            />
          </div>

          {/* Sort Dropdown */}
          <div className="relative">
            <button
              onClick={() => setSortOpen(!sortOpen)}
              className="flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-900 px-4 py-2.5 text-sm text-white transition-all hover:border-slate-600"
            >
              <span className="text-slate-400">Sort:</span>
              <span className="font-medium">{sortOptions.find((o) => o.value === sortBy)?.label}</span>
              <ChevronDown className={`h-4 w-4 transition-transform ${sortOpen ? 'rotate-180' : ''}`} />
            </button>
            {sortOpen && (
              <div className="absolute right-0 top-full z-10 mt-2 w-48 rounded-lg border border-slate-700 bg-slate-800 p-2 shadow-xl">
                {sortOptions.map((option) => (
                  <button
                    key={option.value}
                    onClick={() => {
                      setSortBy(option.value)
                      setSortOpen(false)
                    }}
                    className={`w-full rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                      sortBy === option.value
                        ? 'bg-[#FFC700] text-black font-medium'
                        : 'text-slate-300 hover:bg-slate-700 hover:text-white'
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* View Toggle */}
          <div className="flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-900 p-1">
            <button
              onClick={() => setViewMode('grid')}
              className={`rounded-lg p-2 transition-all ${
                viewMode === 'grid'
                  ? 'bg-[#FFC700] text-black'
                  : 'text-slate-400 hover:text-white'
              }`}
              aria-label="Grid view"
            >
              <Grid3x3 className="h-4 w-4" />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`rounded-lg p-2 transition-all ${
                viewMode === 'list'
                  ? 'bg-[#FFC700] text-black'
                  : 'text-slate-400 hover:text-white'
              }`}
              aria-label="List view"
            >
              <List className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Collections Grid/List */}
        {filteredAndSortedCollections.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-lg border border-slate-700 bg-slate-800/50 py-16">
            <Package className="h-16 w-16 text-slate-600" />
            <p className="mt-4 text-lg font-medium text-slate-400">No collections found</p>
            <p className="mt-1 text-sm text-slate-500">Try adjusting your search query</p>
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="mt-4 rounded-lg bg-slate-700 px-4 py-2 text-sm text-white transition-all hover:bg-slate-600"
              >
                Clear Search
              </button>
            )}
          </div>
        ) : viewMode === 'grid' ? (
          /* Grid View */
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {filteredAndSortedCollections.map((collection) => (
              <div
                key={collection.id}
                className="group cursor-pointer overflow-hidden rounded-lg border border-slate-700 bg-slate-800/50 transition-all duration-300 hover:border-[#FFC700]/50 hover:bg-slate-800/70 hover:shadow-xl hover:shadow-[#FFC700]/10"
              >
                {/* Banner */}
                <div className="relative h-32 overflow-hidden bg-slate-900">
                  <img
                    src={collection.banner}
                    alt={collection.name}
                    className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-slate-900 to-transparent" />
                </div>

                <div className="p-6">
                  {/* Avatar & Info */}
                  <div className="relative -mt-12 mb-4 flex items-end justify-between">
                    <div className="relative">
                      <div className="h-20 w-20 overflow-hidden rounded-lg border-4 border-slate-800 bg-gradient-to-br from-[#FFC700] to-[#FFD700]">
                        <img src={collection.avatar} alt={collection.name} className="h-full w-full object-cover" />
                      </div>
                      {collection.verified && (
                        <div className="absolute -right-1 -top-1 rounded-full bg-slate-800 p-0.5">
                          <BadgeCheck className="h-5 w-5 text-[#FFC700]" />
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Collection Name */}
                  <h3 className="mb-2 text-xl font-bold text-white transition-colors group-hover:text-[#FFC700]">
                    {collection.name}
                  </h3>

                  {/* Creator */}
                  <p className="mb-3 font-mono text-sm text-slate-400">
                    by <span className="text-slate-300">{collection.creator}</span>
                  </p>

                  {/* Description */}
                  <p className="mb-4 line-clamp-2 text-sm text-slate-400">{collection.description}</p>

                  {/* Stats Row */}
                  <div className="grid grid-cols-3 gap-3 rounded-lg border border-slate-700 bg-slate-900/50 p-3">
                    <div>
                      <p className="text-xs uppercase tracking-wide text-slate-500">Items</p>
                      <p className="mt-1 font-mono text-sm font-semibold text-white">{collection.items}</p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-wide text-slate-500">Floor</p>
                      <p className="mt-1 font-mono text-sm font-semibold text-[#FFC700]">
                        {collection.floorPrice.toFixed(1)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-wide text-slate-500">Volume</p>
                      <p className="mt-1 font-mono text-sm font-semibold text-emerald-500">
                        {collection.totalVolume.toFixed(0)}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          /* List View */
          <div className="space-y-3">
            {filteredAndSortedCollections.map((collection) => (
              <div
                key={collection.id}
                className="group flex cursor-pointer items-center gap-6 rounded-lg border border-slate-700 bg-slate-800/50 p-4 transition-all duration-300 hover:border-[#FFC700]/50 hover:bg-slate-800/70"
              >
                {/* Thumbnail */}
                <div className="relative h-20 w-32 flex-shrink-0 overflow-hidden rounded-lg bg-slate-900">
                  <img
                    src={collection.banner}
                    alt={collection.name}
                    className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                  />
                </div>

                {/* Info */}
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg font-bold text-white transition-colors group-hover:text-[#FFC700]">
                      {collection.name}
                    </h3>
                    {collection.verified && <BadgeCheck className="h-5 w-5 text-[#FFC700]" />}
                  </div>
                  <p className="mt-1 font-mono text-xs text-slate-400">by {collection.creator}</p>
                  <p className="mt-1 line-clamp-1 text-sm text-slate-500">{collection.description}</p>
                </div>

                {/* Stats */}
                <div className="hidden items-center gap-8 sm:flex">
                  <div className="text-center">
                    <p className="text-xs uppercase tracking-wide text-slate-500">Items</p>
                    <p className="mt-1 font-mono text-lg font-semibold text-white">{collection.items}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-xs uppercase tracking-wide text-slate-500">Floor</p>
                    <p className="mt-1 font-mono text-lg font-semibold text-[#FFC700]">
                      {collection.floorPrice.toFixed(1)} USDC
                    </p>
                  </div>
                  <div className="text-center">
                    <p className="text-xs uppercase tracking-wide text-slate-500">Volume</p>
                    <p className="mt-1 font-mono text-lg font-semibold text-emerald-500">
                      {collection.totalVolume.toFixed(0)} USDC
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Load More Placeholder */}
        {filteredAndSortedCollections.length > 0 && (
          <div className="flex justify-center pt-4">
            <button className="rounded-lg border border-slate-700 bg-slate-800/50 px-6 py-3 text-sm font-medium uppercase text-white transition-all hover:border-[#FFC700] hover:bg-slate-800/70 hover:text-[#FFC700]">
              Load More Collections
            </button>
          </div>
        )}
      </div>
    </AppLayout>
  )
}
