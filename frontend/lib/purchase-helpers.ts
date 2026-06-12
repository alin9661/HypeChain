/**
 * Client-side guards for the custodial co-sign purchase flow (PR2).
 *
 * Testable without Privy/window: pure functions over the co-sign endpoint's
 * response. The wallet popup is the buyer's last line of defense, so before
 * handing the server-built transaction to it we assert (1) the price the UI
 * displayed equals what the chain will charge, and (2) the buyer — not the
 * server or anyone else — is the fee payer.
 */

import { LAMPORTS_PER_SOL, PublicKey, SystemProgram, Transaction } from '@solana/web3.js';
import { ASSOCIATED_TOKEN_PROGRAM_ID, TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { resolveProgramId } from '@/lib/anchor-client';

/**
 * Throw if the SOL price shown to the user disagrees with the lamports the
 * on-chain listing will actually charge (returned by the co-sign endpoint,
 * read from the EvidenceListing PDA). Closes the "silent DB/chain price
 * disagreement" gap — the buyer never signs for an unexpected amount.
 */
export function assertPriceMatches(displayedSol: number, priceLamports: string): void {
  const displayedLamports = BigInt(Math.round(displayedSol * LAMPORTS_PER_SOL));
  const chainLamports = BigInt(priceLamports);
  if (displayedLamports !== chainLamports) {
    throw new Error(
      `Price mismatch: page shows ${displayedSol} SOL (${displayedLamports} lamports) ` +
        `but the on-chain listing charges ${chainLamports} lamports. Refusing to sign.`
    );
  }
}

/**
 * Deserialize the partially-signed transaction from the co-sign endpoint and
 * verify the buyer is the fee payer before passing it to the wallet.
 */
export function deserializeCosignedTx(base64: string, buyer: PublicKey): Transaction {
  const tx = Transaction.from(Buffer.from(base64, 'base64'));
  if (!tx.feePayer || !tx.feePayer.equals(buyer)) {
    throw new Error('Co-signed transaction fee payer is not the buyer. Refusing to sign.');
  }
  return tx;
}

/**
 * sha256("global:purchase_evidence")[0..8] — Anchor instruction discriminator,
 * pinned identically in `frontend/lib/anchor-client.ts` (IX_PURCHASE_EVIDENCE)
 * and `backend/src/services/evidence-locker-client.js`. Duplicated here (it is
 * module-private in anchor-client) so the buyer-side guard can recognize the
 * one instruction the custodial key is supposed to co-sign.
 */
const PURCHASE_EVIDENCE_DISCRIMINATOR = Uint8Array.from([3, 56, 164, 102, 111, 130, 253, 45]);

/** SystemProgram instruction index (u32 LE at data offset 0) for Transfer. */
const SYSTEM_TRANSFER_INDEX = 2;

function startsWithDiscriminator(data: Uint8Array, disc: Uint8Array): boolean {
  if (data.length < disc.length) return false;
  for (let i = 0; i < disc.length; i++) {
    if (data[i] !== disc[i]) return false;
  }
  return true;
}

/**
 * Decode the co-signed transaction's instructions and refuse to sign anything
 * the co-sign endpoint would never legitimately produce (the buyer's wallet
 * popup is the last line of defense — never hand it unverified bytes):
 *
 * 1. Every instruction's programId must be the marketplace program (resolved
 *    via {@link resolveProgramId} — fails loud on a misconfigured production
 *    build, T8), the Associated Token Account program, the SPL Token program,
 *    or the System program. Anything else is a tampered transaction.
 * 2. Exactly one `purchase_evidence` instruction must target the marketplace
 *    program. If its data carries a u64 after the 8-byte discriminator
 *    (mirroring `evidence-locker-client.js` layouts), it must equal the
 *    `priceLamports` the co-sign endpoint reported. The current program takes
 *    no args (price is enforced on-chain from the listing PDA), so bare
 *    8-byte data is also accepted.
 * 3. No `SystemProgram.transfer` may appear at all — ATA rent is paid inside
 *    `createAssociatedTokenAccountIdempotent`, never as a separate transfer,
 *    so any transfer (especially one sourced from the buyer) is a drain.
 */
export function assertCosignedInstructions(
  tx: Transaction,
  buyer: PublicKey,
  priceLamports: string
): void {
  const marketplaceProgramId = resolveProgramId();
  const allowedPrograms = [
    marketplaceProgramId,
    ASSOCIATED_TOKEN_PROGRAM_ID,
    TOKEN_PROGRAM_ID,
    SystemProgram.programId,
  ];

  if (tx.instructions.length === 0) {
    throw new Error('Co-signed transaction has no instructions. Refusing to sign.');
  }

  let purchaseIxCount = 0;

  for (const ix of tx.instructions) {
    if (!allowedPrograms.some((p) => p.equals(ix.programId))) {
      throw new Error(
        `Co-signed transaction invokes unexpected program ${ix.programId.toBase58()}. ` +
          'Refusing to sign.'
      );
    }

    if (ix.programId.equals(SystemProgram.programId)) {
      const data = Buffer.from(ix.data);
      if (data.length >= 4 && data.readUInt32LE(0) === SYSTEM_TRANSFER_INDEX) {
        const source = ix.keys[0]?.pubkey;
        throw new Error(
          'Co-signed transaction contains a SystemProgram.transfer' +
            (source && source.equals(buyer) ? ' sourced from the buyer' : '') +
            ' — the purchase flow never moves SOL via a separate transfer. Refusing to sign.'
        );
      }
    }

    if (ix.programId.equals(marketplaceProgramId)) {
      const data = Buffer.from(ix.data);
      if (!startsWithDiscriminator(data, PURCHASE_EVIDENCE_DISCRIMINATOR)) {
        throw new Error(
          'Co-signed transaction invokes the marketplace program with an instruction ' +
            'other than purchase_evidence. Refusing to sign.'
        );
      }
      // Discriminator-only data is the current program ABI (price comes from
      // the listing PDA). If a price payload is present, it must match.
      if (data.length > PURCHASE_EVIDENCE_DISCRIMINATOR.length) {
        if (data.length < PURCHASE_EVIDENCE_DISCRIMINATOR.length + 8) {
          throw new Error(
            'purchase_evidence instruction data is malformed (truncated price payload). ' +
              'Refusing to sign.'
          );
        }
        const ixLamports = data.readBigUInt64LE(PURCHASE_EVIDENCE_DISCRIMINATOR.length);
        if (ixLamports !== BigInt(priceLamports)) {
          throw new Error(
            `purchase_evidence instruction charges ${ixLamports} lamports but the co-sign ` +
              `endpoint reported ${priceLamports} lamports. Refusing to sign.`
          );
        }
      }
      purchaseIxCount += 1;
    }
  }

  if (purchaseIxCount !== 1) {
    throw new Error(
      `Expected exactly one purchase_evidence instruction, found ${purchaseIxCount}. ` +
        'Refusing to sign.'
    );
  }
}
