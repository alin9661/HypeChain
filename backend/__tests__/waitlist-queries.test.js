/**
 * Query-layer tests for the waitlist position lookup (queries.js). The route
 * tests inject a fake db that reimplements this logic; these exercise the REAL
 * function against a mock `conn` — critically the aggregate-without-GROUP-BY
 * shape, where a missing id yields one { position: 0, total: 0 } row rather
 * than zero rows.
 */

import './helpers/env-setup.js';
import { describe, it, expect } from 'bun:test';

import { getWaitlistPosition, GET_WAITLIST_POSITION_SQL } from '../src/db/queries.js';

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

describe('getWaitlistPosition', () => {
  it('returns the rank row on a hit', async () => {
    const conn = mockConn([{ rows: [{ position: 3, total: 10 }] }]);
    expect(await getWaitlistPosition(conn, { id: 'w1' })).toEqual({ position: 3, total: 10 });
    expect(conn.calls[0].text).toBe(GET_WAITLIST_POSITION_SQL);
    expect(conn.calls[0].params).toEqual(['w1']);
  });

  it('missing id → aggregate returns { 0, 0 } row → null (deleted-row race)', async () => {
    // Postgres aggregates without GROUP BY always emit exactly one row; a
    // vanished id shows up as counts of zero, which must map to null so the
    // route omits the position fields instead of rendering "#0 of 0".
    const conn = mockConn([{ rows: [{ position: 0, total: 0 }] }]);
    expect(await getWaitlistPosition(conn, { id: 'gone' })).toBeNull();
  });

  it('defensively returns null on an empty rows array too', async () => {
    const conn = mockConn([{ rows: [] }]);
    expect(await getWaitlistPosition(conn, { id: 'w1' })).toBeNull();
  });

  it('position SQL is parameterized and casts counts to int', () => {
    expect(GET_WAITLIST_POSITION_SQL).toContain('me.id = $1');
    expect(GET_WAITLIST_POSITION_SQL).toContain('::int');
  });
});
