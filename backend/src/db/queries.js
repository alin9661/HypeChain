/**
 * Explicit, column-enumerated SQL for the DSQL data layer.
 *
 * Ports backend-py/app/db/queries.py to Node. Parity rules enforced here:
 *   * NO `SELECT *` anywhere — every column the HTTP responses consume is
 *     enumerated and ordered explicitly.
 *   * The transaction-history endpoint reproduces the prior PostgREST embedded
 *     shape `{..., listing: {product_name, image_url, nft_mint_address}}` via a
 *     single `transactions JOIN listings` with `json_build_object` — never N+1.
 *   * `updated_at` is set EXPLICITLY in every UPDATE (Supabase used a trigger;
 *     DSQL has none).
 *
 * Every function accepts a `conn` that is duck-typed: it only needs
 * `query(text, params) -> { rows }` (a node-postgres Pool or PoolClient, or a
 * test fake). The OCC-wrapped `incrementUserVolume` instead takes a
 * client-acquire factory so each retry runs a fresh transaction.
 */

import { retryOnSerializationError } from './occ.js';
import { withClient as defaultWithClient } from './pool.js';

// ---------------------------------------------------------------------------
// Column manifests — single source of truth for "every column" (no SELECT *).
// Order mirrors schema/001_dsql_schema.sql so response field order is stable.
// ---------------------------------------------------------------------------

export const LISTING_COLUMNS = [
  'id', 'nft_mint_address', 'seller_wallet', 'seller_user_id', 'product_name',
  'description', 'category', 'condition', 'image_url', 'metadata_uri',
  'price_sol', 'price_usdc', 'status', 'ai_verified', 'ai_confidence_score',
  'created_at', 'updated_at', 'sold_at', 'buyer_wallet', 'buyer_user_id',
  'transaction_signature', 'views', 'favorites', 'is_compressed',
  'merkle_tree_address', 'leaf_index', 'guest_email', 'is_pending_claim',
  'platform_wallet', 'storage_type', 'listing_pubkey', 'verification_proof_pubkey',
];

export const TRANSACTION_COLUMNS = [
  'id', 'listing_id', 'buyer_wallet', 'seller_wallet', 'buyer_user_id',
  'seller_user_id', 'amount_sol', 'amount_usdc', 'fee_sol', 'signature',
  'status', 'payment_method', 'blockchain_confirmed', 'confirmation_time',
  'error_message', 'created_at', 'confirmed_at', 'updated_at',
];

export const ACTIVITY_COLUMNS = [
  'id', 'event_type', 'nft_mint_address', 'product_name', 'image_url',
  'from_wallet', 'to_wallet', 'price_sol', 'tx_signature', 'block_time',
  'source', 'created_at',
];

// Columns the application supplies on INSERT. id + created_at take DB defaults.
const ACTIVITY_INSERT_COLUMNS = [
  'event_type', 'nft_mint_address', 'product_name', 'image_url', 'from_wallet',
  'to_wallet', 'price_sol', 'tx_signature', 'block_time', 'source',
];

// Columns supplied on INSERT into listings; the rest take DB defaults / NULL.
const LISTING_INSERT_COLUMNS = [
  'nft_mint_address', 'seller_wallet', 'seller_user_id', 'product_name',
  'description', 'category', 'condition', 'image_url', 'metadata_uri',
  'price_sol', 'status', 'ai_verified', 'ai_confidence_score', 'guest_email',
  'is_pending_claim', 'platform_wallet', 'is_compressed', 'merkle_tree_address',
  'leaf_index',
];

// Columns supplied when recording a confirmed purchase. Defaults cover the rest.
const TRANSACTION_INSERT_COLUMNS = [
  'listing_id', 'buyer_wallet', 'seller_wallet', 'buyer_user_id',
  'seller_user_id', 'amount_sol', 'signature', 'status', 'payment_method',
  'blockchain_confirmed', 'confirmed_at',
];

function selectList(columns, prefix = '') {
  const pre = prefix ? `${prefix}.` : '';
  return columns.map((c) => `${pre}${c}`).join(', ');
}

function placeholders(n, start = 1) {
  const parts = [];
  for (let i = start; i < start + n; i += 1) parts.push(`$${i}`);
  return parts.join(', ');
}

