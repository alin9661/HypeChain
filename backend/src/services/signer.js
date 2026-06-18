// Custodial signer abstraction.
//
// One seam for loading the server custodial keypair. Today it has a single backend:
// a bs58 secret from HACKNYU_SERVER_WALLET_PRIVATE_KEY (dev/devnet). The key material
// is NEVER logged. Swapping to a managed secret store or HSM/MPC later is a change to
// this one file (keep getServerWallet()'s contract).

import { Keypair } from '@solana/web3.js';
import bs58 from 'bs58';

let _cached = null; // Keypair — process-wide cache (stable custodial identity)

function decodeBs58SecretKey(secret) {
  let bytes;
  try {
    bytes = bs58.decode(secret.trim());
  } catch {
    throw new Error('Invalid custodial key: secret is not valid base58');
  }
  return Keypair.fromSecretKey(bytes);
}

function loadFromEnv() {
  const secret = process.env.HACKNYU_SERVER_WALLET_PRIVATE_KEY;
  if (!secret) {
    throw new Error('HACKNYU_SERVER_WALLET_PRIVATE_KEY not set');
  }
  return decodeBs58SecretKey(secret);
}

/**
 * Return the cached custodial keypair synchronously. Loads lazily on first call.
 * @returns {import('@solana/web3.js').Keypair}
 */
export function getServerWallet() {
  if (_cached) return _cached;
  _cached = loadFromEnv();
  return _cached;
}

/** Base58 public key of the custodial server wallet. */
export function getServerWalletPublicKey() {
  return getServerWallet().publicKey.toBase58();
}

/** Test hook: clear the cached keypair so env changes take effect. */
export function _resetSignerForTests() {
  _cached = null;
}
