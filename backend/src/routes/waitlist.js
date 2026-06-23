/**
 * Waitlist signup + admin export.
 *
 *   POST /api/waitlist          — public signup (form at /waitlist)
 *   GET  /api/waitlist/export   — admin-only dump (Bearer token), CSV or JSON
 *
 * The route is built by a factory so tests can inject a fake `db` and a fake
 * `emailService` and never touch the live DSQL cluster or AWS SES.
 *
 * SIDE-EFFECT ISOLATION POLICY (the one real design call here):
 *   The DSQL insert is the source of truth for "who is on the list". The two
 *   SES sends (user confirmation + admin notify) are best-effort side effects:
 *   they run AFTER the row is committed, are awaited so we can record their
 *   outcome, but a failure NEVER changes the 2xx the signup earned. A user must
 *   not bounce off a working form because SES is throttled or in sandbox.
 *   (Mirrors the cosign read-repair "never let a repair failure mask the
 *   response" pattern.) If you'd rather surface a soft "confirmation delayed"
 *   signal to the client, thread `confirmation.sent` into the response below.
 */

import express from 'express';
import crypto from 'crypto';

import { db as defaultDb } from '../db/index.js';
import { isValidEmail } from '../utils/validation.js';
import {
  sendWaitlistConfirmation as defaultSendConfirmation,
  sendAdminSignupNotification as defaultSendAdminNotification,
} from '../services/email.js';

const VALID_INTENTS = ['collect', 'trade', 'verify', 'build'];
// Length caps on the free-text fields. email is already capped at 254 by
// isValidEmail; name/wallet are unbounded DSQL TEXT, so cap them at the trust
// boundary before they reach the DB, the admin email, and the CSV export.
const MAX_NAME_LEN = 200;
const MAX_WALLET_LEN = 64; // base58 Solana addresses are 32-44 chars.
const EXPORT_COLUMNS = [
  'id', 'name', 'email', 'wallet_address', 'intent', 'source', 'status',
  'confirmation_sent_at', 'created_at', 'updated_at',
];

// Public-facing submission id derived from the row UUID (stable + traceable to
// the row), e.g. "HC-W-3F2A9B1C".
function submissionId(rowId) {
  const hex = String(rowId).replace(/-/g, '').slice(0, 8).toUpperCase();
  return `HC-W-${hex}`;
}

// Format a timestamptz (pg Date or ISO string) as "YYYY-MM-DD HH:MM:SS UTC".
function formatIntake(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  const pad = (n) => String(n).padStart(2, '0');
  return (
    `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} ` +
    `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())} UTC`
  );
}