// Precomputed SQL strings built from the manifests — keeps "no SELECT *"
// mechanical and testable.
const RETURNING = selectList(LISTING_COLUMNS);
const TX_RETURNING = selectList(TRANSACTION_COLUMNS);
const ACTIVITY_COLS = selectList(ACTIVITY_COLUMNS);

export const INSERT_LISTING_SQL =
  `INSERT INTO listings (${selectList(LISTING_INSERT_COLUMNS)}) ` +
  `VALUES (${placeholders(LISTING_INSERT_COLUMNS.length)}) ` +
  `RETURNING ${RETURNING}`;

export const GET_USER_ID_BY_WALLET_SQL = 'SELECT id FROM users WHERE wallet_address = $1';

export const FETCH_LISTING_BY_ID_SQL = `SELECT ${RETURNING} FROM listings WHERE id = $1`;

export const GET_TRANSACTION_ID_BY_SIGNATURE_SQL =
  'SELECT id FROM transactions WHERE signature = $1';

export const GET_TRANSACTION_BY_SIGNATURE_SQL =
  `SELECT ${TX_RETURNING} FROM transactions WHERE signature = $1`;

// Persist the on-chain PDA references after the listing is anchored on-chain
// (best-effort — a NULL ref just means "not yet/never anchored"). updated_at
// set explicitly (no trigger on DSQL).
export const UPDATE_LISTING_ONCHAIN_REFS_SQL =
  'UPDATE listings ' +
  'SET listing_pubkey = $2, verification_proof_pubkey = $3, updated_at = NOW() ' +
  'WHERE id = $1 ' +
  `RETURNING ${selectList(LISTING_COLUMNS)}`;

// Read-repair: converge a stale 'active' projection to 'sold' when the chain
// (source of truth) already says Sold. The status filter makes it a no-op on
// already-repaired rows. updated_at set explicitly (no trigger on DSQL).
export const MARK_LISTING_SOLD_IF_ACTIVE_SQL =
  "UPDATE listings SET status = 'sold', sold_at = NOW(), updated_at = NOW() " +
  "WHERE id = $1 AND status = 'active'";

// Explicit updated_at = NOW() (Supabase trigger replaced).
export const UPDATE_LISTING_STATUS_SQL =
  'UPDATE listings ' +
  'SET status = $2, sold_at = $3, buyer_wallet = $4, buyer_user_id = $5, ' +
  '    transaction_signature = $6, updated_at = NOW() ' +
  'WHERE id = $1 ' +
  `RETURNING ${RETURNING}`;

export const INSERT_TRANSACTION_SQL =
  `INSERT INTO transactions (${selectList(TRANSACTION_INSERT_COLUMNS)}) ` +
  `VALUES (${placeholders(TRANSACTION_INSERT_COLUMNS.length)}) ` +
  `RETURNING ${TX_RETURNING}`;

// Additive, OCC-safe seller-volume increment (replaces the increment_user_volume RPC).
export const INCREMENT_USER_VOLUME_SQL =
  'UPDATE users ' +
  'SET total_volume = total_volume + $2, updated_at = NOW() ' +
  'WHERE id = $1 ' +
  'RETURNING id, total_volume';

// Transaction history with the embedded `listing` object — single JOIN, never N+1.
const HISTORY_BASE_SQL =
  'SELECT ' +
  `${selectList(TRANSACTION_COLUMNS, 't')}, ` +
  "json_build_object(" +
  "'product_name', l.product_name, " +
  "'image_url', l.image_url, " +
  "'nft_mint_address', l.nft_mint_address" +
  ') AS listing ' +
  'FROM transactions t ' +
  'JOIN listings l ON l.id = t.listing_id ';

// Idempotent insert on the (tx_signature, event_type, nft_mint_address) unique key.
export const INSERT_ACTIVITY_SQL =
  `INSERT INTO activities (${selectList(ACTIVITY_INSERT_COLUMNS)}) ` +
  `VALUES (${placeholders(ACTIVITY_INSERT_COLUMNS.length)}) ` +
  'ON CONFLICT (tx_signature, event_type, nft_mint_address) DO NOTHING ' +
  `RETURNING ${ACTIVITY_COLS}`;

export const FETCH_NFT_HISTORY_SQL =
  `SELECT ${ACTIVITY_COLS} FROM activities ` +
  'WHERE nft_mint_address = $1 ' +
  'ORDER BY block_time DESC, id DESC LIMIT $2';

