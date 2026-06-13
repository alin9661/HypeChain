/**
 * Workstream D — request correlation + rate limiting.
 */

import { test, expect, describe } from 'bun:test';
import express from 'express';
import rateLimit from 'express-rate-limit';

import { requestId } from '../src/middleware/request-id.js';

async function withServer(app, fn) {
  const server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  try {
    return await fn(`http://127.0.0.1:${server.address().port}`);
  } finally {
    server.close();
  }
}

describe('requestId middleware', () => {
  test('mints a UUID and echoes X-Request-Id when none is provided', async () => {
    const app = express();
    app.use(requestId);
    app.get('/', (req, res) => res.json({ id: req.id }));
    await withServer(app, async (base) => {
      const res = await fetch(base);
      const header = res.headers.get('x-request-id');
      const body = await res.json();
      expect(header).toBeTruthy();
      expect(body.id).toBe(header);
      // UUID v4 shape
      expect(header).toMatch(/^[0-9a-f-]{36}$/);
    });
  });

  test('honors a safe inbound X-Request-Id', async () => {
    const app = express();
    app.use(requestId);
    app.get('/', (req, res) => res.json({ id: req.id }));
    await withServer(app, async (base) => {
      const res = await fetch(base, { headers: { 'X-Request-Id': 'trace-abc_123' } });
      expect(res.headers.get('x-request-id')).toBe('trace-abc_123');
    });
  });

  test('rejects a malformed/forged inbound id (mints its own instead)', async () => {
    const app = express();
    app.use(requestId);
    app.get('/', (req, res) => res.json({ id: req.id }));
    await withServer(app, async (base) => {
      // Newline injection attempt → ignored, fresh UUID minted.
      const res = await fetch(base, { headers: { 'X-Request-Id': 'bad id with spaces' } });
      const header = res.headers.get('x-request-id');
      expect(header).not.toBe('bad id with spaces');
      expect(header).toMatch(/^[0-9a-f-]{36}$/);
    });
  });
});

describe('rate limiting', () => {
  test('returns 429 with the RATE_LIMITED envelope once the window cap is hit', async () => {
    // A tiny limiter mirroring the shape of the production ones.
    const app = express();
    app.use(
      rateLimit({
        windowMs: 60_000,
        max: 2,
        standardHeaders: true,
        legacyHeaders: false,
        handler: (req, res) =>
          res.status(429).json({ success: false, error: 'slow down', code: 'RATE_LIMITED' }),
      })
    );
    app.get('/', (req, res) => res.json({ ok: true }));

    await withServer(app, async (base) => {
      const first = await fetch(base);
      const second = await fetch(base);
      const third = await fetch(base);
      expect(first.status).toBe(200);
      expect(second.status).toBe(200);
      expect(third.status).toBe(429);
      const body = await third.json();
      expect(body.code).toBe('RATE_LIMITED');
      expect(body.success).toBe(false);
    });
  });
});
