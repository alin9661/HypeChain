/**
 * ACID-compliance tests for the payment verification path (fix 1):
 * the chain is the source of truth and the DB is a projection, so verifying
 * a signature that was already recorded for the SAME listing + buyer is an
 * idempotent replay of a completed purchase and must succeed — including
 * converging a listing row the original request failed to update (crash
 * window). The same signature pointed at a DIFFERENT listing or buyer is
 * fraud and must still be rejected.
 *
 * Services accept injected { supabaseClient, conn } deps; the route handler
 * factory wires the real service functions over an in-memory Supabase fake
 * and a stub Solana connection.
 */

import './helpers/env-setup.js';
import { describe, it, expect, beforeEach } from 'bun:test';
import express from 'express';
import { Keypair, LAMPORTS_PER_SOL } from '@solana/web3.js';

import { verifyPayment, completePurchase } from '../src/services/payment.js';
import { createVerifyPaymentHandler } from '../src/routes/payment.js';

// ─── In-memory Supabase fake (just the call chains payment.js uses) ────────

function makeFakeSupabase(state) {
  function rowsFor(table) {
    return table === 'listings' ? state.listings : state.transactions;
  }

  return {
    from(table) {
      return {
        select() {
          return {
            eq(col, val) {
              const matches = rowsFor(table).filter((r) => r[col] === val);
              return {
                async single() {
                  return matches.length === 1
                    ? { data: matches[0], error: null }
                    : { data: null, error: { message: 'Row not found' } };
                },
                async maybeSingle() {
                  return { data: matches[0] ?? null, error: null };
                },
              };
            },
          };
        },
        insert(row) {
          return {
            select() {
              return {
                async single() {
                  if (
                    table === 'transactions' &&
                    state.transactions.some((t) => t.signature === row.signature)
                  ) {
                    // Mirror the DB unique constraint on signature.
                    return { data: null, error: { message: 'duplicate key value (signature)' } };
                  }
                  const record = { id: `row-${rowsFor(table).length + 1}`, ...row };
                  rowsFor(table).push(record);
                  return { data: record, error: null };
                },
              };
            },
          };
        },
        update(patch) {
          return {
            async eq(col, val) {
              state.updates.push({ table, col, val, patch });
              rowsFor(table)
                .filter((r) => r[col] === val)
                .forEach((r) => Object.assign(r, patch));
              return { error: null };
            },
          };
        },
      };
    },
    async rpc(fn, args) {
      state.rpcCalls.push({ fn, args });
      return { error: null };
    },
  };
}

// ─── Stub Solana connection serving one confirmed transfer ─────────────────

function makeStubConnection({ signature, recipient, lamports }) {
  const payer = Keypair.generate().publicKey;
  const keys = [payer, recipient];
  return {
    async getTransaction(sig) {
      if (sig !== signature) return null;
      return {
        meta: {
          err: null,
          preBalances: [10 * LAMPORTS_PER_SOL, 0],
          postBalances: [10 * LAMPORTS_PER_SOL - lamports, lamports],
        },
        transaction: {
          message: {
            getAccountKeys: () => ({ length: keys.length, get: (i) => keys[i] }),
          },
        },
        blockTime: Math.floor(Date.now() / 1000),
        slot: 42,
      };
    },
  };
}

// ─── Fixture ───────────────────────────────────────────────────────────────

const SIGNATURE = 'replayed-signature-1111';
const LISTING_ID = 'listing-aaa';
const OTHER_LISTING_ID = 'listing-bbb';

let state;
let supabaseClient;
let conn;
let seller;
let buyerWallet;