// ---------------------------------------------------------------------------
// Query functions. `conn` is duck-typed (node-postgres Pool/Client or a fake).
// ---------------------------------------------------------------------------

/** INSERT a listing row, returning the full row (parity with .select().single()). */
export async function insertListing(conn, listing) {
  const args = LISTING_INSERT_COLUMNS.map((col) => listing[col] ?? null);
  const { rows } = await conn.query(INSERT_LISTING_SQL, args);
  return rows[0];
}

/** Resolve users.id for a wallet, or null if no such user (orphan seller). */
export async function getUserIdByWallet(conn, walletAddress) {
  const { rows } = await conn.query(GET_USER_ID_BY_WALLET_SQL, [walletAddress]);
  return rows.length ? rows[0].id : null;
}

/** Fetch a single listing by id (full row), or null if not found. */
export async function fetchListingById(conn, listingId) {
  const { rows } = await conn.query(FETCH_LISTING_BY_ID_SQL, [listingId]);
  return rows.length ? rows[0] : null;
}

/** Return an existing transaction's id for this signature, or null. */
export async function getTransactionIdBySignature(conn, signature) {
  const { rows } = await conn.query(GET_TRANSACTION_ID_BY_SIGNATURE_SQL, [signature]);
  return rows.length ? rows[0].id : null;
}

/** Return the full transaction row for a signature, or null (replay detection). */
export async function getTransactionBySignature(conn, signature) {
  const { rows } = await conn.query(GET_TRANSACTION_BY_SIGNATURE_SQL, [signature]);
  return rows.length ? rows[0] : null;
}

/** Persist the on-chain EvidenceListing + VerificationProof PDAs for a listing. */
export async function updateListingOnChainRefs(conn, listingId, { listingPubkey = null, verificationProofPubkey = null } = {}) {
  const { rows } = await conn.query(UPDATE_LISTING_ONCHAIN_REFS_SQL, [
    listingId, listingPubkey, verificationProofPubkey,
  ]);
  return rows.length ? rows[0] : null;
}

/**
 * Read-repair a stale listing to 'sold' only if it is still 'active'.
 * Returns the number of rows changed (0 = already repaired / not active).
 */
export async function markListingSoldIfActive(conn, listingId) {
  const { rowCount } = await conn.query(MARK_LISTING_SOLD_IF_ACTIVE_SQL, [listingId]);
  return rowCount;
}

/** Update a listing's status (and sale fields), returning the updated row or null. */
export async function updateListingStatus(
  conn,
  listingId,
  { status, soldAt = null, buyerWallet = null, buyerUserId = null, transactionSignature = null } = {}
) {
  const { rows } = await conn.query(UPDATE_LISTING_STATUS_SQL, [
    listingId, status, soldAt, buyerWallet, buyerUserId, transactionSignature,
  ]);
  return rows.length ? rows[0] : null;
}

/** INSERT a transaction row, returning the full row. */
export async function insertTransaction(conn, tx) {
  const args = TRANSACTION_INSERT_COLUMNS.map((col) => tx[col] ?? null);
  const { rows } = await conn.query(INSERT_TRANSACTION_SQL, args);
  return rows[0];
}

/**
 * Add `amount` to a seller's total_volume, OCC-safe (replaces the
 * increment_user_volume RPC). The whole UPDATE is retried on a DSQL 40001
 * serialization abort. Returns { id, total_volume }, or null if the user row
 * does not exist (caller treats a missing seller volume as non-fatal).
 *
 * @param {string} userId seller users.id
 * @param {number} amount SOL amount to add
 * @param {object} [opts]
 * @param {(fn: Function) => Promise<any>} [opts.withClientFn] injectable for tests
 */
export async function incrementUserVolume(userId, amount, { withClientFn = defaultWithClient } = {}) {
  return retryOnSerializationError(() =>
    withClientFn(async (conn) => {
      const { rows } = await conn.query(INCREMENT_USER_VOLUME_SQL, [userId, amount]);
      return rows.length ? rows[0] : null;
    })
  );
}

/**
 * Fetch a wallet's transaction history with the embedded `listing` object.
 * `type` selects the filter: 'buyer' | 'seller' | 'all' (default).
 * Single JOIN, ordered created_at DESC — never N+1.
 */
