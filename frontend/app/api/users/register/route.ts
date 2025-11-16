import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export const runtime = 'edge' // Optional: Use edge runtime for faster responses

interface RegisterUserRequest {
  walletAddress: string
  privyUserId: string
  chainType: 'ethereum' | 'solana'
  email?: string
}

/**
 * POST /api/users/register
 * Register a new user or update existing user's last login
 */
export async function POST(request: NextRequest) {
  try {
    // Parse request body
    const body = (await request.json()) as RegisterUserRequest

    const { walletAddress, privyUserId, chainType, email } = body

    // Validation
    if (!walletAddress || !privyUserId || !chainType) {
      return NextResponse.json(
        {
          success: false,
          error: 'Missing required fields: walletAddress, privyUserId, chainType',
        },
        { status: 400 }
      )
    }

    // Validate chain type
    if (chainType !== 'ethereum' && chainType !== 'solana') {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid chain type. Must be "ethereum" or "solana"',
        },
        { status: 400 }
      )
    }

    console.log(`[User Registration] Wallet: ${walletAddress}, Chain: ${chainType}`)

    // Check if user already exists
    const { data: existingUser, error: fetchError } = await supabase
      .from('users')
      .select('*')
      .eq('wallet_address', walletAddress)
      .single()

    if (fetchError && fetchError.code !== 'PGRST116') {
      // PGRST116 is "not found" error, which is expected for new users
      console.error('[User Registration] Error fetching user:', fetchError)
      return NextResponse.json(
        {
          success: false,
          error: `Database error: ${fetchError.message}`,
        },
        { status: 500 }
      )
    }

    if (existingUser) {
      // User exists - update last login
      const { data: updatedUser, error: updateError } = await supabase
        .from('users')
        .update({
          last_login: new Date().toISOString(),
        })
        .eq('wallet_address', walletAddress)
        .select()
        .single()

      if (updateError) {
        console.error('[User Registration] Error updating user:', updateError)
        return NextResponse.json(
          {
            success: false,
            error: `Failed to update user: ${updateError.message}`,
          },
          { status: 500 }
        )
      }

      console.log(`[User Registration] Existing user logged in: ${walletAddress}`)

      return NextResponse.json(
        {
          success: true,
          user: {
            id: updatedUser.id,
            walletAddress: updatedUser.wallet_address,
            chainType: updatedUser.chain_type,
            username: updatedUser.username,
            email: updatedUser.email,
            profileImage: updatedUser.profile_image,
            createdAt: updatedUser.created_at,
            totalVolume: updatedUser.total_volume,
            isNewUser: false,
          },
        },
        { status: 200 }
      )
    }

    // Create new user
    const { data: newUser, error: insertError } = await supabase
      .from('users')
      .insert({
        wallet_address: walletAddress,
        privy_user_id: privyUserId,
        chain_type: chainType,
        email: email || null,
        last_login: new Date().toISOString(),
        total_volume: 0,
      })
      .select()
      .single()

    if (insertError) {
      console.error('[User Registration] Error creating user:', insertError)

      // Handle unique constraint violations
      if (insertError.code === '23505') {
        return NextResponse.json(
          {
            success: false,
            error: 'User with this wallet address already exists',
          },
          { status: 409 }
        )
      }

      return NextResponse.json(
        {
          success: false,
          error: `Failed to create user: ${insertError.message}`,
        },
        { status: 500 }
      )
    }

    console.log(`[User Registration] New user created: ${walletAddress}`)

    return NextResponse.json(
      {
        success: true,
        user: {
          id: newUser.id,
          walletAddress: newUser.wallet_address,
          chainType: newUser.chain_type,
          username: newUser.username,
          email: newUser.email,
          profileImage: newUser.profile_image,
          createdAt: newUser.created_at,
          totalVolume: newUser.total_volume,
          isNewUser: true,
        },
      },
      { status: 201 }
    )
  } catch (error) {
    console.error('[User Registration] Unexpected error:', error)

    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred'

    return NextResponse.json(
      {
        success: false,
        error: `Registration failed: ${errorMessage}`,
      },
      { status: 500 }
    )
  }
}
