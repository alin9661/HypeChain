import type { NFTListing } from '@/contexts/AppContext';

/**
 * Placeholder listings for reviewing the marketplace-proof terminal panel
 * in its POPULATED state. The landing page never fetches listings, so
 * without this the panel always renders the (correct) empty state.
 *
 * Only reachable through `useDemoListings()` in marketplace-proof-section,
 * which is dev-build + `?demo=1` gated — production builds strip the whole
 * path, so demo numbers can never impersonate real marketplace data.
 *
 * Timestamps are offsets from `now` (passed in client-side, post-mount)
 * so timeAgo/24h-volume derivations look live at any review time.
 */
export function makeDemoListings(now: number): NFTListing[] {
  const minutes = (m: number) => new Date(now - m * 60_000).toISOString();

  const entry = (
    id: string,
    product_name: string,
    listing_price_sol: number,
    userWallet: string,
    minutesAgo: number,
  ): NFTListing => ({
    success: true,
    id,
    product_name,
    listing_price_sol,
    userWallet,
    createdAt: minutes(minutesAgo),
    nft_mint_address: `DemoMint${id}11111111111111111111111`,
    nft_image_url: '',
  });

  return [
    entry('005847', 'Yeezy Boost 350 v2', 11_250, '7fA9kQmXw3Zr8pLt3c2a', 12),
    entry('005851', 'Jordan 1 Retro Chicago', 8_400, '3kWt5RnYv9Bq2mXs7d1e', 47),
    entry('005853', 'Rolex Submariner 124060', 24_900, '9cJp4HzKt6Nw1vRb5f8g', 128),
    entry('005859', 'Supreme Box Logo FW21', 1_950, '5mDx8TqLs2Gy7nWc4h3j', 260),
    entry('005862', 'Patek Nautilus 5711', 96_500, '2bVk6PfMr4Jz9tYd8a5c', 410),
  ];
}
