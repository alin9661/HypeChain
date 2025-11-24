# Vercel Environment Variables Configuration

## 📋 Required Environment Variables for Deployment

This guide lists all environment variables that must be configured in your Vercel project settings before deployment.

## 🔧 How to Add Environment Variables in Vercel

1. Go to your Vercel project dashboard
2. Navigate to **Settings** → **Environment Variables**
3. For each variable below:
   - Click "Add New"
   - Enter the **Key** (variable name)
   - Enter the **Value**
   - Select **all three environments**: Production, Preview, Development
   - Click "Save"
4. After adding all variables, **redeploy** your project

---

## ✅ Required Variables Checklist

### Frontend API Configuration

| Variable | Description | Example Value | Required |
|----------|-------------|---------------|----------|
| `NEXT_PUBLIC_API_URL` | Backend API URL (no trailing slash) | `https://your-backend.railway.app` | ✅ Yes |

**Important:**
- Remove any trailing slash from the URL
- For development: `http://localhost:3001`
- For production: Your Railway/Render backend URL

---

### Privy Authentication

| Variable | Description | Example Value | Required |
|----------|-------------|---------------|----------|
| `NEXT_PUBLIC_PRIVY_APP_ID` | Privy application ID | `clp7g8x9t00...` | ✅ Yes |

