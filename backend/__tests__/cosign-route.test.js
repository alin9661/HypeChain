/**
 * Route-level smoke tests for POST /api/payments/cosign-purchase.
 *
 * Uses the exported handler factory with injected stubs so no Supabase or
 * RPC access happens. Supabase env vars are dummied because importing
 * routes/payment.js initializes the client at module load.
 */

import './helpers/env-setup.js';
import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import express from 'express';
import { Keypair } from '@solana/web3.js';

import { createCosignPurchaseHandler } from '../src/routes/payment.js';
import { CosignError } from '../src/services/cosign-purchase.js';

let server;
let baseUrl;
let behavior = {};

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.post(
    '/api/payments/cosign-purchase',
    createCosignPurchaseHandler({
      fetchListingFn: async (listingId) => {
        if (behavior.fetchListingError) throw behavior.fetchListingError;
        return { id: listingId, nft_mint_address: 'stub', price_sol: 0.01 };
      },
      getConnectionFn: () => ({}),
      getServerWalletFn: () => Keypair.generate(),
      buildTxFn: async () => {
        if (behavior.buildError) throw behavior.buildError;
        return {
          transactionBase64: 'c3R1Yg==',
          priceLamports: '10000000',
          priceSol: 0.01,
          blockhash: 'stub',
          lastValidBlockHeight: 1,
          nftMint: 'stub',
          listingPda: 'stub',
          seller: 'stub',
        };
      },
    })
  );
  await new Promise((resolve) => {
    server = app.listen(0, resolve);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

afterAll(() => server?.close());

async function post(body) {
  const res = await fetch(`${baseUrl}/api/payments/cosign-purchase`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
}

describe('POST /api/payments/cosign-purchase', () => {
  it('400s with the error envelope on missing fields', async () => {
    behavior = {};
    const { status, body } = await post({ listingId: 'abc' });
    expect(status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.code).toBe('MISSING_FIELDS');
    expect(typeof body.error).toBe('string');
  });

  it('returns the co-signed payload on success', async () => {
    behavior = {};
    const { status, body } = await post({ listingId: 'abc', buyerWallet: 'wallet' });
    expect(status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.transaction).toBe('c3R1Yg==');
    expect(body.priceLamports).toBe('10000000');
    expect(body.seller).toBe('stub');
  });

  it('maps CosignError to its HTTP status and code', async () => {
    behavior = { buildError: new CosignError('SELLER_NOT_CUSTODIAL', 409, 'not custodial') };
    const { status, body } = await post({ listingId: 'abc', buyerWallet: 'wallet' });
    expect(status).toBe(409);
    expect(body.success).toBe(false);
    expect(body.code).toBe('SELLER_NOT_CUSTODIAL');
  });

  it('404s when the DB listing is missing', async () => {
    behavior = { fetchListingError: new Error('Failed to fetch listing: not found') };
    const { status, body } = await post({ listingId: 'abc', buyerWallet: 'wallet' });
    expect(status).toBe(404);
    expect(body.code).toBe('LISTING_NOT_FOUND');
  });

  it('409s when the DB listing is not active', async () => {
    behavior = {
      fetchListingError: new Error('Listing is not available for purchase. Status: sold'),
    };
    const { status, body } = await post({ listingId: 'abc', buyerWallet: 'wallet' });
    expect(status).toBe(409);
    expect(body.code).toBe('LISTING_NOT_ACTIVE');
  });

  it('500s with COSIGN_FAILED on unexpected errors', async () => {
    behavior = { buildError: new Error('rpc exploded') };
    const { status, body } = await post({ listingId: 'abc', buyerWallet: 'wallet' });
    expect(status).toBe(500);
    expect(body.code).toBe('COSIGN_FAILED');
  });
});
