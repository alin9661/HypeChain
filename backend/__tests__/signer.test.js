import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { Keypair } from '@solana/web3.js';
import bs58 from 'bs58';

import {
  initServerWallet,
  getServerWallet,
  getServerWalletPublicKey,
  _resetSignerForTests,
} from '../src/services/signer.js';

// A throwaway custodial keypair for the tests, encoded the way the env var expects.
const TEST_KP = Keypair.generate();
const TEST_BS58 = bs58.encode(TEST_KP.secretKey);

const SAVED = {};
function saveEnv() {
  for (const k of [
    'HACKNYU_CUSTODIAL_KEY_SOURCE',
    'HACKNYU_SERVER_WALLET_PRIVATE_KEY',
    'HACKNYU_CUSTODIAL_SECRET_ID',
  ]) {
    SAVED[k] = process.env[k];
    delete process.env[k];
  }
}
function restoreEnv() {
  for (const [k, v] of Object.entries(SAVED)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
}

beforeEach(() => {
  _resetSignerForTests();
  saveEnv();
});
afterEach(() => {
  restoreEnv();
  _resetSignerForTests();
});

describe('signer — env backend', () => {
  it('loads the keypair from HACKNYU_SERVER_WALLET_PRIVATE_KEY (default source)', () => {
    process.env.HACKNYU_SERVER_WALLET_PRIVATE_KEY = TEST_BS58;
    const kp = getServerWallet();
    expect(kp.publicKey.toBase58()).toBe(TEST_KP.publicKey.toBase58());
    expect(getServerWalletPublicKey()).toBe(TEST_KP.publicKey.toBase58());
  });

  it('caches: a second call returns the same Keypair instance', () => {
    process.env.HACKNYU_SERVER_WALLET_PRIVATE_KEY = TEST_BS58;
    expect(getServerWallet()).toBe(getServerWallet());
  });

  it('throws a clear error when the env key is missing', () => {
    expect(() => getServerWallet()).toThrow(/HACKNYU_SERVER_WALLET_PRIVATE_KEY not set/);
  });

  it('throws on a malformed (non-base58) key', () => {
    process.env.HACKNYU_SERVER_WALLET_PRIVATE_KEY = '0OIl-not-base58-!!!';
    expect(() => getServerWallet()).toThrow(/not valid base58/);
  });
});

describe('signer — secretsmanager backend', () => {
  beforeEach(() => {
    process.env.HACKNYU_CUSTODIAL_KEY_SOURCE = 'secretsmanager';
    process.env.HACKNYU_CUSTODIAL_SECRET_ID = 'arn:test:custodial';
  });

  it('fetches, decodes, and caches the key (one fetch for many reads)', async () => {
    let calls = 0;
    const fetchSecret = async (id) => {
      calls += 1;
      expect(id).toBe('arn:test:custodial');
      return TEST_BS58;
    };
    const kp = await initServerWallet({ fetchSecret });
    expect(kp.publicKey.toBase58()).toBe(TEST_KP.publicKey.toBase58());

    // Subsequent sync reads hit the cache; no further fetches.
    expect(getServerWallet().publicKey.toBase58()).toBe(TEST_KP.publicKey.toBase58());
    await initServerWallet({ fetchSecret });
    expect(calls).toBe(1);
  });

  it('accepts a JSON-envelope SecretString ({ privateKey })', async () => {
    const fetchSecret = async () => JSON.stringify({ privateKey: TEST_BS58 });
    const kp = await initServerWallet({ fetchSecret });
    expect(kp.publicKey.toBase58()).toBe(TEST_KP.publicKey.toBase58());
  });

  it('getServerWallet() throws if called before init under secretsmanager', () => {
    expect(() => getServerWallet()).toThrow(/not initialized.*initServerWallet/);
  });

  it('throws if HACKNYU_CUSTODIAL_SECRET_ID is unset', async () => {
    delete process.env.HACKNYU_CUSTODIAL_SECRET_ID;
    await expect(initServerWallet({ fetchSecret: async () => TEST_BS58 })).rejects.toThrow(
      /HACKNYU_CUSTODIAL_SECRET_ID not set/
    );
  });

  it('does not poison the cache on a transient fetch failure (retry succeeds)', async () => {
    let calls = 0;
    const fetchSecret = async () => {
      calls += 1;
      if (calls === 1) throw new Error('transient Secrets Manager error');
      return TEST_BS58;
    };
    await expect(initServerWallet({ fetchSecret })).rejects.toThrow(/transient/);
    const kp = await initServerWallet({ fetchSecret });
    expect(kp.publicKey.toBase58()).toBe(TEST_KP.publicKey.toBase58());
    expect(calls).toBe(2);
  });
});

describe('signer — never logs key material', () => {
  it('does not write the secret to console during load', () => {
    process.env.HACKNYU_SERVER_WALLET_PRIVATE_KEY = TEST_BS58;
    const captured = [];
    const orig = { log: console.log, warn: console.warn, error: console.error };
    console.log = (...a) => captured.push(a.join(' '));
    console.warn = (...a) => captured.push(a.join(' '));
    console.error = (...a) => captured.push(a.join(' '));
    try {
      getServerWallet();
    } finally {
      Object.assign(console, orig);
    }
    expect(captured.join('\n')).not.toContain(TEST_BS58);
  });
});
