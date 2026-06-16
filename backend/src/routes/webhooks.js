/**
 * Helius enhanced-webhook ingest for off-platform NFT transfers (ported from FastAPI).
 *
 *   POST /api/webhooks/helius
 *
 * Helius POSTs an array of enriched transactions whenever a watched NFT moves.
 * We extract NFT token transfers and append `transfer` rows to the activities
 * table so the feed and per-NFT provenance reflect ownership changes that did
 * NOT flow through create-listing / payment.
 *
 * SECURITY (fail-closed): a PUBLIC write endpoint into the provenance feed — the
 * data the product's trust pitch rests on. Every request must carry the shared
 * secret in its `Authorization` header (configured on the Helius webhook and in
 * HACKNYU_HELIUS_WEBHOOK_SECRET). If the secret is unset OR the header doesn't
 * match, reject 401. Comparison is constant-time (crypto.timingSafeEqual).
 *
 * IDEMPOTENCY: Helius delivers at-least-once and retries on non-2xx. The DB's
 * UNIQUE(tx_signature, event_type, nft_mint_address) + ON CONFLICT DO NOTHING
 * makes ingestion idempotent — a replay inserts nothing and is reported as 0
 * ingested. We always answer 200 on a well-formed, authorized payload (even 0
 * ingested) so Helius doesn't retry-storm.
 */

import express from 'express';
import crypto from 'crypto';

import * as activityService from '../services/activity.js';

const router = express.Router();

/**
 * Constant-time check of the Authorization header against the shared secret.
 * Fail-closed: returns false if the secret is unconfigured, so an
 * unauthenticated endpoint can never exist by omission.
 */
export function authorized(req) {
  const secret = process.env.HACKNYU_HELIUS_WEBHOOK_SECRET;
  if (!secret) return false;
  const provided = req.headers.authorization || '';
  const a = Buffer.from(provided, 'utf8');
  const b = Buffer.from(secret, 'utf8');
  // timingSafeEqual requires equal-length buffers; a length mismatch is a
  // non-match (checked first so timingSafeEqual never throws).
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/** Extract NFT transfer events from one Helius enhanced transaction. */
export function parseTransferEvents(tx) {
  const signature = tx.signature;
  if (!signature) return [];
  const ts = tx.timestamp;
  const blockTime = typeof ts === 'number' ? new Date(ts * 1000) : new Date();

  const events = [];
  for (const tt of tx.tokenTransfers || []) {
    if (tt == null || typeof tt !== 'object') continue;
    const mint = tt.mint;
    if (!mint) continue;
    events.push({
      event_type: 'transfer',
      nft_mint_address: mint,
      tx_signature: signature,
      source: 'helius',
      from_wallet: tt.fromUserAccount ?? null,
      to_wallet: tt.toUserAccount ?? null,
      block_time: blockTime,
    });
  }
  return events;
}

/**
 * Build the POST /helius handler. `recordFn` is injectable for tests (default:
 * the strict activity recorder over the real DSQL facade).
 */
export function createHeliusHandler({ recordFn = activityService.record } = {}) {
  return async (req, res) => {
    if (!authorized(req)) {
      // Generic message — don't hint whether the secret is unset vs. mismatched.
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    const payload = req.body;
    if (!Array.isArray(payload)) {
      return res.status(422).json({ success: false, error: 'Expected a JSON array of transactions' });
    }

    let ingested = 0;
    let seen = 0;
    for (const tx of payload) {
      if (tx == null || typeof tx !== 'object') continue;
      for (const event of parseTransferEvents(tx)) {
        seen += 1;
        // Strict record: a genuine DB error surfaces as 500 and Helius retries;
        // duplicates return false via ON CONFLICT (not an error).
        // eslint-disable-next-line no-await-in-loop
        if (await recordFn(event)) ingested += 1;
      }
    }

    // received/events/ingested are integer counters — no user-controlled strings.
    console.log(`[webhooks] helius ingest received=${payload.length} events=${seen} ingested=${ingested}`);
    return res.json({ success: true, received: payload.length, events: seen, ingested });
  };
}

router.post('/helius', createHeliusHandler());

export default router;
