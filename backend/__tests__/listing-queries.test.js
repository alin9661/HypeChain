/**
 * Query-layer tests for the marketplace listing feed (getListings in
 * queries.js), added with the Supabase decommission when GET /api/listings
 * moved from a Supabase-backed Next.js route to Express + DSQL.
 *
 * These exercise the REAL SQL-building logic against a mock `conn`, focusing on
 * the security-critical parts that raw SQL introduces over the old PostgREST
 * client: the ORDER BY allow-list (injection guard), LIMIT/OFFSET clamping, and
 * parameterized status/search filters. getListings issues TWO queries via
 * Promise.all — the page SELECT first, then COUNT(*) — so the mock returns them
 * in that call order.
 */

import './helpers/env-setup.js';
import { describe, it, expect } from 'bun:test';

import { getListings, LISTINGS_SORTABLE_COLUMNS } from '../src/db/queries.js';

// A conn whose query() returns queued { rows } results in call order, recording
// every (sql, params) pair so we can assert ordering + parameterization.
function mockConn(responses) {
  const calls = [];
  let i = 0;
  return {
    calls,
    async query(text, params) {
      calls.push({ text, params });
      return responses[i++] ?? { rows: [] };
    },
  };
}

const LISTING = { id: 'l1', product_name: 'Widget', status: 'active' };

// Page SELECT result, then the COUNT(*) result — the order getListings calls them.
function ok(rows = [LISTING], count = 1) {
  return [{ rows }, { rows: [{ count: String(count) }] }];
}

describe('getListings', () => {
  it('applies defaults: active status, created_at DESC, limit 50 / offset 0', async () => {
    const conn = mockConn(ok());
    const out = await getListings(conn, {});
    expect(out.listings).toEqual([LISTING]);
    expect(out.count).toBe(1);
    expect(out.limit).toBe(50);
    expect(out.offset).toBe(0);

    const [list, countQ] = conn.calls;
    expect(list.text).toContain('WHERE status = $1');
    expect(list.text).toContain('ORDER BY created_at DESC, id DESC');
    expect(list.params).toEqual(['active', 50, 0]); // status, limit, offset
    // count query shares the filter args but NOT limit/offset
    expect(countQ.text).toContain('SELECT COUNT(*)');
    expect(countQ.params).toEqual(['active']);
  });

  it('search adds an ILIKE clause with ONE bound %term% param (reused across columns)', async () => {
    const conn = mockConn(ok());
    await getListings(conn, { search: 'sneaker' });
    const [list, countQ] = conn.calls;
    expect(list.text).toContain('product_name ILIKE $2');
    expect(list.text).toContain('description ILIKE $2');
    expect(list.text).toContain('category ILIKE $2');
    expect(list.params).toEqual(['active', '%sneaker%', 50, 0]);
    // the count query carries the same search filter + arg
    expect(countQ.params).toEqual(['active', '%sneaker%']);
  });

  it('accepts a whitelisted sortBy + asc order', async () => {
    const conn = mockConn(ok());
    await getListings(conn, { sortBy: 'price_sol', order: 'asc' });
    expect(conn.calls[0].text).toContain('ORDER BY price_sol ASC, id DESC');
  });

  it('rejects a non-whitelisted sortBy → falls back to created_at (injection guard)', async () => {
    const conn = mockConn(ok());
    await getListings(conn, { sortBy: 'price_sol; DROP TABLE listings;--' });
    expect(conn.calls[0].text).toContain('ORDER BY created_at DESC');
    expect(conn.calls[0].text).not.toContain('DROP TABLE');
  });

  it('rejects a bogus order value → defaults to DESC', async () => {
    const conn = mockConn(ok());
    await getListings(conn, { order: 'sideways' });
    expect(conn.calls[0].text).toContain('created_at DESC');
  });

  it('clamps limit to 1..100, offset to >=0, and coerces NaN to the default', async () => {
    expect((await getListings(mockConn(ok()), { limit: 9999 })).limit).toBe(100);
    expect((await getListings(mockConn(ok()), { limit: 0 })).limit).toBe(1);
    expect((await getListings(mockConn(ok()), { offset: -5 })).offset).toBe(0);
    expect((await getListings(mockConn(ok()), { limit: 'abc' })).limit).toBe(50);
  });

  it('returns count parsed as a number; an empty page → []', async () => {
    const conn = mockConn([{ rows: [] }, { rows: [{ count: '0' }] }]);
    const out = await getListings(conn, { status: 'sold' });
    expect(out.listings).toEqual([]);
    expect(out.count).toBe(0);
    expect(conn.calls[0].params[0]).toBe('sold'); // status is parameterized
  });
});

describe('LISTINGS_SORTABLE_COLUMNS', () => {
  it('is the exact fixed allow-list (anything else falls back to created_at)', () => {
    expect([...LISTINGS_SORTABLE_COLUMNS].sort()).toEqual(
      ['created_at', 'favorites', 'price_sol', 'updated_at', 'views'].sort()
    );
  });
});
