import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Lazy singleton — server-only env vars aren't available during
// `next build` page data collection, so we defer initialization
let _supabase: ReturnType<typeof createClient> | null = null;

function getSupabase() {
  if (!_supabase) {
    _supabase = createClient(
      process.env.HACKNYU_SUPABASE_URL!,
      process.env.HACKNYU_SUPABASE_ANON_KEY!
    );
  }
  return _supabase;
}

/**
 * GET /api/listings - Fetch all active listings
 * Query params:
 *   - status: Filter by status (default: 'active')
 *   - limit: Limit number of results (default: 50)
 *   - offset: Offset for pagination (default: 0)
 *   - sortBy: Sort field (default: 'created_at')
 *   - order: Sort order 'asc' | 'desc' (default: 'desc')
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    const status = searchParams.get('status') || 'active';
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');
    const sortBy = searchParams.get('sortBy') || 'created_at';
    const order = (searchParams.get('order') || 'desc') as 'asc' | 'desc';
    const searchQuery = searchParams.get('search') || '';

    const supabase = getSupabase();
    let query = supabase
      .from('listings')
      .select('*')
      .eq('status', status)
      .order(sortBy, { ascending: order === 'asc' })
      .range(offset, offset + limit - 1);

    // Add search filter if provided
    if (searchQuery) {
      query = query.or(
        `product_name.ilike.%${searchQuery}%,description.ilike.%${searchQuery}%,category.ilike.%${searchQuery}%`
      );
    }

    const { data: listings, error, count } = await query;

    if (error) {
      console.error('[API] Error fetching listings:', error);
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      listings: listings || [],
      count: count || 0,
      limit,
      offset,
    });
  } catch (error: any) {
    console.error('[API] Error in GET /api/listings:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
