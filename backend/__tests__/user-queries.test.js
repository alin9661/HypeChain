/**
 * Query-layer tests for the user data access (queries.js). The route tests
 * inject a fake db that reimplements this logic; these exercise the REAL
 * INSERT ... ON CONFLICT DO NOTHING RETURNING + UPDATE-fallback idiom against a
 * mock `conn`, so the new-vs-existing and row-vanished branches are covered.
 */

import './helpers/env-setup.js';
import { describe, it, expect } from 'bun:test';

import {
  registerOrLoginUser,
  getUserByWallet,
  INSERT_USER_SQL,
  UPDATE_USER_LOGIN_SQL,
  GET_USER_BY_WALLET_SQL,
} from '../src/db/queries.js';

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

const ROW = { id: 'u1', wallet_address: 'W', chain_type: 'solana', email: 'a@b.com' };

describe('registerOrLoginUser', () => {
  it('INSERT returns a row → isNewUser=true (no UPDATE issued)', async () => {
    const conn = mockConn([{ rows: [ROW] }]);
    const out = await registerOrLoginUser(conn, { walletAddress: 'W', privyUserId: 'p', chainType: 'solana', email: 'a@b.com' });
    expect(out).toEqual({ user: ROW, isNewUser: true });
    expect(conn.calls).toHaveLength(1); // INSERT only, no fallback UPDATE
    expect(conn.calls[0].text).toBe(INSERT_USER_SQL);
    expect(conn.calls[0].params).toEqual(['W', 'p', 'solana', 'a@b.com']);
  });

  it('INSERT empty (conflict) → UPDATE returns the existing row → isNewUser=false', async () => {
    const conn = mockConn([{ rows: [] }, { rows: [ROW] }]);
    const out = await registerOrLoginUser(conn, { walletAddress: 'W', privyUserId: 'p', chainType: 'solana', email: null });
    expect(out).toEqual({ user: ROW, isNewUser: false });
    expect(conn.calls).toHaveLength(2);
    expect(conn.calls[1].text).toBe(UPDATE_USER_LOGIN_SQL);
    expect(conn.calls[1].params).toEqual(['W']);
  });

  it('INSERT empty + UPDATE empty (row vanished) → { user: null, isNewUser: false }', async () => {
    const conn = mockConn([{ rows: [] }, { rows: [] }]);
    const out = await registerOrLoginUser(conn, { walletAddress: 'W', privyUserId: 'p', chainType: 'solana' });
    expect(out).toEqual({ user: null, isNewUser: false });
  });

  it('a missing email is bound as NULL (not undefined)', async () => {
    const conn = mockConn([{ rows: [ROW] }]);
    await registerOrLoginUser(conn, { walletAddress: 'W', privyUserId: 'p', chainType: 'solana' });
    expect(conn.calls[0].params[3]).toBeNull();
  });
});

describe('getUserByWallet', () => {
  it('returns the row on a hit', async () => {
    const conn = mockConn([{ rows: [ROW] }]);
    expect(await getUserByWallet(conn, 'W')).toEqual(ROW);
    expect(conn.calls[0].text).toBe(GET_USER_BY_WALLET_SQL);
    expect(conn.calls[0].params).toEqual(['W']);
  });

  it('returns null on a miss', async () => {
    const conn = mockConn([{ rows: [] }]);
    expect(await getUserByWallet(conn, 'nope')).toBeNull();
  });
});

describe('user SQL is parameterized (no interpolation)', () => {
  it('INSERT/UPDATE/SELECT use $-placeholders + the conflict guard', () => {
    expect(INSERT_USER_SQL).toContain('ON CONFLICT (wallet_address) DO NOTHING');
    expect(INSERT_USER_SQL).toContain('$1');
    expect(UPDATE_USER_LOGIN_SQL).toContain('WHERE wallet_address = $1');
    expect(GET_USER_BY_WALLET_SQL).toContain('WHERE wallet_address = $1');
  });
});
