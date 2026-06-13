/**
 * Unit tests for the ported activity feed/provenance + Helius webhook (A).
 * No live cluster: a fake `db` facade backs the service; the webhook is tested
 * over its injectable handler factory with a fake recordFn.
 */

import { test, expect, describe, beforeEach, afterEach } from 'bun:test';
import express from 'express';

import * as activity from '../src/services/activity.js';
import { authorized, parseTransferEvents, createHeliusHandler } from '../src/routes/webhooks.js';

// ─── activity service ───────────────────────────────────────────────────────

describe('toActivityItem — wire shape', () => {
  test('maps DB row to frontend fields; price defaults to 0; timestamp is ms', () => {
    const bt = new Date('2026-06-12T14:32:08.000Z');
    const item = activity.toActivityItem({
      id: 'a1', event_type: 'sale', nft_mint_address: 'M', product_name: 'Kicks',
      image_url: 'img', from_wallet: 'F', to_wallet: 'T', price_sol: 1.5,
      tx_signature: 'sig', block_time: bt,
    });
    expect(item).toEqual({
      id: 'a1', type: 'sale', nftName: 'Kicks', nftImage: 'img',
      from: 'F', to: 'T', price: 1.5, timestamp: bt.getTime(), txHash: 'sig',
    });
  });

  test('null price → 0, null name/image preserved', () => {
    const item = activity.toActivityItem({
      id: 'a2', event_type: 'transfer', nft_mint_address: 'M',
      product_name: null, image_url: null, from_wallet: 'F', to_wallet: 'T',
      price_sol: null, tx_signature: 'sig', block_time: new Date(),
    });
    expect(item.price).toBe(0);
    expect(item.nftName).toBeNull();
    expect(item.nftImage).toBeNull();
  });
});

describe('cursor codec', () => {
  test('encode/decode round-trips block_time + id', () => {
    const bt = new Date('2026-06-12T14:32:08.000Z');
    const cursor = activity.encodeCursor({ block_time: bt, id: 'xyz' });
    const { beforeBlockTime, beforeId } = activity.decodeCursor(cursor);
    expect(beforeId).toBe('xyz');
    expect(beforeBlockTime.getTime()).toBe(bt.getTime());
  });

  test('decode throws "malformed cursor" on garbage', () => {
    expect(() => activity.decodeCursor('!!!not-base64!!!')).toThrow('malformed cursor');
    expect(() => activity.decodeCursor(Buffer.from('no-separator', 'utf8').toString('base64url')))
      .toThrow('malformed cursor');
  });
});

describe('feed — keyset pagination', () => {
  function dbWithRows(rows) {
    return {
      lastArgs: null,
      async getActivitiesFeed(args) {
        this.lastArgs = args;
        return rows;
      },
    };
  }

  test('limit+1 rows → page trimmed to limit and nextCursor emitted', async () => {
    const rows = Array.from({ length: 21 }, (_, i) => ({
      id: `id${i}`, event_type: 'sale', nft_mint_address: 'M', tx_signature: `s${i}`,
      block_time: new Date(Date.now() - i * 1000), price_sol: 1,
    }));
    const db = dbWithRows(rows);
    const { rows: page, nextCursor } = await activity.feed({ limit: 20 }, { db });
    expect(page).toHaveLength(20);
    expect(nextCursor).not.toBeNull();
    expect(db.lastArgs.limit).toBe(21); // fetched limit+1
  });

  test('fewer than limit+1 rows → no nextCursor', async () => {
    const rows = [{ id: 'id0', event_type: 'sale', nft_mint_address: 'M', tx_signature: 's', block_time: new Date(), price_sol: 1 }];
    const { rows: page, nextCursor } = await activity.feed({ limit: 20 }, { db: dbWithRows(rows) });
    expect(page).toHaveLength(1);
    expect(nextCursor).toBeNull();
  });

  test('passes a decoded cursor through to the query', async () => {
    const db = dbWithRows([]);
    const bt = new Date('2026-06-12T00:00:00.000Z');
    const cursor = activity.encodeCursor({ block_time: bt, id: 'cur' });
    await activity.feed({ cursor, limit: 10 }, { db });
    expect(db.lastArgs.beforeId).toBe('cur');
    expect(db.lastArgs.beforeBlockTime.getTime()).toBe(bt.getTime());
  });
});

