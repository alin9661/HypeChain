import { createClient } from '@supabase/supabase-js'

// Supabase client configuration
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing Supabase environment variables. Please add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to your .env.local file.'
  )
}

// Database schema types
export interface Database {
  public: {
    Tables: {
      users: {
        Row: {
          id: string
          wallet_address: string
          privy_user_id: string
          chain_type: 'ethereum' | 'solana'
          username: string | null
          email: string | null
          profile_image: string | null
          created_at: string
          last_login: string | null
          total_volume: number
        }
        Insert: {
          id?: string
          wallet_address: string
          privy_user_id: string
          chain_type: 'ethereum' | 'solana'
          username?: string | null
          email?: string | null
          profile_image?: string | null
          created_at?: string
          last_login?: string | null
          total_volume?: number
        }
        Update: {
          id?: string
          wallet_address?: string
          privy_user_id?: string
          chain_type?: 'ethereum' | 'solana'
          username?: string | null
          email?: string | null
          profile_image?: string | null
          created_at?: string
          last_login?: string | null
          total_volume?: number
        }
      }
    }
  }
}

// Create typed Supabase client
export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: false, // We're using Privy for auth, not Supabase auth
  },
})

// Export types for use in other files
export type UserRow = Database['public']['Tables']['users']['Row']
export type UserInsert = Database['public']['Tables']['users']['Insert']
export type UserUpdate = Database['public']['Tables']['users']['Update']
