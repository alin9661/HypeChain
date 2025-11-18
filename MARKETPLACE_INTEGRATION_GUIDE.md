# Marketplace Page Integration Guide

## Overview
The marketplace page ([frontend/app/marketplace/page.tsx](frontend/app/marketplace/page.tsx)) currently uses mock data. This guide shows how to integrate real listings from the database.

## Integration Steps

### 1. Update Imports
```typescript
import { useEffect, useState } from 'react';
import { apiClient, type Listing } from '@/lib/api-client';
import { toast } from 'sonner';
import Link from 'next/link';
```

### 2. Replace Mock Data with API Call
```typescript
export default function MarketplacePage() {
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'price_sol' | 'created_at'>('created_at');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  useEffect(() => {
    async function fetchListings() {
      try {
        setLoading(true);
        const response = await apiClient.getAllListings({
          status: 'active',
          limit: 50,
          sortBy: sortBy,
          order: sortOrder,
          search: searchQuery,
        });

        if (response.success && response.data) {
          setListings(response.data.listings);
        } else {
          toast.error('Failed to load listings');
        }
      } catch (error) {
        console.error('Error fetching listings:', error);
        toast.error('Failed to load listings');
      } finally {
        setLoading(false);
      }
    }

    fetchListings();
  }, [searchQuery, sortBy, sortOrder]);

  // Rest of component...
}
```

### 3. Update Product Card to Link to Detail Page
```typescript
{listings.map((listing) => (
  <Link
    key={listing.id}
    href={`/listings/${listing.id}`}
    className="block"
  >
    <div className="group relative rounded-lg overflow-hidden bg-gray-900 hover:scale-105 transition-transform">
      <img
        src={listing.image_url}
        alt={listing.product_name}
        className="w-full aspect-square object-cover"
      />
      <div className="p-4">
        <h3 className="font-mono text-white font-bold truncate">
          {listing.product_name}
        </h3>
        <div className="flex items-center justify-between mt-2">
          <span className="text-[#FFC700] font-mono font-bold">
            {listing.price_sol} SOL
          </span>
          {listing.ai_verified && (
            <span className="text-green-500 text-xs font-mono">
              ✓ VERIFIED
            </span>
          )}
        </div>
      </div>
    </div>
  </Link>
))}
```

### 4. Add Loading State
```typescript
{loading ? (
  <div className="col-span-full flex items-center justify-center py-20">
    <div className="text-center space-y-4">
      <div className="animate-spin h-12 w-12 border-4 border-[#FFC700] border-t-transparent rounded-full mx-auto" />
      <p className="font-mono text-[#FFC700]">Loading listings...</p>
    </div>
  </div>
) : listings.length === 0 ? (
  <div className="col-span-full text-center py-20">
    <p className="font-mono text-gray-400 text-lg">
      No listings found
    </p>
    <Link
      href="/"
      className="inline-block mt-4 bg-[#FFC700] text-black px-6 py-3 rounded-md font-mono uppercase font-bold hover:bg-[#FFD700] transition"
    >
      Create a Listing
    </Link>
  </div>
) : (
  // Render listings grid
)}
```

## API Endpoints Available

### Fetch Listings
- **Endpoint**: `GET /api/listings`
- **Query Params**:
  - `status`: Filter by status (default: 'active')
  - `limit`: Number of results (default: 50)
  - `offset`: Pagination offset (default: 0)
  - `sortBy`: Sort field (default: 'created_at')
  - `order`: Sort order 'asc' | 'desc' (default: 'desc')
  - `search`: Search query (searches product_name, description, category)

### Get Listing Details
- **Endpoint**: `GET /api/payments/listing/:listingId`
- **Response**: Full listing details

## Data Structure
```typescript
interface Listing {
  id: string;
  nft_mint_address: string;
  seller_wallet: string;
  product_name: string;
  description: string;
  category: string;
  image_url: string;
  price_sol: number;
  status: 'active' | 'sold' | 'delisted' | 'pending';
  ai_verified: boolean;
  ai_confidence_score: number | null;
  created_at: string;
  views: number;
  favorites: number;
}
```

## Testing the Integration

1. **Create a test listing**:
   - Go to homepage
   - Upload a product image
   - Create a listing with a price

2. **View in marketplace**:
   - Navigate to `/marketplace`
   - You should see your listing
   - Click on it to go to detail page

3. **Test purchase flow**:
   - Connect wallet
   - Click "Buy" button
   - Approve transaction in wallet
   - Verify purchase completion

## Notes

- The current marketplace page has extensive UI with filters, sorting, and view modes
- You can keep all that UI and just replace the data source
- Make sure to run the Supabase schema migration first: [supabase_marketplace_schema.sql](supabase_marketplace_schema.sql)
- Ensure environment variables are set (see [.env.example](frontend/.env.example))