describe('record / recordSafe', () => {
  test('record rejects an unknown event_type', async () => {
    const db = { async insertActivity() { return { id: 'x' }; } };
    await expect(activity.record({ event_type: 'bogus', nft_mint_address: 'M', tx_signature: 's', source: 'app' }, { db }))
      .rejects.toThrow('unknown event_type');
  });

  test('record returns true on insert, false on duplicate (db returns null)', async () => {
    const inserted = await activity.record(
      { event_type: 'sale', nft_mint_address: 'M', tx_signature: 's', source: 'app' },
      { db: { async insertActivity() { return { id: 'x' }; } } }
    );
    expect(inserted).toBe(true);

    const dup = await activity.record(
      { event_type: 'sale', nft_mint_address: 'M', tx_signature: 's', source: 'app' },
      { db: { async insertActivity() { return null; } } }
    );
    expect(dup).toBe(false);
  });

  test('recordSafe swallows a DB error and returns false', async () => {
    const result = await activity.recordSafe(
      { event_type: 'sale', nft_mint_address: 'M', tx_signature: 's', source: 'app' },
      { db: { async insertActivity() { throw new Error('db down'); } } }
    );
    expect(result).toBe(false);
  });
});

// ─── webhook auth + parsing + idempotency ────────────────────────────────────

describe('webhook authorized() — fail-closed, constant-time', () => {
  const ORIG = process.env.HACKNYU_HELIUS_WEBHOOK_SECRET;
  afterEach(() => {
    if (ORIG === undefined) delete process.env.HACKNYU_HELIUS_WEBHOOK_SECRET;
    else process.env.HACKNYU_HELIUS_WEBHOOK_SECRET = ORIG;
  });

  test('rejects when the secret is unset (fail-closed)', () => {
    delete process.env.HACKNYU_HELIUS_WEBHOOK_SECRET;
    expect(authorized({ headers: { authorization: 'anything' } })).toBe(false);
  });

  test('rejects a mismatched header', () => {
    process.env.HACKNYU_HELIUS_WEBHOOK_SECRET = 'top-secret';
    expect(authorized({ headers: { authorization: 'wrong' } })).toBe(false);
  });

  test('accepts the exact secret', () => {
    process.env.HACKNYU_HELIUS_WEBHOOK_SECRET = 'top-secret';
    expect(authorized({ headers: { authorization: 'top-secret' } })).toBe(true);
  });
});

describe('parseTransferEvents', () => {
  test('extracts one transfer event per tokenTransfer carrying a mint', () => {
    const events = parseTransferEvents({
      signature: 'sig1', timestamp: 1700000000,
      tokenTransfers: [
        { mint: 'M1', fromUserAccount: 'A', toUserAccount: 'B' },
        { fromUserAccount: 'A', toUserAccount: 'B' }, // no mint → skipped
        null, // malformed → skipped
      ],
    });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      event_type: 'transfer', nft_mint_address: 'M1', tx_signature: 'sig1',
      source: 'helius', from_wallet: 'A', to_wallet: 'B',
    });
    expect(events[0].block_time).toBeInstanceOf(Date);
  });

  test('no signature → no events', () => {
    expect(parseTransferEvents({ tokenTransfers: [{ mint: 'M' }] })).toEqual([]);
  });
});

describe('POST /helius handler — over fakes', () => {
  const ORIG = process.env.HACKNYU_HELIUS_WEBHOOK_SECRET;
  beforeEach(() => { process.env.HACKNYU_HELIUS_WEBHOOK_SECRET = 'secret-xyz'; });
  afterEach(() => {
    if (ORIG === undefined) delete process.env.HACKNYU_HELIUS_WEBHOOK_SECRET;
    else process.env.HACKNYU_HELIUS_WEBHOOK_SECRET = ORIG;
  });

  async function post(body, { auth = 'secret-xyz', recordFn } = {}) {
    const app = express();
    app.use(express.json());
    app.post('/api/webhooks/helius', createHeliusHandler({ recordFn }));
    const server = await new Promise((resolve) => {
      const s = app.listen(0, () => resolve(s));
    });
    try {
      const res = await fetch(`http://127.0.0.1:${server.address().port}/api/webhooks/helius`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(auth ? { Authorization: auth } : {}) },
        body: JSON.stringify(body),
      });
      return { status: res.status, body: await res.json() };
    } finally {
      server.close();
    }
  }

  test('401 on missing/wrong auth', async () => {
    const { status } = await post([], { auth: 'nope' });
    expect(status).toBe(401);
  });

  test('422 on a non-array payload', async () => {
    const { status } = await post({ not: 'an array' });
    expect(status).toBe(422);
  });

  test('counts ingested vs seen; duplicate (recordFn=false) ingests 0', async () => {
    const txs = [{ signature: 'sig', timestamp: 1700000000, tokenTransfers: [{ mint: 'M', fromUserAccount: 'A', toUserAccount: 'B' }] }];
    const fresh = await post(txs, { recordFn: async () => true });
    expect(fresh.status).toBe(200);
    expect(fresh.body).toMatchObject({ success: true, received: 1, events: 1, ingested: 1 });

    const replay = await post(txs, { recordFn: async () => false });
    expect(replay.body).toMatchObject({ events: 1, ingested: 0 });
  });
});
