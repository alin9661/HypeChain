/**
 * Payment Routes - Solana Pay API Endpoints
 * Handles payment request generation, verification, and transaction completion
 */

import express from 'express';
import {
  createPaymentRequest,
  verifyPayment,
  completePurchase,
  getTransactionHistory,
  getWalletBalance,
  fetchListing
} from '../services/payment.js';

const router = express.Router();

/**
 * POST /api/payments/create
 * Create a payment request for a listing
 *
 * Request body:
 * {
 *   listingId: string,
 *   buyerWallet: string
 * }
 *
 * Response:
 * {
 *   success: boolean,
 *   paymentRequest: {
 *     recipient: string,
 *     amount: number,
 *     label: string,
 *     message: string,
 *     memo: string,
 *     reference: string,
 *     listingId: string,
 *     nftMintAddress: string,
 *     productName: string,
 *     imageUrl: string
 *   }
 * }
 */
router.post('/create', async (req, res) => {
  try {
    const { listingId, buyerWallet } = req.body;

    // Validate input
    if (!listingId || !buyerWallet) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: listingId and buyerWallet'
      });
    }

    console.log(`[API] Creating payment request for listing ${listingId}`);

    const paymentRequest = await createPaymentRequest(listingId, buyerWallet);

    res.json({
      success: true,
      paymentRequest
    });
  } catch (error) {
    console.error('[API] Error creating payment request:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/payments/verify
 * Verify a payment transaction and complete the purchase
 *
 * Request body:
 * {
 *   signature: string,
 *   listingId: string,
 *   buyerWallet: string,
 *   buyerUserId?: string
 * }
 *
 * Response:
 * {
 *   success: boolean,
 *   verification: {
 *     valid: boolean,
 *     transaction: object,
 *     amountTransferred: number
 *   },
 *   purchase?: {
 *     transaction: object,
 *     listing: object
 *   }
 * }
 */
router.post('/verify', async (req, res) => {
  try {
    const { signature, listingId, buyerWallet, buyerUserId } = req.body;

    // Validate input
    if (!signature || !listingId || !buyerWallet) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: signature, listingId, and buyerWallet'
      });
    }

    console.log(`[API] Verifying payment for listing ${listingId}, signature: ${signature}`);

    // 1. Fetch listing to get expected recipient and amount
    const listing = await fetchListing(listingId);

    // 2. Verify the payment transaction
    const verification = await verifyPayment(
      signature,
      listing.seller_wallet,
      listing.price_sol,
      listingId
    );

    if (!verification.valid) {
      return res.status(400).json({
        success: false,
        error: verification.error,
        needsRetry: verification.needsRetry || false
      });
    }

    // 3. Complete the purchase (update listing, create transaction record)
    const purchaseResult = await completePurchase(
      listingId,
      buyerWallet,
      buyerUserId,
      signature,
      verification.amountTransferred
    );

    console.log(`[API] Purchase completed successfully for listing ${listingId}`);

    res.json({
      success: true,
      verification: {
        valid: true,
        amountTransferred: verification.amountTransferred,
        blockTime: verification.blockTime,
        slot: verification.slot
      },
      purchase: purchaseResult
    });
  } catch (error) {
    console.error('[API] Error verifying payment:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/payments/history/:walletAddress
 * Get transaction history for a wallet
 *
 * Query params:
 * - type: 'buyer' | 'seller' | 'all' (default: 'all')
 *
 * Response:
 * {
 *   success: boolean,
 *   transactions: Array<{
 *     id: string,
 *     listing_id: string,
 *     buyer_wallet: string,
 *     seller_wallet: string,
 *     amount_sol: number,
 *     signature: string,
 *     status: string,
 *     created_at: string,
 *     confirmed_at: string,
 *     listing: {
 *       product_name: string,
 *       image_url: string,
 *       nft_mint_address: string
 *     }
 *   }>
 * }
 */
router.get('/history/:walletAddress', async (req, res) => {
  try {
    const { walletAddress } = req.params;
    const { type = 'all' } = req.query;

    if (!walletAddress) {
      return res.status(400).json({
        success: false,
        error: 'Wallet address is required'
      });
    }

    console.log(`[API] Fetching transaction history for wallet ${walletAddress}, type: ${type}`);

    const transactions = await getTransactionHistory(walletAddress, type);

    res.json({
      success: true,
      transactions,
      count: transactions.length
    });
  } catch (error) {
    console.error('[API] Error fetching transaction history:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/payments/balance/:walletAddress
 * Get SOL balance for a wallet
 *
 * Response:
 * {
 *   success: boolean,
 *   walletAddress: string,
 *   balance: number
 * }
 */
router.get('/balance/:walletAddress', async (req, res) => {
  try {
    const { walletAddress } = req.params;

    if (!walletAddress) {
      return res.status(400).json({
        success: false,
        error: 'Wallet address is required'
      });
    }

    console.log(`[API] Fetching balance for wallet ${walletAddress}`);

    const balance = await getWalletBalance(walletAddress);

    res.json({
      success: true,
      walletAddress,
      balance
    });
  } catch (error) {
    console.error('[API] Error fetching wallet balance:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/payments/listing/:listingId
 * Get listing details (for payment UI)
 *
 * Response:
 * {
 *   success: boolean,
 *   listing: {
 *     id: string,
 *     product_name: string,
 *     price_sol: number,
 *     seller_wallet: string,
 *     image_url: string,
 *     nft_mint_address: string,
 *     status: string
 *   }
 * }
 */
router.get('/listing/:listingId', async (req, res) => {
  try {
    const { listingId } = req.params;

    if (!listingId) {
      return res.status(400).json({
        success: false,
        error: 'Listing ID is required'
      });
    }

    console.log(`[API] Fetching listing ${listingId}`);

    const listing = await fetchListing(listingId);

    res.json({
      success: true,
      listing
    });
  } catch (error) {
    console.error('[API] Error fetching listing:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/payments/cancel
 * Mark a pending transaction as cancelled (if needed)
 *
 * Request body:
 * {
 *   listingId: string
 * }
 *
 * Response:
 * {
 *   success: boolean
 * }
 */
router.post('/cancel', async (req, res) => {
  try {
    const { listingId } = req.body;

    if (!listingId) {
      return res.status(400).json({
        success: false,
        error: 'Listing ID is required'
      });
    }

    console.log(`[API] Cancelling payment for listing ${listingId}`);

    // Note: In Solana Pay, there's no actual cancellation needed
    // This endpoint is mainly for UI state management
    // The listing remains active until a successful payment is verified

    res.json({
      success: true,
      message: 'Payment cancelled (listing remains active)'
    });
  } catch (error) {
    console.error('[API] Error cancelling payment:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

export default router;
