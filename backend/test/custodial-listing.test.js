/**
 * B1 — custodial (guest) listing path: the mint target, on-chain seller, and
 * co-sign signer are unified on ONE real server keypair, so a guest's item is
 * actually sellable via cosign-purchase.
 *
 * Covers the server-wallet accessor + the create-listing Step-0 branching that
 * routes custodial vs self-custody requests. The full minting happy-path needs
 * live AI/RPC/DSQL and is exercised by the devnet smoke test, not here.
 */

import '../__tests__/helpers/env-setup.js';
import { test, expect, describe, beforeEach, afterEach } from 'bun:test';
import express from 'express';
import { Keypair } from '@solana/web3.js';
import bs58 from 'bs58';

import {
  getServerWalletPublicKey,
  _resetServerWalletForTests,
} from '../src/services/solana.js';
import listingRouter from '../src/routes/listing.js';

const ORIG_KEY = process.env.HACKNYU_SERVER_WALLET_PRIVATE_KEY;

afterEach(() => {
  if (ORIG_KEY === undefined) delete process.env.HACKNYU_SERVER_WALLET_PRIVATE_KEY;
  else process.env.HACKNYU_SERVER_WALLET_PRIVATE_KEY = ORIG_KEY;
  _resetServerWalletForTests();
});

describe('getServerWalletPublicKey', () => {
  test('returns the base58 pubkey matching the configured secret', () => {
    const kp = Keypair.generate();
    process.env.HACKNYU_SERVER_WALLET_PRIVATE_KEY = bs58.encode(kp.secretKey);
    _resetServerWalletForTests();
    expect(getServerWalletPublicKey()).toBe(kp.publicKey.toBase58());
  });

  test('throws when the server key is not configured', () => {
    delete process.env.HACKNYU_SERVER_WALLET_PRIVATE_KEY;
    _resetServerWalletForTests();
    expect(() => getServerWalletPublicKey()).toThrow();
  });
});

describe('POST /api/create-listing — custodial branching (Step 0)', () => {
  let server;
  let baseUrl;

  beforeEach(async () => {
    const app = express();
    app.use(express.json({ limit: '10mb' }));
    app.use('/api', listingRouter);
    server = await new Promise((resolve) => {
      const s = app.listen(0, () => resolve(s));
    });
    baseUrl = `http://127.0.0.1:${server.address().port}`;
  });
  afterEach(() => server?.close());

  async function post(body) {
    const res = await fetch(`${baseUrl}/api/create-listing`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return { status: res.status, body: await res.json() };
  }

  test('custodial:true with no server key → 503 CUSTODIAL_UNAVAILABLE', async () => {
    delete process.env.HACKNYU_SERVER_WALLET_PRIVATE_KEY;
    _resetServerWalletForTests();
    const { status, body } = await post({
      custodial: true,
      userEmail: 'guest@example.com',
      productImage: 'data:image/png;base64,AAAA',
    });
    expect(status).toBe(503);
    expect(body.code).toBe('CUSTODIAL_UNAVAILABLE');
  });

  test('non-custodial guest (email only) still requires a wallet (ACCOUNT_REQUIRED)', async () => {
    const { status, body } = await post({
      userEmail: 'guest@example.com',
      productImage: 'data:image/png;base64,AAAA',
    });
    expect(status).toBe(400);
    expect(body.code).toBe('ACCOUNT_REQUIRED');
  });
});
