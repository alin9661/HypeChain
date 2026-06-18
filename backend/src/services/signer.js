// Custodial signer abstraction.
//
// One seam for loading the server custodial keypair, with two interchangeable
// backends selected by HACKNYU_CUSTODIAL_KEY_SOURCE:
//   • "env" (default)          — bs58 secret from HACKNYU_SERVER_WALLET_PRIVATE_KEY (dev/devnet).
//   • "secretsmanager"         — fetch from AWS Secrets Manager (KMS-encrypted at rest;
//                                decrypt is transparent via the execution role's grant),
//                                decode once at cold start, cache in memory.
//
// The key material is NEVER logged. Swapping to HSM/MPC custody later is a change
// to this one file (add a backend, keep getServerWallet()'s contract).
//
// Sync vs async: getServerWallet() is synchronous because the custodial co-sign
// path (routes/payment.js → services/cosign-purchase.js) is synchronous. The env
// backend loads lazily and synchronously. The secretsmanager backend CANNOT load
// synchronously, so entry points (src/lambda.js) MUST call initServerWallet() once
// before serving; getServerWallet() then returns the warmed cache. If it is called
// before init under the secretsmanager source, it throws a clear error rather than
// silently falling back to env.

import { Keypair } from '@solana/web3.js';
import bs58 from 'bs58';

let _cached = null; // Keypair — process-wide cache (stable custodial identity)
let _initPromise = null; // de-dupes concurrent initServerWallet() at cold start

function keySource() {
  return (process.env.HACKNYU_CUSTODIAL_KEY_SOURCE || 'env').toLowerCase();
}

function decodeBs58SecretKey(secret) {
  let bytes;
  try {
    bytes = bs58.decode(secret.trim());
  } catch {
    throw new Error('Invalid custodial key: secret is not valid base58');
  }
  return Keypair.fromSecretKey(bytes);
}

// A Secrets Manager SecretString may be either a raw base58 secret key or a JSON
// envelope like {"privateKey":"<bs58>"}. Support both so the secret can be created
// either way without a code change.
function keypairFromSecretString(secretString) {
  if (!secretString) {
    throw new Error('Custodial secret is empty (no SecretString returned)');
  }
  let raw = secretString.trim();
  if (raw.startsWith('{')) {
    let obj;
    try {
      obj = JSON.parse(raw);
    } catch {
      throw new Error('Custodial secret is not valid JSON');
    }
    raw = obj.privateKey || obj.private_key || obj.secretKey || obj.HACKNYU_SERVER_WALLET_PRIVATE_KEY;
    if (!raw) {
      throw new Error('Custodial secret JSON is missing a privateKey field');
    }
  }
  return decodeBs58SecretKey(raw);
}

function loadFromEnv() {
  const secret = process.env.HACKNYU_SERVER_WALLET_PRIVATE_KEY;
  if (!secret) {
    throw new Error('HACKNYU_SERVER_WALLET_PRIVATE_KEY not set');
  }
  return decodeBs58SecretKey(secret);
}

// Default Secrets Manager fetch. Imported lazily so the AWS SDK is only loaded
// when the secretsmanager backend is actually used (env/dev pays no cost).
async function defaultFetchSecret(secretId) {
  const { SecretsManagerClient, GetSecretValueCommand } = await import(
    '@aws-sdk/client-secrets-manager'
  );
  const client = new SecretsManagerClient({ region: process.env.AWS_REGION });
  const res = await client.send(new GetSecretValueCommand({ SecretId: secretId }));
  return res.SecretString;
}

async function loadFromSecretsManager(fetchSecret) {
  const secretId = process.env.HACKNYU_CUSTODIAL_SECRET_ID;
  if (!secretId) {
    throw new Error('HACKNYU_CUSTODIAL_SECRET_ID not set for secretsmanager key source');
  }
  const secretString = await fetchSecret(secretId);
  return keypairFromSecretString(secretString);
}

/**
 * Load and cache the custodial keypair. Idempotent and concurrency-safe.
 * Call once at startup (required for the secretsmanager source). The env source
 * also works through here, but loads lazily via getServerWallet() too.
 *
 * @param {{ fetchSecret?: (secretId: string) => Promise<string> }} [deps]
 *   Inject a fake fetchSecret in tests to avoid hitting AWS.
 * @returns {Promise<import('@solana/web3.js').Keypair>}
 */
export async function initServerWallet({ fetchSecret = defaultFetchSecret } = {}) {
  if (_cached) return _cached;
  if (_initPromise) return _initPromise;
  _initPromise = (async () => {
    const src = keySource();
    const kp = src === 'secretsmanager'
      ? await loadFromSecretsManager(fetchSecret)
      : loadFromEnv();
    _cached = kp;
    return kp;
  })();
  try {
    return await _initPromise;
  } catch (err) {
    _initPromise = null; // allow a later retry (e.g. transient Secrets Manager error)
    throw err;
  } finally {
    if (_cached) _initPromise = null;
  }
}

/**
 * Return the cached custodial keypair synchronously.
 * env source: loads lazily on first call. secretsmanager source: requires a prior
 * initServerWallet() and throws otherwise (never silently falls back to env).
 * @returns {import('@solana/web3.js').Keypair}
 */
export function getServerWallet() {
  if (_cached) return _cached;
  if (keySource() === 'secretsmanager') {
    throw new Error(
      'Custodial signer not initialized: call initServerWallet() at startup when HACKNYU_CUSTODIAL_KEY_SOURCE=secretsmanager'
    );
  }
  _cached = loadFromEnv();
  return _cached;
}

/** Base58 public key of the custodial server wallet. */
export function getServerWalletPublicKey() {
  return getServerWallet().publicKey.toBase58();
}

/** Test hook: clear the cached keypair + in-flight init so env changes take effect. */
export function _resetSignerForTests() {
  _cached = null;
  _initPromise = null;
}
