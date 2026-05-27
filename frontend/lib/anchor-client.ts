/**
 * HypeChain — Evidence Locker client.
 *
 * Pure `@solana/web3.js` client for the Anchor program at
 * `contracts/programs/hypechain-marketplace/src/lib.rs`. No
 * `@coral-xyz/anchor` dependency — we hardcode the 8-byte instruction +
 * account discriminators and hand-roll the Borsh layouts.
 *
 * The PDA seed prefixes and Borsh field order MUST stay byte-identical
 * to the on-chain program. If you change one, change both.
 */

import {
  Connection,
  PublicKey,
  TransactionInstruction,
  SystemProgram,
} from '@solana/web3.js'
import { TOKEN_PROGRAM_ID } from '@solana/spl-token'

// ─────────────────────────────────────────────────────────────────────────────
// Program ID + threshold (must mirror the on-chain constant)
// ─────────────────────────────────────────────────────────────────────────────

export const PROGRAM_ID = new PublicKey(
  process.env.NEXT_PUBLIC_HYPECHAIN_PROGRAM_ID ||
    // Anchor placeholder — replace via `anchor keys sync` + deploy.
    'Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS'
)

/** Mirror of `MIN_CONFIDENCE_BPS` in the program. 50 % expressed in bps. */
export const MIN_CONFIDENCE_BPS = 5_000

// ─────────────────────────────────────────────────────────────────────────────
// PDA helpers — seeds MUST match the program byte-for-byte
// ─────────────────────────────────────────────────────────────────────────────

export function findDossierPda(authority: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('dossier'), authority.toBuffer()],
    PROGRAM_ID
  )
}

export function findVerificationPda(nftMint: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('verification'), nftMint.toBuffer()],
    PROGRAM_ID
  )
}

export function findListingPda(nftMint: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('evidence'), nftMint.toBuffer()],
    PROGRAM_ID
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Discriminators — sha256("global:<ix>")[0..8] / sha256("account:<Type>")[0..8].
// Provenance: see commit message — computed via Node `crypto` once and pinned
// here so the client has zero hash-at-runtime overhead.
// ─────────────────────────────────────────────────────────────────────────────

const IX_INIT_DOSSIER = Uint8Array.from([60, 164, 158, 113, 143, 45, 252, 114])
const IX_SUBMIT_VERIFICATION = Uint8Array.from([30, 19, 8, 156, 126, 43, 28, 175])
const IX_LIST_EVIDENCE = Uint8Array.from([110, 84, 14, 230, 70, 165, 24, 178])
const IX_DELIST_EVIDENCE = Uint8Array.from([254, 165, 215, 141, 71, 66, 11, 63])
const IX_PURCHASE_EVIDENCE = Uint8Array.from([3, 56, 164, 102, 111, 130, 253, 45])
const IX_FLAG_DISPUTE = Uint8Array.from([150, 222, 78, 72, 117, 140, 2, 75])

const ACCT_DOSSIER = Uint8Array.from([117, 129, 31, 17, 191, 3, 46, 72])
const ACCT_VERIFICATION = Uint8Array.from([173, 117, 59, 248, 202, 158, 93, 232])
const ACCT_LISTING = Uint8Array.from([158, 32, 222, 3, 220, 148, 119, 255])

// ─────────────────────────────────────────────────────────────────────────────
// Tiny Borsh codec — only what we need for fixed-size fields. Anchor data
// layouts are deterministic; we never round-trip through a generic decoder.
// ─────────────────────────────────────────────────────────────────────────────

class BinaryWriter {
  private parts: Buffer[] = []
  pushBytes(b: Uint8Array | Buffer): void {
    this.parts.push(Buffer.from(b))
  }
  u8(n: number): void {
    const b = Buffer.alloc(1); b.writeUInt8(n, 0); this.parts.push(b)
  }
  u16(n: number): void {
    const b = Buffer.alloc(2); b.writeUInt16LE(n, 0); this.parts.push(b)
  }
  u64(n: bigint): void {
    const b = Buffer.alloc(8); b.writeBigUInt64LE(n, 0); this.parts.push(b)
  }
  bool(v: boolean): void { this.u8(v ? 1 : 0) }
  fixedBytes(b: Uint8Array, len: number): void {
    if (b.length !== len) throw new Error(`expected ${len} bytes, got ${b.length}`)
    this.parts.push(Buffer.from(b))
  }
  build(): Buffer { return Buffer.concat(this.parts) }
}

