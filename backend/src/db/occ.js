/**
 * Optimistic-concurrency-control retry helper for Aurora DSQL.
 *
 * Aurora DSQL uses optimistic concurrency control: instead of locking rows, it
 * lets concurrent transactions proceed and aborts the loser at COMMIT with a
 * serialization failure. PostgreSQL signals this with SQLSTATE `40001`
 * (`serialization_failure`); node-postgres surfaces it as an error whose `.code`
 * is `'40001'`.
 *
 * A write that may race another writer on the same row (notably the seller
 * `total_volume` increment in queries.incrementUserVolume) must therefore be
 * wrapped so that, on a 40001 abort, the whole operation is retried from
 * scratch. This helper provides that retry loop with bounded attempts and
 * exponential backoff.
 *
 * Ports backend-py/app/db/occ.py.
 */

// Postgres / DSQL serialization failure code.
export const SERIALIZATION_FAILURE_SQLSTATE = '40001';

export const DEFAULT_MAX_ATTEMPTS = 5;
export const DEFAULT_BASE_DELAY_MS = 10;

function isSerializationError(err) {
  return err != null && err.code === SERIALIZATION_FAILURE_SQLSTATE;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Run `op` and retry it on a DSQL serialization failure (SQLSTATE 40001).
 *
 * `op` MUST be an idempotent, self-contained async factory — each call performs
 * the entire transaction afresh (acquire connection, run the statement(s)),
 * because a retried attempt starts a brand-new transaction. The additive
 * `total_volume = total_volume + $amt` form (not read-modify-write in JS) is
 * what makes each retried attempt correct.
 *
 * @template T
 * @param {() => Promise<T>} op zero-arg async factory performing the work
 * @param {object} [opts]
 * @param {number} [opts.maxAttempts] total tries before giving up and re-throwing
 * @param {number} [opts.baseDelayMs] base for exponential backoff (delay = base * 2**attempt)
 * @returns {Promise<T>} whatever `op` returns on the first successful attempt
 * @throws the last serialization error if every attempt fails, or immediately
 *   re-throws any non-serialization error.
 */
export async function retryOnSerializationError(
  op,
  { maxAttempts = DEFAULT_MAX_ATTEMPTS, baseDelayMs = DEFAULT_BASE_DELAY_MS } = {}
) {
  let lastErr;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      return await op();
    } catch (err) {
      if (!isSerializationError(err)) {
        throw err;
      }
      lastErr = err;
      if (attempt + 1 >= maxAttempts) {
        break;
      }
      // Exponential backoff with light jitter to de-correlate competing retriers.
      const delay = baseDelayMs * 2 ** attempt + Math.floor(Math.random() * baseDelayMs);
      await sleep(delay);
    }
  }
  throw lastErr;
}
