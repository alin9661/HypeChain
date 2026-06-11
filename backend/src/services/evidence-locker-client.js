/**
 * Backend client for the HypeChain Evidence Locker program.
 *
 * Mirror of `frontend/lib/anchor-client.ts` ported to ESM JavaScript so the
 * backend can build and sign instructions without pulling in TypeScript /
 * `@coral-xyz/anchor`. If you change PDA seeds or discriminators here, you
 * MUST mirror the change in the frontend client — or every call will fail
 * with `ConstraintSeeds`.
 */

import {
  PublicKey,
  TransactionInstruction,
  SystemProgram,
} from '@solana/web3.js';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';

export const PROGRAM_ID = new PublicKey(
  process.env.HACKNYU_MARKETPLACE_PROGRAM_ID ||
    'Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS'
);

export const MIN_CONFIDENCE_BPS = 5000;

// ─── PDA seeds ────────────────────────────────────────────────────────────

export function findDossierPda(authority) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('dossier'), authority.toBuffer()],
    PROGRAM_ID
  );
}

export function findVerificationPda(nftMint) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('verification'), nftMint.toBuffer()],
    PROGRAM_ID
  );
}

export function findListingPda(nftMint) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('evidence'), nftMint.toBuffer()],
    PROGRAM_ID
  );
}

// ─── Listing status — mirror of the on-chain enum ─────────────────────────

export const ListingStatus = Object.freeze({
  Pending: 0,
  Verified: 1,
  Listed: 2,
  Sold: 3,
  Delisted: 4,
  Disputed: 5,
});

// ─── Discriminators — sha256("global:<ix>")[0..8] ─────────────────────────

const IX_INIT_DOSSIER = Buffer.from([60, 164, 158, 113, 143, 45, 252, 114]);
const IX_SUBMIT_VERIFICATION = Buffer.from([30, 19, 8, 156, 126, 43, 28, 175]);
const IX_LIST_EVIDENCE = Buffer.from([110, 84, 14, 230, 70, 165, 24, 178]);
const IX_DELIST_EVIDENCE = Buffer.from([254, 165, 215, 141, 71, 66, 11, 63]);
const IX_PURCHASE_EVIDENCE = Buffer.from([3, 56, 164, 102, 111, 130, 253, 45]);
const IX_FLAG_DISPUTE = Buffer.from([150, 222, 78, 72, 117, 140, 2, 75]);

// ─── Helpers ──────────────────────────────────────────────────────────────

function u8(n) { const b = Buffer.alloc(1); b.writeUInt8(n, 0); return b; }
function u16(n) { const b = Buffer.alloc(2); b.writeUInt16LE(n, 0); return b; }
function u64(n) { const b = Buffer.alloc(8); b.writeBigUInt64LE(BigInt(n), 0); return b; }
function pubkey(pk) { return pk.toBuffer(); }
function fixedBytes(buf, len) {
  if (buf.length !== len) throw new Error(`expected ${len} bytes, got ${buf.length}`);
  return Buffer.from(buf);
}

export function casePrefixBytes(prefix) {
  const out = Buffer.alloc(8);
  Buffer.from(prefix, 'utf8').copy(out);
  return out;
}

export function modelNameBytes(name) {
  const out = Buffer.alloc(32);
  Buffer.from(name, 'utf8').copy(out);
  return out;
}

// ─── Instruction builders ─────────────────────────────────────────────────

export function buildInitDossierIx({ authority, casePrefix, examiner }) {
  const [dossier] = findDossierPda(authority);
  const data = Buffer.concat([
    IX_INIT_DOSSIER,
    fixedBytes(casePrefix, 8),
    pubkey(examiner),
  ]);
  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: authority, isSigner: true, isWritable: true },
      { pubkey: dossier, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data,
  });
}

export function buildSubmitVerificationIx({
  examiner,
  nftMint,
  dossierAuthority,
  confidenceBps,
  modelName,
  livenessPassed,
}) {
  const [dossier] = findDossierPda(dossierAuthority);
  const [verification] = findVerificationPda(nftMint);
  const data = Buffer.concat([
    IX_SUBMIT_VERIFICATION,
    u16(confidenceBps),
    fixedBytes(modelName, 32),
    u8(livenessPassed ? 1 : 0),
  ]);
  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: examiner, isSigner: true, isWritable: true },
      { pubkey: nftMint, isSigner: false, isWritable: false },
      { pubkey: dossier, isSigner: false, isWritable: false },
      { pubkey: verification, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data,
  });
}

