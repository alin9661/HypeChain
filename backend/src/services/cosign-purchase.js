/**
 * Custodial co-sign for `purchase_evidence` (PR2).
 *
 * The on-chain instruction requires BOTH buyer and seller signatures. For
 * custodial (guest) listings the seller is the platform server wallet, so
 * the server must co-sign. Security model: **the server builds the entire
 * transaction itself and partial-signs it** — it never signs client-supplied
 * bytes. The custodial key therefore only ever authorizes the intended
 * trade: +price lamports, −1 NFT, with price/status enforced by the program
 * from the listing PDA. Any client mutation of the returned transaction
 * invalidates the seller signature; replays fail on-chain once the listing
 * flips to Sold. The endpoint is stateless — on blockhash expiry the client
 * simply requests a fresh co-sign.
 *
 * Validation is chain-authoritative: the DB row only maps listingId → mint;
 * seller/status/price are read from the EvidenceListing PDA (it is what the
 * program enforces). The DB price is cross-checked as defense-in-depth so
 * silent DB↔chain drift surfaces as a loud 409 instead of a wrong charge.
 */

import { PublicKey, Transaction, LAMPORTS_PER_SOL } from '@solana/web3.js';
import {
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountIdempotentInstruction,
} from '@solana/spl-token';

import {
  buildPurchaseEvidenceIx,
  fetchEvidenceListing,
  findListingPda,
  ListingStatus,
} from './evidence-locker-client.js';

