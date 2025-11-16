'use client';

import { useState } from 'react';
import { Connection, PublicKey, Transaction, SystemProgram, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { usePrivy } from '@privy-io/react-auth';
import { apiClient } from '@/lib/api-client';
import { toast } from 'sonner';

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

    // Find Solana wallet from Privy user
    const solanaWallet = user.linkedAccounts.find(
      (account) => account.type === 'wallet' && account.chainType === 'solana'
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

      const transaction = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: buyerPublicKey,
          toPubkey: recipientPublicKey,
          lamports: amountLamports,
        })
      );

      // Get recent blockhash
      const { blockhash } = await connection.getLatestBlockhash();
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = buyerPublicKey;

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

      // Wait for confirmation
      const confirmation = await connection.confirmTransaction(signature, 'confirmed');

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

      // Success!
      toast.success(`🎉 Successfully purchased ${productName}!`, {
        description: `Transaction: ${signature.substring(0, 8)}...${signature.substring(signature.length - 8)}`,
        duration: 5000,
      });

      setStatus('Purchase complete!');
      onSuccess?.();
    } catch (error: any) {
      console.error('Purchase error:', error);

      const errorMessage = error?.message || 'Purchase failed. Please try again.';
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
          w-full px-6 py-3 rounded-md font-mono uppercase font-bold
          transition-all duration-200
          ${
            isDisabled
              ? 'bg-gray-400 text-gray-700 cursor-not-allowed'
              : 'bg-[#FFC700] text-black hover:bg-[#FFD700] hover:scale-105 active:scale-95'
          }
          ${className}
        `}
      >
        {loading ? (
          <span className="flex items-center justify-center gap-2">
            <svg
              className="animate-spin h-5 w-5"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
            {status || 'Processing...'}
          </span>
        ) : (
          `Buy for ${price} SOL`
        )}
      </button>

      {!authenticated && (
        <p className="text-sm text-gray-400 text-center font-mono">
          Connect your wallet to purchase
        </p>
      )}

      {loading && status && (
        <p className="text-sm text-[#FFC700] text-center font-mono animate-pulse">
          {status}
        </p>
      )}
    </div>
  );
}
