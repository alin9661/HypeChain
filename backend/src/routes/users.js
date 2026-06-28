/**
 * User registration + profile lookup.
 *
 *   POST /api/users/register        — register a wallet (or stamp last_login)
 *   GET  /api/users/:walletAddress  — fetch a user profile by wallet
 *
 * Replaces the Supabase-backed Next.js routes (frontend/app/api/users/*) that
 * the frontend used to call same-origin. Now DSQL-backed via the Express
 * `db` facade. The route is built by a factory so tests inject a fake `db`.
 *
 * Response field order/shape matches what frontend/lib/api-client.ts consumes
 * (RegisterUserResponse / GetUserResponse): camelCase, never the raw DB row.
 */

import express from 'express';

import { db as defaultDb } from '../db/index.js';

const VALID_CHAIN_TYPES = ['ethereum', 'solana'];
// base58 Solana addresses are 32-44 chars; cap at the trust boundary so an
// over-long value can't bloat the row / index before it reaches the DB.
const MAX_WALLET_LEN = 64;

// PUBLIC profile shape — safe to return on an UNAUTHENTICATED by-wallet lookup.
// Deliberately omits PII: `email` and `last_login` are NOT included, so a
// wallet-enumeration scan can't harvest emails or activity timing. (The old
// Supabase route returned both via `select('*')`; this is the tightened
// replacement.) `privy_user_id` is never surfaced.
function toPublicUser(row, extra = {}) {
  return {
    id: row.id,
    walletAddress: row.wallet_address,
    chainType: row.chain_type,
    username: row.username,
    profileImage: row.profile_image,
    createdAt: row.created_at,
    totalVolume: row.total_volume,
    ...extra,
  };
}

export function createUserRouter({ db = defaultDb } = {}) {
  const router = express.Router();

  // -------------------------------------------------------------------------
  // POST /api/users/register — register a new wallet or refresh last_login
  //
  // SECURITY (deferred, mainnet-hardening): this write has NO server-side proof
  // that the caller controls `walletAddress` — a client could register/squat any
  // wallet→privyUserId binding. The original Supabase route had the same gap;
  // Privy authenticates the user client-side. Full fix = verify a wallet-signed
  // nonce before binding. Mitigated for now by the per-IP rate limit in index.js.
  // -------------------------------------------------------------------------
  router.post('/users/register', async (req, res) => {
    try {
      const { walletAddress, privyUserId, chainType, email } = req.body || {};

      // Type-coerce guards: reject non-strings up front so a malformed body
      // can't reach the DB as a stray object/number.
      if (
        typeof walletAddress !== 'string' || !walletAddress.trim() ||
        typeof privyUserId !== 'string' || !privyUserId.trim() ||
        typeof chainType !== 'string' || !chainType.trim()
      ) {
        return res.status(400).json({
          success: false,
          error: 'Missing required fields: walletAddress, privyUserId, chainType',
          code: 'MISSING_FIELDS',
        });
      }

      if (!VALID_CHAIN_TYPES.includes(chainType)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid chain type. Must be "ethereum" or "solana"',
          code: 'INVALID_CHAIN_TYPE',
        });
      }

      if (walletAddress.length > MAX_WALLET_LEN) {
        return res.status(400).json({
          success: false,
          error: 'walletAddress is too long',
          code: 'INVALID_WALLET',
        });
      }

      const emailValue =
        typeof email === 'string' && email.trim() ? email.trim() : null;

      const { user, isNewUser } = await db.registerOrLoginUser({
        walletAddress: walletAddress.trim(),
        privyUserId: privyUserId.trim(),
        chainType,
        email: emailValue,
      });

      if (!user) {
        // The wallet conflicted on INSERT but the follow-up UPDATE returned no
        // row — the user was deleted between the two statements. Rare; surface
        // it rather than return a half-empty body.
        return res.status(500).json({
          success: false,
          error: 'Could not register user. Please try again.',
          code: 'USER_REGISTER_FAILED',
        });
      }

      // Echo email ONLY on a brand-new registration (isNewUser), where the caller
      // genuinely just submitted it. On the existing-wallet path the row's email
      // is the PRIOR registrant's (email isn't updated on conflict) and the caller
      // proved no wallet ownership — returning it would leak PII by wallet, the
      // exact enumeration the GET lookup is hardened against.
      return res
        .status(isNewUser ? 201 : 200)
        .json({
          success: true,
          user: toPublicUser(user, { ...(isNewUser ? { email: user.email } : {}), isNewUser }),
        });
    } catch (err) {
      console.error('[users] register failed:', err?.message || err);
      return res.status(500).json({
        success: false,
        error: 'Could not register user. Please try again.',
        code: 'USER_REGISTER_FAILED',
      });
    }
  });

  // -------------------------------------------------------------------------
  // GET /api/users/:walletAddress — fetch a profile (404 when not registered)
  // -------------------------------------------------------------------------
  router.get('/users/:walletAddress', async (req, res) => {
    try {
      const { walletAddress } = req.params;

      if (typeof walletAddress !== 'string' || !walletAddress.trim()) {
        return res.status(400).json({
          success: false,
          error: 'walletAddress is required',
          code: 'MISSING_WALLET',
        });
      }

      // Same trust-boundary cap as register: bound the param before it reaches
      // the indexed lookup (the GET is exempt from the register rate limiter).
      if (walletAddress.length > MAX_WALLET_LEN) {
        return res.status(400).json({
          success: false,
          error: 'walletAddress is too long',
          code: 'INVALID_WALLET',
        });
      }

      const user = await db.getUserByWallet(walletAddress);
      if (!user) {
        return res.status(404).json({
          success: false,
          error: 'User not found',
          code: 'USER_NOT_FOUND',
        });
      }

      return res.json({ success: true, user: toPublicUser(user) });
    } catch (err) {
      console.error('[users] profile lookup failed:', err?.message || err);
      return res.status(500).json({
        success: false,
        error: 'Could not load user profile.',
        code: 'USER_LOOKUP_FAILED',
      });
    }
  });

  return router;
}

export default createUserRouter();
