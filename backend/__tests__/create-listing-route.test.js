/**
 * Route-level tests for POST /api/create-listing wallet enforcement.
 *
 * A SELF-CUSTODY listing must belong to a real user wallet, so a missing/empty/
 * invalid userWallet is rejected up front with ACCOUNT_REQUIRED. (CUSTODIAL
 * guest listings — `custodial: true` — are the documented exception and are
 * covered in test/custodial-listing.test.js.) All assertions here hit only
 * Step 0 validation, so no OpenRouter/RPC/DB access happens — env vars are
 * dummied by helpers/env-setup.js.
 */

import './helpers/env-setup.js';
import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import express from 'express';

import listingRouter from '../src/routes/listing.js';

let server;
let baseUrl;

beforeAll(async () => {
  const app = express();
  app.use(express.json({ limit: '10mb' }));
  app.use('/api', listingRouter);
  await new Promise((resolve) => {
    server = app.listen(0, resolve);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

afterAll(() => server?.close());

async function post(body) {
  const res = await fetch(`${baseUrl}/api/create-listing`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
}

describe('POST /api/create-listing wallet enforcement', () => {
  it('400s with ACCOUNT_REQUIRED when userWallet is missing', async () => {
    const { status, body } = await post({ productImage: 'data:image/png;base64,AAAA' });
    expect(status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.code).toBe('ACCOUNT_REQUIRED');
    expect(body.error).toBe('An account with a wallet is required to create a listing');
  });

  it('400s with ACCOUNT_REQUIRED when userWallet is empty', async () => {
    const { status, body } = await post({
      userWallet: '',
      productImage: 'data:image/png;base64,AAAA',
    });
    expect(status).toBe(400);
    expect(body.code).toBe('ACCOUNT_REQUIRED');
  });

  it('400s with ACCOUNT_REQUIRED for guest email-only submissions', async () => {
    const { status, body } = await post({
      userEmail: 'guest@example.com',
      productImage: 'data:image/png;base64,AAAA',
    });
    expect(status).toBe(400);
    expect(body.code).toBe('ACCOUNT_REQUIRED');
  });

  it('still 400s on an invalid wallet address (no ACCOUNT_REQUIRED code)', async () => {
    const { status, body } = await post({
      userWallet: 'not-a-solana-key',
      productImage: 'data:image/png;base64,AAAA',
    });
    expect(status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error).toBe('Invalid Solana wallet address');
    expect(body.code).toBeUndefined();
  });
});
