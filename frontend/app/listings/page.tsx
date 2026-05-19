'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Navigation } from '@/components/navigation'
import { Button } from '@/components/ui/button'
import { CreateListingForm } from '@/components/create-listing-form'
import { useWallet, useListings } from '@/contexts/AppContext'
import { Plus, Wallet, Package } from 'lucide-react'

const listingsNavItems = [
  { name: 'Marketplace', href: '/marketplace' },
  { name: 'Collections', href: '/collections' },
  { name: 'Activities', href: '/activities' },
]

export default function ListingsPage() {
  const [showForm, setShowForm] = useState(false)
  const { wallet, connectWallet } = useWallet()
  const { listings, isLoading } = useListings()

  return (
    <>
      <Navigation items={listingsNavItems} showConnectWallet={true} />

      <div className="min-h-screen bg-black pt-32 px-4 pb-16">
        <div className="container mx-auto max-w-6xl">
          {/* Header Section */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8">
            <div>
              <h1 className="text-4xl sm:text-5xl font-mono text-white mb-2">
                [My Listings]
              </h1>
              <p className="font-mono text-sm text-white/60">
                Tokenize your real-world assets into blockchain-based NFTs
              </p>
            </div>

            {/* Tokenize Asset Button - No wallet required */}
            <Button
              onClick={() => setShowForm(!showForm)}
              className="whitespace-nowrap"
              aria-label="Create new listing - wallet optional"
              title="Create listing now, connect wallet later to mint NFT"
            >
              <Plus className="w-5 h-5 mr-2" aria-hidden="true" />
              [Create Listing]
            </Button>
          </div>

          {/* Informational Message - Wallet Optional */}
          {!wallet.connected && (
            <div className="mb-8 p-6 bg-blue-500/10 border border-blue-500/30 rounded-lg">
              <div className="flex items-start gap-4">
                <Wallet className="w-6 h-6 text-blue-400 flex-shrink-0 mt-1" aria-hidden="true" />
                <div>
                  <h3 className="font-mono text-lg text-blue-400 mb-2">
                    Wallet Connection Optional
                  </h3>
                  <p className="font-mono text-sm text-white/70 mb-4">
                    You can create listings now without a wallet! Connect your Solana wallet later to mint your NFT and enable trading.
                  </p>
                  <div className="flex flex-wrap gap-2 text-xs font-mono text-white/50">
                    <span className="px-3 py-1 bg-white/5 border border-white/10 rounded">
                      ✓ Create listings immediately
                    </span>
                    <span className="px-3 py-1 bg-white/5 border border-white/10 rounded">
                      ✓ Connect wallet anytime
                    </span>
                    <span className="px-3 py-1 bg-white/5 border border-white/10 rounded">
                      ✓ Claim NFT when ready
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Create Listing Form - Always available */}
          {showForm && (
            <div className="mb-12 animate-in fade-in slide-in-from-top-4 duration-300">
              <CreateListingForm />
            </div>
          )}

          {/* Listings Grid - Show for all users */}
          <div>
            <div className="flex items-center gap-3 mb-6">
              <Package className="w-5 h-5 text-[#D4A82C]" aria-hidden="true" />
              <h2 className="text-2xl font-mono text-white">
                [Your Listings]
              </h2>
            </div>

            {isLoading ? (
              <div className="flex items-center justify-center py-20">
                <div className="text-center">
                  <svg
                    className="animate-spin h-8 w-8 text-[#D4A82C] mx-auto mb-4"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    aria-label="Loading"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                  </svg>
                  <p className="font-mono text-sm text-white/60">
                    Loading your listings...
                  </p>
                </div>
              </div>
            ) : wallet.connected && listings.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {listings.map((listing) => (
                    <div
                      key={listing.id}
                      className="bg-[#0F0F0F] border border-[#424242] rounded-lg overflow-hidden hover:border-[#D4A82C] transition-colors duration-300 group"
                    >
                      {/* NFT Image */}
                      <div className="aspect-square bg-black/50 relative overflow-hidden">
                        {listing.nft_image_url ? (
                          <img
                            src={listing.nft_image_url}
                            alt={listing.product_name}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <Package className="w-16 h-16 text-white/20" aria-hidden="true" />
                          </div>
                        )}
                      </div>

                      {/* NFT Details */}
                      <div className="p-4">
                        <h3 className="font-mono text-lg text-white mb-2 truncate">
                          {listing.product_name || 'Unnamed Asset'}
                        </h3>

                        <div className="space-y-2 mb-4">
                          <div className="flex justify-between items-center">
                            <span className="font-mono text-xs text-white/50">
                              Price
                            </span>
                            <span className="font-mono text-sm text-[#D4A82C]">
                              {listing.listing_price_sol || '0'} USDC
                            </span>
                          </div>

                          {listing.nft_mint_address && (
                            <div className="flex justify-between items-center">
                              <span className="font-mono text-xs text-white/50">
                                Mint Address
                              </span>
                              <span className="font-mono text-xs text-white/70 truncate max-w-[150px]">
                                {listing.nft_mint_address.slice(0, 4)}...{listing.nft_mint_address.slice(-4)}
                              </span>
                            </div>
                          )}
                        </div>

                        {listing.ipfsUrl && (
                          <a
                            href={listing.ipfsUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-2 font-mono text-xs text-[#D4A82C] hover:underline"
                          >
                            View on IPFS →
                          </a>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-20">
                  <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-[#D4A82C]/10 border border-[#D4A82C]/30 mb-4">
                    <Package className="w-8 h-8 text-[#D4A82C]" aria-hidden="true" />
                  </div>
                  <h3 className="font-mono text-xl text-white mb-2">
                    No listings yet
                  </h3>
                  <p className="font-mono text-sm text-white/60 mb-6 max-w-md mx-auto">
                    Start creating your listings by clicking the
                    <span className="text-[#D4A82C]"> [Create Listing] </span>
                    button above. {!wallet.connected && "You can connect your wallet later to mint the NFT."}
                  </p>
                  {!showForm && (
                    <Button onClick={() => setShowForm(true)}>
                      <Plus className="w-5 h-5 mr-2" aria-hidden="true" />
                      [Create Your First Listing]
                    </Button>
                  )}
                </div>
              )}
          </div>

          {/* Browse Marketplace CTA */}
          <div className="mt-12 text-center">
            <Link href="/marketplace">
              <Button variant="outline">
                [Browse Marketplace]
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </>
  )
}
