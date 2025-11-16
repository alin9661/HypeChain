import { Connection, PublicKey, Keypair, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import { createNft, mplTokenMetadata } from '@metaplex-foundation/mpl-token-metadata';
import { generateSigner, keypairIdentity, percentAmount, publicKey as umiPublicKey } from '@metaplex-foundation/umi';
import bs58 from 'bs58';

const SOLANA_RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';
const MARKETPLACE_PROGRAM_ID = process.env.MARKETPLACE_PROGRAM_ID;

export function getConnection() {
  return new Connection(SOLANA_RPC_URL, 'confirmed');
}

function getServerWallet() {
  const privateKeyString = process.env.SERVER_WALLET_PRIVATE_KEY;
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

export async function listItemOnMarketplace(nftMint, priceSol, sellerWallet) {
  if (!MARKETPLACE_PROGRAM_ID) {
    console.warn('MARKETPLACE_PROGRAM_ID not set. Skipping marketplace listing.');
    return 'Marketplace listing skipped - contract not deployed';
  }

  // TODO: Implement Anchor instruction call when contract is deployed
  console.log('Listing item on marketplace...');
  console.log('NFT Mint:', nftMint);
  console.log('Price (SOL):', priceSol);
  console.log('Seller:', sellerWallet);

  return 'Marketplace listing pending smart contract deployment';
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
