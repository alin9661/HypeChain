/**
 * Unit tests for the Node DSQL data layer (A0). No live cluster: a fake `conn`
 * captures (text, params) and returns canned rows. Mirrors the regression
 * guards in backend-py/tests/test_dsql.py — notably "no SELECT *" and the
 * keyset / history WHERE construction — plus the OCC retry semantics.
 */

import { test, expect, describe } from 'bun:test';

import {
  retryOnSerializationError,
  SERIALIZATION_FAILURE_SQLSTATE,
} from '../src/db/occ.js';
import * as q from '../src/db/queries.js';

function fakeConn(resultRows = []) {
  const calls = [];
  return {
    calls,
    async query(text, params) {
      calls.push({ text, params });
      return { rows: resultRows, rowCount: resultRows.length };
    },
  };
}

describe('queries — no SELECT *', () => {
  test('no exported SQL constant uses SELECT *', () => {
    const sqlConstants = [
      q.INSERT_LISTING_SQL,
      q.GET_USER_ID_BY_WALLET_SQL,
      q.FETCH_LISTING_BY_ID_SQL,
      q.GET_TRANSACTION_ID_BY_SIGNATURE_SQL,
      q.UPDATE_LISTING_STATUS_SQL,
      q.INSERT_TRANSACTION_SQL,
      q.INCREMENT_USER_VOLUME_SQL,
      q.INSERT_ACTIVITY_SQL,
      q.FETCH_NFT_HISTORY_SQL,
    ];
    for (const sql of sqlConstants) {
      expect(sql).not.toContain('*');
    }
  });

  test('column manifests are non-empty and unique', () => {
    for (const cols of [q.LISTING_COLUMNS, q.TRANSACTION_COLUMNS, q.ACTIVITY_COLUMNS]) {
      expect(cols.length).toBeGreaterThan(0);
      expect(new Set(cols).size).toBe(cols.length);
    }
  });
});

describe('insertListing', () => {
  test('passes args in manifest order and returns the row', async () => {
    const conn = fakeConn([{ id: 'L1' }]);
    const row = await q.insertListing(conn, {
      nft_mint_address: 'MINT', seller_wallet: 'W', product_name: 'P',
      image_url: 'img', price_sol: 0, status: 'active',
    });
    expect(row).toEqual({ id: 'L1' });
    const { text, params } = conn.calls[0];
    expect(text).toContain('INSERT INTO listings');
    expect(text).toContain('RETURNING');
    // First insert column is nft_mint_address; last supplied is leaf_index.
    expect(params[0]).toBe('MINT');
    expect(params).toHaveLength(19);
    // Missing optional keys default to null, not undefined.
    expect(params.includes(undefined)).toBe(false);
  });
});

describe('getTransactionHistory — WHERE per type', () => {
  test('buyer / seller / all build the right predicate', async () => {
    for (const [type, frag] of [
      ['buyer', 't.buyer_wallet = $1'],
      ['seller', 't.seller_wallet = $1'],
      ['all', 't.buyer_wallet = $1 OR t.seller_wallet = $1'],
    ]) {
      const conn = fakeConn([]);
      await q.getTransactionHistory(conn, 'WALLET', { type });
      const { text, params } = conn.calls[0];
      expect(text).toContain(frag);
      expect(text).toContain('JOIN listings l ON l.id = t.listing_id');
      expect(text).toContain('ORDER BY t.created_at DESC');
      expect(params).toEqual(['WALLET']);
    }
  });
});

describe('getActivitiesFeed — keyset pagination', () => {
  test('no cursor, no type → just limit', async () => {
    const conn = fakeConn([]);
    await q.getActivitiesFeed(conn, { limit: 20 });
    const { text, params } = conn.calls[0];
    expect(text).not.toContain('WHERE');
    expect(text).toContain('ORDER BY block_time DESC, id DESC LIMIT $1');
    expect(params).toEqual([20]);
  });

  test('type + cursor → filter and row-value keyset predicate', async () => {
    const conn = fakeConn([]);
    await q.getActivitiesFeed(conn, {
      eventType: 'sale', beforeBlockTime: 't0', beforeId: 'id0', limit: 10,
    });
    const { text, params } = conn.calls[0];
    expect(text).toContain('event_type = $1');
    expect(text).toContain('(block_time, id) < ($2, $3)');
    expect(params).toEqual(['sale', 't0', 'id0', 10]);
  });
});

describe('insertActivity — idempotency', () => {
  test('returns the row on insert, null on conflict (no rows)', async () => {
    const inserted = await q.insertActivity(fakeConn([{ id: 'A1' }]), {
      event_type: 'sale', nft_mint_address: 'M', tx_signature: 'S',
      block_time: 't', source: 'app',
    });
    expect(inserted).toEqual({ id: 'A1' });

    const dup = await q.insertActivity(fakeConn([]), {
      event_type: 'sale', nft_mint_address: 'M', tx_signature: 'S',
      block_time: 't', source: 'app',
    });
    expect(dup).toBeNull();
  });

  test('SQL uses ON CONFLICT DO NOTHING on the composite key', () => {
    expect(q.INSERT_ACTIVITY_SQL).toContain(
      'ON CONFLICT (tx_signature, event_type, nft_mint_address) DO NOTHING'
    );
  });
});

describe('incrementUserVolume — OCC', () => {
  test('uses injected withClientFn and returns updated row', async () => {
    const conn = fakeConn([{ id: 'U1', total_volume: 5 }]);
    const withClientFn = async (fn) => fn(conn);
    const row = await q.incrementUserVolume('U1', 2.5, { withClientFn });
    expect(row).toEqual({ id: 'U1', total_volume: 5 });
    expect(conn.calls[0].params).toEqual(['U1', 2.5]);
    expect(conn.calls[0].text).toContain('total_volume = total_volume + $2');
  });

  test('retries a fresh transaction on 40001 then succeeds', async () => {
    let attempts = 0;
    const withClientFn = async (fn) => {
      attempts += 1;
      if (attempts === 1) {
        const err = new Error('serialization failure');
        err.code = SERIALIZATION_FAILURE_SQLSTATE;
        throw err;
      }
      return fn(fakeConn([{ id: 'U1', total_volume: 9 }]));
    };
    const row = await q.incrementUserVolume('U1', 1, { withClientFn });
    expect(attempts).toBe(2);
    expect(row).toEqual({ id: 'U1', total_volume: 9 });
  });
});

describe('retryOnSerializationError', () => {
  test('re-throws a non-40001 error immediately (no retry)', async () => {
    let calls = 0;
    const op = async () => {
      calls += 1;
      const err = new Error('boom');
      err.code = '23505'; // unique_violation, not serialization
      throw err;
    };
    await expect(retryOnSerializationError(op, { baseDelayMs: 0 })).rejects.toThrow('boom');
    expect(calls).toBe(1);
  });

  test('gives up after maxAttempts on persistent 40001', async () => {
    let calls = 0;
    const op = async () => {
      calls += 1;
      const err = new Error('serialization');
      err.code = SERIALIZATION_FAILURE_SQLSTATE;
      throw err;
    };
    await expect(
      retryOnSerializationError(op, { maxAttempts: 3, baseDelayMs: 0 })
    ).rejects.toThrow('serialization');
    expect(calls).toBe(3);
  });

  test('returns the result on first success', async () => {
    const result = await retryOnSerializationError(async () => 42, { baseDelayMs: 0 });
    expect(result).toBe(42);
  });
});