export class CosignError extends Error {
  constructor(code, httpStatus, message) {
    super(message);
    this.name = 'CosignError';
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

/** SPL token account layout: amount is a u64 LE at byte offset 64. */
function tokenAccountAmount(accountInfo) {
  return accountInfo.data.readBigUInt64LE(64);
}

/**
 * Build and partial-sign the purchase transaction for a custodial listing.
 *
 * @param {object} deps
 * @param {import('@solana/web3.js').Connection} deps.connection
 * @param {import('@solana/web3.js').Keypair} deps.serverWallet custodial seller keypair
 * @param {object} deps.listingRow Supabase `listings` row (id, nft_mint_address, price_sol)
 * @param {string} deps.buyerWallet buyer pubkey, base58
 * @param {(listingId: string) => Promise<void>} [deps.markListingSoldFn]
 *   read-repair hook: flips the DB projection to sold when the chain says
 *   Sold but the row still says active. No-op by default; the route wires
 *   the real Supabase helper. Failures are logged, never thrown.
 * @throws {CosignError} with a machine-readable `code` and `httpStatus`
 */
export async function buildCosignedPurchaseTx({
  connection,
  serverWallet,
  listingRow,
  buyerWallet,
  markListingSoldFn = async () => {},
}) {
  let buyer;
  try {
    buyer = new PublicKey(buyerWallet);
  } catch {
    throw new CosignError('INVALID_BUYER_WALLET', 400, 'buyerWallet is not a valid public key');
  }

  if (buyer.equals(serverWallet.publicKey)) {
    throw new CosignError('SELF_PURCHASE', 400, 'Buyer cannot be the custodial seller wallet');
  }

  if (!listingRow?.nft_mint_address) {
    throw new CosignError(
      'LISTING_NOT_ON_CHAIN',
      409,
      'Listing has no NFT mint address — it was never anchored on-chain'
    );
  }
  const nftMint = new PublicKey(listingRow.nft_mint_address);

  const chainListing = await fetchEvidenceListing(connection, nftMint);
  if (!chainListing) {
    throw new CosignError(
      'LISTING_NOT_ON_CHAIN',
      409,
      'No EvidenceListing account exists for this mint'
    );
  }
  if (chainListing.status !== ListingStatus.Listed) {
    if (chainListing.status === ListingStatus.Sold && listingRow.status === 'active') {
      // Chain is the source of truth; the DB projection is stale. Read-repair
      // it, but never let a repair failure mask the 409 the caller needs.
      try {
        await markListingSoldFn(listingRow.id);
      } catch (repairError) {
        console.warn(
          `[cosign] read-repair failed for listing ${JSON.stringify(String(listingRow.id))}: ` +
            `${repairError?.message ?? repairError}`
        );
      }
    }
    throw new CosignError(
      'LISTING_NOT_PURCHASABLE',
      409,
      `On-chain listing status is ${chainListing.status}, expected Listed`
    );
  }
  if (!chainListing.seller.equals(serverWallet.publicKey)) {
    const chainSeller = chainListing.seller.toBase58();
    const dbSeller = listingRow.seller_wallet || null;
    if (dbSeller && dbSeller === chainSeller) {
      // DB and chain agree on a non-custodial seller: a genuine user-wallet
      // listing. The client's legacy direct-purchase fallback handles it.
      throw new CosignError(
        'SELLER_NOT_CUSTODIAL',
        409,
        'On-chain seller is not the platform custodial wallet — co-sign unavailable'
      );
    }
    // DB says custodial (seller_wallet null/legacy, equal to our key, or
    // disagreeing with chain) but the chain seller is a different key: the
    // two services' custodial keys have drifted. Falling back to a direct
    // purchase here would charge the buyer without delivering the NFT.
    throw new CosignError(
      'CUSTODIAL_KEY_DRIFT',
      409,
      `On-chain seller ${chainSeller} does not match the custodial server wallet ` +
        `${serverWallet.publicKey.toBase58()} — custodial keys have drifted; refusing to co-sign`
    );
  }

  const priceSolNum = Number(listingRow.price_sol);
  if (!Number.isFinite(priceSolNum) || priceSolNum <= 0) {
    throw new CosignError(
      'PRICE_MISMATCH',
      409,
      'Listing has a missing or malformed price'
    );
  }
  const dbLamports = BigInt(Math.round(priceSolNum * LAMPORTS_PER_SOL));
  if (dbLamports !== chainListing.priceLamports) {
    throw new CosignError(
      'PRICE_MISMATCH',
      409,
      `DB price (${dbLamports} lamports) disagrees with on-chain price (${chainListing.priceLamports} lamports)`
    );
  }

  const sellerAta = getAssociatedTokenAddressSync(nftMint, serverWallet.publicKey);
  const sellerAtaInfo = await connection.getAccountInfo(sellerAta, 'confirmed');
  if (!sellerAtaInfo || tokenAccountAmount(sellerAtaInfo) < 1n) {
    throw new CosignError(
      'NFT_NOT_IN_CUSTODY',
      409,
      'Custodial wallet does not hold the NFT for this listing'
    );
  }

  const buyerAta = getAssociatedTokenAddressSync(nftMint, buyer);
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');

  const tx = new Transaction({ feePayer: buyer, blockhash, lastValidBlockHeight });
  tx.add(
    // Idempotent: no-op when the buyer ATA already exists. Buyer pays rent.
    createAssociatedTokenAccountIdempotentInstruction(buyer, buyerAta, buyer, nftMint),
    buildPurchaseEvidenceIx({
      buyer,
      seller: serverWallet.publicKey,
      nftMint,
      sellerTokenAccount: sellerAta,
      buyerTokenAccount: buyerAta,
    })
  );
  tx.partialSign(serverWallet);

  const [listingPda] = findListingPda(nftMint);
  // JSON.stringify neutralizes control characters in the DB-sourced id
  // (CWE-117); the remaining fields are base58/numeric and inert.
  console.log(
    `[cosign] listing=${JSON.stringify(String(listingRow.id))} buyer=${buyer.toBase58()} ` +
      `price=${chainListing.priceLamports} blockhash=${blockhash}`
  );

  return {
    transactionBase64: tx
      .serialize({ requireAllSignatures: false, verifySignatures: false })
      .toString('base64'),
    priceLamports: chainListing.priceLamports.toString(),
    priceSol: Number(chainListing.priceLamports) / LAMPORTS_PER_SOL,
    blockhash,
    lastValidBlockHeight,
    nftMint: nftMint.toBase58(),
    listingPda: listingPda.toBase58(),
    seller: serverWallet.publicKey.toBase58(),
  };
}
