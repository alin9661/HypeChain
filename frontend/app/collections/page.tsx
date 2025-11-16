'use client';

import React, { useState } from 'react';
import { Grid3x3, List, Search, SlidersHorizontal } from 'lucide-react';
import { AppLayout } from '@/components/app-layout';
import { NFTGrid } from '@/components/nft-grid';
import { useListings } from '@/contexts/AppContext';

export default function CollectionsPage() {
  const { listings, isLoading } = useListings();
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [filterOpen, setFilterOpen] = useState(false);

  // Group NFTs by creator/collection
  const collections = React.useMemo(() => {
    const grouped = listings.reduce((acc, listing) => {
      const creator = listing.creator_wallet || 'Unknown';
      if (!acc[creator]) {
        acc[creator] = {
          creator,
          items: [],
          totalValue: 0,
        };
      }
      acc[creator].items.push(listing);
      acc[creator].totalValue += listing.price_sol || 0;
      return acc;
    }, {} as Record<string, { creator: string; items: any[]; totalValue: number }>);

    return Object.values(grouped);
  }, [listings]);

  // Filter collections by search
  const filteredCollections = React.useMemo(() => {
    if (!searchQuery) return collections;
    return collections.filter((collection) =>
      collection.creator.toLowerCase().includes(searchQuery.toLowerCase()) ||
      collection.items.some((item) =>
        item.product_name.toLowerCase().includes(searchQuery.toLowerCase())
      )
    );
  }, [collections, searchQuery]);

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold text-white">Collections</h1>
          <p className="text-slate-400 mt-2">
            Explore NFT collections on HypeChain marketplace
          </p>
        </div>

        {/* Filters and Search */}
        <div className="flex flex-col sm:flex-row gap-4">
          {/* Search */}
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
            <input
              type="text"
              placeholder="Search collections or items..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* View Mode Toggle */}
          <div className="flex items-center gap-2 bg-slate-800 border border-slate-700 rounded-lg p-1">
            <button
              onClick={() => setViewMode('grid')}
              className={`p-2 rounded ${
                viewMode === 'grid'
                  ? 'bg-slate-700 text-white'
                  : 'text-slate-400 hover:text-white'
              }`}
              aria-label="Grid view"
            >
              <Grid3x3 className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`p-2 rounded ${
                viewMode === 'list'
                  ? 'bg-slate-700 text-white'
                  : 'text-slate-400 hover:text-white'
              }`}
              aria-label="List view"
            >
              <List className="w-4 h-4" />
            </button>
          </div>

          {/* Filter Button */}
          <button
            onClick={() => setFilterOpen(!filterOpen)}
            className="flex items-center gap-2 px-4 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white hover:bg-slate-700 transition"
          >
            <SlidersHorizontal className="w-4 h-4" />
            Filters
          </button>
        </div>

        {/* Collections Grid/List */}
        {isLoading ? (
          <div className="text-center py-12">
            <div className="inline-block w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-slate-400 mt-4">Loading collections...</p>
          </div>
        ) : filteredCollections.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-slate-400">No collections found</p>
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="mt-4 text-blue-400 hover:text-blue-300"
              >
                Clear search
              </button>
            )}
          </div>
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {filteredCollections.map((collection, index) => (
              <div
                key={collection.creator + index}
                className="bg-slate-800 border border-slate-700 rounded-lg p-6 hover:border-blue-500 transition cursor-pointer"
              >
                {/* Collection Header */}
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center text-white font-bold">
                      {collection.creator.slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <h3 className="font-semibold text-white">
                        {collection.creator.slice(0, 8)}...
                      </h3>
                      <p className="text-sm text-slate-400">
                        {collection.items.length} items
                      </p>
                    </div>
                  </div>
                </div>

                {/* Preview Items */}
                <div className="grid grid-cols-3 gap-2 mb-4">
                  {collection.items.slice(0, 3).map((item, idx) => (
                    <div
                      key={item.nft_mint_address + idx}
                      className="aspect-square rounded-lg bg-slate-900 overflow-hidden"
                    >
                      {item.nft_image_url && (
                        <img
                          src={item.nft_image_url}
                          alt={item.product_name}
                          className="w-full h-full object-cover"
                        />
                      )}
                    </div>
                  ))}
                </div>

                {/* Stats */}
                <div className="flex items-center justify-between text-sm">
                  <div>
                    <p className="text-slate-400">Total Value</p>
                    <p className="text-white font-semibold">
                      {collection.totalValue.toFixed(2)} SOL
                    </p>
                  </div>
                  <div>
                    <p className="text-slate-400">Floor</p>
                    <p className="text-white font-semibold">
                      {Math.min(...collection.items.map((i) => i.price_sol || 0)).toFixed(2)} SOL
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Stats Summary */}
        {!isLoading && filteredCollections.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-6 border-t border-slate-700">
            <div className="bg-slate-800 rounded-lg p-4">
              <p className="text-sm text-slate-400">Total Collections</p>
              <p className="text-2xl font-bold text-white mt-1">
                {filteredCollections.length}
              </p>
            </div>
            <div className="bg-slate-800 rounded-lg p-4">
              <p className="text-sm text-slate-400">Total Items</p>
              <p className="text-2xl font-bold text-white mt-1">
                {filteredCollections.reduce((acc, c) => acc + c.items.length, 0)}
              </p>
            </div>
            <div className="bg-slate-800 rounded-lg p-4">
              <p className="text-sm text-slate-400">Total Value</p>
              <p className="text-2xl font-bold text-white mt-1">
                {filteredCollections.reduce((acc, c) => acc + c.totalValue, 0).toFixed(2)} SOL
              </p>
            </div>
            <div className="bg-slate-800 rounded-lg p-4">
              <p className="text-sm text-slate-400">Avg. Floor</p>
              <p className="text-2xl font-bold text-white mt-1">
                {(
                  filteredCollections.reduce(
                    (acc, c) => acc + Math.min(...c.items.map((i) => i.price_sol || 0)),
                    0
                  ) / filteredCollections.length
                ).toFixed(2)}{' '}
                SOL
              </p>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