class BinaryReader {
  private offset = 0
  constructor(private buf: Buffer) {}
  u8(): number { const v = this.buf.readUInt8(this.offset); this.offset += 1; return v }
  u16(): number { const v = this.buf.readUInt16LE(this.offset); this.offset += 2; return v }
  u32(): number { const v = this.buf.readUInt32LE(this.offset); this.offset += 4; return v }
  u64(): bigint { const v = this.buf.readBigUInt64LE(this.offset); this.offset += 8; return v }
  i64(): bigint { const v = this.buf.readBigInt64LE(this.offset); this.offset += 8; return v }
  bool(): boolean { return this.u8() === 1 }
  pubkey(): PublicKey {
    const v = new PublicKey(this.buf.subarray(this.offset, this.offset + 32))
    this.offset += 32
    return v
  }
  optionalPubkey(): PublicKey | null {
    const present = this.u8() === 1
    if (!present) return null
    return this.pubkey()
  }
  fixedBytes(n: number): Buffer {
    const v = this.buf.subarray(this.offset, this.offset + n)
    this.offset += n
    return Buffer.from(v)
  }
  expectDiscriminator(disc: Uint8Array): void {
    const head = this.buf.subarray(this.offset, this.offset + 8)
    this.offset += 8
    for (let i = 0; i < 8; i++) {
      if (head[i] !== disc[i]) throw new Error('Account discriminator mismatch')
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Types — mirror of the on-chain structs
// ─────────────────────────────────────────────────────────────────────────────

export enum ListingStatus {
  Pending = 0,
  Verified = 1,
  Listed = 2,
  Sold = 3,
  Delisted = 4,
  Disputed = 5,
}

export interface Dossier {
  authority: PublicKey
  casePrefix: Buffer        // 8 bytes, e.g. "HC-2026-"
  nextCaseNumber: number
  examiner: PublicKey
  bump: number
}

export interface VerificationProof {
  nftMint: PublicKey
  examiner: PublicKey
  confidenceBps: number
  verifiedAt: bigint         // unix timestamp in seconds
  modelName: Buffer          // 32 bytes, zero-padded UTF-8
  livenessPassed: boolean
  bump: number
}

export interface EvidenceListing {
  seller: PublicKey
  nftMint: PublicKey
  dossier: PublicKey
  verificationProof: PublicKey
  examiner: PublicKey
  custodian: PublicKey | null
  caseNumber: number
  priceLamports: bigint
  status: ListingStatus
  createdAt: bigint
  bump: number
}

// ─────────────────────────────────────────────────────────────────────────────
// Instruction builders
// ─────────────────────────────────────────────────────────────────────────────

export function buildInitDossierIx(params: {
  authority: PublicKey
  casePrefix: Uint8Array  // exactly 8 bytes
  examiner: PublicKey
}): TransactionInstruction {
  if (params.casePrefix.length !== 8) {
    throw new Error('casePrefix must be exactly 8 bytes')
  }
  const [dossier] = findDossierPda(params.authority)
  const w = new BinaryWriter()
  w.pushBytes(IX_INIT_DOSSIER)
  w.fixedBytes(params.casePrefix, 8)
  w.fixedBytes(params.examiner.toBuffer(), 32)

  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: params.authority, isSigner: true, isWritable: true },
      { pubkey: dossier, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: w.build(),
  })
}

export function buildSubmitVerificationIx(params: {
  examiner: PublicKey
  nftMint: PublicKey
  dossierAuthority: PublicKey
  confidenceBps: number
  modelName: Uint8Array  // 32 bytes, zero-padded UTF-8
  livenessPassed: boolean
}): TransactionInstruction {
  if (params.modelName.length !== 32) {
    throw new Error('modelName must be exactly 32 bytes (zero-pad if shorter)')
  }
  const [dossier] = findDossierPda(params.dossierAuthority)
  const [verification] = findVerificationPda(params.nftMint)
  const w = new BinaryWriter()
  w.pushBytes(IX_SUBMIT_VERIFICATION)
  w.u16(params.confidenceBps)
  w.fixedBytes(params.modelName, 32)
  w.bool(params.livenessPassed)

  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: params.examiner, isSigner: true, isWritable: true },
      { pubkey: params.nftMint, isSigner: false, isWritable: false },
      { pubkey: dossier, isSigner: false, isWritable: false },
      { pubkey: verification, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: w.build(),
  })
}

export function buildListEvidenceIx(params: {
  seller: PublicKey
  nftMint: PublicKey
  priceLamports: bigint
}): TransactionInstruction {
  const [dossier] = findDossierPda(params.seller)
  const [verification] = findVerificationPda(params.nftMint)
  const [listing] = findListingPda(params.nftMint)
  const w = new BinaryWriter()
  w.pushBytes(IX_LIST_EVIDENCE)
  w.u64(params.priceLamports)

  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: params.seller, isSigner: true, isWritable: true },
      { pubkey: params.nftMint, isSigner: false, isWritable: false },
      { pubkey: dossier, isSigner: false, isWritable: true },
      // `authority` UncheckedAccount — must equal `seller`; passed because
      // Anchor's has_one constraint resolves the alias by name.
      { pubkey: params.seller, isSigner: false, isWritable: false },
      { pubkey: verification, isSigner: false, isWritable: false },
      { pubkey: listing, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: w.build(),
  })
}

export function buildDelistEvidenceIx(params: {
  seller: PublicKey
  nftMint: PublicKey
}): TransactionInstruction {
  const [listing] = findListingPda(params.nftMint)
  const w = new BinaryWriter()
  w.pushBytes(IX_DELIST_EVIDENCE)

  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: params.seller, isSigner: true, isWritable: false },
      { pubkey: listing, isSigner: false, isWritable: true },
    ],
    data: w.build(),
  })
}