function csvEscape(value) {
  if (value == null) return '';
  let s = String(value);
  // Defang spreadsheet formula injection: Excel/Sheets/LibreOffice treat a cell
  // starting with = + - @ (or a leading TAB/CR) as a live formula. A signup
  // `name` of `=cmd|'/c calc'!A1` would otherwise execute when an admin opens
  // the export. Prefix such a cell with a single quote so it renders as text.
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function toCsv(rows) {
  const header = EXPORT_COLUMNS.join(',');
  const lines = rows.map((r) => EXPORT_COLUMNS.map((c) => csvEscape(r[c])).join(','));
  return [header, ...lines].join('\r\n') + '\r\n';
}

// Constant-time bearer-token comparison (avoids a timing oracle on the secret).
function tokensMatch(provided, expected) {
  const a = Buffer.from(String(provided));
  const b = Buffer.from(String(expected));
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export function createWaitlistRouter({
  db = defaultDb,
  sendConfirmation = defaultSendConfirmation,
  sendAdminNotification = defaultSendAdminNotification,
} = {}) {
  const router = express.Router();

  // -------------------------------------------------------------------------
  // POST /api/waitlist — public signup
  // -------------------------------------------------------------------------
  router.post('/waitlist', async (req, res) => {
    try {
      const { name, email, walletAddress, interest } = req.body || {};

      // Validation: name + email are required; email must look like an email;
      // intent (if supplied) must be one of the known values.
      if (!name || !String(name).trim() || !email || !String(email).trim()) {
        return res.status(400).json({
          success: false,
          error: 'Name and email are required.',
          code: 'MISSING_FIELDS',
        });
      }
      if (!isValidEmail(email)) {
        return res.status(400).json({
          success: false,
          error: 'Email address is invalid.',
          code: 'INVALID_EMAIL',
        });
      }
      if (String(name).trim().length > MAX_NAME_LEN) {
        return res.status(400).json({
          success: false,
          error: `Name must be ${MAX_NAME_LEN} characters or fewer.`,
          code: 'INVALID_NAME',
        });
      }
      if (walletAddress && String(walletAddress).trim().length > MAX_WALLET_LEN) {
        return res.status(400).json({
          success: false,
          error: `Wallet address must be ${MAX_WALLET_LEN} characters or fewer.`,
          code: 'INVALID_WALLET',
        });
      }
      const intent = interest == null || interest === '' ? 'collect' : String(interest);
      if (!VALID_INTENTS.includes(intent)) {
        return res.status(400).json({
          success: false,
          error: `Intent must be one of: ${VALID_INTENTS.join(', ')}.`,
          code: 'INVALID_INTENT',
        });
      }

      const normalizedEmail = String(email).trim().toLowerCase();
      const wallet = walletAddress && String(walletAddress).trim()
        ? String(walletAddress).trim()
        : null;

      const entry = {
        name: String(name).trim(),
        email: normalizedEmail,
        wallet_address: wallet,
        intent,
        source: 'web',
      };

      // Idempotent insert: a duplicate email returns null (ON CONFLICT DO
      // NOTHING). Re-signups are a no-op — return the existing row's receipt
      // and do NOT re-send the confirmation email.
      const inserted = await db.insertWaitlistEntry(entry);
      if (!inserted) {
        const existing = await db.getWaitlistByEmail(normalizedEmail);
        if (!existing) {
          // Lost the row to a race we can't see — treat as success without a
          // receipt id rather than 500 on a healthy signup.
          return res.status(200).json({
            success: true,
            email: normalizedEmail,
            intent,
            alreadyOnList: true,
          });
        }
        return res.status(200).json({
          success: true,
          id: submissionId(existing.id),
          intake: formatIntake(existing.created_at),
          email: existing.email,
          intent: existing.intent,
          alreadyOnList: true,
        });
      }

      // Fresh signup. Fire the side effects best-effort. allSettled (not all)
      // is deliberate: it NEVER rejects, so even a throwing sender cannot fall
      // through to the 500 handler and turn a recorded signup into an error.
      // This is the side-effect isolation policy — always 2xx once the row is
      // committed. (To instead surface a soft "confirmation delayed" signal,
      // inspect these results and thread a flag into the response below.)
      await Promise.allSettled([
        sendConfirmation(normalizedEmail, {
          name: entry.name,
          id: submissionId(inserted.id),
          intake: formatIntake(inserted.created_at),
        }),
        sendAdminNotification(inserted),
      ]);

      return res.status(200).json({
        success: true,
        id: submissionId(inserted.id),
        intake: formatIntake(inserted.created_at),
        email: inserted.email,
        intent: inserted.intent,
        alreadyOnList: false,
      });
    } catch (error) {
      console.error('[waitlist] signup failed:', error?.message ?? error);
      return res.status(500).json({
        success: false,
        error: 'Could not record your signup. Please try again.',
        code: 'WAITLIST_INSERT_FAILED',
      });
    }
  });

  // -------------------------------------------------------------------------
  // GET /api/waitlist/export — admin-only dump (Bearer token)
  // -------------------------------------------------------------------------
  router.get('/waitlist/export', async (req, res) => {
    const expected = process.env.HACKNYU_WAITLIST_EXPORT_TOKEN;
    if (!expected) {
      // Fail closed: never expose the list when no token is configured.
      return res.status(500).json({
        success: false,
        error: 'Export is not configured.',
        code: 'EXPORT_NOT_CONFIGURED',
      });
    }

    const auth = req.get('authorization') || '';
    const provided = auth.startsWith('Bearer ') ? auth.slice('Bearer '.length) : '';
    if (!provided || !tokensMatch(provided, expected)) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized.',
        code: 'UNAUTHORIZED',
      });
    }

    try {
      const rows = await db.listWaitlist({ limit: 10000 });
      if (req.query.format === 'json') {
        return res.status(200).json({ success: true, count: rows.length, rows });
      }
      res.status(200);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="hypechain-waitlist.csv"');
      return res.send(toCsv(rows));
    } catch (error) {
      console.error('[waitlist] export failed:', error?.message ?? error);
      return res.status(500).json({
        success: false,
        error: 'Could not export the waitlist.',
        code: 'WAITLIST_EXPORT_FAILED',
      });
    }
  });

  return router;
}

// Default instance wired to the real db + SES email service.
export default createWaitlistRouter();
