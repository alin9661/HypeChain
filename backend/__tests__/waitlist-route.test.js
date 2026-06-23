/**
 * Route-level tests for the waitlist endpoints.
 *
 *   POST /api/waitlist          — signup (validation, idempotency, server id)
 *   GET  /api/waitlist/export   — admin export (Bearer-token auth)
 *
 * The router is built via createWaitlistRouter() with an injected in-memory db
 * and fake SES senders, so no live DSQL cluster or AWS SES is touched. The key
 * behaviour under test is the SIDE-EFFECT ISOLATION policy: a signup succeeds
 * (2xx) even when an email sender throws.
 */

import './helpers/env-setup.js';
import { describe, it, expect, afterEach } from 'bun:test';
import express from 'express';

import { createWaitlistRouter } from '../src/routes/waitlist.js';

const EXPORT_TOKEN = process.env.HACKNYU_WAITLIST_EXPORT_TOKEN;

// In-memory db mirroring the real db facade's waitlist methods.
function makeFakeDb() {
  const rows = [];
  const stamped = [];
  let seq = 0;
  return {
    rows,
    stamped, // row ids passed to markWaitlistConfirmationSent
    async markWaitlistConfirmationSent(id) {
      stamped.push(id);
      const row = rows.find((r) => r.id === id);
      if (row) row.confirmation_sent_at = new Date('2026-06-19T12:00:01Z');
    },
    async insertWaitlistEntry(entry) {
      if (rows.some((r) => r.email === entry.email)) return null; // ON CONFLICT DO NOTHING
      seq += 1;
      const row = {
        id: `00000000-0000-4000-8000-${String(seq).padStart(12, '0')}`,
        name: entry.name,
        email: entry.email,
        wallet_address: entry.wallet_address ?? null,
        intent: entry.intent,
        source: entry.source ?? 'web',
        status: 'pending',
        confirmation_sent_at: null,
        created_at: new Date('2026-06-19T12:00:00Z'),
        updated_at: new Date('2026-06-19T12:00:00Z'),
      };
      rows.push(row);
      return row;
    },
    async getWaitlistByEmail(email) {
      return rows.find((r) => r.email === email) ?? null;
    },
    async listWaitlist() {
      return [...rows].reverse();
    },
  };
}

function makeSpy(impl) {
  const calls = [];
  const fn = async (...args) => {
    calls.push(args);
    return impl ? impl(...args) : { sent: true };
  };
  fn.calls = calls;
  return fn;
}

let server;

async function start(deps) {
  const app = express();
  app.use(express.json());
  app.use('/api', createWaitlistRouter(deps));
  await new Promise((resolve) => {
    server = app.listen(0, resolve);
  });
  return `http://127.0.0.1:${server.address().port}`;
}

afterEach(() => {
  server?.close();
  server = null;
});

