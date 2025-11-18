'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { apiClient, type Listing } from '@/lib/api-client';
import { PurchaseButton } from '@/components/purchase-button';
import { usePrivy } from '@privy-io/react-auth';
import { toast } from 'sonner';
import Link from 'next/link';

export default function ListingDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { user } = usePrivy();
  const listingId = params.id as string;

  const [listing, setListing] = useState<Listing | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const getSolanaWallet = () => {
    if (!user) return null;
    const solanaWallet = user.linkedAccounts.find(
      (account) => account.type === 'wallet' && account.chainType === 'solana'
    );
    return solanaWallet?.address || null;
  };

  useEffect(() => {
    async function fetchListing() {
      try {
        setLoading(true);
        const response = await apiClient.getListingDetails(listingId);

        if (!response.success || !response.data) {
          throw new Error(response.error || 'Failed to load listing');
        }

        setListing(response.data.listing);
      } catch (err: any) {
        console.error('Error fetching listing:', err);
        setError(err.message || 'Failed to load listing');
        toast.error('Failed to load listing');
      } finally {
        setLoading(false);
      }
    }

    if (listingId) {
      fetchListing();
    }
  }, [listingId]);

  const handlePurchaseSuccess = () => {
    // Refresh the listing data to show sold status
    router.push(`/sold`);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="animate-spin h-12 w-12 border-4 border-[#FFC700] border-t-transparent rounded-full mx-auto" />
          <p className="font-mono text-[#FFC700]">Loading listing...</p>
        </div>
      </div>
    );
  }

  if (error || !listing) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <div className="text-center space-y-4 max-w-md">
          <h1 className="text-3xl font-bold text-red-500">Error</h1>
          <p className="font-mono text-gray-400">{error || 'Listing not found'}</p>
          <Link
            href="/marketplace"
            className="inline-block bg-[#FFC700] text-black px-6 py-3 rounded-md font-mono uppercase font-bold hover:bg-[#FFD700] transition"
          >
            Back to Marketplace
          </Link>
        </div>
      </div>
    );
  }

  const userWallet = getSolanaWallet();
  const isOwnListing = userWallet === listing.seller_wallet;
  const isSold = listing.status === 'sold';

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Navigation */}
      <nav className="border-b border-gray-800 bg-black/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <Link href="/" className="text-2xl font-bold font-mono text-[#FFC700]">
              HYPECHAIN
            </Link>
            <Link
              href="/marketplace"
              className="text-gray-400 hover:text-white font-mono transition"
            >
              ← Back to Marketplace
            </Link>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
          {/* Left Column - Image */}
          <div className="space-y-4">
            <div className="relative aspect-square w-full rounded-lg overflow-hidden bg-gray-900">
              <img
                src={listing.image_url}
                alt={listing.product_name}
                className="w-full h-full object-cover"
              />
              {listing.ai_verified && (
                <div className="absolute top-4 right-4 bg-green-500 text-black px-3 py-1 rounded-full text-sm font-bold font-mono">
                  ✓ AI VERIFIED
                </div>
              )}
              {isSold && (
                <div className="absolute inset-0 bg-black/70 flex items-center justify-center">
                  <div className="text-center">
                    <p className="text-5xl font-bold text-red-500 font-mono">SOLD</p>
                    <p className="text-gray-400 font-mono mt-2">This item has been sold</p>
                  </div>
                </div>
              )}
            </div>

            {/* Verification Details */}
            {listing.ai_verified && listing.ai_confidence_score && (
              <div className="bg-gray-900 rounded-lg p-4 border border-green-500/30">
                <h3 className="font-mono text-sm text-gray-400 mb-2">AI Verification</h3>
                <div className="flex items-center justify-between">
                  <span className="font-mono text-white">Confidence Score</span>
                  <span className="font-mono text-green-500 font-bold">
                    {listing.ai_confidence_score}%
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Right Column - Details */}
          <div className="space-y-6">
            <div>
              <h1 className="text-4xl font-bold font-mono mb-2">{listing.product_name}</h1>
              <p className="text-gray-400 font-mono text-sm">
                Category: {listing.category || 'Luxury Goods'}
              </p>
            </div>

            {/* Price */}
            <div className="bg-gray-900 rounded-lg p-6 border border-[#FFC700]/30">
              <p className="text-sm font-mono text-gray-400 mb-2">Current Price</p>
              <p className="text-5xl font-bold text-[#FFC700] font-mono">
                {listing.price_sol} USDC
              </p>
              {listing.price_usdc && (
                <p className="text-gray-400 font-mono mt-1">≈ ${listing.price_usdc} USDC</p>
              )}
            </div>

            {/* Description */}
            {listing.description && (
              <div className="bg-gray-900 rounded-lg p-6">
                <h3 className="font-mono text-sm text-gray-400 mb-2">Description</h3>
                <p className="text-white font-mono text-sm leading-relaxed">
                  {listing.description}
                </p>
              </div>
            )}

            {/* Condition */}
            {listing.condition && (
              <div className="bg-gray-900 rounded-lg p-4">
                <h3 className="font-mono text-sm text-gray-400 mb-2">Condition</h3>
                <p className="text-white font-mono">{listing.condition}</p>
              </div>
            )}

            {/* NFT Details */}
            <div className="bg-gray-900 rounded-lg p-4 space-y-2">
              <h3 className="font-mono text-sm text-gray-400 mb-3">NFT Details</h3>
              <div className="space-y-2 text-sm font-mono">
                <div className="flex justify-between">
                  <span className="text-gray-400">Mint Address:</span>
                  <a
                    href={`https://solscan.io/token/${listing.nft_mint_address}?cluster=devnet`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[#FFC700] hover:underline truncate max-w-[200px]"
                  >
                    {listing.nft_mint_address.substring(0, 8)}...
                    {listing.nft_mint_address.substring(listing.nft_mint_address.length - 8)}
                  </a>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Seller:</span>
                  <a
                    href={`https://solscan.io/account/${listing.seller_wallet}?cluster=devnet`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[#FFC700] hover:underline truncate max-w-[200px]"
                  >
                    {listing.seller_wallet.substring(0, 8)}...
                    {listing.seller_wallet.substring(listing.seller_wallet.length - 8)}
                  </a>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Listed:</span>
                  <span className="text-white">
                    {new Date(listing.created_at).toLocaleDateString()}
                  </span>
                </div>
              </div>
            </div>

            {/* Purchase Button */}
            <div className="pt-4">
              {isSold ? (
                <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 text-center">
                  <p className="font-mono text-red-500 font-bold">This item has been sold</p>
                  {listing.sold_at && (
                    <p className="font-mono text-sm text-gray-400 mt-1">
                      Sold on {new Date(listing.sold_at).toLocaleDateString()}
                    </p>
                  )}
                </div>
              ) : isOwnListing ? (
                <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4 text-center">
                  <p className="font-mono text-blue-500 font-bold">This is your listing</p>
                  <p className="font-mono text-sm text-gray-400 mt-1">
                    You cannot purchase your own item
                  </p>
                </div>
              ) : (
                <PurchaseButton
                  listingId={listing.id}
                  price={listing.price_sol}
                  sellerWallet={listing.seller_wallet}
                  productName={listing.product_name}
                  onSuccess={handlePurchaseSuccess}
                />
              )}
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-gray-900 rounded-lg p-4 text-center">
                <p className="text-2xl font-bold text-[#FFC700] font-mono">{listing.views}</p>
                <p className="text-sm text-gray-400 font-mono">Views</p>
              </div>
              <div className="bg-gray-900 rounded-lg p-4 text-center">
                <p className="text-2xl font-bold text-[#FFC700] font-mono">
                  {listing.favorites}
                </p>
                <p className="text-sm text-gray-400 font-mono">Favorites</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
