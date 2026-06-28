/**
 * Route-level tests for the user endpoints (DSQL-backed; replaced the former
 * Supabase Next.js routes in the Supabase decommission).
 *
 *   POST /api/users/register        — register / refresh last_login
 *   GET  /api/users/:walletAddress  — profile lookup (404 when absent)
 *
 * The router is built via createUserRouter() with an injected in-memory db, so
 * no live DSQL cluster is touched. Behaviour under test: new-vs-existing status
 * codes (201/200), idempotent re-register stamps last_login, validation guards,
 * and the camelCase response shape the api-client consumes.
 */

import './helpers/env-setup.js';
import { describe, it, expect, afterEach } from 'bun:test';
import express from 'express';

import { createUserRouter } from '../src/routes/users.js';

// In-memory db mirroring the real facade's user methods. The INSERT ... ON
// CONFLICT DO NOTHING semantics: a fresh wallet returns { isNewUser: true };
// a repeat wallet stamps last_login and returns { isNewUser: false }.
function makeFakeDb() {
  const rows = [];
  let seq = 0;
  return {
    rows,
    async registerOrLoginUser({ walletAddress, privyUserId, chainType, email }) {
      const existing = rows.find((r) => r.wallet_address === walletAddress);
      if (existing) {
        existing.last_login = new Date('2026-06-27T13:00:00Z');
        existing.updated_at = new Date('2026-06-27T13:00:00Z');
        return { user: existing, isNewUser: false };
      }
      seq += 1;
      const row = {
        id: `00000000-0000-4000-8000-${String(seq).padStart(12, '0')}`,
        wallet_address: walletAddress,
        privy_user_id: privyUserId,
        chain_type: chainType,
        username: null,
        profile_image: null,
        email: email ?? null,
        total_volume: 0,
        last_login: new Date('2026-06-27T12:00:00Z'),
        created_at: new Date('2026-06-27T12:00:00Z'),
        updated_at: new Date('2026-06-27T12:00:00Z'),
      };
      rows.push(row);
      return { user: row, isNewUser: true };
    },
    async getUserByWallet(walletAddress) {
      return rows.find((r) => r.wallet_address === walletAddress) ?? null;
    },
  };
}

let server;

async function start(deps) {
  const app = express();
  app.use(express.json());
  app.use('/api', createUserRouter(deps));
  await new Promise((resolve) => {
    server = app.listen(0, resolve);
  });
  return `http://127.0.0.1:${server.address().port}`;
}

afterEach(() => {
  server?.close();
  server = null;
});

const VALID = { walletAddress: 'Wa11etAddre55Solana1111111111111111111111', privyUserId: 'privy:abc', chainType: 'solana' };

describe('POST /api/users/register', () => {
  it('creates a new user (201, isNewUser=true) with camelCase shape', async () => {
    const base = await start({ db: makeFakeDb() });
    const res = await fetch(`${base}/api/users/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...VALID, email: 'a@b.com' }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.user.isNewUser).toBe(true);
    expect(body.user.walletAddress).toBe(VALID.walletAddress);
    expect(body.user.chainType).toBe('solana');
    expect(body.user.email).toBe('a@b.com');
    // never leak the raw snake_case row
    expect(body.user.wallet_address).toBeUndefined();
  });

  it('re-registering the same wallet returns 200 (isNewUser=false) and stamps last_login', async () => {
    const db = makeFakeDb();
    const base = await start({ db });
    await fetch(`${base}/api/users/register`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(VALID),
    });
    const res = await fetch(`${base}/api/users/register`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(VALID),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.user.isNewUser).toBe(false);
    expect(db.rows).toHaveLength(1); // no duplicate row
    expect(new Date(body.user.lastLogin).toISOString()).toBe('2026-06-27T13:00:00.000Z');
  });

  it('rejects missing required fields (400 MISSING_FIELDS)', async () => {
    const base = await start({ db: makeFakeDb() });
    const res = await fetch(`${base}/api/users/register`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ walletAddress: 'x', chainType: 'solana' }), // no privyUserId
    });
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe('MISSING_FIELDS');
  });

  it('rejects a non-string walletAddress (400 MISSING_FIELDS)', async () => {
    const base = await start({ db: makeFakeDb() });
    const res = await fetch(`${base}/api/users/register`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...VALID, walletAddress: ['array'] }),
    });
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe('MISSING_FIELDS');
  });

  it('rejects an invalid chainType (400 INVALID_CHAIN_TYPE)', async () => {
    const base = await start({ db: makeFakeDb() });
    const res = await fetch(`${base}/api/users/register`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...VALID, chainType: 'bitcoin' }),
    });
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe('INVALID_CHAIN_TYPE');
  });
});

describe('GET /api/users/:walletAddress', () => {
  it('returns a registered profile (200)', async () => {
    const db = makeFakeDb();
    const base = await start({ db });
    await fetch(`${base}/api/users/register`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(VALID),
    });
    const res = await fetch(`${base}/api/users/${VALID.walletAddress}`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.user.walletAddress).toBe(VALID.walletAddress);
    expect(body.user.chainType).toBe('solana');
  });

  it('returns 404 for an unknown wallet (USER_NOT_FOUND)', async () => {
    const base = await start({ db: makeFakeDb() });
    const res = await fetch(`${base}/api/users/NopeNotRegistered111111111111`);
    expect(res.status).toBe(404);
    expect((await res.json()).code).toBe('USER_NOT_FOUND');
  });
});
