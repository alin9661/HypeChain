/**
 * Payment Service - Solana Pay Integration
 * Handles payment request generation and transaction verification
 */

import {
  Connection,
  PublicKey,
  LAMPORTS_PER_SOL,
  clusterApiUrl
} from '@solana/web3.js';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

// Initialize Supabase client
const supabase = createClient(
  process.env.HACKNYU_SUPABASE_URL,
  process.env.HACKNYU_SUPABASE_SERVICE_ROLE_KEY // Use service key for backend operations
);

// Initialize Solana connection
const connection = new Connection(
  process.env.HACKNYU_SOLANA_RPC_URL || clusterApiUrl('devnet'),
  'confirmed'
);

/**
 * Fetch a listing row from the database without gating on status.
 * Used by flows that must see sold rows too (e.g. idempotent replay of an
 * already-completed purchase).
 * @param {string} listingId - UUID of the listing
 * @param {Object} [deps] - optional injected deps for tests
 * @returns {Promise<Object>} Listing data
 */
export async function fetchListingRow(listingId, { supabaseClient = supabase } = {}) {
  const { data, error } = await supabaseClient
    .from('listings')
    .select('*')
    .eq('id', listingId)
    .single();

  if (error) {
    throw new Error(`Failed to fetch listing: ${error.message}`);
  }

  if (!data) {
    throw new Error('Listing not found');
  }

  return data;
}

/**
 * Fetch listing details from database (purchasable listings only)
 * @param {string} listingId - UUID of the listing
 * @returns {Promise<Object>} Listing data
 */
export async function fetchListing(listingId) {
  const data = await fetchListingRow(listingId);

  if (data.status !== 'active') {
    throw new Error(`Listing is not available for purchase. Status: ${data.status}`);
  }

  return data;
}

/**
 * Read-repair helper: converge a stale 'active' DB projection to 'sold'
 * when the chain (source of truth) says the listing is already Sold.
 * The status filter makes the update a no-op on already-repaired rows.
 * @param {string} listingId - UUID of the listing
 */
export async function markListingSold(listingId) {
  const { error } = await supabase
    .from('listings')
    .update({
      status: 'sold',
      sold_at: new Date().toISOString()
    })
    .eq('id', listingId)
    .eq('status', 'active');

  if (error) {
    throw new Error(`Failed to mark listing sold: ${error.message}`);
  }
}

/**
 * Generate a unique payment reference for tracking
 * @param {string} listingId - UUID of the listing
 * @returns {string} Unique reference string
 */
function generatePaymentReference(listingId) {
  // Create a unique reference that includes timestamp and listing ID
  const timestamp = Date.now();
  return `hypechain-${listingId}-${timestamp}`;
}

/**
 * Create payment request for a listing
 * @param {string} listingId - UUID of the listing
 * @param {string} buyerWallet - Buyer's Solana wallet address
 * @returns {Promise<Object>} Payment request details
 */
export async function createPaymentRequest(listingId, buyerWallet) {
  try {
    // 1. Validate buyer wallet address
    try {
      new PublicKey(buyerWallet);
    } catch (error) {
      throw new Error('Invalid buyer wallet address');
    }

    // 2. Fetch listing from database
    const listing = await fetchListing(listingId);

    // 3. Validate seller wallet
    try {
      new PublicKey(listing.seller_wallet);
    } catch (error) {
      throw new Error('Invalid seller wallet address');
    }

    // 4. Prevent self-purchase
    if (buyerWallet === listing.seller_wallet) {
      throw new Error('Cannot purchase your own listing');
    }

    // 5. Generate payment reference
    const reference = generatePaymentReference(listingId);

    // 6. Create payment request object
    const paymentRequest = {
      recipient: listing.seller_wallet,
      amount: parseFloat(listing.price_sol),
      splToken: null, // Using SOL (null means native SOL)
      reference: reference,
      label: `HypeChain - ${listing.product_name}`,
      message: `Purchase ${listing.product_name} NFT`,
      memo: `listing:${listingId}`,
      listingId: listingId,
      nftMintAddress: listing.nft_mint_address,
      productName: listing.product_name,
      imageUrl: listing.image_url,
    };

    console.log(`[Payment] Created payment request for listing ${listingId}`);
    return paymentRequest;
  } catch (error) {
    console.error('[Payment] Error creating payment request:', error);
    throw error;
  }
}

/**
 * Verify payment transaction on Solana blockchain
 * @param {string} signature - Transaction signature
 * @param {string} expectedRecipient - Expected recipient wallet address
 * @param {number} expectedAmount - Expected amount in SOL
 * @param {string} listingId - UUID of the listing
 * @param {string} [buyerWallet] - Buyer's wallet address (enables idempotent replay detection)
 * @param {Object} [deps] - optional injected deps for tests
 * @returns {Promise<Object>} Verification result
 */
