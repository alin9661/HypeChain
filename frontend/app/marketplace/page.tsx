'use client';

import React, { useState } from 'react';
import { Plus, Filter, Search, RefreshCw } from 'lucide-react';
import { NFTGrid, NFTGridSkeleton } from '@/components/nft-grid';
import { CreateListingForm } from '@/components/create-listing-form';
import { useListings } from '@/contexts/AppContext';
import { NFTListing } from '@/contexts/AppContext';

export default function MarketplacePage() {
  const { listings, isLoading, error } = useListings();
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'recent' | 'price-high' | 'price-low'>(
    'recent'
  );
  const [selectedNFT, setSelectedNFT] = useState<NFTListing | null>(null);

  // Filter and sort listings
  const filteredListings = React.useMemo(() => {
    let filtered = [...listings];

    // Search filter
    if (searchQuery) {
      filtered = filtered.filter(
        (listing) =>
          listing.product_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          listing.nft_mint_address.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    // Sort
    filtered.sort((a, b) => {
      switch (sortBy) {
        case 'recent':
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        case 'price-high':
          return b.listing_price_sol - a.listing_price_sol;
        case 'price-low':
          return a.listing_price_sol - b.listing_price_sol;
        default:
          return 0;
      }
    });

    return filtered;
  }, [listings, searchQuery, sortBy]);

  return (
    <div className="min-h-screen p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">NFT Marketplace</h1>
          <p className="text-muted-foreground mt-1">
            AI-verified authentic product NFTs on Solana
          </p>
        </div>

        <button
          onClick={() => setShowCreateForm(!showCreateForm)}
          className="px-6 py-3 bg-primary text-primary-foreground rounded-lg font-medium hover:opacity-90 transition flex items-center gap-2"
        >
          <Plus className="w-5 h-5" />
          Create Listing
        </button>
      </div>

      {/* Create Listing Form Modal */}
      {showCreateForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="relative max-w-3xl w-full max-h-[90vh] overflow-y-auto">
            <button
              onClick={() => setShowCreateForm(false)}
              className="absolute top-4 right-4 z-10 px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600"
            >
              Close
            </button>
            <CreateListingForm />
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-card border border-border rounded-lg p-6">
          <p className="text-sm text-muted-foreground">Total Listings</p>
          <p className="text-3xl font-bold mt-2">{listings.length}</p>
        </div>
        <div className="bg-card border border-border rounded-lg p-6">
          <p className="text-sm text-muted-foreground">Total Volume</p>
          <p className="text-3xl font-bold mt-2">
            {listings.reduce((sum, l) => sum + l.listing_price_sol, 0).toFixed(2)}{' '}
            SOL
          </p>
        </div>
        <div className="bg-card border border-border rounded-lg p-6">
          <p className="text-sm text-muted-foreground">Active Today</p>
          <p className="text-3xl font-bold mt-2">
            {
              listings.filter((l) => {
                const today = new Date();
                const listingDate = new Date(l.createdAt);
                return listingDate.toDateString() === today.toDateString();
              }).length
            }
          </p>
        </div>
      </div>

      {/* Filters & Search */}
      <div className="flex flex-col md:flex-row gap-4">
        {/* Search */}
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search by name or mint address..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-3 bg-card border border-border rounded-lg focus:ring-2 focus:ring-primary"
          />
        </div>

        {/* Sort */}
        <div className="flex items-center gap-2">
          <Filter className="w-5 h-5 text-muted-foreground" />
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            className="px-4 py-3 bg-card border border-border rounded-lg focus:ring-2 focus:ring-primary"
          >
            <option value="recent">Most Recent</option>
            <option value="price-high">Price: High to Low</option>
            <option value="price-low">Price: Low to High</option>
          </select>
        </div>

        {/* Refresh */}
        <button
          onClick={() => window.location.reload()}
          className="px-4 py-3 bg-card border border-border rounded-lg hover:bg-muted transition flex items-center gap-2"
        >
          <RefreshCw className="w-5 h-5" />
          Refresh
        </button>
      </div>

      {/* Results count */}
      {searchQuery && (
        <p className="text-sm text-muted-foreground">
          Found {filteredListings.length} listing(s) matching "{searchQuery}"
        </p>
      )}

      {/* NFT Grid */}
      {isLoading ? (
        <NFTGridSkeleton count={8} />
      ) : (
        <NFTGrid
          listings={filteredListings}
          loading={isLoading}
          error={error}
          onNFTClick={(nft) => setSelectedNFT(nft)}
        />
      )}

      {/* NFT Detail Modal */}
      {selectedNFT && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={() => setSelectedNFT(null)}
        >
          <div
            className="bg-card border border-border rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="grid md:grid-cols-2 gap-6 p-6">
              {/* Image */}
              <div className="aspect-square relative rounded-lg overflow-hidden">
                <img
                  src={selectedNFT.nft_image_url}
                  alt={selectedNFT.product_name}
                  className="w-full h-full object-cover"
                />
              </div>

              {/* Details */}
              <div className="space-y-6">
                <div>
                  <h2 className="text-3xl font-bold">{selectedNFT.product_name}</h2>
                  <p className="text-4xl font-bold font-mono mt-4">
                    {selectedNFT.listing_price_sol} SOL
                  </p>
                </div>

                <div className="space-y-4 pt-4 border-t border-border">
                  <div>
                    <p className="text-sm text-muted-foreground">Mint Address</p>
                    <p className="font-mono text-sm text-blue-400 break-all">
                      {selectedNFT.nft_mint_address}
                    </p>
                  </div>

                  <div>
                    <p className="text-sm text-muted-foreground">Owner</p>
                    <p className="font-mono text-sm break-all">
                      {selectedNFT.userWallet}
                    </p>
                  </div>

                  <div>
                    <p className="text-sm text-muted-foreground">Created</p>
                    <p className="text-sm">
                      {new Date(selectedNFT.createdAt).toLocaleString()}
                    </p>
                  </div>

                  <div>
                    <p className="text-sm text-muted-foreground">IPFS Image</p>
                    <a
                      href={selectedNFT.nft_image_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-primary hover:underline break-all"
                    >
                      {selectedNFT.nft_image_url}
                    </a>
                  </div>
                </div>

                <div className="flex gap-4 pt-4">
                  <button className="flex-1 px-6 py-3 bg-primary text-primary-foreground rounded-lg font-medium hover:opacity-90 transition">
                    Buy Now
                  </button>
                  <button
                    onClick={() => setSelectedNFT(null)}
                    className="px-6 py-3 bg-muted text-foreground rounded-lg font-medium hover:opacity-90 transition"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
