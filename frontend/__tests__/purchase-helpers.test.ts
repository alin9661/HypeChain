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
import { assertPriceMatches, deserializeCosignedTx } from '@/lib/purchase-helpers';

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
