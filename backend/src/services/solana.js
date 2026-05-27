import {
  Connection,
  PublicKey,
  Keypair,
  LAMPORTS_PER_SOL,
  Transaction,
  sendAndConfirmTransaction,
} from '@solana/web3.js';
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import { createNft, mplTokenMetadata } from '@metaplex-foundation/mpl-token-metadata';
import { generateSigner, keypairIdentity, percentAmount, publicKey as umiPublicKey } from '@metaplex-foundation/umi';
import bs58 from 'bs58';

import { buildListEvidenceIx, findListingPda } from './evidence-locker-client.js';

const SOLANA_RPC_URL = process.env.HACKNYU_SOLANA_RPC_URL || 'https://api.devnet.solana.com';
const MARKETPLACE_PROGRAM_ID = process.env.HACKNYU_MARKETPLACE_PROGRAM_ID;

export function getConnection() {
  return new Connection(SOLANA_RPC_URL, 'confirmed');
}

function getServerWallet() {
  const privateKeyString = process.env.HACKNYU_SERVER_WALLET_PRIVATE_KEY;
  if (!privateKeyString) {
    throw new Error('SERVER_WALLET_PRIVATE_KEY not set in environment');
  }

  try {
    const privateKeyBytes = bs58.decode(privateKeyString);
    return Keypair.fromSecretKey(privateKeyBytes);
  } catch (error) {
    throw new Error('Invalid SERVER_WALLET_PRIVATE_KEY format');
  }
}

export async function mintNFT(userWalletAddress, metadataUri, productName) {
  try {
    const umi = createUmi(SOLANA_RPC_URL).use(mplTokenMetadata());
    const serverWallet = getServerWallet();
    const umiKeypair = umi.eddsa.createKeypairFromSecretKey(serverWallet.secretKey);
    umi.use(keypairIdentity(umiKeypair));

    const mint = generateSigner(umi);

    console.log(`Minting NFT to: ${userWalletAddress}`);
    console.log(`Mint address: ${mint.publicKey}`);

    const transaction = await createNft(umi, {
      mint,
      name: productName.substring(0, 32),
      uri: metadataUri,
      sellerFeeBasisPoints: percentAmount(5),
      tokenOwner: umiPublicKey(userWalletAddress),
      updateAuthority: umiKeypair.publicKey,
      creators: [{ address: umiKeypair.publicKey, verified: true, share: 100 }]
    });

    const result = await transaction.sendAndConfirm(umi, { confirm: { commitment: 'confirmed' } });

    console.log('NFT minted successfully!');
    console.log('Signature:', bs58.encode(result.signature));

    return mint.publicKey.toString();
  } catch (error) {
    console.error('NFT minting error:', error);
    throw new Error(`Failed to mint NFT: ${error.message}`);
  }
}

/**
 * Two-mode marketplace listing:
 *
 *  • **Custodial mode** (sellerWallet === server wallet): the server signs
 *    `list_evidence` directly and the on-chain listing is fully active.
 *  • **User-wallet mode** (sellerWallet is a user wallet): the server cannot
 *    sign on the user's behalf. We return a hint object instead — the
 *    frontend builds and signs the `list_evidence` tx itself using
 *    `frontend/lib/anchor-client.ts`.
 *
 * Both modes require a `VerificationProof` PDA to already exist on-chain
 * for `nftMint` (call `submitVerification` from `verification.js` first).
 */
export async function listItemOnMarketplace(nftMint, priceSol, sellerWallet) {
  if (!MARKETPLACE_PROGRAM_ID) {
    console.warn('MARKETPLACE_PROGRAM_ID not set. Skipping marketplace listing.');
    return { mode: 'skipped', reason: 'contract not deployed' };
  }

  const mintPk = new PublicKey(nftMint);
  const [listingPda] = findListingPda(mintPk);
  const priceLamports = BigInt(Math.round(priceSol * LAMPORTS_PER_SOL));

  // Detect mode by comparing the seller wallet to the server wallet pubkey.
  const serverWallet = getServerWallet();
  const isCustodial = new PublicKey(sellerWallet).equals(serverWallet.publicKey);

  if (!isCustodial) {
    console.log(`📝 Listing prepared for user-wallet signing: ${sellerWallet}`);
    return {
      mode: 'pending_user_signature',
      listingPda: listingPda.toBase58(),
      programId: MARKETPLACE_PROGRAM_ID,
      seller: sellerWallet,
      nftMint,
      priceLamports: priceLamports.toString(),
    };
  }

  // Custodial path — server signs the full listing tx.
  const connection = getConnection();
  const ix = buildListEvidenceIx({
    seller: serverWallet.publicKey,
    nftMint: mintPk,
    priceLamports,
  });
  const tx = new Transaction().add(ix);
  const signature = await sendAndConfirmTransaction(connection, tx, [serverWallet], {
    commitment: 'confirmed',
  });

  console.log(`🏪 EvidenceListing created (custodial): ${listingPda.toBase58()} sig=${signature}`);
  return {
    mode: 'custodial_listed',
    listingPda: listingPda.toBase58(),
    signature,
  };
}

export async function getBalance(address) {
  try {
    const connection = getConnection();
    const publicKey = new PublicKey(address);
    const balance = await connection.getBalance(publicKey);
    return balance / LAMPORTS_PER_SOL;
  } catch (error) {
    console.error('Balance check error:', error);
    return 0;
  }
}
