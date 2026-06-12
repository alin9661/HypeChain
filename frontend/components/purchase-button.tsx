'use client';

import { useState } from 'react';
import { Connection, PublicKey, Transaction, SystemProgram, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { usePrivy } from '@privy-io/react-auth';
import { apiClient } from '@/lib/api-client';
import {
  assertCosignedInstructions,
  assertPriceMatches,
  deserializeCosignedTx,
} from '@/lib/purchase-helpers';
import { toast } from 'sonner';

/**
 * Feature flag for the Anchor-based purchase flow.
 *
 * Off (default): `SystemProgram.transfer` SOL-only flow. The legacy path
 * that ships in production today — no on-chain listing state mutation.
 *
 * On: builds an Anchor `purchase_evidence` instruction. This flips the
 * `EvidenceListing.status` to `Sold` on-chain. Requires the seller to
 * co-sign (custodial listings: backend co-signs; user-wallet listings:
 * out-of-band coordination). See plan §"Files to create / modify" for
 * the full architectural intent.
 */
const USE_ANCHOR_PURCHASE =
  process.env.NEXT_PUBLIC_USE_ANCHOR_PURCHASE === '1';

interface PurchaseButtonProps {
  listingId: string;
  price: number;
  sellerWallet: string;
  productName: string;
  disabled?: boolean;
  className?: string;
  onSuccess?: () => void;
  onError?: (error: string) => void;
}

export function PurchaseButton({
  listingId,
  price,
  sellerWallet,
  productName,
  disabled = false,
  className = '',
  onSuccess,
  onError,
}: PurchaseButtonProps) {
  const { user, authenticated } = usePrivy();
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string>('');

  const getSolanaWallet = () => {
    if (!user) return null;

    // Find Solana wallet from Privy user. Type-guard predicate so the find
    // result narrows to the wallet member of the LinkedAccount union.
    const solanaWallet = user.linkedAccounts.find(
      (account): account is Extract<typeof account, { address: string }> =>
        account.type === 'wallet' && account.chainType === 'solana'
    );

    return solanaWallet?.address || null;
  };

  const handlePurchase = async () => {
    if (!authenticated || !user) {
      toast.error('Please connect your wallet first');
      return;
    }

    const buyerWallet = getSolanaWallet();
    if (!buyerWallet) {
      toast.error('Please connect a Solana wallet');
      return;
    }

    if (buyerWallet === sellerWallet) {
      toast.error('You cannot purchase your own listing');
      return;
    }

    setLoading(true);
    setStatus('Creating payment request...');

    try {
      // Step 1: Create payment request
      const paymentResponse = await apiClient.createPayment({
        listingId,
        buyerWallet,
      });

      if (!paymentResponse.success || !paymentResponse.data) {
        throw new Error(paymentResponse.error || 'Failed to create payment request');
      }

      const paymentRequest = paymentResponse.data.paymentRequest;
      setStatus('Building transaction...');

      // Step 2: Create Solana connection
      const rpcUrl = process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 'https://api.devnet.solana.com';
      const connection = new Connection(rpcUrl, 'confirmed');

      // Step 3: Build transaction
      const buyerPublicKey = new PublicKey(buyerWallet);
      const recipientPublicKey = new PublicKey(paymentRequest.recipient);
      const amountLamports = Math.floor(paymentRequest.amount * LAMPORTS_PER_SOL);

      // Anchor path is feature-flagged. `purchase_evidence` needs BOTH the
      // buyer and seller to sign; for custodial (guest) listings the backend
      // co-sign endpoint builds the full transaction and partial-signs as
      // seller — we verify price + fee payer, then the buyer signs on top.
      // Non-custodial / never-anchored listings (SELLER_NOT_CUSTODIAL,
      // LISTING_NOT_ON_CHAIN) fall back to the legacy SOL-only transfer.
      let transaction: Transaction | null = null;
      let confirmStrategy: { blockhash: string; lastValidBlockHeight: number } | null = null;

      if (USE_ANCHOR_PURCHASE && paymentRequest.nftMintAddress) {
        setStatus('Requesting platform co-signature...');
        const cosign = await apiClient.cosignPurchase({ listingId, buyerWallet });

        if (cosign.success && cosign.data) {
          // The price shown to the user must equal what the chain charges.
          assertPriceMatches(paymentRequest.amount, cosign.data.priceLamports);
          transaction = deserializeCosignedTx(cosign.data.transaction, buyerPublicKey);
          // Never sign unverified bytes: every instruction must be one the
          // co-sign endpoint legitimately builds (allowlisted programs, one
          // purchase_evidence at the agreed price, no stray transfers).
          assertCosignedInstructions(transaction, buyerPublicKey, cosign.data.priceLamports);
          confirmStrategy = {
            blockhash: cosign.data.blockhash,
            lastValidBlockHeight: cosign.data.lastValidBlockHeight,
          };
        } else if (
          cosign.code === 'SELLER_NOT_CUSTODIAL' ||
          cosign.code === 'LISTING_NOT_ON_CHAIN'
        ) {
          // Explicitly non-custodial / never-anchored listing — the legacy
          // SOL-only transfer below is the correct path.
        } else if (!cosign.code && cosign.status === 404) {
          // Code-less 404 means the co-sign endpoint itself is missing
          // (misdeployed write service). Falling back to the legacy transfer
          // here would charge the buyer WITHOUT delivering the NFT on
          // custodial listings — hard-fail instead (red-team finding).
          throw new Error('Purchase service unavailable — please try again shortly.');
        } else {
          throw new Error(cosign.error || 'Failed to obtain platform co-signature');
        }
      }

      if (!transaction) {
        transaction = new Transaction().add(
          SystemProgram.transfer({
            fromPubkey: buyerPublicKey,
            toPubkey: recipientPublicKey,
            lamports: amountLamports,
          })
        );
        const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
        transaction.recentBlockhash = blockhash;
        transaction.feePayer = buyerPublicKey;
        confirmStrategy = { blockhash, lastValidBlockHeight };
      }

      setStatus('Awaiting wallet approval...');

      // Step 4: Request wallet to sign and send transaction
      // Access Solana provider from window
      const solanaProvider = (window as any).solana || (window as any).phantom?.solana;

      if (!solanaProvider) {
        throw new Error('Solana wallet not found. Please install Phantom or another Solana wallet.');
      }

      // Connect wallet if not connected
      if (!solanaProvider.isConnected) {
        await solanaProvider.connect();
      }

      // Sign and send transaction
      const signed = await solanaProvider.signTransaction(transaction);
      setStatus('Sending transaction...');

      const signature = await connection.sendRawTransaction(signed.serialize());

      setStatus('Confirming transaction...');

      // Wait for confirmation — the blockhash strategy surfaces expiry
      // (block height exceeded) instead of hanging. On expiry the user can
      // simply retry: the co-sign endpoint is stateless and re-issues
      // against a fresh blockhash.
      const confirmation = await connection.confirmTransaction(
        { signature, ...confirmStrategy! },
        'confirmed'
      );

      if (confirmation.value.err) {
        throw new Error('Transaction failed on blockchain');
      }

      setStatus('Verifying payment...');

      // Step 5: Verify payment with backend
      const verifyResponse = await apiClient.verifyPayment({
        signature,
        listingId,
        buyerWallet,
        buyerUserId: user.id,
      });

      if (!verifyResponse.success || !verifyResponse.data) {
        throw new Error(verifyResponse.error || 'Failed to verify payment');
      }

      // Success — terminal voice, no confetti.
      toast.success(`PURCHASE CONFIRMED — ${productName}`, {
        description: `Transaction: ${signature.substring(0, 8)}...${signature.substring(signature.length - 8)}`,
        duration: 5000,
      });

      setStatus('Purchase complete!');
      onSuccess?.();
    } catch (error: any) {
      console.error('Purchase error:', error);

      // Blockhash expiry is the one designed-for retryable failure: surface
      // a plain retry hint instead of web3.js's signature-embedding message.
      const isExpiry =
        error?.name === 'TransactionExpiredBlockheightExceededError' ||
        /block height exceeded/i.test(error?.message || '');
      const errorMessage = isExpiry
        ? 'Transaction expired before confirmation — please retry the purchase.'
        : error?.message || 'Purchase failed. Please try again.';
      toast.error('Purchase Failed', {
        description: errorMessage,
        duration: 5000,
      });

      onError?.(errorMessage);
      setStatus('');
    } finally {
      setLoading(false);
    }
  };

  const isDisabled = disabled || loading || !authenticated;

  return (
    <div className="space-y-2">
      <button
        onClick={handlePurchase}
        disabled={isDisabled}
        className={`
          w-full px-6 py-3 rounded font-mono uppercase font-bold
          transition-all duration-200
          ${
            isDisabled
              ? 'bg-[var(--hc-surface-2)] text-[var(--hc-text-muted)] cursor-not-allowed'
              : 'bg-[var(--hc-accent)] text-black hover:bg-[var(--hc-accent-deep)] hover:scale-[1.02] active:scale-[0.98]'
          }
          ${className}
        `}
      >
        {loading ? (
          <span className="font-mono uppercase tracking-widest animate-pulse">
            {status || 'Processing...'}
          </span>
        ) : (
          `Buy for ${price} SOL`
        )}
      </button>

      {!authenticated && (
        <p className="text-sm text-[var(--hc-text-muted)] text-center font-mono">
          Connect your wallet to purchase
        </p>
      )}

      {loading && status && (
        <p className="text-sm text-[var(--hc-accent)] text-center font-mono animate-pulse">
          {status}
        </p>
      )}
    </div>
  );
}