export function buildListEvidenceIx({ seller, nftMint, priceLamports }) {
  const [dossier] = findDossierPda(seller);
  const [verification] = findVerificationPda(nftMint);
  const [listing] = findListingPda(nftMint);
  const data = Buffer.concat([IX_LIST_EVIDENCE, u64(priceLamports)]);
  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: seller, isSigner: true, isWritable: true },
      { pubkey: nftMint, isSigner: false, isWritable: false },
      { pubkey: dossier, isSigner: false, isWritable: true },
      // authority UncheckedAccount alias — must equal seller
      { pubkey: seller, isSigner: false, isWritable: false },
      { pubkey: verification, isSigner: false, isWritable: false },
      { pubkey: listing, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data,
  });
}

export function buildDelistEvidenceIx({ seller, nftMint }) {
  const [listing] = findListingPda(nftMint);
  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: seller, isSigner: true, isWritable: false },
      { pubkey: listing, isSigner: false, isWritable: true },
    ],
    data: IX_DELIST_EVIDENCE,
  });
}

export function buildPurchaseEvidenceIx({
  buyer,
  seller,
  nftMint,
  sellerTokenAccount,
  buyerTokenAccount,
}) {
  const [listing] = findListingPda(nftMint);
  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: buyer, isSigner: true, isWritable: true },
      { pubkey: seller, isSigner: true, isWritable: true },
      { pubkey: listing, isSigner: false, isWritable: true },
      { pubkey: sellerTokenAccount, isSigner: false, isWritable: true },
      { pubkey: buyerTokenAccount, isSigner: false, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: IX_PURCHASE_EVIDENCE,
  });
}

// ─── Account decoding — mirror of frontend/lib/anchor-client.ts ────────────
//
// Account discriminator = sha256("account:EvidenceListing")[0..8]. Pinned in
// both clients; the cosign test suite round-trips an encoded fixture so any
// drift fails loudly (TODOS.md P2 mitigation).

const ACCT_LISTING = Buffer.from([158, 32, 222, 3, 220, 148, 119, 255]);

class BinaryReader {
  constructor(buf) {
    this.buf = buf;
    this.offset = 0;
  }
  u8() { const v = this.buf.readUInt8(this.offset); this.offset += 1; return v; }
  u32() { const v = this.buf.readUInt32LE(this.offset); this.offset += 4; return v; }
  u64() { const v = this.buf.readBigUInt64LE(this.offset); this.offset += 8; return v; }
  i64() { const v = this.buf.readBigInt64LE(this.offset); this.offset += 8; return v; }
  pubkey() {
    const v = new PublicKey(this.buf.subarray(this.offset, this.offset + 32));
    this.offset += 32;
    return v;
  }
  optionalPubkey() {
    return this.u8() === 1 ? this.pubkey() : null;
  }
  expectDiscriminator(disc) {
    const head = this.buf.subarray(this.offset, this.offset + 8);
    this.offset += 8;
    for (let i = 0; i < 8; i++) {
      if (head[i] !== disc[i]) throw new Error('Account discriminator mismatch');
    }
  }
}

export function decodeEvidenceListing(buf) {
  const r = new BinaryReader(buf);
  r.expectDiscriminator(ACCT_LISTING);
  return {
    seller: r.pubkey(),
    nftMint: r.pubkey(),
    dossier: r.pubkey(),
    verificationProof: r.pubkey(),
    examiner: r.pubkey(),
    custodian: r.optionalPubkey(),
    caseNumber: r.u32(),
    priceLamports: r.u64(),
    status: r.u8(),
    createdAt: r.i64(),
    bump: r.u8(),
  };
}

export async function fetchEvidenceListing(connection, nftMint) {
  const [pda] = findListingPda(nftMint);
  const account = await connection.getAccountInfo(pda, 'confirmed');
  if (!account) return null;
  return decodeEvidenceListing(account.data);
}

export function buildFlagDisputeIx({ signer, nftMint, reason }) {
  const [listing] = findListingPda(nftMint);
  const data = Buffer.concat([IX_FLAG_DISPUTE, u8(reason)]);
  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: signer, isSigner: true, isWritable: false },
      { pubkey: listing, isSigner: false, isWritable: true },
    ],
    data,
  });
}