beforeEach(() => {
  seller = Keypair.generate().publicKey;
  buyerWallet = Keypair.generate().publicKey.toBase58();
  state = {
    listings: [
      {
        id: LISTING_ID,
        status: 'active',
        price_sol: 0.5,
        seller_wallet: seller.toBase58(),
        seller_user_id: 'seller-user-1',
        nft_mint_address: 'mint-xyz',
        product_name: 'Test Kicks',
      },
      {
        id: OTHER_LISTING_ID,
        status: 'active',
        price_sol: 0.5,
        seller_wallet: seller.toBase58(),
        seller_user_id: null,
        nft_mint_address: 'mint-other',
        product_name: 'Other Kicks',
      },
    ],
    transactions: [],
    updates: [],
    rpcCalls: [],
  };
  supabaseClient = makeFakeSupabase(state);
  conn = makeStubConnection({
    signature: SIGNATURE,
    recipient: seller,
    lamports: 0.5 * LAMPORTS_PER_SOL,
  });
});

function recordCompletedTransaction(overrides = {}) {
  state.transactions.push({
    id: 'tx-existing',
    listing_id: LISTING_ID,
    buyer_wallet: buyerWallet,
    seller_wallet: seller.toBase58(),
    amount_sol: 0.5,
    signature: SIGNATURE,
    status: 'confirmed',
    ...overrides,
  });
}

const deps = () => ({ supabaseClient, conn });

// ─── verifyPayment ─────────────────────────────────────────────────────────

describe('verifyPayment — signature reuse', () => {
  it('fresh signature verifies as valid', async () => {
    const result = await verifyPayment(
      SIGNATURE, seller.toBase58(), 0.5, LISTING_ID, buyerWallet, deps()
    );
    expect(result.valid).toBe(true);
    expect(result.replay).toBeUndefined();
    expect(result.amountTransferred).toBeCloseTo(0.5);
  });

  it('replay for the SAME listing + buyer is treated as a completed purchase (valid, replay)', async () => {
    recordCompletedTransaction();
    const result = await verifyPayment(
      SIGNATURE, seller.toBase58(), 0.5, LISTING_ID, buyerWallet, deps()
    );
    expect(result.valid).toBe(true);
    expect(result.replay).toBe(true);
  });

  it('reuse for a DIFFERENT listing is rejected', async () => {
    recordCompletedTransaction({ listing_id: OTHER_LISTING_ID });
    const result = await verifyPayment(
      SIGNATURE, seller.toBase58(), 0.5, LISTING_ID, buyerWallet, deps()
    );
    expect(result.valid).toBe(false);
    expect(result.error).toBe('Transaction signature already used');
  });

  it('reuse by a DIFFERENT buyer is rejected', async () => {
    recordCompletedTransaction({ buyer_wallet: Keypair.generate().publicKey.toBase58() });
    const result = await verifyPayment(
      SIGNATURE, seller.toBase58(), 0.5, LISTING_ID, buyerWallet, deps()
    );
    expect(result.valid).toBe(false);
    expect(result.error).toBe('Transaction signature already used');
  });

  it('legacy callers that omit buyerWallet still get the reuse rejection', async () => {
    recordCompletedTransaction();
    const result = await verifyPayment(
      SIGNATURE, seller.toBase58(), 0.5, LISTING_ID, undefined, deps()
    );
    expect(result.valid).toBe(false);
    expect(result.error).toBe('Transaction signature already used');
  });
});

// ─── completePurchase ──────────────────────────────────────────────────────