export function buildPurchaseEvidenceIx(params: {
  buyer: PublicKey
  seller: PublicKey
  nftMint: PublicKey
  sellerTokenAccount: PublicKey
  buyerTokenAccount: PublicKey
}): TransactionInstruction {
  const [listing] = findListingPda(params.nftMint)
  const w = new BinaryWriter()
  w.pushBytes(IX_PURCHASE_EVIDENCE)

  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: params.buyer, isSigner: true, isWritable: true },
      { pubkey: params.seller, isSigner: true, isWritable: true },
      { pubkey: listing, isSigner: false, isWritable: true },
      { pubkey: params.sellerTokenAccount, isSigner: false, isWritable: true },
      { pubkey: params.buyerTokenAccount, isSigner: false, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: w.build(),
  })
}

export function buildFlagDisputeIx(params: {
  signer: PublicKey      // must be seller or examiner — program enforces
  nftMint: PublicKey
  reason: number          // u8; meaning defined off-chain
}): TransactionInstruction {
  if (params.reason < 0 || params.reason > 255) {
    throw new Error('reason must fit in u8 (0-255)')
  }
  const [listing] = findListingPda(params.nftMint)
  const w = new BinaryWriter()
  w.pushBytes(IX_FLAG_DISPUTE)
  w.u8(params.reason)

  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: params.signer, isSigner: true, isWritable: false },
      { pubkey: listing, isSigner: false, isWritable: true },
    ],
    data: w.build(),
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// Account fetchers + decoders
// ─────────────────────────────────────────────────────────────────────────────

function decodeListingStatus(tag: number): ListingStatus {
  if (tag < 0 || tag > 5) throw new Error(`unknown ListingStatus tag ${tag}`)
  return tag as ListingStatus
}

export function decodeDossier(buf: Buffer): Dossier {
  const r = new BinaryReader(buf)
  r.expectDiscriminator(ACCT_DOSSIER)
  return {
    authority: r.pubkey(),
    casePrefix: r.fixedBytes(8),
    nextCaseNumber: r.u32(),
    examiner: r.pubkey(),
    bump: r.u8(),
  }
}

export function decodeVerificationProof(buf: Buffer): VerificationProof {
  const r = new BinaryReader(buf)
  r.expectDiscriminator(ACCT_VERIFICATION)
  return {
    nftMint: r.pubkey(),
    examiner: r.pubkey(),
    confidenceBps: r.u16(),
    verifiedAt: r.i64(),
    modelName: r.fixedBytes(32),
    livenessPassed: r.bool(),
    bump: r.u8(),
  }
}

export function decodeEvidenceListing(buf: Buffer): EvidenceListing {
  const r = new BinaryReader(buf)
  r.expectDiscriminator(ACCT_LISTING)
  return {
    seller: r.pubkey(),
    nftMint: r.pubkey(),
    dossier: r.pubkey(),
    verificationProof: r.pubkey(),
    examiner: r.pubkey(),
    custodian: r.optionalPubkey(),
    caseNumber: r.u32(),
    priceLamports: r.u64(),
    status: decodeListingStatus(r.u8()),
    createdAt: r.i64(),
    bump: r.u8(),
  }
}

export async function fetchDossier(
  connection: Connection,
  authority: PublicKey
): Promise<Dossier | null> {
  const [pda] = findDossierPda(authority)
  const account = await connection.getAccountInfo(pda, 'confirmed')
  if (!account) return null
  return decodeDossier(account.data)
}

export async function fetchVerificationProof(
  connection: Connection,
  nftMint: PublicKey
): Promise<VerificationProof | null> {
  const [pda] = findVerificationPda(nftMint)
  const account = await connection.getAccountInfo(pda, 'confirmed')
  if (!account) return null
  return decodeVerificationProof(account.data)
}

export async function fetchEvidenceListing(
  connection: Connection,
  nftMint: PublicKey
): Promise<EvidenceListing | null> {
  const [pda] = findListingPda(nftMint)
  const account = await connection.getAccountInfo(pda, 'confirmed')
  if (!account) return null
  return decodeEvidenceListing(account.data)
}

// ─────────────────────────────────────────────────────────────────────────────
// Convenience helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Build "HC-2026-" → 8-byte fixed-length prefix used by `init_dossier`. */
export function casePrefixBytes(prefix: string): Uint8Array {
  const buf = Buffer.alloc(8)
  Buffer.from(prefix, 'utf8').copy(buf)
  return new Uint8Array(buf)
}

/** Zero-pad a model identifier (e.g. "VISION-4O") to 32 bytes. */
export function modelNameBytes(name: string): Uint8Array {
  const buf = Buffer.alloc(32)
  Buffer.from(name, 'utf8').copy(buf)
  return new Uint8Array(buf)
}

/** Format a dossier's case file label: "HC-2026-000042" given case_number 42. */
export function formatCaseLabel(dossier: Dossier, caseNumber: number): string {
  const prefix = dossier.casePrefix.toString('utf8').replace(/\0+$/, '')
  return `${prefix}${caseNumber.toString().padStart(6, '0')}`
}
