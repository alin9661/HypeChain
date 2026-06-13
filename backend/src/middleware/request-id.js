/**
 * Request correlation middleware.
 *
 * Assigns each request a stable id (honoring an inbound `X-Request-Id` from a
 * trusted proxy/load balancer, otherwise minting a UUID) and echoes it on the
 * response. Downstream logs can include `req.id` so a single request is
 * traceable across the access log, error handler, and any service-level logs —
 * the baseline for debugging a Lambda cold-start or a partial-failure purchase.
 */

import crypto from 'crypto';

// A conservative id shape so a forged inbound header can't inject control
// characters into logs (CWE-117) — accept only short hex/uuid-ish tokens.
const SAFE_ID = /^[A-Za-z0-9._-]{1,128}$/;

export function requestId(req, res, next) {
  const inbound = req.headers['x-request-id'];
  req.id = typeof inbound === 'string' && SAFE_ID.test(inbound) ? inbound : crypto.randomUUID();
  res.setHeader('X-Request-Id', req.id);
  next();
}