export async function verifyPayment(
  signature,
  expectedRecipient,
  expectedAmount,
  listingId,
  buyerWallet,
  { supabaseClient = supabase, conn = connection } = {}
) {
  try {
    console.log(`[Payment] Verifying transaction ${signature}`);

    // 1. Fetch transaction from blockchain
    const transaction = await conn.getTransaction(signature, {
      commitment: 'confirmed',
      maxSupportedTransactionVersion: 0
    });

    if (!transaction) {
      return {
        valid: false,
        error: 'Transaction not found on blockchain',
        needsRetry: true
      };
    }

    // 2. Check if transaction succeeded
    if (transaction.meta.err !== null) {
      return {
        valid: false,
        error: `Transaction failed: ${JSON.stringify(transaction.meta.err)}`,
        transaction: transaction
      };
    }

    // 3. Verify recipient and amount
    const expectedRecipientPubkey = new PublicKey(expectedRecipient);

    // Get pre and post balances
    const accountKeys = transaction.transaction.message.getAccountKeys();
    let recipientFound = false;
    let amountTransferred = 0;

    // Find the recipient in account keys
    for (let i = 0; i < accountKeys.length; i++) {
      const accountKey = accountKeys.get(i);
      if (accountKey.equals(expectedRecipientPubkey)) {
        recipientFound = true;
        // Calculate amount transferred (post balance - pre balance)
        const preBalance = transaction.meta.preBalances[i];
        const postBalance = transaction.meta.postBalances[i];
        amountTransferred = (postBalance - preBalance) / LAMPORTS_PER_SOL;
        break;
      }
    }

    if (!recipientFound) {
      return {
        valid: false,
        error: 'Recipient wallet not found in transaction',
        transaction: transaction
      };
    }

    // 4. Verify amount (allow small difference for fees)
    const expectedAmountNum = parseFloat(expectedAmount);
    const tolerance = 0.001; // 0.001 SOL tolerance for rounding

    if (Math.abs(amountTransferred - expectedAmountNum) > tolerance) {
      return {
        valid: false,
        error: `Amount mismatch. Expected: ${expectedAmountNum} SOL, Received: ${amountTransferred} SOL`,
        transaction: transaction
      };
    }

    // 5. Check transaction timestamp (prevent old transactions)
    const blockTime = transaction.blockTime;
    const currentTime = Math.floor(Date.now() / 1000);
    const fiveMinutes = 5 * 60;

    if (currentTime - blockTime > fiveMinutes) {
      console.warn(`[Payment] Transaction is older than 5 minutes: ${signature}`);
      // Don't reject, just warn - the transaction might still be valid
    }

    // 6. Check if transaction was already used.
    // The chain is the source of truth: a signature already recorded for the
    // SAME listing + buyer means the purchase already completed — verifying
    // it again is an idempotent replay and must succeed. Only a signature
    // reused for a DIFFERENT listing or buyer is fraudulent.
    const { data: existingTransaction } = await supabaseClient
      .from('transactions')
      .select('id, listing_id, buyer_wallet')
      .eq('signature', signature)
      .maybeSingle();

    if (existingTransaction) {
      const isSamePurchase =
        existingTransaction.listing_id === listingId &&
        Boolean(buyerWallet) &&
        existingTransaction.buyer_wallet === buyerWallet;

      if (!isSamePurchase) {
        return {
          valid: false,
          error: 'Transaction signature already used',
          transaction: transaction
        };
      }

      console.log(`[Payment] Replay of completed purchase detected: ${signature}`);
      return {
        valid: true,
        replay: true,
        transaction: transaction,
        amountTransferred: amountTransferred,
        blockTime: blockTime,
        slot: transaction.slot
      };
    }

    console.log(`[Payment] Transaction verified successfully: ${signature}`);

    return {
      valid: true,
      transaction: transaction,
      amountTransferred: amountTransferred,
      blockTime: blockTime,
      slot: transaction.slot
    };
  } catch (error) {
    console.error('[Payment] Error verifying payment:', error);
    return {
      valid: false,
      error: error.message,
      needsRetry: error.message.includes('not found')
    };
  }
}

/**
 * Complete purchase - update listing and create transaction record
 * @param {string} listingId - UUID of the listing
 * @param {string} buyerWallet - Buyer's wallet address
 * @param {string} buyerUserId - Buyer's user ID (optional)
 * @param {string} signature - Transaction signature
 * @param {number} amountSol - Amount paid in SOL
 * @param {Object} [deps] - optional injected deps for tests
 * @returns {Promise<Object>} Purchase result
 *
 * Idempotent: replaying a signature already recorded for the same listing
 * and buyer converges the listing projection (covers the crash window where
 * the transactions row was written but the listing update never landed) and
 * returns success instead of double-writing.
 */