**How to get:**
1. Go to [privy.io](https://privy.io)
2. Create/select your app
3. Copy the App ID from dashboard

---

### Supabase Database (Client-Side)

| Variable | Description | Example Value | Required |
|----------|-------------|---------------|----------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL | `https://xxxxx.supabase.co` | ✅ Yes |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon/public key | `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...` | ✅ Yes |

**How to get:**
1. Go to [supabase.com](https://supabase.com)
2. Select your project
3. Go to **Settings** → **API**
4. Copy **Project URL** and **anon public** key

---

### Supabase Database (Server-Side API Routes)

| Variable | Description | Example Value | Required |
|----------|-------------|---------------|----------|
| `HACKNYU_SUPABASE_URL` | Same as NEXT_PUBLIC_SUPABASE_URL | `https://xxxxx.supabase.co` | ✅ Yes |
| `HACKNYU_SUPABASE_ANON_KEY` | Same as NEXT_PUBLIC_SUPABASE_ANON_KEY | `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...` | ✅ Yes |

**Note:** These are duplicates of the public variables but without the `NEXT_PUBLIC_` prefix. They're used by server-side API routes.

---

### Blockchain Configuration

| Variable | Description | Example Value | Required |
|----------|-------------|---------------|----------|
| `NEXT_PUBLIC_CHAIN` | Blockchain type | `solana` | ⚠️ Optional* |
| `NEXT_PUBLIC_SOLANA_NETWORK` | Solana network | `devnet` or `mainnet-beta` | ⚠️ Optional* |

**Note:** These have defaults in `vercel.json` (`solana` and `devnet`), so they're optional. Override if needed.

---

## 📝 Complete Environment Variables List

### Copy-Paste Template

Add these to Vercel (replace values with your actual credentials):

```bash
# Frontend API
NEXT_PUBLIC_API_URL=https://your-backend.railway.app

# Privy Authentication
NEXT_PUBLIC_PRIVY_APP_ID=your_privy_app_id

# Supabase (Client-Side)
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.your_anon_key

# Supabase (Server-Side)
HACKNYU_SUPABASE_URL=https://xxxxx.supabase.co
HACKNYU_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.your_anon_key

# Blockchain (Optional - has defaults)
NEXT_PUBLIC_CHAIN=solana
NEXT_PUBLIC_SOLANA_NETWORK=devnet
```

---

## 🚨 Common Mistakes

### 1. Trailing Slash in API URL ❌

```bash
# WRONG
NEXT_PUBLIC_API_URL=https://backend.railway.app/

# CORRECT
NEXT_PUBLIC_API_URL=https://backend.railway.app
```

### 2. Not Selecting All Environments ❌

When adding variables in Vercel, you must check:
- ✅ Production
- ✅ Preview
- ✅ Development

If you only select "Production", preview deployments will fail.

### 3. Forgetting to Redeploy ❌

After adding/changing environment variables:
1. Go to **Deployments** tab
2. Click **•••** menu on latest deployment
3. Click **Redeploy**

Or push a new commit to trigger automatic deployment.

### 4. Missing HACKNYU_SUPABASE Variables ❌

The `/api/listings` route uses `HACKNYU_SUPABASE_*` variables, not `NEXT_PUBLIC_*`. Make sure to add both sets.

---

## 🔍 Verifying Variables

### Check Build Logs

After deployment, check build logs for:

```bash
# Good - No environment variable errors
✓ Compiled successfully

# Bad - Missing variables
Error: NEXT_PUBLIC_API_URL is not defined
```

### Test at Runtime

Visit your deployed site and check browser console:

```javascript
// In browser console
console.log(process.env.NEXT_PUBLIC_API_URL)
// Should show your backend URL, not undefined
```

---

## 🔐 Security Best Practices

### Public vs Private Variables

| Prefix | Visibility | Use Case | Example |
|--------|-----------|----------|---------|
| `NEXT_PUBLIC_*` | 🌍 Client-side (public) | Exposed in browser | `NEXT_PUBLIC_API_URL` |
| No prefix | 🔒 Server-side (private) | Hidden from browser | `HACKNYU_SUPABASE_URL` |

**Important:**
- `NEXT_PUBLIC_*` variables are **embedded in client-side JavaScript** and visible to users
- Only use `NEXT_PUBLIC_*` for truly public values (API URLs, public keys)
- Never put secrets in `NEXT_PUBLIC_*` variables

### Sensitive Values

✅ Safe to expose:
- Supabase anon key (it's public)
- Privy App ID (it's public)
- API URLs
- Blockchain network names

❌ Never expose:
- Supabase service role key
- Private keys
- API secrets
- Admin credentials

---

## 🧪 Testing Locally

Before deploying, test with local environment variables:

1. Create `frontend/.env.local`:

```bash
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_PRIVY_APP_ID=your_privy_app_id
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
HACKNYU_SUPABASE_URL=https://xxxxx.supabase.co
HACKNYU_SUPABASE_ANON_KEY=your_anon_key
NEXT_PUBLIC_CHAIN=solana
NEXT_PUBLIC_SOLANA_NETWORK=devnet
```

2. Run development server:

```bash
cd frontend
pnpm dev
```

3. Verify all features work before deploying to Vercel

---

## 📊 Environment-Specific Values

### Development

```bash
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_SOLANA_NETWORK=devnet
```

### Preview (Vercel)

```bash
NEXT_PUBLIC_API_URL=https://backend-preview.railway.app
NEXT_PUBLIC_SOLANA_NETWORK=devnet
```

### Production (Vercel)

```bash
NEXT_PUBLIC_API_URL=https://backend.railway.app
NEXT_PUBLIC_SOLANA_NETWORK=mainnet-beta
```

You can set different values per environment in Vercel settings.

---

## 🆘 Troubleshooting

### "Cannot read properties of undefined" Error

**Cause:** Missing environment variable

**Fix:**
1. Check Vercel dashboard → Settings → Environment Variables
2. Ensure the variable exists and is spelled correctly
3. Redeploy

### API Calls Failing

**Cause:** `NEXT_PUBLIC_API_URL` is wrong or has trailing slash

**Fix:**
1. Verify backend is deployed and accessible
2. Remove trailing slash from URL
3. Test URL in browser: `https://your-backend.railway.app/health`

### Supabase Queries Failing

**Cause:** Missing or incorrect `HACKNYU_SUPABASE_*` variables

**Fix:**
1. Add both `HACKNYU_SUPABASE_URL` and `HACKNYU_SUPABASE_ANON_KEY`
2. Values should match `NEXT_PUBLIC_SUPABASE_*` variables
3. Redeploy

---

## ✅ Final Checklist

Before deploying, verify:

- [ ] All required variables added to Vercel
- [ ] All three environments selected for each variable
- [ ] No trailing slashes in URLs
- [ ] HACKNYU_SUPABASE_* variables match NEXT_PUBLIC_SUPABASE_* values
- [ ] Variables tested locally with `.env.local`
- [ ] Backend is deployed and accessible
- [ ] Privy App ID is correct
- [ ] Supabase project is accessible

---

## 🚀 Ready to Deploy!

Once all variables are configured:

```bash
cd frontend
vercel --prod
```

Your HypeChain platform should deploy successfully! 🎉

---

## 📚 Additional Resources

- [Vercel Environment Variables Docs](https://vercel.com/docs/projects/environment-variables)
- [Next.js Environment Variables](https://nextjs.org/docs/app/building-your-application/configuring/environment-variables)
- [Supabase JavaScript Client](https://supabase.com/docs/reference/javascript)
- [Privy Documentation](https://docs.privy.io/)
