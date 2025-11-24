import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

interface RouteParams {
  params: Promise<{
    walletAddress: string
  }>
}

/**
 * GET /api/users/[walletAddress]
 * Fetch user profile by wallet address
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { walletAddress } = await params

    if (!walletAddress) {
      return NextResponse.json(
        {
          success: false,
          error: 'Wallet address is required',
        },
        { status: 400 }
      )
    }

    console.log(`[Get User Profile] Fetching profile for: ${walletAddress}`)

    // Fetch user from Supabase
    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('wallet_address', walletAddress)
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        // User not found
        console.log(`[Get User Profile] User not found: ${walletAddress}`)
        return NextResponse.json(
          {
            success: false,
            error: 'User not found',
          },
          { status: 404 }
        )
      }

      console.error('[Get User Profile] Database error:', error)
      return NextResponse.json(
        {
          success: false,
          error: `Database error: ${error.message}`,
        },
        { status: 500 }
      )
    }

    console.log(`[Get User Profile] User found: ${walletAddress}`)

    return NextResponse.json(
      {
        success: true,
        user: {
          id: user.id,
          walletAddress: user.wallet_address,
          chainType: user.chain_type,
          username: user.username,
          email: user.email,
          profileImage: user.profile_image,
          createdAt: user.created_at,
          lastLogin: user.last_login,
          totalVolume: user.total_volume,
        },
      },
      { status: 200 }
    )
  } catch (error) {
    console.error('[Get User Profile] Unexpected error:', error)

    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred'

    return NextResponse.json(
      {
        success: false,
        error: `Failed to fetch user profile: ${errorMessage}`,
      },
      { status: 500 }
    )
  }
}