describe('completePurchase — idempotent convergence', () => {
  it('fresh purchase inserts the transaction, marks the listing sold, and bumps volume', async () => {
    const result = await completePurchase(
      LISTING_ID, buyerWallet, 'buyer-user-1', SIGNATURE, 0.5, deps()
    );
    expect(result.success).toBe(true);
    expect(result.replay).toBe(false);
    expect(state.transactions).toHaveLength(1);
    expect(state.listings[0].status).toBe('sold');
    expect(state.rpcCalls).toHaveLength(1);
  });

  it('replay with the listing already sold returns success without double-writing', async () => {
    recordCompletedTransaction();
    state.listings[0].status = 'sold';
    const result = await completePurchase(
      LISTING_ID, buyerWallet, 'buyer-user-1', SIGNATURE, 0.5, deps()
    );
    expect(result.success).toBe(true);
    expect(result.replay).toBe(true);
    expect(result.transaction.id).toBe('tx-existing');
    expect(state.transactions).toHaveLength(1); // no duplicate insert
    expect(state.updates).toHaveLength(0); // no redundant listing update
    expect(state.rpcCalls).toHaveLength(0); // volume not double-counted
  });

  it('crash window: transactions row exists but listing is still active → replay converges it to sold', async () => {
    recordCompletedTransaction();
    // listing left 'active' by the crash
    const result = await completePurchase(
      LISTING_ID, buyerWallet, 'buyer-user-1', SIGNATURE, 0.5, deps()
    );
    expect(result.success).toBe(true);
    expect(result.replay).toBe(true);
    expect(state.listings[0].status).toBe('sold');
    expect(state.listings[0].transaction_signature).toBe(SIGNATURE);
    expect(state.transactions).toHaveLength(1);
    expect(state.rpcCalls).toHaveLength(0);
  });

  it('signature recorded for a different listing throws the reuse error', async () => {
    recordCompletedTransaction({ listing_id: OTHER_LISTING_ID });
    await expect(
      completePurchase(LISTING_ID, buyerWallet, null, SIGNATURE, 0.5, deps())
    ).rejects.toThrow('Transaction signature already used');
  });

  it('fresh purchase against a non-active listing still fails', async () => {
    state.listings[0].status = 'sold';
    await expect(
      completePurchase(LISTING_ID, buyerWallet, null, SIGNATURE, 0.5, deps())
    ).rejects.toThrow('not available for purchase');
  });
});

// ─── Route: POST /api/payments/verify (real services over fakes) ───────────

describe('POST /api/payments/verify — end-to-end over fakes', () => {
  async function postVerify(body) {
    const app = express();
    app.use(express.json());
    app.post(
      '/api/payments/verify',
      createVerifyPaymentHandler({
        fetchListingRowFn: async (listingId) => {
          const row = state.listings.find((l) => l.id === listingId);
          if (!row) throw new Error('Failed to fetch listing: Row not found');
          return row;
        },
        verifyPaymentFn: (sig, recipient, amount, listingId, buyer) =>
          verifyPayment(sig, recipient, amount, listingId, buyer, deps()),
        completePurchaseFn: (listingId, buyer, buyerUserId, sig, amount) =>
          completePurchase(listingId, buyer, buyerUserId, sig, amount, deps()),
      })
    );
    const server = await new Promise((resolve) => {
      const s = app.listen(0, () => resolve(s));
    });
    try {
      const res = await fetch(
        `http://127.0.0.1:${server.address().port}/api/payments/verify`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }
      );
      return { status: res.status, body: await res.json() };
    } finally {
      server.close();
    }
  }

  it('replay of a completed purchase (row already sold) returns 200 success', async () => {
    recordCompletedTransaction();
    state.listings[0].status = 'sold';
    const { status, body } = await postVerify({
      signature: SIGNATURE,
      listingId: LISTING_ID,
      buyerWallet,
    });
    expect(status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.purchase.transaction.id).toBe('tx-existing');
  });

  it('signature reused for a different listing returns 400', async () => {
    recordCompletedTransaction({ listing_id: OTHER_LISTING_ID });
    const { status, body } = await postVerify({
      signature: SIGNATURE,
      listingId: LISTING_ID,
      buyerWallet,
    });
    expect(status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error).toBe('Transaction signature already used');
  });

  it('first-time verification completes the purchase', async () => {
    const { status, body } = await postVerify({
      signature: SIGNATURE,
      listingId: LISTING_ID,
      buyerWallet,
    });
    expect(status).toBe(200);
    expect(body.success).toBe(true);
    expect(state.listings[0].status).toBe('sold');
    expect(state.transactions).toHaveLength(1);
  });
});