export async function getTransactionHistory(conn, walletAddress, { type = 'all' } = {}) {
  let where;
  if (type === 'buyer') where = 'WHERE t.buyer_wallet = $1 ';
  else if (type === 'seller') where = 'WHERE t.seller_wallet = $1 ';
  else where = 'WHERE t.buyer_wallet = $1 OR t.seller_wallet = $1 ';

  const sql = `${HISTORY_BASE_SQL}${where}ORDER BY t.created_at DESC`;
  const { rows } = await conn.query(sql, [walletAddress]);
  return rows;
}

/**
 * Idempotently INSERT an activity event, returning the row — or null on dup.
 * A duplicate (same tx_signature + event_type + nft_mint_address) hits
 * ON CONFLICT DO NOTHING and returns null, so the caller can report "already
 * ingested" without raising — the property that makes Helius at-least-once
 * webhook delivery safe to replay.
 */
export async function insertActivity(conn, activity) {
  const args = ACTIVITY_INSERT_COLUMNS.map((col) => activity[col] ?? null);
  const { rows } = await conn.query(INSERT_ACTIVITY_SQL, args);
  return rows.length ? rows[0] : null;
}

/**
 * Keyset-paginated global activity feed, newest first. Pagination is keyset
 * (NOT OFFSET): the cursor is the (block_time, id) of the last row seen, and
 * the next page is everything strictly "less than" it in (block_time DESC,
 * id DESC) order — O(log n) as the feed grows.
 */
export async function getActivitiesFeed(
  conn,
  { eventType = null, beforeBlockTime = null, beforeId = null, limit = 20 } = {}
) {
  const conds = [];
  const args = [];
  if (eventType != null) {
    args.push(eventType);
    conds.push(`event_type = $${args.length}`);
  }
  if (beforeBlockTime != null && beforeId != null) {
    args.push(beforeBlockTime);
    const tsIdx = args.length;
    args.push(beforeId);
    const idIdx = args.length;
    conds.push(`(block_time, id) < ($${tsIdx}, $${idIdx})`);
  }
  const where = conds.length ? ` WHERE ${conds.join(' AND ')}` : '';
  args.push(limit);
  const limitIdx = args.length;
  const sql =
    `SELECT ${ACTIVITY_COLS} FROM activities${where} ` +
    `ORDER BY block_time DESC, id DESC LIMIT $${limitIdx}`;
  const { rows } = await conn.query(sql, args);
  return rows;
}

/** Full chain of custody for one NFT (the provenance endpoint), newest first. */
export async function getNftHistory(conn, nftMintAddress, { limit = 100 } = {}) {
  const { rows } = await conn.query(FETCH_NFT_HISTORY_SQL, [nftMintAddress, limit]);
  return rows;
}

// ---------------------------------------------------------------------------
// WAITLIST — pre-production signup capture (POST /api/waitlist + admin export).
// Self-contained block: manifest, SQL, and query functions for the waitlist.
// ---------------------------------------------------------------------------

export const WAITLIST_COLUMNS = [
  'id', 'name', 'email', 'wallet_address', 'intent', 'source', 'status',
  'confirmation_sent_at', 'created_at', 'updated_at',
];

// Columns the application supplies on INSERT; the rest take DB defaults.
const WAITLIST_INSERT_COLUMNS = ['name', 'email', 'wallet_address', 'intent', 'source'];

const WAITLIST_COLS = selectList(WAITLIST_COLUMNS);

// Idempotent insert: a duplicate email hits ON CONFLICT DO NOTHING and returns
// no row, so the caller treats it as "already on the list" without raising and
// without re-sending the confirmation email.
export const INSERT_WAITLIST_SQL =
  `INSERT INTO waitlist (${selectList(WAITLIST_INSERT_COLUMNS)}) ` +
  `VALUES (${placeholders(WAITLIST_INSERT_COLUMNS.length)}) ` +
  'ON CONFLICT (email) DO NOTHING ' +
  `RETURNING ${WAITLIST_COLS}`;

export const GET_WAITLIST_BY_EMAIL_SQL =
  `SELECT ${WAITLIST_COLS} FROM waitlist WHERE email = $1`;

export const LIST_WAITLIST_SQL =
  `SELECT ${WAITLIST_COLS} FROM waitlist ORDER BY created_at DESC LIMIT $1`;

