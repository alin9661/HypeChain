import {
  Connection,
  PublicKey,
  Keypair,
  Transaction,
  SystemProgram,
  LAMPORTS_PER_SOL
} from '@solana/web3.js';
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import { createNft, mplTokenMetadata } from '@metaplex-foundation/mpl-token-metadata';
import {
  generateSigner,
  keypairIdentity,
  percentAmount,
  publicKey as umiPublicKey,
  TransactionBuilder
} from '@metaplex-foundation/umi';
import bs58 from 'bs58';

const SOLANA_RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';
const SOLANA_NETWORK = process.env.SOLANA_NETWORK || 'devnet';
const MARKETPLACE_PROGRAM_ID = process.env.MARKETPLACE_PROGRAM_ID;

/**
 * Initializes Solana connection
 */
export function getConnection(): Connection {
  return new Connection(SOLANA_RPC_URL, 'confirmed');
}

/**
 * Gets server wallet keypair from environment
 */
function getServerWallet(): Keypair {
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

/**
 * Mints an NFT using Metaplex Umi SDK
 * @param userWalletAddress User's wallet address (will be the NFT owner)
 * @param metadataUri IPFS URI for NFT metadata
 * @param productName Name of the product
 * @returns NFT mint address
 */
export async function mintNFT(
  userWalletAddress: string,
  metadataUri: string,
  productName: string
): Promise<string> {
  try {
    // Initialize Umi with Solana endpoint
    const umi = createUmi(SOLANA_RPC_URL).use(mplTokenMetadata());

    // Get server wallet as payer
    const serverWallet = getServerWallet();

    // Convert server wallet to Umi keypair
    const umiKeypair = umi.eddsa.createKeypairFromSecretKey(serverWallet.secretKey);

    // Set identity as server wallet (it will pay for the mint)
    umi.use(keypairIdentity(umiKeypair));

    // Generate a new mint address
    const mint = generateSigner(umi);

    console.log(`Minting NFT to: ${userWalletAddress}`);
    console.log(`Mint address: ${mint.publicKey}`);

    // Create the NFT
    const transaction = await createNft(umi, {
      mint,
      name: productName.substring(0, 32), // Max 32 chars for on-chain name
      uri: metadataUri,
      sellerFeeBasisPoints: percentAmount(5), // 5% royalty
      // The NFT will be owned by the user's wallet
      tokenOwner: umiPublicKey(userWalletAddress),
      // Server wallet pays for the transaction
      updateAuthority: umiKeypair.publicKey,
      creators: [
        {
          address: umiKeypair.publicKey,
          verified: true,
          share: 100
        }
      ]
    });

    // Send and confirm transaction
    const result = await transaction.sendAndConfirm(umi, {
      confirm: { commitment: 'confirmed' }
    });

    console.log('NFT minted successfully!');
    console.log('Signature:', bs58.encode(result.signature));

    return mint.publicKey.toString();
  } catch (error) {
    console.error('NFT minting error:', error);
    throw new Error(`Failed to mint NFT: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Calls the marketplace smart contract to list an item
 * @param nftMint NFT mint address
 * @param priceSol Price in SOL
 * @param sellerWallet Seller's wallet public key
 * @returns Transaction signature
 */
export async function listItemOnMarketplace(
  nftMint: string,
  priceSol: number,
  sellerWallet: string
): Promise<string> {
  if (!MARKETPLACE_PROGRAM_ID) {
    throw new Error('MARKETPLACE_PROGRAM_ID not set. Deploy the smart contract first.');
  }

  try {
    const connection = getConnection();
    const serverWallet = getServerWallet();

    // Convert price to lamports
    const pricelamports = Math.floor(priceSol * LAMPORTS_PER_SOL);

    // This is a placeholder - actual implementation depends on your Anchor program's instruction format
    // You'll need to import the generated Anchor client and call the list_item instruction

    console.log('Listing item on marketplace...');
    console.log('NFT Mint:', nftMint);
    console.log('Price (SOL):', priceSol);
    console.log('Seller:', sellerWallet);

    // TODO: Replace with actual Anchor instruction call
    // Example:
    // const tx = await program.methods
    //   .listItem(new BN(pricelamports))
    //   .accounts({
    //     seller: new PublicKey(sellerWallet),
    //     nftMint: new PublicKey(nftMint),
    //     productListing: listingPda,
    //     systemProgram: SystemProgram.programId,
    //   })
    //   .rpc();

    // For now, return a mock transaction signature
    const mockSignature = 'Marketplace listing pending smart contract deployment';

    return mockSignature;
  } catch (error) {
    console.error('Marketplace listing error:', error);
    throw new Error(`Failed to list item on marketplace: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Gets SOL balance for an address
 */
export async function getBalance(address: string): Promise<number> {
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

/**
 * Validates that a wallet owns an NFT
 */
export async function validateNFTOwnership(
  walletAddress: string,
  nftMint: string
): Promise<boolean> {
  try {
    const connection = getConnection();
    const wallet = new PublicKey(walletAddress);
    const mint = new PublicKey(nftMint);

    // Get token accounts for this wallet
    const tokenAccounts = await connection.getParsedTokenAccountsByOwner(wallet, {
      mint
    });

    // Check if wallet has a token account with balance > 0
    return tokenAccounts.value.some(
      (account) => account.account.data.parsed.info.tokenAmount.uiAmount > 0
    );
  } catch (error) {
    console.error('NFT ownership validation error:', error);
    return false;
  }
}

/**
 * Airdrops SOL on devnet for testing
 */
export async function requestAirdrop(address: string, amount: number = 1): Promise<string> {
  if (SOLANA_NETWORK !== 'devnet') {
    throw new Error('Airdrops only available on devnet');
  }

  try {
    const connection = getConnection();
    const publicKey = new PublicKey(address);
    const signature = await connection.requestAirdrop(
      publicKey,
      amount * LAMPORTS_PER_SOL
    );

    await connection.confirmTransaction(signature);
    return signature;
  } catch (error) {
    console.error('Airdrop error:', error);
    throw new Error(`Failed to request airdrop: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}
