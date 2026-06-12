#!/usr/bin/env node
/**
 * Devnet buy-side smoke test for the custodial co-sign loop (PR2).
 *
 * Proves the full purchase path against a REAL deployed program:
 *   (optionally) mint → verify → list custodially, then
 *   co-sign → buyer-sign → send → assert Sold + NFT moved + SOL received.
 *
 * Skip-gated like backend-py/tests/test_devnet_smoke.py — runs only when:
 *   RUN_DEVNET=1
 *   HACKNYU_MARKETPLACE_PROGRAM_ID=<deployed id>
 *   HACKNYU_SERVER_WALLET_PRIVATE_KEY=<funded devnet key, base58>
 *
 * Usage:
 *   RUN_DEVNET=1 node scripts/devnet-buy-smoke.js [nftMint]
 *
 * With [nftMint]: expects an existing custodial listing for that mint
 * (e.g. left behind by the backend-py sell-side smoke test).
 * Without: performs the full custodial setup first (mint + verify + list,
 * ~0.03 devnet SOL in fees/rent paid by the server wallet).
 *
 * The throwaway buyer is funded FROM the server wallet (price + fee
 * headroom) to avoid devnet airdrop rate limits.
 */

import {
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  LAMPORTS_PER_SOL,
  sendAndConfirmTransaction,
} from '@solana/web3.js';
import { getAssociatedTokenAddressSync } from '@solana/spl-token';

const SKIP_REASONS = [];
if (process.env.RUN_DEVNET !== '1') SKIP_REASONS.push('RUN_DEVNET != 1');
if (!process.env.HACKNYU_MARKETPLACE_PROGRAM_ID) SKIP_REASONS.push('HACKNYU_MARKETPLACE_PROGRAM_ID unset');
if (!process.env.HACKNYU_SERVER_WALLET_PRIVATE_KEY) SKIP_REASONS.push('HACKNYU_SERVER_WALLET_PRIVATE_KEY unset');
if (SKIP_REASONS.length > 0) {
  console.log(`SKIP devnet buy smoke: ${SKIP_REASONS.join(', ')}`);
  process.exit(0);
}

// Imports that read env happen after the gate.
const { getConnection, getServerWallet, mintNFT, listItemOnMarketplace } = await import(
  '../src/services/solana.js'
);
const { submitVerification } = await import('../src/services/verification.js');
const { fetchEvidenceListing, ListingStatus } = await import(
  '../src/services/evidence-locker-client.js'
);
const { buildCosignedPurchaseTx } = await import('../src/services/cosign-purchase.js');

const PRICE_SOL = 0.001;
const connection = getConnection();
const serverWallet = getServerWallet();

function assert(cond, msg) {
  if (!cond) {
    console.error(`✗ ASSERTION FAILED: ${msg}`);
    process.exit(1);
  }
  console.log(`✓ ${msg}`);
}

async function setupCustodialListing() {
  console.log('— no mint provided: running custodial mint → verify → list —');
  const mint = await mintNFT(
    serverWallet.publicKey.toBase58(),
    'https://hypechain.example/devnet-smoke.json',
    `Devnet Smoke ${Date.now()}`
  );
  await submitVerification({
    nftMint: mint,
    confidenceBps: 9_500,
    modelName: 'SMOKE-TEST',
    livenessPassed: true,
  });
  const listed = await listItemOnMarketplace(mint, PRICE_SOL, serverWallet.publicKey.toBase58());
  assert(listed.mode === 'custodial_listed', `custodial listing created (${listed.listingPda})`);
  return mint;
}

const mintArg = process.argv[2];
const nftMint = mintArg || (await setupCustodialListing());
const mintPk = new PublicKey(nftMint);
console.log(`NFT mint: ${nftMint}`);

// Pre-state.
const preListing = await fetchEvidenceListing(connection, mintPk);
assert(preListing, 'EvidenceListing exists on-chain');
assert(preListing.status === ListingStatus.Listed, 'listing status is Listed');
assert(preListing.seller.equals(serverWallet.publicKey), 'listing seller is the custodial wallet');
const priceLamports = preListing.priceLamports;

// Throwaway buyer, funded from the server wallet.
const buyer = Keypair.generate();
const headroom = BigInt(Math.round(0.01 * LAMPORTS_PER_SOL)); // fees + ATA rent
const fundTx = new Transaction().add(
  SystemProgram.transfer({
    fromPubkey: serverWallet.publicKey,
    toPubkey: buyer.publicKey,
    lamports: priceLamports + headroom,
  })
);
await sendAndConfirmTransaction(connection, fundTx, [serverWallet], { commitment: 'confirmed' });
console.log(`buyer ${buyer.publicKey.toBase58()} funded with ${priceLamports + headroom} lamports`);

const sellerPreBalance = BigInt(await connection.getBalance(serverWallet.publicKey, 'confirmed'));

// Co-sign exactly as the endpoint does (DB row stubbed — chain is authoritative).
const cosign = await buildCosignedPurchaseTx({
  connection,
  serverWallet,
  listingRow: {
    id: 'devnet-buy-smoke',
    nft_mint_address: nftMint,
    price_sol: Number(priceLamports) / LAMPORTS_PER_SOL,
  },
  buyerWallet: buyer.publicKey.toBase58(),
});
console.log(`co-signed: price=${cosign.priceLamports} listingPda=${cosign.listingPda}`);

// Buyer signs on top and submits — mirrors the wallet flow in the frontend.
const tx = Transaction.from(Buffer.from(cosign.transactionBase64, 'base64'));
tx.partialSign(buyer);
const signature = await connection.sendRawTransaction(tx.serialize());
await connection.confirmTransaction(
  { signature, blockhash: cosign.blockhash, lastValidBlockHeight: cosign.lastValidBlockHeight },
  'confirmed'
);
console.log(`purchase tx confirmed: ${signature}`);

// Post-state assertions.
const postListing = await fetchEvidenceListing(connection, mintPk);
assert(postListing.status === ListingStatus.Sold, 'listing status flipped to Sold');

const buyerAta = getAssociatedTokenAddressSync(mintPk, buyer.publicKey);
const buyerAtaBalance = await connection.getTokenAccountBalance(buyerAta, 'confirmed');
assert(buyerAtaBalance.value.amount === '1', 'buyer ATA holds the NFT');

const sellerPostBalance = BigInt(await connection.getBalance(serverWallet.publicKey, 'confirmed'));
assert(
  sellerPostBalance - sellerPreBalance === priceLamports,
  `seller received exactly ${priceLamports} lamports`
);

console.log('\n✅ devnet custodial buy loop: PASS');
