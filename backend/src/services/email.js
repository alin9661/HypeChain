// Transactional email via AWS SES.
//
// Used by the waitlist signup path to (1) acknowledge a signup to the user and
// (2) notify the operator of each new signup. The AWS SDK is imported LAZILY
// (mirroring services/signer.js) so dev/test and the non-email request paths
// pay no import cost and need no AWS creds.
//
// CONTRACT: these functions NEVER throw. The waitlist DB write is the source of
// truth for "who is on the list"; email is a best-effort side effect. Each
// function returns a small result object ({ sent, skipped?, error? }) and logs
// only the recipient address + outcome — never the message body or any secret.
//
// Sends are gated by HACKNYU_WAITLIST_EMAILS_ENABLED=true. When unset/false
// (dev, CI), every call short-circuits to { sent: false, skipped: 'disabled' }
// so local signups work end-to-end without SES.

const SENDER_ENV = 'HACKNYU_SES_SENDER';
const ADMIN_ENV = 'HACKNYU_WAITLIST_ADMIN_EMAIL';

export function emailsEnabled() {
  return process.env.HACKNYU_WAITLIST_EMAILS_ENABLED === 'true';
}

// Default SES transport. Imported lazily so @aws-sdk/client-ses only loads when
// emails are actually enabled. Reads AWS_REGION + the verified sender identity.
// Throws on misconfig/transport error — callers below convert that into a
// best-effort result and never propagate it.
async function defaultSesSend({ to, subject, text }) {
  const region = process.env.AWS_REGION;
  if (!region) throw new Error('AWS_REGION not set for SES send');
  const sender = process.env[SENDER_ENV];
  if (!sender) throw new Error(`${SENDER_ENV} not set (verified SES sender required)`);

  const { SESClient, SendEmailCommand } = await import('@aws-sdk/client-ses');
  const client = new SESClient({ region });
  await client.send(
    new SendEmailCommand({
      Source: sender,
      Destination: { ToAddresses: [to] },
      Message: {
        Subject: { Data: subject, Charset: 'UTF-8' },
        Body: { Text: { Data: text, Charset: 'UTF-8' } },
      },
    })
  );
}

// Run a send through the disabled-gate + failure-isolation wrapper. `label` is
// used only for logging the outcome.
async function bestEffortSend(label, to, build, sesSend) {
  if (!emailsEnabled()) return { sent: false, skipped: 'disabled' };
  if (!to) return { sent: false, skipped: 'no-recipient' };
  try {
    await sesSend({ to, ...build() });
    console.log(`[email] ${label} sent to ${to}`);
    return { sent: true };
  } catch (err) {
    // Best-effort: log the outcome (not the body) and report failure without
    // raising. The caller (the waitlist route) keeps the signup successful.
    console.warn(`[email] ${label} to ${to} failed: ${err?.message ?? err}`);
    return { sent: false, error: err?.message ?? String(err) };
  }
}

/**
 * Acknowledge a new waitlist signup to the user (single opt-in — informational,
 * not a click-to-confirm). Best-effort; never throws.
 *
 * @param {string} toEmail normalized signup email
 * @param {{ name?: string, id: string, intake: string }} info
 * @param {{ sesSend?: Function }} [deps] inject a fake transport in tests
 */
export async function sendWaitlistConfirmation(toEmail, { name, id, intake } = {}, { sesSend = defaultSesSend } = {}) {
  return bestEffortSend(
    'confirmation',
    toEmail,
    () => ({
      subject: 'HypeChain — your waitlist intake is filed',
      text:
        `${name ? `${name}, ` : ''}your HypeChain waitlist intake is filed.\n\n` +
        `Submission: ${id}\n` +
        `Intake: ${intake}\n\n` +
        `We examine every listing before mint — verified records, not a JPEG mall.\n` +
        `Wave invitations roll out weekly. We'll email this address when it's your turn.\n\n` +
        `— HypeChain`,
    }),
    sesSend
  );
}

/**
 * Notify the operator that someone joined the waitlist. Sent to
 * HACKNYU_WAITLIST_ADMIN_EMAIL. Best-effort; never throws.
 *
 * @param {object} entry the persisted waitlist row (id, name, email, intent, ...)
 * @param {{ sesSend?: Function }} [deps]
 */
export async function sendAdminSignupNotification(entry, { sesSend = defaultSesSend } = {}) {
  const admin = process.env[ADMIN_ENV];
  return bestEffortSend(
    'admin-notify',
    admin,
    () => ({
      subject: `HypeChain waitlist: new signup (${entry?.intent ?? 'unknown'})`,
      text:
        `New HypeChain waitlist signup:\n\n` +
        `Name:   ${entry?.name ?? ''}\n` +
        `Email:  ${entry?.email ?? ''}\n` +
        `Wallet: ${entry?.wallet_address ?? '—'}\n` +
        `Intent: ${entry?.intent ?? ''}\n` +
        `Joined: ${entry?.created_at ?? ''}\n` +
        `Row id: ${entry?.id ?? ''}\n`,
    }),
    sesSend
  );
}
