/**
 * Module-level Aurora DSQL connection pool (node-postgres).
 *
 * Ports backend-py/app/db/pool.py to Node. Key constraints carried over:
 *
 *   * A single module-level pool (max 5 connections) created lazily and reused
 *     across warm Lambda invocations — NOT per-request.
 *
 *   * NO server-side prepared-statement caching. Aurora DSQL rejects/limits the
 *     server-side prepared statements a driver caches by default. node-postgres
 *     only creates a *named* (cached) prepared statement when a query is given a
 *     `name`; our queries never set `name`, so every statement is an unnamed,
 *     non-cached parse/bind/execute. This is the Node equivalent of asyncpg's
 *     mandatory `statement_cache_size=0`. Do NOT add `name:` to any DSQL query.
 *
 *   * Authentication uses a short-lived DSQL IAM auth token (not a static
 *     password). The token authenticates *connection setup*, not each query, so
 *     node-postgres's async `password` callback mints a fresh token only when a
 *     brand-new physical connection is established (initial fill + replacements),
 *     never on acquire/release of an already-open connection.
 *
 * The pool is intentionally not closed per-request; `closePool()` exists for
 * test teardown and graceful shutdown only.
 */

import pg from 'pg';

const { Pool, types } = pg;

// node-postgres returns NUMERIC (OID 1700) as a string to avoid float precision
// loss. The prior Supabase client returned numerics as JS numbers, and the HTTP
// responses + frontend consume them as numbers (price_sol, ai_confidence_score,
// total_volume). Parse to Number to preserve that contract. SOL/price magnitudes
// are well within IEEE-754 safe range.
types.setTypeParser(1700, (v) => (v === null ? null : parseFloat(v)));

// DSQL listens on the standard Postgres port; the admin DB user is "admin".
const DSQL_PORT = 5432;
const DSQL_USER = 'admin';
const POOL_MAX_SIZE = 5;
// Tokens are short-lived; recycle connections well before expiry so a long-lived
// warm container never authenticates a query on a stale-token connection.
const CONNECTION_MAX_LIFETIME_MS = 50 * 60 * 1000; // 50 min (token TTL is ~15 min default; see note)

// Module-level singleton. Reused across warm invocations.
let _pool = null;

function isDevelopment() {
  return (process.env.NODE_ENV || 'production') === 'development';
}

/**
 * Mint a short-lived DSQL IAM auth token for the "admin" user.
 *
 * `@aws-sdk/dsql-signer` is imported lazily so importing this module (and
 * running unit tests, which inject a fake pool) never requires AWS creds or
 * network access.
 */
async function generateDsqlAuthToken(endpoint, region) {
  const { DsqlSigner } = await import('@aws-sdk/dsql-signer');
  const signer = new DsqlSigner({ hostname: endpoint, region });
  // Admin connect token is the standard auth path for the "admin" user.
  return signer.getDbConnectAdminAuthToken();
}

function createPool() {
  // LOCAL/CI escape hatch (local-dev parity). When HACKNYU_DATABASE_URL is set,
  // connect to a plain Postgres via DSN/password instead of the DSQL IAM-token +
  // TLS path — DSQL is "plain Postgres over the wire", so the same queries run
  // unchanged against a local container.
  //
  // FAIL-CLOSED: this path drops TLS + IAM auth, so it must NEVER activate in
  // production. It is gated on NODE_ENV=development (which defaults to
  // "production"). If HACKNYU_DATABASE_URL is set while NODE_ENV is anything but
  // "development", we refuse rather than silently downgrade to a plaintext,
  // unauthenticated connection.
  const localDsn = process.env.HACKNYU_DATABASE_URL;
  if (localDsn) {
    if (!isDevelopment()) {
      throw new Error(
        'HACKNYU_DATABASE_URL is only honored when NODE_ENV=development. ' +
          'Refusing to open a plaintext, non-IAM Postgres connection outside ' +
          'development — production must use the Aurora DSQL IAM-token + TLS path.'
      );
    }
    return new Pool({ connectionString: localDsn, max: POOL_MAX_SIZE });
  }

  const endpoint = process.env.HACKNYU_DSQL_ENDPOINT;
  if (!endpoint) {
    throw new Error(
      'HACKNYU_DSQL_ENDPOINT is not set — cannot open the Aurora DSQL pool. ' +
        'Set it in the environment (or set HACKNYU_DATABASE_URL with NODE_ENV=development for local).'
    );
  }
  const region = process.env.HACKNYU_DSQL_REGION || 'us-east-1';
  const database = process.env.HACKNYU_DSQL_DATABASE || 'postgres';

  return new Pool({
    host: endpoint,
    port: DSQL_PORT,
    user: DSQL_USER,
    database,
    // Async password callback: invoked per new physical connection, which is
    // exactly when a fresh IAM token is needed (token authenticates connection
    // setup, not queries).
    password: () => generateDsqlAuthToken(endpoint, region),
    // DSQL requires TLS; its certs chain to a public CA, so verify against the
    // platform trust store.
    ssl: { rejectUnauthorized: true },
    max: POOL_MAX_SIZE,
    maxLifetimeSeconds: Math.floor(CONNECTION_MAX_LIFETIME_MS / 1000),
  });
}

/** Return the process-wide DSQL pool, creating it on first use. */
export function getPool() {
  if (_pool == null) {
    _pool = createPool();
  }
  return _pool;
}

/**
 * Run a single parameterized statement against the pool.
 * Returns node-postgres's result ({ rows, rowCount }).
 */
export function query(text, params) {
  return getPool().query(text, params);
}

/**
 * Acquire a pooled client, run `fn(client)`, and always release it.
 * Used by the OCC retry path so each attempt runs on a fresh checkout.
 *
 * @template T
 * @param {(client: import('pg').PoolClient) => Promise<T>} fn
 * @returns {Promise<T>}
 */
export async function withClient(fn) {
  const client = await getPool().connect();
  try {
    return await fn(client);
  } finally {
    client.release();
  }
}

/** Close and drop the module-level pool (graceful shutdown / test teardown). */
export async function closePool() {
  if (_pool != null) {
    await _pool.end();
    _pool = null;
  }
}

/** Test hook: inject a fake pool (or clear it). Not used in production code. */
export function _resetForTests(pool) {
  _pool = pool;
}