// Stamp confirmation_sent_at once the SES acknowledgement actually dispatches.
export const MARK_WAITLIST_CONFIRMATION_SENT_SQL =
  'UPDATE waitlist SET confirmation_sent_at = NOW(), updated_at = NOW() WHERE id = $1';

/**
 * INSERT a waitlist signup, returning the full row — or null on a duplicate
 * email (ON CONFLICT DO NOTHING). The route normalizes `email` (lower/trim)
 * before calling so the UNIQUE guard is case-insensitive.
 */
export async function insertWaitlistEntry(conn, entry) {
  const args = WAITLIST_INSERT_COLUMNS.map((col) => entry[col] ?? null);
  const { rows } = await conn.query(INSERT_WAITLIST_SQL, args);
  return rows.length ? rows[0] : null;
}

/** Fetch a waitlist row by (normalized) email, or null if not on the list. */
export async function getWaitlistByEmail(conn, email) {
  const { rows } = await conn.query(GET_WAITLIST_BY_EMAIL_SQL, [email]);
  return rows.length ? rows[0] : null;
}

/** All waitlist signups, newest first (admin export). `limit` caps the dump. */
export async function listWaitlist(conn, { limit = 10000 } = {}) {
  const { rows } = await conn.query(LIST_WAITLIST_SQL, [limit]);
  return rows;
}

/** Record that the confirmation email for a row has been dispatched. */
export async function markWaitlistConfirmationSent(conn, id) {
  await conn.query(MARK_WAITLIST_CONFIRMATION_SENT_SQL, [id]);
}

// ---------------------------------------------------------------------------
// USERS — register/login + profile lookup. Replaces the Supabase-backed
// Next.js routes (frontend/app/api/users/*) as part of the Supabase
// decommission. Same idempotent INSERT ... ON CONFLICT DO NOTHING RETURNING
// idiom as the waitlist: a returned row means a brand-new user; no row means
// the wallet already existed, so we stamp last_login and return the row.
// ---------------------------------------------------------------------------

export const USER_COLUMNS = [
  'id', 'wallet_address', 'privy_user_id', 'chain_type', 'username',
  'profile_image', 'email', 'total_volume', 'last_login', 'created_at',
  'updated_at',
];

// Columns supplied on a first-time register; id/timestamps take DB defaults,
// last_login is stamped with NOW() in the SQL below.
const USER_INSERT_COLUMNS = ['wallet_address', 'privy_user_id', 'chain_type', 'email'];

const USER_COLS = selectList(USER_COLUMNS);

export const INSERT_USER_SQL =
  `INSERT INTO users (${selectList(USER_INSERT_COLUMNS)}, last_login) ` +
  `VALUES (${placeholders(USER_INSERT_COLUMNS.length)}, NOW()) ` +
  'ON CONFLICT (wallet_address) DO NOTHING ' +
  `RETURNING ${USER_COLS}`;

export const UPDATE_USER_LOGIN_SQL =
  'UPDATE users SET last_login = NOW(), updated_at = NOW() ' +
  `WHERE wallet_address = $1 RETURNING ${USER_COLS}`;

export const GET_USER_BY_WALLET_SQL =
  `SELECT ${USER_COLS} FROM users WHERE wallet_address = $1`;

/**
 * Register a new user or, if the wallet already exists, stamp last_login and
 * return the existing row. Returns `{ user, isNewUser }`. Idempotent against the
 * wallet_address UNIQUE constraint via TWO statements (not a single transaction):
 * the INSERT either creates the row (new) or no-ops on conflict, in which case
 * the follow-up UPDATE refreshes last_login. The caller handles the rare
 * row-deleted-between-statements race (user === null).
 */
export async function registerOrLoginUser(conn, { walletAddress, privyUserId, chainType, email }) {
  const inserted = await conn.query(INSERT_USER_SQL, [
    walletAddress, privyUserId, chainType, email ?? null,
  ]);
  if (inserted.rows.length) return { user: inserted.rows[0], isNewUser: true };

  const updated = await conn.query(UPDATE_USER_LOGIN_SQL, [walletAddress]);
  return { user: updated.rows.length ? updated.rows[0] : null, isNewUser: false };
}

/** Fetch a user profile by wallet address, or null if not registered. */
export async function getUserByWallet(conn, walletAddress) {
  const { rows } = await conn.query(GET_USER_BY_WALLET_SQL, [walletAddress]);
  return rows.length ? rows[0] : null;
}