async function post(baseUrl, body) {
  const res = await fetch(`${baseUrl}/api/waitlist`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
}

async function getExport(baseUrl, { token, format } = {}) {
  const headers = token ? { Authorization: `Bearer ${token}` } : {};
  const url = `${baseUrl}/api/waitlist/export${format ? `?format=${format}` : ''}`;
  const res = await fetch(url, { headers });
  return { status: res.status, text: await res.text() };
}

const VALID = { name: 'Jane Doe', email: 'jane@example.com', interest: 'collect' };

describe('POST /api/waitlist', () => {
  it('records a signup and returns a server-issued id + normalized email', async () => {
    const db = makeFakeDb();
    const sendConfirmation = makeSpy();
    const sendAdminNotification = makeSpy();
    const baseUrl = await start({ db, sendConfirmation, sendAdminNotification });

    const { status, body } = await post(baseUrl, {
      name: '  Jane Doe  ',
      email: 'Jane@Example.COM',
      walletAddress: '  7f49aBc  ',
      interest: 'trade',
    });

    expect(status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.alreadyOnList).toBe(false);
    expect(body.email).toBe('jane@example.com'); // normalized
    expect(body.intent).toBe('trade');
    expect(body.id).toMatch(/^HC-W-[0-9A-F]{8}$/);
    expect(typeof body.intake).toBe('string');

    // Persisted with trimmed name + wallet.
    expect(db.rows).toHaveLength(1);
    expect(db.rows[0].name).toBe('Jane Doe');
    expect(db.rows[0].wallet_address).toBe('7f49aBc');

    // Both side effects fired exactly once.
    expect(sendConfirmation.calls).toHaveLength(1);
    expect(sendAdminNotification.calls).toHaveLength(1);
  });

  it('400s MISSING_FIELDS when name or email is absent', async () => {
    const baseUrl = await start({ db: makeFakeDb(), sendConfirmation: makeSpy(), sendAdminNotification: makeSpy() });

    const noName = await post(baseUrl, { email: 'a@b.com' });
    expect(noName.status).toBe(400);
    expect(noName.body.code).toBe('MISSING_FIELDS');

    const noEmail = await post(baseUrl, { name: 'A' });
    expect(noEmail.status).toBe(400);
    expect(noEmail.body.code).toBe('MISSING_FIELDS');
  });

  it('400s INVALID_EMAIL on a malformed address', async () => {
    const baseUrl = await start({ db: makeFakeDb(), sendConfirmation: makeSpy(), sendAdminNotification: makeSpy() });
    const { status, body } = await post(baseUrl, { name: 'A', email: 'not-an-email' });
    expect(status).toBe(400);
    expect(body.code).toBe('INVALID_EMAIL');
  });

  it('400s INVALID_INTENT on an unknown intent', async () => {
    const baseUrl = await start({ db: makeFakeDb(), sendConfirmation: makeSpy(), sendAdminNotification: makeSpy() });
    const { status, body } = await post(baseUrl, { ...VALID, interest: 'hack' });
    expect(status).toBe(400);
    expect(body.code).toBe('INVALID_INTENT');
  });

  it('is idempotent: a duplicate email returns alreadyOnList and does not re-send email', async () => {
    const db = makeFakeDb();
    const sendConfirmation = makeSpy();
    const sendAdminNotification = makeSpy();
    const baseUrl = await start({ db, sendConfirmation, sendAdminNotification });

    const first = await post(baseUrl, VALID);
    expect(first.body.alreadyOnList).toBe(false);

    // Same email, different case — normalization makes it the same row.
    const second = await post(baseUrl, { ...VALID, email: 'JANE@example.com' });
    expect(second.status).toBe(200);
    expect(second.body.success).toBe(true);
    expect(second.body.alreadyOnList).toBe(true);
    expect(second.body.id).toBe(first.body.id);

    expect(db.rows).toHaveLength(1); // no duplicate row
    expect(sendConfirmation.calls).toHaveLength(1); // not re-sent on the dup
    expect(sendAdminNotification.calls).toHaveLength(1);
  });

  it('still succeeds (2xx) when a confirmation email throws — side-effect isolation', async () => {
    const db = makeFakeDb();
    const throwingConfirmation = makeSpy(() => {
      throw new Error('SES is in sandbox / throttled');
    });
    const baseUrl = await start({
      db,
      sendConfirmation: throwingConfirmation,
      sendAdminNotification: makeSpy(),
    });

    const { status, body } = await post(baseUrl, VALID);
    expect(status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.alreadyOnList).toBe(false);
    expect(db.rows).toHaveLength(1); // the signup was recorded despite the throw
  });

  it('still succeeds (2xx) when the admin-notify email throws — side-effect isolation', async () => {
    const db = makeFakeDb();
    const throwingAdmin = makeSpy(() => {
      throw new Error('admin mailbox unreachable');
    });
    const baseUrl = await start({ db, sendConfirmation: makeSpy(), sendAdminNotification: throwingAdmin });

    const { status, body } = await post(baseUrl, VALID);
    expect(status).toBe(200);
    expect(body.success).toBe(true);
    expect(db.rows).toHaveLength(1);
  });

  it('stamps confirmation_sent_at only when the confirmation actually sent', async () => {
    const db = makeFakeDb();
    // Sender reports sent — the route should stamp the row.
    const sentUrl = await start({
      db,
      sendConfirmation: makeSpy(() => ({ sent: true })),
      sendAdminNotification: makeSpy(),
    });
    await post(sentUrl, VALID);
    expect(db.stamped).toHaveLength(1);
    expect(db.rows[0].confirmation_sent_at).not.toBeNull();

    // Sender reports skipped (emails disabled) — no stamp.
    const skippedDb = makeFakeDb();
    const skippedUrl = await start({
      db: skippedDb,
      sendConfirmation: makeSpy(() => ({ sent: false, skipped: 'disabled' })),
      sendAdminNotification: makeSpy(),
    });
    await post(skippedUrl, { ...VALID, email: 'other@example.com' });
    expect(skippedDb.stamped).toHaveLength(0);
    expect(skippedDb.rows[0].confirmation_sent_at).toBeNull();
  });

  it('400s INVALID_NAME / INVALID_WALLET on over-long free-text fields', async () => {
    const baseUrl = await start({ db: makeFakeDb(), sendConfirmation: makeSpy(), sendAdminNotification: makeSpy() });

    const longName = await post(baseUrl, { ...VALID, name: 'x'.repeat(201) });
    expect(longName.status).toBe(400);
    expect(longName.body.code).toBe('INVALID_NAME');

    const longWallet = await post(baseUrl, { ...VALID, walletAddress: 'a'.repeat(65) });
    expect(longWallet.status).toBe(400);
    expect(longWallet.body.code).toBe('INVALID_WALLET');
  });

  it('500s WAITLIST_INSERT_FAILED when the db insert throws', async () => {
    const db = {
      async insertWaitlistEntry() {
        throw new Error('DSQL connection reset');
      },
    };
    const baseUrl = await start({ db, sendConfirmation: makeSpy(), sendAdminNotification: makeSpy() });
    const { status, body } = await post(baseUrl, VALID);
    expect(status).toBe(500);
    expect(body.code).toBe('WAITLIST_INSERT_FAILED');
  });

  it('returns success without an id when the row is lost to an unobservable race', async () => {
    // insert returns null (conflict) but the conflicting row is then not found.
    const db = {
      async insertWaitlistEntry() { return null; },
      async getWaitlistByEmail() { return null; },
    };
    const baseUrl = await start({ db, sendConfirmation: makeSpy(), sendAdminNotification: makeSpy() });
    const { status, body } = await post(baseUrl, VALID);
    expect(status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.alreadyOnList).toBe(true);
    expect(body.id).toBeUndefined();
  });
});

describe('GET /api/waitlist/export', () => {
  it('401s without a valid Bearer token', async () => {
    const baseUrl = await start({ db: makeFakeDb(), sendConfirmation: makeSpy(), sendAdminNotification: makeSpy() });

    const noToken = await getExport(baseUrl);
    expect(noToken.status).toBe(401);

    const badToken = await getExport(baseUrl, { token: 'wrong-token' });
    expect(badToken.status).toBe(401);
  });

  it('returns CSV with a valid token, and JSON with ?format=json', async () => {
    const db = makeFakeDb();
    const baseUrl = await start({ db, sendConfirmation: makeSpy(), sendAdminNotification: makeSpy() });
    await post(baseUrl, VALID);

    const csv = await getExport(baseUrl, { token: EXPORT_TOKEN });
    expect(csv.status).toBe(200);
    expect(csv.text.split('\r\n')[0]).toContain('id,name,email');
    expect(csv.text).toContain('jane@example.com');

    const json = await getExport(baseUrl, { token: EXPORT_TOKEN, format: 'json' });
    expect(json.status).toBe(200);
    const parsed = JSON.parse(json.text);
    expect(parsed.success).toBe(true);
    expect(parsed.count).toBe(1);
    expect(parsed.rows[0].email).toBe('jane@example.com');
  });

  it('defangs spreadsheet formula injection in the CSV export', async () => {
    const db = makeFakeDb();
    const baseUrl = await start({ db, sendConfirmation: makeSpy(), sendAdminNotification: makeSpy() });
    // A malicious signup name that would execute as a formula in Excel/Sheets.
    await post(baseUrl, { name: '=cmd|\'/c calc\'!A1', email: 'evil@example.com' });

    const csv = await getExport(baseUrl, { token: EXPORT_TOKEN });
    expect(csv.status).toBe(200);
    // The dangerous cell must be neutralized with a leading apostrophe so the
    // spreadsheet treats it as text, never emitted as a bare =-prefixed cell.
    expect(csv.text).toContain("'=cmd");
    expect(csv.text).not.toContain(',=cmd');
  });

  it('500s EXPORT_NOT_CONFIGURED when no export token is set (fail closed)', async () => {
    const saved = process.env.HACKNYU_WAITLIST_EXPORT_TOKEN;
    delete process.env.HACKNYU_WAITLIST_EXPORT_TOKEN;
    try {
      const baseUrl = await start({ db: makeFakeDb(), sendConfirmation: makeSpy(), sendAdminNotification: makeSpy() });
      const res = await getExport(baseUrl, { token: 'anything' });
      expect(res.status).toBe(500);
      expect(JSON.parse(res.text).code).toBe('EXPORT_NOT_CONFIGURED');
    } finally {
      process.env.HACKNYU_WAITLIST_EXPORT_TOKEN = saved;
    }
  });

  it('500s WAITLIST_EXPORT_FAILED when the db list throws', async () => {
    const db = {
      async listWaitlist() {
        throw new Error('DSQL read timeout');
      },
    };
    const baseUrl = await start({ db, sendConfirmation: makeSpy(), sendAdminNotification: makeSpy() });
    const res = await getExport(baseUrl, { token: EXPORT_TOKEN });
    expect(res.status).toBe(500);
    expect(JSON.parse(res.text).code).toBe('WAITLIST_EXPORT_FAILED');
  });
});
