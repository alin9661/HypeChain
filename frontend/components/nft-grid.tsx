'use client';

import React from 'react';
import { NFTCard } from './nft-card';
import { NFTListing } from '@/contexts/AppContext';
import { Loader2, Package } from 'lucide-react';

interface NFTGridProps {
  listings: NFTListing[];
  loading?: boolean;
  error?: string | null;
  onNFTClick?: (listing: NFTListing) => void;
}

export function NFTGrid({ listings, loading, error, onNFTClick }: NFTGridProps) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-center space-y-4">
          <Loader2 className="w-12 h-12 animate-spin mx-auto text-primary" />
          <p className="text-muted-foreground">Loading NFT listings...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-center space-y-4 max-w-md">
          <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mx-auto">
            <Package className="w-8 h-8 text-red-500" />
          </div>
          <h3 className="text-xl font-bold">Failed to Load Listings</h3>
          <p className="text-muted-foreground">{error}</p>
        </div>
      </div>
    );
  }

  if (listings.length === 0) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-center space-y-4 max-w-md">
          <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto">
            <Package className="w-8 h-8 text-muted-foreground" />
          </div>
          <h3 className="text-xl font-bold">No NFT Listings Yet</h3>
          <p className="text-muted-foreground">
            Be the first to create an NFT listing! Upload your product and let our
            AI verify its authenticity.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
      {listings.map((listing) => (
        <NFTCard
          key={listing.id}
          listing={listing}
          onClick={() => onNFTClick?.(listing)}
        />
      ))}
    </div>
  );
}

/**
 * Skeleton loader for NFT grid
 */
export function NFTGridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="bg-card border border-border rounded-lg overflow-hidden animate-pulse"
        >
          {/* Image skeleton */}
          <div className="aspect-square bg-muted" />

          {/* Info skeleton */}
          <div className="p-4 space-y-3">
            {/* Title */}
            <div className="h-6 bg-muted rounded w-3/4" />

            {/* Price */}
            <div className="h-8 bg-muted rounded w-1/2" />

            {/* Mint address */}
            <div className="pt-2 border-t border-border space-y-2">
              <div className="h-3 bg-muted rounded w-1/4" />
              <div className="h-3 bg-muted rounded w-full" />
            </div>

            {/* Wallet */}
            <div className="h-3 bg-muted rounded w-1/3" />

            {/* Time */}
            <div className="h-3 bg-muted rounded w-1/4" />
          </div>
        </div>
      ))}
    </div>
  );
}
