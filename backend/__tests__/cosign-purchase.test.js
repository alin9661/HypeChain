/**
 * Tests for the custodial co-sign purchase service (PR2).
 *
 * The service is pure given injected deps — no network, no env. The stub
 * connection serves hand-encoded account buffers so the EvidenceListing
 * decoder is exercised against the same pinned discriminators the program
 * emits (drift mitigation for TODOS.md P2).
 */

import { describe, it, expect } from 'bun:test';
import { Keypair, Transaction } from '@solana/web3.js';
import {
  getAssociatedTokenAddressSync,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from '@solana/spl-token';

import {
  decodeEvidenceListing,
  fetchEvidenceListing,
  findListingPda,
  ListingStatus,
  PROGRAM_ID,
} from '../src/services/evidence-locker-client.js';
import {
  buildCosignedPurchaseTx,
  CosignError,
} from '../src/services/cosign-purchase.js';

// ─── Fixture encoding (mirror of decodeEvidenceListing) ───────────────────

const ACCT_LISTING = Buffer.from([158, 32, 222, 3, 220, 148, 119, 255]);
const IX_PURCHASE_EVIDENCE = Buffer.from([3, 56, 164, 102, 111, 130, 253, 45]);

function u32(n) { const b = Buffer.alloc(4); b.writeUInt32LE(n, 0); return b; }
function u64(n) { const b = Buffer.alloc(8); b.writeBigUInt64LE(BigInt(n), 0); return b; }
function i64(n) { const b = Buffer.alloc(8); b.writeBigInt64LE(BigInt(n), 0); return b; }
function u8(n) { const b = Buffer.alloc(1); b.writeUInt8(n, 0); return b; }

function encodeEvidenceListing({
  seller,
  nftMint,
  dossier = Keypair.generate().publicKey,
  verificationProof = Keypair.generate().publicKey,
  examiner = Keypair.generate().publicKey,
  custodian = null,
  caseNumber = 1,
  priceLamports = 10_000_000n,
  status = ListingStatus.Listed,
  createdAt = 1_700_000_000n,
  bump = 254,
}) {
  return Buffer.concat([
    ACCT_LISTING,
    seller.toBuffer(),
    nftMint.toBuffer(),
    dossier.toBuffer(),
    verificationProof.toBuffer(),
    examiner.toBuffer(),
    custodian ? Buffer.concat([u8(1), custodian.toBuffer()]) : u8(0),
    u32(caseNumber),
    u64(priceLamports),
    u8(status),
    i64(createdAt),
    u8(bump),
  ]);
}

/** SPL token account: mint(32) + owner(32) + amount(u64 LE at offset 64) + padding. */
function encodeTokenAccount({ mint, owner, amount }) {
  const buf = Buffer.alloc(165);
  mint.toBuffer().copy(buf, 0);
  owner.toBuffer().copy(buf, 32);
  buf.writeBigUInt64LE(BigInt(amount), 64);
  return buf;
}

function stubConnection(accounts) {
  const fakeBlockhash = Keypair.generate().publicKey.toBase58();
  return {
    async getAccountInfo(pubkey) {
      const data = accounts[pubkey.toBase58()];
      return data ? { data } : null;
    },
    async getLatestBlockhash() {
      return { blockhash: fakeBlockhash, lastValidBlockHeight: 12345 };
    },
  };
}

// ─── Common fixture ────────────────────────────────────────────────────────

function makeFixture(overrides = {}) {
  const serverWallet = Keypair.generate();
  const buyer = Keypair.generate();
  const nftMint = Keypair.generate().publicKey;
  const [listingPda] = findListingPda(nftMint);
  const sellerAta = getAssociatedTokenAddressSync(nftMint, serverWallet.publicKey);

  const chain = {
    seller: serverWallet.publicKey,
    nftMint,
    priceLamports: 10_000_000n, // 0.01 SOL
    status: ListingStatus.Listed,
    ...overrides.chain,
  };

  const accounts = {
    [listingPda.toBase58()]: encodeEvidenceListing(chain),
    [sellerAta.toBase58()]: encodeTokenAccount({
      mint: nftMint,
      owner: serverWallet.publicKey,
      amount: overrides.sellerAtaAmount ?? 1,
    }),
    ...overrides.accounts,
  };
  if (overrides.omitListingAccount) delete accounts[listingPda.toBase58()];
  if (overrides.omitSellerAta) delete accounts[sellerAta.toBase58()];

  const listingRow = {
    id: 'listing-uuid-1',
    nft_mint_address: nftMint.toBase58(),
    price_sol: 0.01,
    seller_wallet: serverWallet.publicKey.toBase58(),
    status: 'active',
    ...overrides.listingRow,
  };

  return {
    serverWallet,
    buyer,
    nftMint,
    listingPda,
    sellerAta,
    listingRow,
    connection: stubConnection(accounts),
  };
}

async function expectCosignError(promise, code, httpStatus) {
  let thrown;
  try {
    await promise;
  } catch (e) {
    thrown = e;
  }
  expect(thrown).toBeInstanceOf(CosignError);
  expect(thrown.code).toBe(code);
  expect(thrown.httpStatus).toBe(httpStatus);
}

// ─── Decoder (P2 discriminator-drift mitigation) ───────────────────────────

describe('decodeEvidenceListing', () => {
  it('round-trips an encoded fixture with the pinned discriminator', () => {
    const seller = Keypair.generate().publicKey;
    const nftMint = Keypair.generate().publicKey;
    const custodian = Keypair.generate().publicKey;
    const buf = encodeEvidenceListing({
      seller,
      nftMint,
      custodian,
      caseNumber: 42,
      priceLamports: 123_456_789n,
      status: ListingStatus.Delisted,
    });
    const decoded = decodeEvidenceListing(buf);
    expect(decoded.seller.equals(seller)).toBe(true);
    expect(decoded.nftMint.equals(nftMint)).toBe(true);
    expect(decoded.custodian.equals(custodian)).toBe(true);
    expect(decoded.caseNumber).toBe(42);
    expect(decoded.priceLamports).toBe(123_456_789n);
    expect(decoded.status).toBe(ListingStatus.Delisted);
  });

  it('decodes custodian None and rejects a wrong discriminator', () => {
    const buf = encodeEvidenceListing({
      seller: Keypair.generate().publicKey,
      nftMint: Keypair.generate().publicKey,
    });
    expect(decodeEvidenceListing(buf).custodian).toBe(null);

    const corrupted = Buffer.from(buf);
    corrupted[0] ^= 0xff;
    expect(() => decodeEvidenceListing(corrupted)).toThrow(/discriminator/i);
  });

  it('fetchEvidenceListing returns null for a missing account', async () => {
    const conn = stubConnection({});
    const listing = await fetchEvidenceListing(conn, Keypair.generate().publicKey);
    expect(listing).toBe(null);
  });
});

// ─── Happy path ────────────────────────────────────────────────────────────

describe('buildCosignedPurchaseTx — happy path', () => {
  it('builds ATA-idempotent ix first and purchase_evidence second with the pinned discriminator', async () => {
    const f = makeFixture();
    const result = await buildCosignedPurchaseTx({
      connection: f.connection,
      serverWallet: f.serverWallet,
      listingRow: f.listingRow,
      buyerWallet: f.buyer.publicKey.toBase58(),
    });

    const tx = Transaction.from(Buffer.from(result.transactionBase64, 'base64'));
    expect(tx.instructions.length).toBe(2);
    expect(tx.instructions[0].programId.equals(ASSOCIATED_TOKEN_PROGRAM_ID)).toBe(true);
    expect(tx.instructions[1].programId.equals(PROGRAM_ID)).toBe(true);
    expect(Buffer.from(tx.instructions[1].data).equals(IX_PURCHASE_EVIDENCE)).toBe(true);
  });

  it('sets feePayer to the buyer, carries a valid seller signature, and leaves the buyer slot empty', async () => {
    const f = makeFixture();
    const result = await buildCosignedPurchaseTx({
      connection: f.connection,
      serverWallet: f.serverWallet,
      listingRow: f.listingRow,
      buyerWallet: f.buyer.publicKey.toBase58(),
    });

    const tx = Transaction.from(Buffer.from(result.transactionBase64, 'base64'));
    expect(tx.feePayer.equals(f.buyer.publicKey)).toBe(true);

    const sellerSig = tx.signatures.find((s) => s.publicKey.equals(f.serverWallet.publicKey));
    const buyerSig = tx.signatures.find((s) => s.publicKey.equals(f.buyer.publicKey));
    expect(sellerSig?.signature).not.toBe(null);
    expect(buyerSig?.signature).toBe(null);
    // verifySignatures(false) checks present signatures only.
    expect(tx.verifySignatures(false)).toBe(true);
  });

  it('returns chain-derived price and metadata', async () => {
    const f = makeFixture();
    const result = await buildCosignedPurchaseTx({
      connection: f.connection,
      serverWallet: f.serverWallet,
      listingRow: f.listingRow,
      buyerWallet: f.buyer.publicKey.toBase58(),
    });
    expect(result.priceLamports).toBe('10000000');
    expect(result.priceSol).toBeCloseTo(0.01);
    expect(result.nftMint).toBe(f.nftMint.toBase58());
    expect(result.listingPda).toBe(f.listingPda.toBase58());
    expect(result.seller).toBe(f.serverWallet.publicKey.toBase58());
    expect(typeof result.blockhash).toBe('string');
    expect(result.lastValidBlockHeight).toBe(12345);
  });
});

// ─── Rejections ────────────────────────────────────────────────────────────

describe('buildCosignedPurchaseTx — rejections', () => {
  it('rejects an unparseable buyer wallet (400 INVALID_BUYER_WALLET)', async () => {
    const f = makeFixture();
    await expectCosignError(
      buildCosignedPurchaseTx({
        connection: f.connection,
        serverWallet: f.serverWallet,
        listingRow: f.listingRow,
        buyerWallet: 'definitely-not-base58!!!',
      }),
      'INVALID_BUYER_WALLET',
      400
    );
  });

  it('rejects buyer == custodial seller (400 SELF_PURCHASE)', async () => {
    const f = makeFixture();
    await expectCosignError(
      buildCosignedPurchaseTx({
        connection: f.connection,
        serverWallet: f.serverWallet,
        listingRow: f.listingRow,
        buyerWallet: f.serverWallet.publicKey.toBase58(),
      }),
      'SELF_PURCHASE',
      400
    );
  });

  it('rejects a DB row without a mint address (409 LISTING_NOT_ON_CHAIN)', async () => {
    const f = makeFixture({ listingRow: { nft_mint_address: null } });
    await expectCosignError(
      buildCosignedPurchaseTx({
        connection: f.connection,
        serverWallet: f.serverWallet,
        listingRow: f.listingRow,
        buyerWallet: f.buyer.publicKey.toBase58(),
      }),
      'LISTING_NOT_ON_CHAIN',
      409
    );
  });

  it('rejects a missing on-chain listing account (409 LISTING_NOT_ON_CHAIN)', async () => {
    const f = makeFixture({ omitListingAccount: true });
    await expectCosignError(
      buildCosignedPurchaseTx({
        connection: f.connection,
        serverWallet: f.serverWallet,
        listingRow: f.listingRow,
        buyerWallet: f.buyer.publicKey.toBase58(),
      }),
      'LISTING_NOT_ON_CHAIN',
      409
    );
  });

  for (const [label, status] of [
    ['Sold', ListingStatus.Sold],
    ['Delisted', ListingStatus.Delisted],
    ['Disputed', ListingStatus.Disputed],
  ]) {
    it(`rejects chain status ${label} (409 LISTING_NOT_PURCHASABLE)`, async () => {
      const f = makeFixture({ chain: { status } });
      await expectCosignError(
        buildCosignedPurchaseTx({
          connection: f.connection,
          serverWallet: f.serverWallet,
          listingRow: f.listingRow,
          buyerWallet: f.buyer.publicKey.toBase58(),
        }),
        'LISTING_NOT_PURCHASABLE',
        409
      );
    });
  }

  it('rejects a genuine user-wallet listing (DB seller matches chain seller) with 409 SELLER_NOT_CUSTODIAL', async () => {
    const userSeller = Keypair.generate().publicKey;
    const f = makeFixture({
      chain: { seller: userSeller },
      listingRow: { seller_wallet: userSeller.toBase58() },
    });
    await expectCosignError(
      buildCosignedPurchaseTx({
        connection: f.connection,
        serverWallet: f.serverWallet,
        listingRow: f.listingRow,
        buyerWallet: f.buyer.publicKey.toBase58(),
      }),
      'SELLER_NOT_CUSTODIAL',
      409
    );
  });

  it('rejects DB/chain price drift (409 PRICE_MISMATCH)', async () => {
    const f = makeFixture({ listingRow: { price_sol: 0.02 } });
    await expectCosignError(
      buildCosignedPurchaseTx({
        connection: f.connection,
        serverWallet: f.serverWallet,
        listingRow: f.listingRow,
        buyerWallet: f.buyer.publicKey.toBase58(),
      }),
      'PRICE_MISMATCH',
      409
    );
  });

  it('rejects a missing seller ATA (409 NFT_NOT_IN_CUSTODY)', async () => {
    const f = makeFixture({ omitSellerAta: true });
    await expectCosignError(
      buildCosignedPurchaseTx({
        connection: f.connection,
        serverWallet: f.serverWallet,
        listingRow: f.listingRow,
        buyerWallet: f.buyer.publicKey.toBase58(),
      }),
      'NFT_NOT_IN_CUSTODY',
      409
    );
  });

  it('rejects an empty seller ATA (409 NFT_NOT_IN_CUSTODY)', async () => {
    const f = makeFixture({ sellerAtaAmount: 0 });
    await expectCosignError(
      buildCosignedPurchaseTx({
        connection: f.connection,
        serverWallet: f.serverWallet,
        listingRow: f.listingRow,
        buyerWallet: f.buyer.publicKey.toBase58(),
      }),
      'NFT_NOT_IN_CUSTODY',
      409
    );
  });
});

// ─── Custodial key drift (fix 2) ───────────────────────────────────────────

describe('buildCosignedPurchaseTx — custodial key drift', () => {
  function driftCase(listingRowOverrides, chainSeller) {
    return makeFixture({
      chain: { seller: chainSeller },
      listingRow: listingRowOverrides,
    });
  }

  it('409 CUSTODIAL_KEY_DRIFT when DB seller_wallet is null (legacy row) and chain seller != server key', async () => {
    const chainSeller = Keypair.generate().publicKey;
    const f = driftCase({ seller_wallet: null }, chainSeller);
    await expectCosignError(
      buildCosignedPurchaseTx({
        connection: f.connection,
        serverWallet: f.serverWallet,
        listingRow: f.listingRow,
        buyerWallet: f.buyer.publicKey.toBase58(),
      }),
      'CUSTODIAL_KEY_DRIFT',
      409
    );
  });

  it('409 CUSTODIAL_KEY_DRIFT when DB seller_wallet == server key but chain seller is a different key', async () => {
    // The DB says this listing is custodial (ours), but the chain seller is
    // some other key — the two services' custodial keys drifted. The default
    // fixture row already sets seller_wallet to the server pubkey.
    const f = makeFixture({ chain: { seller: Keypair.generate().publicKey } });
    await expectCosignError(
      buildCosignedPurchaseTx({
        connection: f.connection,
        serverWallet: f.serverWallet,
        listingRow: f.listingRow,
        buyerWallet: f.buyer.publicKey.toBase58(),
      }),
      'CUSTODIAL_KEY_DRIFT',
      409
    );
  });

  it('409 CUSTODIAL_KEY_DRIFT when DB seller_wallet is a third key disagreeing with the chain seller', async () => {
    const chainSeller = Keypair.generate().publicKey;
    const f = driftCase({ seller_wallet: Keypair.generate().publicKey.toBase58() }, chainSeller);
    await expectCosignError(
      buildCosignedPurchaseTx({
        connection: f.connection,
        serverWallet: f.serverWallet,
        listingRow: f.listingRow,
        buyerWallet: f.buyer.publicKey.toBase58(),
      }),
      'CUSTODIAL_KEY_DRIFT',
      409
    );
  });

  it('drift error message names both the chain seller and the server pubkey', async () => {
    const chainSeller = Keypair.generate().publicKey;
    const f = driftCase({ seller_wallet: null }, chainSeller);
    let thrown;
    try {
      await buildCosignedPurchaseTx({
        connection: f.connection,
        serverWallet: f.serverWallet,
        listingRow: f.listingRow,
        buyerWallet: f.buyer.publicKey.toBase58(),
      });
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeInstanceOf(CosignError);
    expect(thrown.message).toContain(chainSeller.toBase58());
    expect(thrown.message).toContain(f.serverWallet.publicKey.toBase58());
  });
});

// ─── Read-repair of a stale sold projection (fix 3) ────────────────────────

describe('buildCosignedPurchaseTx — read-repair on chain-Sold', () => {
  function callWith(f, markListingSoldFn) {
    return buildCosignedPurchaseTx({
      connection: f.connection,
      serverWallet: f.serverWallet,
      listingRow: f.listingRow,
      buyerWallet: f.buyer.publicKey.toBase58(),
      markListingSoldFn,
    });
  }

  it('chain Sold + DB active → invokes the repair callback with the listing id, then throws 409 LISTING_NOT_PURCHASABLE', async () => {
    const f = makeFixture({ chain: { status: ListingStatus.Sold } });
    const repaired = [];
    await expectCosignError(
      callWith(f, async (listingId) => {
        repaired.push(listingId);
      }),
      'LISTING_NOT_PURCHASABLE',
      409
    );
    expect(repaired).toEqual([f.listingRow.id]);
  });

  it('a failing repair never masks the 409', async () => {
    const f = makeFixture({ chain: { status: ListingStatus.Sold } });
    await expectCosignError(
      callWith(f, async () => {
        throw new Error('database exploded');
      }),
      'LISTING_NOT_PURCHASABLE',
      409
    );
  });

  it('does not invoke the repair callback when the DB row already says sold', async () => {
    const f = makeFixture({
      chain: { status: ListingStatus.Sold },
      listingRow: { status: 'sold' },
    });
    let called = 0;
    await expectCosignError(
      callWith(f, async () => {
        called += 1;
      }),
      'LISTING_NOT_PURCHASABLE',
      409
    );
    expect(called).toBe(0);
  });

  it('does not invoke the repair callback for Delisted chain status', async () => {
    const f = makeFixture({ chain: { status: ListingStatus.Delisted } });
    let called = 0;
    await expectCosignError(
      callWith(f, async () => {
        called += 1;
      }),
      'LISTING_NOT_PURCHASABLE',
      409
    );
    expect(called).toBe(0);
  });
});
