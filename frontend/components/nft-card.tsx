'use client';

import React from 'react';
import Image from 'next/image';
import { ExternalLink, Wallet } from 'lucide-react';
import { NFTListing } from '@/contexts/AppContext';
import { formatDistance } from 'date-fns';

interface NFTCardProps {
  listing: NFTListing;
  onClick?: () => void;
}

export function NFTCard({ listing, onClick }: NFTCardProps) {
  const timeAgo = formatDistance(new Date(listing.createdAt), new Date(), {
    addSuffix: true,
  });

  return (
    <div
      className="group cursor-pointer bg-card border border-border rounded-lg overflow-hidden hover:border-primary/50 transition-all duration-300"
      onClick={onClick}
    >
      {/* Image */}
      <div className="relative aspect-square overflow-hidden bg-muted">
        <Image
          src={listing.nft_image_url}
          alt={listing.product_name}
          fill
          className="object-cover group-hover:scale-105 transition-transform duration-300"
          sizes="(max-width: 768px) 50vw, (max-width: 1024px) 33vw, 25vw"
        />
        {/* Overlay on hover */}
        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center">
          <a
            href={listing.nft_image_url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-lg flex items-center gap-2 hover:opacity-90"
          >
            <ExternalLink className="w-4 h-4" />
            View on IPFS
          </a>
        </div>
      </div>

      {/* Info */}
      <div className="p-4 space-y-2">
        {/* Product Name */}
        <h3 className="font-bold text-lg truncate">{listing.product_name}</h3>

        {/* Price */}
        <div className="flex items-center justify-between">
          <span className="text-2xl font-bold font-mono">
            {listing.listing_price_sol} USDC
          </span>
          {listing.listing_price_sol > 0 && (
            <span className="text-sm text-muted-foreground">
              ≈ ${(listing.listing_price_sol * 100).toFixed(2)}
            </span>
          )}
        </div>

        {/* Mint Address */}
        <div className="pt-2 border-t border-border">
          <p className="text-xs text-muted-foreground mb-1">Mint Address</p>
          <p className="font-mono text-xs truncate text-blue-400">
            {listing.nft_mint_address}
          </p>
        </div>

        {/* Owner Wallet */}
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Wallet className="w-3 h-3" />
          <span className="font-mono truncate">
            {listing.userWallet.slice(0, 4)}...{listing.userWallet.slice(-4)}
          </span>
        </div>

        {/* Time */}
        <p className="text-xs text-muted-foreground">Listed {timeAgo}</p>
      </div>
    </div>
  );
}
