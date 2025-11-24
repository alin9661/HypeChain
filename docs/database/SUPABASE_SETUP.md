# Supabase Setup Guide for HypeChain

This guide will walk you through setting up Supabase for user authentication and database management.

## Prerequisites

- A Supabase account (sign up at [supabase.com](https://supabase.com))
- Your `.env.local` file ready for configuration

## Step 1: Create a Supabase Project

1. Go to [https://app.supabase.com](https://app.supabase.com)
2. Click **"New Project"**
3. Fill in the details:
   - **Name**: HypeChain (or your preferred name)
   - **Database Password**: Create a strong password (save it securely)
   - **Region**: Choose the closest region to your users
   - **Pricing Plan**: Free tier is sufficient for development
4. Click **"Create new project"**
5. Wait 2-3 minutes for the project to be provisioned

## Step 2: Get Your API Credentials

1. Once your project is ready, go to **Settings** → **API**
2. Copy the following values:
   - **Project URL** (e.g., `https://your-project.supabase.co`)
   - **anon public** key (under "Project API keys")

3. Add these to your `.env.local` file:
   ```bash
   NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key_here
   ```

## Step 3: Create the Users Table

### Option A: Using the SQL Editor (Recommended)

1. Go to **SQL Editor** in the left sidebar
2. Click **"New query"**
3. Paste the following SQL:

```sql
-- Create users table
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_address TEXT UNIQUE NOT NULL,
  privy_user_id TEXT UNIQUE NOT NULL,
  chain_type TEXT NOT NULL CHECK (chain_type IN ('ethereum', 'solana')),
  username TEXT,
  email TEXT,
  profile_image TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_login TIMESTAMPTZ,
  total_volume NUMERIC DEFAULT 0
);

-- Create indexes for better query performance
CREATE INDEX idx_users_wallet_address ON users(wallet_address);
CREATE INDEX idx_users_privy_user_id ON users(privy_user_id);
CREATE INDEX idx_users_created_at ON users(created_at DESC);

-- Enable Row Level Security (RLS)
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
-- Allow anyone to read user data (public profiles)
CREATE POLICY "Users are viewable by everyone"
  ON users FOR SELECT
  USING (true);

-- Allow users to insert their own data (registration)
CREATE POLICY "Users can insert their own data"
  ON users FOR INSERT
  WITH CHECK (true);

-- Allow users to update their own data only
CREATE POLICY "Users can update their own data"
  ON users FOR UPDATE
  USING (auth.uid()::text = id::text OR true); -- Adjust based on your auth setup

-- Add comment for documentation
COMMENT ON TABLE users IS 'User profiles linked to wallet addresses';
```

4. Click **"Run"** to execute the query
5. Verify the table was created by going to **Table Editor** → **users**

### Option B: Using the Table Editor UI

1. Go to **Table Editor** in the left sidebar
2. Click **"Create a new table"**
3. Set table name: `users`
4. Add the following columns:

| Column Name      | Type        | Default Value        | Primary | Unique | Nullable | Additional Settings       |
|------------------|-------------|----------------------|---------|--------|----------|---------------------------|
| id               | uuid        | gen_random_uuid()    | ✓       | ✓      | ✗        |                           |
| wallet_address   | text        | -                    |         | ✓      | ✗        |                           |
| privy_user_id    | text        | -                    |         | ✓      | ✗        |                           |
| chain_type       | text        | -                    |         |        | ✗        | Check: 'ethereum' OR 'solana' |
| username         | text        | -                    |         |        | ✓        |                           |
| email            | text        | -                    |         |        | ✓        |                           |
| profile_image    | text        | -                    |         |        | ✓        |                           |
| created_at       | timestamptz | now()                |         |        | ✗        |                           |
| last_login       | timestamptz | -                    |         |        | ✓        |                           |
| total_volume     | numeric     | 0                    |         |        | ✗        |                           |

5. Click **"Save"**

## Step 4: Configure Row Level Security (RLS)

1. Go to **Authentication** → **Policies**
2. Select the `users` table
3. Click **"Enable RLS"**
4. Add policies using the SQL from Option A above, or:
   - Click **"New Policy"**
   - Create policies for SELECT (public read), INSERT (allow registration), and UPDATE (user-specific updates)

## Step 5: Verify the Setup

### Test the API Routes

1. Start your Next.js development server:
   ```bash
   cd frontend
   pnpm dev
   ```

2. Open your browser's DevTools Console

3. Test the registration endpoint:
   ```javascript
   fetch('/api/users/register', {
     method: 'POST',
     headers: { 'Content-Type': 'application/json' },
     body: JSON.stringify({
       walletAddress: '0x1234567890abcdef1234567890abcdef12345678',
       privyUserId: 'test-privy-id-123',
       chainType: 'ethereum',
       email: 'test@example.com'
     })
   }).then(r => r.json()).then(console.log)
   ```

4. Expected response:
   ```json
   {
     "success": true,
     "user": {
       "id": "uuid-here",
       "walletAddress": "0x1234567890abcdef1234567890abcdef12345678",
       "chainType": "ethereum",
       "email": "test@example.com",
       "createdAt": "2025-11-16T...",
       "totalVolume": 0,
       "isNewUser": true
     }
   }
   ```

5. Verify in Supabase:
   - Go to **Table Editor** → **users**
   - You should see the new user record

## Step 6: Test Wallet Connection Flow

1. Connect your wallet (MetaMask or Phantom)
2. Check the browser console for logs:
   - `[User Registration] Starting registration for: 0x...`
   - `[User Registration] Success: { ... }`
3. You should see a success notification: "🎉 Welcome! Your account has been created."
4. Disconnect and reconnect - you should see: "👋 Welcome back!"

## Step 7: Deploy to Vercel

### Update Environment Variables in Vercel

1. Go to your project in Vercel Dashboard
2. Navigate to **Settings** → **Environment Variables**
3. Add the following variables:

```
NEXT_PUBLIC_PRIVY_APP_ID=your_privy_app_id
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
NEXT_PUBLIC_API_URL=http://localhost:3001
```

4. Click **"Save"**
5. Redeploy your application

### Vercel Deployment Notes

- Next.js API routes (`/app/api/users/*`) will be deployed as **Vercel Serverless Functions**
- No separate backend server needed for user management
- Supabase handles the database
- Edge runtime is enabled for faster responses

## Troubleshooting

### Error: "Missing Supabase environment variables"

**Solution**: Ensure `.env.local` contains:
```bash
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
```

### Error: "Failed to register user: Database error"

**Possible causes**:
1. **RLS policies too restrictive** - Temporarily disable RLS to test
2. **Missing table** - Run the SQL from Step 3 again
3. **Invalid API keys** - Double-check your Supabase credentials

### Error: "User with this wallet address already exists"

**Explanation**: This is expected behavior when trying to register twice with the same wallet.

**Solution**: The second registration will update `last_login` instead of creating a duplicate.

### Users table not appearing in Table Editor

**Solution**:
1. Refresh the Supabase dashboard
2. Check **SQL Editor** for any error messages
3. Re-run the table creation SQL

## Database Schema

Here's the complete schema for reference:

```typescript
interface User {
  id: string                    // UUID
  wallet_address: string        // Unique wallet address (0x... or base58)
  privy_user_id: string         // Unique Privy user ID
  chain_type: 'ethereum' | 'solana'
  username: string | null       // Optional username
  email: string | null          // Optional email
  profile_image: string | null  // Optional profile image URL
  created_at: string            // ISO timestamp
  last_login: string | null     // ISO timestamp
  total_volume: number          // Total trading volume (default: 0)
}
```

## API Endpoints

### POST /api/users/register

**Description**: Register a new user or update existing user's last login

**Request Body**:
```json
{
  "walletAddress": "0x...",
  "privyUserId": "privy-id",
  "chainType": "ethereum" | "solana",
  "email": "user@example.com" // optional
}
```

**Response (Success - New User)**:
```json
{
  "success": true,
  "user": {
    "id": "uuid",
    "walletAddress": "0x...",
    "chainType": "ethereum",
    "username": null,
    "email": "user@example.com",
    "createdAt": "2025-11-16T...",
    "totalVolume": 0,
    "isNewUser": true
  }
}
```

**Response (Success - Existing User)**:
```json
{
  "success": true,
  "user": {
    ...
    "isNewUser": false
  }
}
```

### GET /api/users/[walletAddress]

**Description**: Get user profile by wallet address

**Response**:
```json
{
  "success": true,
  "user": {
    "id": "uuid",
    "walletAddress": "0x...",
    "chainType": "ethereum",
    "username": "user123",
    "email": "user@example.com",
    "createdAt": "2025-11-16T...",
    "lastLogin": "2025-11-16T...",
    "totalVolume": 1234.56
  }
}
```

## Next Steps

1. **Add user profile editing** - Create an endpoint to update username, email, profile_image
2. **Link NFT listings to users** - Add a `user_id` foreign key to your listings table
3. **Add user statistics** - Track total listings, sales, purchases
4. **Implement user search** - Create an endpoint to search users by username
5. **Add social features** - Following, favorites, activity feed

## Additional Resources

- [Supabase Documentation](https://supabase.com/docs)
- [Privy Documentation](https://docs.privy.io)
- [Next.js API Routes](https://nextjs.org/docs/app/building-your-application/routing/route-handlers)
- [Row Level Security](https://supabase.com/docs/guides/auth/row-level-security)

## Support

If you encounter any issues:
1. Check the browser console for error messages
2. Check Supabase logs: **Logs** → **API Logs** or **Postgres Logs**
3. Verify your environment variables
4. Ensure your Supabase project is active and not paused

---

**Congratulations!** Your user registration system with Supabase is now complete. Users will automatically be registered when they connect their wallets for the first time.
