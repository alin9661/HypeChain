/**
 * Activity feed service — write helpers + read queries over the activities table.
 *
 * Ports backend-py/app/services/activity.py + app/schemas/activity.py to Node.
 * SQL lives in src/db/queries.js (via the `db` facade); this file is
 * orchestration + the wire-shape mapping + the opaque keyset cursor codec.
 *
 * WRITE PATHS
 *   * recordSafe(...) — BEST-EFFORT public write entry point. Any failure is
 *     logged and swallowed, returning false. create-listing / payment-verify
 *     call this: logging an activity must NEVER break a listing or a payment.
 *   * record(...) — strict variant (propagates errors). The webhook uses it so a
 *     genuine DB error surfaces as 500 and Helius retries.
 *
 * A return of true means a row was inserted; false means a duplicate was ignored
 * (idempotent, via ON CONFLICT) OR — for recordSafe — the write failed and was
 * swallowed. The webhook only counts true, so a replayed event ingests 0.
 */

import { db as defaultDb } from '../db/index.js';

export const VALID_EVENT_TYPES = new Set(['mint', 'listing', 'sale', 'transfer']);

// Hard cap on a feed / provenance page so a pathological history or a huge
// `limit` query param can't return an unbounded result set.
export const MAX_LIMIT = 100;
export const DEFAULT_FEED_LIMIT = 20;

function clampLimit(limit, fallback) {
  if (!Number.isFinite(limit) || limit <= 0) return fallback;
  return Math.min(Math.floor(limit), MAX_LIMIT);
}

// ─── wire-shape mapping (matches frontend app/activities/page.tsx) ─────────

function blockTimeMs(blockTime) {
  if (blockTime instanceof Date) return blockTime.getTime();
  const value = Number(blockTime);
  if (!Number.isFinite(value)) return Date.parse(blockTime) || 0;
  // Normalize seconds → ms.
  return value < 1e12 ? Math.round(value * 1000) : Math.round(value);
}

/** Map a DB activities row to the frontend wire shape. */
export function toActivityItem(row) {
  const price = row.price_sol;
  return {
    id: String(row.id),
    type: row.event_type,
    nftName: row.product_name ?? null,
    nftImage: row.image_url ?? null,
    from: row.from_wallet ?? null,
    to: row.to_wallet ?? null,
    price: price != null ? Number(price) : 0,
    timestamp: blockTimeMs(row.block_time), // epoch ms — frontend does new Date(timestamp)
    txHash: row.tx_signature,
  };
}

// ─── opaque keyset cursor codec ────────────────────────────────────────────

function isoOf(blockTime) {
  return blockTime instanceof Date ? blockTime.toISOString() : String(blockTime);
}

/** Encode a row's keyset position into an opaque base64url cursor. */
export function encodeCursor(row) {
  const raw = `${isoOf(row.block_time)}|${row.id}`;
  return Buffer.from(raw, 'utf8').toString('base64url');
}

/**
 * Decode an opaque cursor into { beforeBlockTime: Date, beforeId }.
 * Throws Error('malformed cursor') on any bad input so the route can 400.
 */
export function decodeCursor(cursor) {
  let raw;
  try {
    raw = Buffer.from(cursor, 'base64url').toString('utf8');
  } catch {
    throw new Error('malformed cursor');
  }
  const sep = raw.indexOf('|');
  if (sep <= 0 || sep === raw.length - 1) throw new Error('malformed cursor');
  const btStr = raw.slice(0, sep);
  const idStr = raw.slice(sep + 1);
  const ts = new Date(btStr);
  if (Number.isNaN(ts.getTime())) throw new Error('malformed cursor');
  return { beforeBlockTime: ts, beforeId: idStr };
}

// ─── write helpers ──────────────────────────────────────────────────────────

/**
 * Insert one activity event. Returns true if inserted, false if duplicate.
 * Strict: a DB error propagates.
 */
export async function record(event, { db = defaultDb } = {}) {
  if (!VALID_EVENT_TYPES.has(event.event_type)) {
    throw new Error(`unknown event_type: ${event.event_type}`);
  }
  const row = {
    event_type: event.event_type,
    nft_mint_address: event.nft_mint_address,
    product_name: event.product_name ?? null,
    image_url: event.image_url ?? null,
    from_wallet: event.from_wallet ?? null,
    to_wallet: event.to_wallet ?? null,
    price_sol: event.price_sol ?? null,
    tx_signature: event.tx_signature,
    block_time: event.block_time ?? new Date(),
    source: event.source,
  };
  const inserted = await db.insertActivity(row);
  return inserted != null;
}

/**
 * Best-effort record — log and swallow any failure, return false. The write
 * entry point for create-listing / payment-verify.
 */
export async function recordSafe(event, deps = {}) {
  try {
    return await record(event, deps);
  } catch (err) {
    console.warn(
      `[activity] record failed (swallowed): event_type=${event?.event_type} ` +
        `mint=${event?.nft_mint_address} error=${err?.message ?? err}`
    );
    return false;
  }
}

// ─── read queries ─────────────────────────────────────────────────────────

/**
 * Return one keyset page of the global feed + the next cursor (or null).
 * Fetches limit+1 rows to detect hasMore without a COUNT.
 * Throws Error('malformed cursor') on a bad cursor.
 */
export async function feed({ eventType = null, cursor = null, limit = DEFAULT_FEED_LIMIT } = {}, { db = defaultDb } = {}) {
  const lim = clampLimit(limit, DEFAULT_FEED_LIMIT);
  let beforeBlockTime = null;
  let beforeId = null;
  if (cursor) {
    ({ beforeBlockTime, beforeId } = decodeCursor(cursor));
  }
  const rows = await db.getActivitiesFeed({
    eventType,
    beforeBlockTime,
    beforeId,
    limit: lim + 1,
  });
  const hasMore = rows.length > lim;
  const page = rows.slice(0, lim);
  const nextCursor = hasMore && page.length ? encodeCursor(page[page.length - 1]) : null;
  return { rows: page, nextCursor };
}

/** Full chain of custody for one NFT (provenance), newest first. */
export async function history(nftMintAddress, { limit = MAX_LIMIT } = {}, { db = defaultDb } = {}) {
  const lim = clampLimit(limit, MAX_LIMIT);
  return db.getNftHistory(nftMintAddress, { limit: lim });
}
