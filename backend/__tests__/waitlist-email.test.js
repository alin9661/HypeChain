/**
 * Unit tests for the waitlist email service and the email validator.
 *
 * The SES transport is injected (`sesSend`) so nothing hits AWS. The contract
 * under test is the one the whole feature leans on: these functions are
 * best-effort and NEVER throw — a disabled gate, a missing recipient, or a
 * throwing transport all resolve to a small result object, never a rejection.
 */

import './helpers/env-setup.js';
import { describe, it, expect, afterEach } from 'bun:test';

import {
  emailsEnabled,
  sendWaitlistConfirmation,
  sendAdminSignupNotification,
} from '../src/services/email.js';
import { isValidEmail } from '../src/utils/validation.js';

const ENABLED = 'HACKNYU_WAITLIST_EMAILS_ENABLED';
const ADMIN = 'HACKNYU_WAITLIST_ADMIN_EMAIL';

// Snapshot + restore the env keys these tests mutate.
const saved = { [ENABLED]: process.env[ENABLED], [ADMIN]: process.env[ADMIN] };
afterEach(() => {
  for (const k of [ENABLED, ADMIN]) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

function spySend(impl) {
  const calls = [];
  const fn = async (args) => {
    calls.push(args);
    if (impl) return impl(args);
  };
  fn.calls = calls;
  return fn;
}

describe('emailsEnabled()', () => {
  it('is true only for the exact string "true"', () => {
    process.env[ENABLED] = 'true';
    expect(emailsEnabled()).toBe(true);
    process.env[ENABLED] = 'false';
    expect(emailsEnabled()).toBe(false);
    process.env[ENABLED] = '1';
    expect(emailsEnabled()).toBe(false);
    delete process.env[ENABLED];
    expect(emailsEnabled()).toBe(false);
  });
});

describe('sendWaitlistConfirmation()', () => {
  it('skips (no transport call) when emails are disabled', async () => {
    process.env[ENABLED] = 'false';
    const sesSend = spySend();
    const result = await sendWaitlistConfirmation('a@b.com', { id: 'HC-W-1', intake: 'now' }, { sesSend });
    expect(result).toEqual({ sent: false, skipped: 'disabled' });
    expect(sesSend.calls).toHaveLength(0);
  });

  it('sends and reports {sent:true} when enabled, carrying id + intake in the body', async () => {
    process.env[ENABLED] = 'true';
    const sesSend = spySend();
    const result = await sendWaitlistConfirmation(
      'a@b.com',
      { name: 'Jane', id: 'HC-W-ABCD1234', intake: '2026-06-19 12:00:00 UTC' },
      { sesSend }
    );
    expect(result).toEqual({ sent: true });
    expect(sesSend.calls).toHaveLength(1);
    const msg = sesSend.calls[0];
    expect(msg.to).toBe('a@b.com');
    expect(msg.subject).toContain('waitlist');
    expect(msg.text).toContain('HC-W-ABCD1234');
    expect(msg.text).toContain('2026-06-19 12:00:00 UTC');
  });

  it('never throws when the transport fails — returns {sent:false, error}', async () => {
    process.env[ENABLED] = 'true';
    const sesSend = spySend(() => {
      throw new Error('SES throttled');
    });
    const result = await sendWaitlistConfirmation('a@b.com', { id: 'HC-W-1', intake: 'now' }, { sesSend });
    expect(result.sent).toBe(false);
    expect(result.error).toContain('SES throttled');
  });
});

describe('sendAdminSignupNotification()', () => {
  it('skips with no-recipient when the admin address is unset', async () => {
    process.env[ENABLED] = 'true';
    delete process.env[ADMIN];
    const sesSend = spySend();
    const result = await sendAdminSignupNotification({ email: 'a@b.com', intent: 'collect' }, { sesSend });
    expect(result).toEqual({ sent: false, skipped: 'no-recipient' });
    expect(sesSend.calls).toHaveLength(0);
  });

  it('sends to the configured admin with the signup details in the body', async () => {
    process.env[ENABLED] = 'true';
    process.env[ADMIN] = 'ops@hypechain.io';
    const sesSend = spySend();
    const entry = { id: 'row-1', name: 'Jane', email: 'jane@example.com', wallet_address: '7f49', intent: 'trade' };
    const result = await sendAdminSignupNotification(entry, { sesSend });
    expect(result).toEqual({ sent: true });
    const msg = sesSend.calls[0];
    expect(msg.to).toBe('ops@hypechain.io');
    expect(msg.text).toContain('jane@example.com');
    expect(msg.text).toContain('trade');
  });
});

// Regression guard for the A1 fix: every test above injects a fake `sesSend`,
// so the real transport's `await import('@aws-sdk/client-ses')` is NEVER
// exercised by them. That import lives inside best-effort error handling that
// swallows a missing dependency into a logged warning + {sent:false} — so if
// the package were dropped from package.json again, the whole suite would stay
// green while production silently sent zero emails. This test imports the real
// package so the suite fails LOUDLY if that dependency goes missing.
describe('SES transport dependency (@aws-sdk/client-ses)', () => {
  it('is installed and exposes the symbols email.js dynamically imports', async () => {
    const mod = await import('@aws-sdk/client-ses');
    expect(typeof mod.SESClient).toBe('function');
    expect(typeof mod.SendEmailCommand).toBe('function');
  });
});

describe('isValidEmail()', () => {
  it('accepts a well-formed address', () => {
    expect(isValidEmail('jane@example.com')).toBe(true);
    expect(isValidEmail('  jane@example.com  ')).toBe(true); // trimmed
  });

  it('rejects non-strings, empties, malformed shapes, and over-long input', () => {
    expect(isValidEmail(null)).toBe(false);
    expect(isValidEmail(12345)).toBe(false);
    expect(isValidEmail('')).toBe(false);
    expect(isValidEmail('   ')).toBe(false);
    expect(isValidEmail('no-at-sign')).toBe(false);
    expect(isValidEmail('a@b')).toBe(false); // no dot in domain
    expect(isValidEmail('a b@c.com')).toBe(false); // space
    expect(isValidEmail(`${'a'.repeat(250)}@example.com`)).toBe(false); // > 254
  });
});
