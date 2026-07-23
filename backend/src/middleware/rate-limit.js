/**
 * Rate limiting (fail-closed throttles on the expensive / abusable routes).
 *
 * create-listing burns real money per call (AI vision + image gen + on-chain
 * mint), so it gets the tightest limit. The payment routes mutate funds/state,
 * so they get a moderate limit. Keyed by client IP (trust proxy is set on the
 * app so the Lambda Function URL / ALB forwards the real client IP).
 *
 * Store: in-memory (per warm instance). Adequate for the current single-function
 * deploy; a distributed deploy should swap in a shared store (Redis) — the
 * limiter accepts a `store` option, so that's a config change, not a rewrite.
 *
 * The handler returns the standard error envelope + a machine-readable code so
 * the frontend can show a clear "slow down" message instead of a generic 429.
 */

import rateLimit from 'express-rate-limit';

const WINDOW_MS = 60 * 1000; // 1 minute

function limiter({ max, code, message }) {
  return rateLimit({
    windowMs: WINDOW_MS,
    max,
    standardHeaders: true, // RateLimit-* headers
    legacyHeaders: false,
    handler: (req, res) => {
      res.status(429).json({ success: false, error: message, code });
    },
  });
}

// Listing creation is the most expensive call (AI + mint) — keep it tight.
export const createListingLimiter = limiter({
  max: 5,
  code: 'RATE_LIMITED',
  message: 'Too many listing attempts. Please wait a minute and try again.',
});

// Payment endpoints mutate funds/state — moderate per-IP cap.
export const paymentsLimiter = limiter({
  max: 30,
  code: 'RATE_LIMITED',
  message: 'Too many payment requests. Please slow down and try again shortly.',
});

// Public waitlist signup — cheap, but each call can dispatch SES emails, so cap
// per-IP to blunt spam/abuse of the send path.
export const waitlistLimiter = limiter({
  max: 5,
  code: 'RATE_LIMITED',
  message: 'Too many waitlist attempts. Please wait a minute and try again.',
});

// Public waitlist stats (GET /api/waitlist/stats) — served from a 60s in-route
// cache, so this is DoS hygiene on a cheap read, not capacity protection.
// Generous cap; the landing page fetches it once per visit.
export const waitlistStatsLimiter = limiter({
  max: 60,
  code: 'RATE_LIMITED',
  message: 'Too many stats requests. Please slow down and try again shortly.',
});

// User register/login — unauthenticated wallet write. Cheap per call, but cap
// per-IP so a script can't mass-create or spray wallet rows (the route has no
// server-side ownership proof yet; see routes/users.js). Looser than waitlist
// since a wallet connect can legitimately re-register on each session.
export const userRegisterLimiter = limiter({
  max: 20,
  code: 'RATE_LIMITED',
  message: 'Too many registration attempts. Please wait a minute and try again.',
});

// Public profile lookup (GET /api/users/:wallet) — unauthenticated and a
// registration/existence oracle (200 vs 404), so throttle per-IP to blunt
// mass wallet enumeration + DB-load DoS. Looser than register since a page can
// legitimately fetch several profiles.
export const userLookupLimiter = limiter({
  max: 60,
  code: 'RATE_LIMITED',
  message: 'Too many profile lookups. Please slow down and try again shortly.',
});
