/**
 * Verification — server-wallet-signed `submit_verification` for the
 * HypeChain Evidence Locker program.
 *
 * The server wallet acts as the on-chain **examiner**. The actual AI
 * verification happens off-chain (OpenRouter); this service anchors the
 * verdict on-chain so the redacted-field UI can prove the confidence
 * score wasn't tampered with after the fact.
 *
 * On first call we lazily open a Dossier for the server wallet — one PDA
 * per server wallet, gives the examiner an on-chain identity. Subsequent
 * verifications just write the proof PDA.
 */

import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  sendAndConfirmTransaction,
} from '@solana/web3.js';
import bs58 from 'bs58';

import {
  PROGRAM_ID,
  findDossierPda,
  findVerificationPda,
  buildInitDossierIx,
  buildSubmitVerificationIx,
  casePrefixBytes,
  modelNameBytes,
} from './evidence-locker-client.js';

const SOLANA_RPC_URL = process.env.HACKNYU_SOLANA_RPC_URL || 'https://api.devnet.solana.com';
const CASE_PREFIX = process.env.HACKNYU_CASE_PREFIX || 'HC-2026-';

function getConnection() {
  return new Connection(SOLANA_RPC_URL, 'confirmed');
}

// Module-level keypair cache — decoded once per process to avoid redundant
// bs58.decode + Keypair construction on every request (and to keep the
// secret in heap for a shorter aggregate lifetime).
let _cachedServerWallet = null;
function getServerWallet() {
  if (_cachedServerWallet) return _cachedServerWallet;
  const privateKeyString = process.env.HACKNYU_SERVER_WALLET_PRIVATE_KEY;
  if (!privateKeyString) {
    throw new Error('HACKNYU_SERVER_WALLET_PRIVATE_KEY not set');
  }
  _cachedServerWallet = Keypair.fromSecretKey(bs58.decode(privateKeyString));
  return _cachedServerWallet;
}

// Promise cache so two concurrent listing requests at cold start do not both
// fire `init_dossier` and have one fail with "account already in use".
let _dossierEnsuredPromise = null;

async function _doEnsureServerDossier() {
  const connection = getConnection();
  const wallet = getServerWallet();
  const [dossierPda] = findDossierPda(wallet.publicKey);

  const existing = await connection.getAccountInfo(dossierPda, 'confirmed');
  if (existing) {
    return { dossierPda: dossierPda.toBase58(), created: false };
  }

  const ix = buildInitDossierIx({
    authority: wallet.publicKey,
    casePrefix: casePrefixBytes(CASE_PREFIX),
    examiner: wallet.publicKey, // server wallet IS the examiner in v1
  });
  const tx = new Transaction().add(ix);
  const sig = await sendAndConfirmTransaction(connection, tx, [wallet], {
    commitment: 'confirmed',
  });
  console.log(`✅ Opened server dossier ${dossierPda.toBase58()} (${sig})`);
  return { dossierPda: dossierPda.toBase58(), created: true };
}

/**
 * Ensure the server wallet has a Dossier PDA open on-chain. Cheap to call —
 * we check `getAccountInfo` first and only send the tx if missing.
 * Concurrent calls share a single in-flight promise (race-safe).
 */
export async function ensureServerDossier() {
  if (!_dossierEnsuredPromise) {
    _dossierEnsuredPromise = _doEnsureServerDossier().catch((err) => {
      // Reset on failure so the next caller can retry.
      _dossierEnsuredPromise = null;
      throw err;
    });
  }
  return _dossierEnsuredPromise;
}

/**
 * Anchor an AI verification verdict on-chain. Idempotent at the protocol
 * level — calling twice for the same mint will fail with the PDA
 * already-exists error, which the caller may want to ignore.
 *
 * @param {object} args
 * @param {string} args.nftMint     base58 NFT mint address
 * @param {number} args.confidenceBps integer 0..=10_000
 * @param {string} args.modelName   e.g. "VISION-4O" (zero-padded to 32 bytes)
 * @param {boolean} args.livenessPassed
 * @returns {Promise<{signature: string, verificationPda: string}>}
 */
export async function submitVerification({
  nftMint,
  confidenceBps,
  modelName,
  livenessPassed,
}) {
  if (!Number.isInteger(confidenceBps) || confidenceBps < 0 || confidenceBps > 10_000) {
    throw new Error('confidenceBps must be an integer in 0..=10000');
  }
  await ensureServerDossier();

  const connection = getConnection();
  const wallet = getServerWallet();
  const mintPk = new PublicKey(nftMint);
  const [verificationPda] = findVerificationPda(mintPk);

  const ix = buildSubmitVerificationIx({
    examiner: wallet.publicKey,
    nftMint: mintPk,
    dossierAuthority: wallet.publicKey,
    confidenceBps,
    modelName: modelNameBytes(modelName),
    livenessPassed,
  });
  const tx = new Transaction().add(ix);
  const signature = await sendAndConfirmTransaction(connection, tx, [wallet], {
    commitment: 'confirmed',
  });
  console.log(
    `📝 VerificationProof anchored: mint=${nftMint} conf_bps=${confidenceBps} liveness=${livenessPassed} sig=${signature}`
  );
  return {
    signature,
    verificationPda: verificationPda.toBase58(),
  };
}

/**
 * Convert an AI confidence percent (0..1 or 0..100) into the integer
 * basis-points format the program expects. Accepts both common shapes
 * to be robust against upstream changes in the AI vision response.
 */
export function confidenceToBps(value) {
  if (typeof value !== 'number' || Number.isNaN(value)) return 0;
  if (value <= 1) return Math.round(value * 10_000);
  if (value <= 100) return Math.round(value * 100);
  if (value <= 10_000) return Math.round(value);
  return 10_000;
}

export { PROGRAM_ID };