export async function completePurchase(
  listingId,
  buyerWallet,
  buyerUserId,
  signature,
  amountSol,
  { supabaseClient = supabase } = {}
) {
  try {
    // 1. Fetch listing row WITHOUT the active-status gate — replays of a
    // completed purchase legitimately arrive after the row flipped to sold.
    const listing = await fetchListingRow(listingId, { supabaseClient });

    // 2. Idempotency check: has this signature already been recorded?
    const { data: existingTransaction, error: existingError } = await supabaseClient
      .from('transactions')
      .select('*')
      .eq('signature', signature)
      .maybeSingle();

    if (existingError) {
      throw new Error(`Failed to check existing transaction: ${existingError.message}`);
    }

    if (
      existingTransaction &&
      (existingTransaction.listing_id !== listingId ||
        existingTransaction.buyer_wallet !== buyerWallet)
    ) {
      // Same signature pointed at a different listing/buyer — fraud, not replay.
      throw new Error('Transaction signature already used');
    }

    const isReplay = Boolean(existingTransaction);
    let transactionRecord = existingTransaction;

    if (!isReplay) {
      // Fresh purchases still require a purchasable listing.
      if (listing.status !== 'active') {
        throw new Error(`Listing is not available for purchase. Status: ${listing.status}`);
      }

      // 3. Create transaction record
      const { data: insertedRecord, error: txError } = await supabaseClient
        .from('transactions')
        .insert({
          listing_id: listingId,
          buyer_wallet: buyerWallet,
          seller_wallet: listing.seller_wallet,
          buyer_user_id: buyerUserId || null,
          seller_user_id: listing.seller_user_id || null,
          amount_sol: amountSol,
          signature: signature,
          status: 'confirmed',
          payment_method: 'SOL',
          blockchain_confirmed: true,
          confirmed_at: new Date().toISOString()
        })
        .select()
        .single();

      if (txError) {
        throw new Error(`Failed to create transaction record: ${txError.message}`);
      }
      transactionRecord = insertedRecord;
    }

    // 4. Converge listing status to sold. Runs for fresh purchases AND for
    // replays where the transactions row exists but the listing update was
    // lost in a crash window (idempotent convergence).
    if (listing.status !== 'sold') {
      const { error: updateError } = await supabaseClient
        .from('listings')
        .update({
          status: 'sold',
          sold_at: new Date().toISOString(),
          buyer_wallet: buyerWallet,
          buyer_user_id: buyerUserId || null,
          transaction_signature: signature
        })
        .eq('id', listingId);

      if (updateError) {
        throw new Error(`Failed to update listing: ${updateError.message}`);
      }
    }

    // 5. Update seller's total volume (fresh purchases only — replays must
    // not double-count volume)
    if (!isReplay && listing.seller_user_id) {
      const { error: volumeError } = await supabaseClient.rpc('increment_user_volume', {
        user_id: listing.seller_user_id,
        amount: amountSol
      });

      if (volumeError) {
        console.warn(`[Payment] Failed to update seller volume: ${volumeError.message}`);
        // Don't fail the purchase if this fails
      }
    }

    console.log(
      `[Payment] Purchase ${isReplay ? 'replay converged' : 'completed'} for listing ${listingId}`
    );

    return {
      success: true,
      replay: isReplay,
      transaction: transactionRecord,
      listing: {
        id: listingId,
        nft_mint_address: listing.nft_mint_address,
        product_name: listing.product_name
      }
    };
  } catch (error) {
    console.error('[Payment] Error completing purchase:', error);
    throw error;
  }
}

/**
 * Get transaction history for a wallet
 * @param {string} walletAddress - Wallet address
 * @param {string} type - 'buyer' | 'seller' | 'all'
 * @returns {Promise<Array>} Transaction history
 */
export async function getTransactionHistory(walletAddress, type = 'all') {
  try {
    let query = supabase
      .from('transactions')
      .select(`
        *,
        listing:listings(
          product_name,
          image_url,
          nft_mint_address
        )
      `)
      .order('created_at', { ascending: false });

    if (type === 'buyer') {
      query = query.eq('buyer_wallet', walletAddress);
    } else if (type === 'seller') {
      query = query.eq('seller_wallet', walletAddress);
    } else {
      query = query.or(`buyer_wallet.eq.${walletAddress},seller_wallet.eq.${walletAddress}`);
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(`Failed to fetch transaction history: ${error.message}`);
    }

    return data || [];
  } catch (error) {
    console.error('[Payment] Error fetching transaction history:', error);
    throw error;
  }
}

/**
 * Get Solana balance for a wallet
 * @param {string} walletAddress - Wallet address
 * @returns {Promise<number>} Balance in SOL
 */
export async function getWalletBalance(walletAddress) {
  try {
    const publicKey = new PublicKey(walletAddress);
    const balance = await connection.getBalance(publicKey);
    return balance / LAMPORTS_PER_SOL;
  } catch (error) {
    console.error('[Payment] Error getting wallet balance:', error);
    throw error;
  }
}
