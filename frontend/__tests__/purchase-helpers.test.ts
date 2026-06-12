/**
 * @jest-environment node
 *
 * Unit tests for purchase-helpers (PR2 co-sign flow client guards).
 * Node environment: jsdom's Uint8Array is a different realm than Node's
 * Buffer, which breaks web3.js transaction serialization (`b must be a
 * Uint8Array`). These helpers are DOM-free.
 */

import {
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} from '@solana/web3.js';
import { ASSOCIATED_TOKEN_PROGRAM_ID, TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { PROGRAM_ID } from '@/lib/anchor-client';
import {
  assertCosignedInstructions,
  assertPriceMatches,
  deserializeCosignedTx,
} from '@/lib/purchase-helpers';

function makeTx(feePayer: PublicKey): Transaction {
  const tx = new Transaction({
    feePayer,
    blockhash: Keypair.generate().publicKey.toBase58(),
    lastValidBlockHeight: 1,
  });
  // web3.js refuses to serialize an instruction-less transaction. A raw
  // instruction avoids SystemProgram.transfer's bigint-buffer encoding,
  // which breaks under the jsdom test environment.
  tx.add(
    new TransactionInstruction({
      programId: SystemProgram.programId,
      keys: [{ pubkey: feePayer, isSigner: true, isWritable: true }],
      data: Buffer.alloc(0),
    })
  );
  return tx;
}

describe('assertPriceMatches', () => {
  it('passes when the displayed SOL equals the lamports the server will charge', () => {
    expect(() => assertPriceMatches(0.01, '10000000')).not.toThrow();
    expect(() => assertPriceMatches(1.5, String(1.5 * LAMPORTS_PER_SOL))).not.toThrow();
  });

  it('throws on any mismatch', () => {
    expect(() => assertPriceMatches(0.01, '10000001')).toThrow(/price/i);
    expect(() => assertPriceMatches(0.02, '10000000')).toThrow(/price/i);
  });
});

describe('deserializeCosignedTx', () => {
  it('returns the transaction when the fee payer is the buyer', () => {
    const buyer = Keypair.generate();
    const base64 = makeTx(buyer.publicKey)
      .serialize({ requireAllSignatures: false, verifySignatures: false })
      .toString('base64');

    const restored = deserializeCosignedTx(base64, buyer.publicKey);
    expect(restored.feePayer?.equals(buyer.publicKey)).toBe(true);
  });

  it('rejects a transaction whose fee payer is not the buyer', () => {
    const buyer = Keypair.generate();
    const attacker = Keypair.generate();
    const tx = makeTx(attacker.publicKey);
    tx.partialSign(attacker);
    const base64 = tx
      .serialize({ requireAllSignatures: false, verifySignatures: false })
      .toString('base64');
    expect(() => deserializeCosignedTx(base64, buyer.publicKey)).toThrow(/fee payer/i);
  });
});

describe('assertCosignedInstructions', () => {
  /** sha256("global:purchase_evidence")[0..8] — pinned in both clients. */
  const PURCHASE_DISC = Buffer.from([3, 56, 164, 102, 111, 130, 253, 45]);
  const PRICE_LAMPORTS = '10000000';

  function u64le(n: bigint): Buffer {
    const b = Buffer.alloc(8);
    b.writeBigUInt64LE(n, 0);
    return b;
  }

  /**
   * Mirror of backend/src/services/cosign-purchase.js: ATA-create-idempotent
   * (buyer pays rent inside the ATA program) + purchase_evidence on the
   * marketplace program.
   */
  function makeCosignedTx(
    buyer: PublicKey,
    {
      purchaseProgramId = PROGRAM_ID,
      purchaseData = PURCHASE_DISC,
    }: { purchaseProgramId?: PublicKey; purchaseData?: Buffer } = {}
  ): Transaction {
    const seller = Keypair.generate().publicKey;
    const mint = Keypair.generate().publicKey;
    const tx = new Transaction({
      feePayer: buyer,
      blockhash: Keypair.generate().publicKey.toBase58(),
      lastValidBlockHeight: 1,
    });
    tx.add(
      new TransactionInstruction({
        programId: ASSOCIATED_TOKEN_PROGRAM_ID,
        keys: [
          { pubkey: buyer, isSigner: true, isWritable: true },
          { pubkey: Keypair.generate().publicKey, isSigner: false, isWritable: true },
          { pubkey: buyer, isSigner: false, isWritable: false },
          { pubkey: mint, isSigner: false, isWritable: false },
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
          { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        ],
        data: Buffer.from([1]), // CreateIdempotent
      }),
      new TransactionInstruction({
        programId: purchaseProgramId,
        keys: [
          { pubkey: buyer, isSigner: true, isWritable: true },
          { pubkey: seller, isSigner: true, isWritable: true },
        ],
        data: purchaseData,
      })
    );
    return tx;
  }

  it('accepts the canonical co-signed tx (ATA create + purchase_evidence)', () => {
    const buyer = Keypair.generate().publicKey;
    const tx = makeCosignedTx(buyer);
    expect(() => assertCosignedInstructions(tx, buyer, PRICE_LAMPORTS)).not.toThrow();
  });

  it('accepts a purchase_evidence ix that embeds the matching lamports after the discriminator', () => {
    const buyer = Keypair.generate().publicKey;
    const tx = makeCosignedTx(buyer, {
      purchaseData: Buffer.concat([PURCHASE_DISC, u64le(BigInt(PRICE_LAMPORTS))]),
    });
    expect(() => assertCosignedInstructions(tx, buyer, PRICE_LAMPORTS)).not.toThrow();
  });

  it('rejects an instruction whose program id is not in the allowlist (tampered program id)', () => {
    const buyer = Keypair.generate().publicKey;
    const tx = makeCosignedTx(buyer, {
      purchaseProgramId: Keypair.generate().publicKey,
    });
    expect(() => assertCosignedInstructions(tx, buyer, PRICE_LAMPORTS)).toThrow(/program/i);
  });

  it('rejects a purchase_evidence ix whose embedded lamports disagree with the cosign price', () => {
    const buyer = Keypair.generate().publicKey;
    const tx = makeCosignedTx(buyer, {
      purchaseData: Buffer.concat([PURCHASE_DISC, u64le(BigInt(PRICE_LAMPORTS) + BigInt(1))]),
    });
    expect(() => assertCosignedInstructions(tx, buyer, PRICE_LAMPORTS)).toThrow(/lamports/i);
  });

  it('rejects an extra SystemProgram.transfer draining the buyer', () => {
    const buyer = Keypair.generate().publicKey;
    const tx = makeCosignedTx(buyer);
    tx.add(
      SystemProgram.transfer({
        fromPubkey: buyer,
        toPubkey: Keypair.generate().publicKey,
        lamports: 1_000_000,
      })
    );
    expect(() => assertCosignedInstructions(tx, buyer, PRICE_LAMPORTS)).toThrow(/transfer/i);
  });

  it('rejects a tx with no purchase_evidence instruction', () => {
    const buyer = Keypair.generate().publicKey;
    const tx = makeCosignedTx(buyer, {
      purchaseData: Buffer.from([9, 9, 9, 9, 9, 9, 9, 9]),
    });
    expect(() => assertCosignedInstructions(tx, buyer, PRICE_LAMPORTS)).toThrow(
      /purchase_evidence/i
    );
  });
});
