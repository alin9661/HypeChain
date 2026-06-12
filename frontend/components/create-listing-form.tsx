'use client';

import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Upload, Loader2, CheckCircle, XCircle, Wallet } from 'lucide-react';
import { usePrivy } from '@privy-io/react-auth';
import { useCreateListing, useImageUpload } from '@/hooks/useApi';
import { useWallet } from '@/contexts/AppContext';

// Validation schema — an account wallet is required (auto-filled after sign-in)
const listingFormSchema = z.object({
  userWallet: z
    .string()
    .optional()
    .refine(
      (val) => !val || (val.length >= 32 && val.length <= 44),
      'Invalid Solana wallet address'
    ),
  optionalPriceSol: z
    .number()
    .min(0, 'Price must be positive')
    .optional()
    .or(z.literal('')),
});

type ListingFormData = z.infer<typeof listingFormSchema>;

export function CreateListingForm() {
  const { authenticated, login } = usePrivy();
  const { wallet, connectWallet } = useWallet();
  // Every listing must belong to a real user wallet — guests sign in first.
  const needsAccount = !authenticated || !wallet.address;
  const { createListing, loading, error, progress, data, reset } =
    useCreateListing();
  const { preview, handleFileChange, reset: resetImage } = useImageUpload();
  const [dragActive, setDragActive] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
    setValue,
  } = useForm<ListingFormData>({
    resolver: zodResolver(listingFormSchema),
    defaultValues: {
      userWallet: wallet.address || '',
      optionalPriceSol: 0,
    },
  });

  // Update wallet address when connected
  React.useEffect(() => {
    if (wallet.address) {
      setValue('userWallet', wallet.address);
    }
  }, [wallet.address, setValue]);

  const onSubmit = async (formData: ListingFormData) => {
    const sellerWallet = formData.userWallet || wallet.address;
    if (needsAccount || !sellerWallet) {
      login();
      return;
    }

    if (!preview) {
      alert('Please upload a product image');
      return;
    }

    const result = await createListing({
      userWallet: sellerWallet,
      productImage: preview,
      optionalPriceSol:
        typeof formData.optionalPriceSol === 'number'
          ? formData.optionalPriceSol
          : 0,
    });

    if (result.success) {
      // Reset form after successful creation
      resetImage();
      setValue('optionalPriceSol', 0);
    }
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      await handleFileChange(e.dataTransfer.files[0]);
    }
  };

  const handleFileInput = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      await handleFileChange(e.target.files[0]);
    }
  };

  const handleConnectWallet = () => {
    // Placeholder for wallet connection - will be implemented later
    const demoWallet = '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU';
    connectWallet(demoWallet, 1.5);
  };

  return (
    <div
      className="max-w-2xl mx-auto p-6 md:p-7"
      style={{
        background: 'var(--hc-surface-1)',
        border: '1px solid var(--hc-border)',
      }}
    >
      <div
        className="mb-2 font-mono text-[11px] uppercase tracking-[0.14em]"
        style={{ color: 'var(--hc-accent)' }}
      >
        Evidence Filing
      </div>
      <h2
        className="mb-6 font-mono text-[17px] uppercase tracking-[-0.01em]"
        style={{ color: 'var(--hc-text)', fontWeight: 500 }}
      >
        Create NFT Listing
      </h2>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        {/* Wallet Connection - Optional */}
        <div>
          <label
            className="block mb-2 font-mono text-[11px] uppercase tracking-[0.16em]"
            style={{ color: 'var(--hc-text-muted)', fontWeight: 500 }}
          >
            Solana Wallet Address{' '}
            <span style={{ color: 'var(--hc-accent)', fontWeight: 400 }}>(Required)</span>
          </label>
          <p
            className="mb-3 font-mono text-[11px]"
            style={{ color: 'var(--hc-text-muted)', letterSpacing: '0.04em' }}
            title="An account with a wallet is required to create a listing"
          >
            Sign in with your account to mint your NFT on Solana blockchain
          </p>
          {wallet.connected && (
            <div
              className="flex items-center gap-2 p-3 mb-2"
              style={{
                background: 'var(--hc-surface-2)',
                border: '1px solid var(--hc-hairline)',
              }}
            >
              <CheckCircle className="w-5 h-5" style={{ color: 'var(--hc-verify-high)' }} />
              <span className="font-mono text-sm truncate flex-1" style={{ color: 'var(--hc-text)' }}>
                {wallet.address}
              </span>
              <span className="font-mono text-sm" style={{ color: 'var(--hc-text-muted)' }}>
                {wallet.balance?.toFixed(2)} USDC
              </span>
            </div>
          )}
          <input
            type="text"
            {...register('userWallet')}
            className="w-full px-4 py-2.5 font-mono text-sm transition-colors focus:outline-none"
            style={{
              background: 'var(--hc-bg)',
              border: '1px solid var(--hc-border)',
              color: 'var(--hc-text)',
            }}
            onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--hc-accent)')}
            onBlur={(e) => (e.currentTarget.style.borderColor = 'var(--hc-border)')}
            placeholder="Sign in to use your account wallet"
          />
          {errors.userWallet && (
            <p className="mt-1 font-mono text-[11px] uppercase tracking-[0.1em]" style={{ color: 'var(--hc-verify-low)' }}>
              {errors.userWallet.message}
            </p>
          )}
        </div>

        {/* Image Upload */}
        <div>
          <label
            className="block mb-2 font-mono text-[11px] uppercase tracking-[0.16em]"
            style={{ color: 'var(--hc-text-muted)', fontWeight: 500 }}
          >
            Product Image
          </label>
          <div
            className="relative border border-dashed transition-colors"
            style={{
              borderColor: dragActive ? 'var(--hc-accent)' : 'var(--hc-border)',
              background: dragActive ? 'var(--hc-accent-tint)' : 'transparent',
            }}
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
          >
            {preview ? (
              <div className="relative aspect-square">
                <img
                  src={preview}
                  alt="Preview"
                  className="w-full h-full object-cover"
                />
                <button
                  type="button"
                  onClick={() => {
                    resetImage();
                  }}
                  className="absolute top-2 right-2 inline-flex h-9 w-9 items-center justify-center transition-colors"
                  style={{
                    background: 'rgba(0, 0, 0, 0.7)',
                    border: '1px solid var(--hc-verify-low)',
                    color: 'var(--hc-verify-low)',
                    clipPath:
                      'polygon(6px 0, 100% 0, 100% calc(100% - 6px), calc(100% - 6px) 100%, 0 100%, 0 6px)',
                  }}
                  aria-label="Remove image"
                >
                  <XCircle className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <label className="flex flex-col items-center justify-center py-12 cursor-pointer">
                <Upload className="w-12 h-12 mb-3" style={{ color: 'var(--hc-text-muted)' }} />
                <p className="mb-1 font-mono text-[12px] uppercase tracking-[0.12em]" style={{ color: 'var(--hc-text)', fontWeight: 500 }}>
                  Drag & drop or click to upload
                </p>
                <p className="font-mono text-[11px] uppercase tracking-[0.1em]" style={{ color: 'var(--hc-text-muted)' }}>
                  JPEG · PNG · WebP — Max 5 MB
                </p>
                <input
                  type="file"
                  accept="image/jpeg,image/jpg,image/png,image/webp"
                  onChange={handleFileInput}
                  className="hidden"
                />
              </label>
            )}
          </div>
        </div>

        {/* Price Input */}
        <div>
          <label
            className="block mb-2 font-mono text-[11px] uppercase tracking-[0.16em]"
            style={{ color: 'var(--hc-text-muted)', fontWeight: 500 }}
          >
            Price <span style={{ color: 'var(--hc-accent)' }}>USDC</span> — Optional
          </label>
          <input
            type="number"
            step="0.01"
            {...register('optionalPriceSol', { valueAsNumber: true })}
            className="w-full px-4 py-2.5 font-mono text-sm tabular-nums transition-colors focus:outline-none"
            style={{
              background: 'var(--hc-bg)',
              border: '1px solid var(--hc-border)',
              color: 'var(--hc-text)',
            }}
            onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--hc-accent)')}
            onBlur={(e) => (e.currentTarget.style.borderColor = 'var(--hc-border)')}
            placeholder="0.00"
          />
          {errors.optionalPriceSol && (
            <p className="mt-1 font-mono text-[11px] uppercase tracking-[0.1em]" style={{ color: 'var(--hc-verify-low)' }}>
              {errors.optionalPriceSol.message}
            </p>
          )}
        </div>

        {/* Progress Indicator */}
        {loading && progress && (
          <div
            className="p-4 flex items-center gap-3"
            style={{
              background: 'var(--hc-accent-tint)',
              border: '1px solid var(--hc-accent-deep)',
              borderLeft: '2px solid var(--hc-accent)',
            }}
          >
            <Loader2 className="w-5 h-5 animate-spin" style={{ color: 'var(--hc-accent)' }} />
            <span className="font-mono text-[12px] uppercase tracking-[0.12em]" style={{ color: 'var(--hc-accent)' }}>
              {progress}
            </span>
          </div>
        )}

        {/* Error Display */}
        {error && (
          <div
            className="p-4 flex items-center gap-3"
            style={{
              background: 'rgba(255, 59, 48, 0.08)',
              border: '1px solid rgba(255, 59, 48, 0.3)',
              borderLeft: '2px solid var(--hc-verify-low)',
            }}
          >
            <XCircle className="w-5 h-5" style={{ color: 'var(--hc-verify-low)' }} />
            <span className="font-mono text-[12px] uppercase tracking-[0.12em]" style={{ color: 'var(--hc-verify-low)' }}>
              {error}
            </span>
          </div>
        )}

        {/* Success Display */}
        {data && !loading && (
          <div
            className="p-4"
            style={{
              background: 'rgba(0, 229, 160, 0.06)',
              border: '1px solid rgba(0, 229, 160, 0.3)',
              borderLeft: '2px solid var(--hc-verify-high)',
            }}
          >
            <div className="flex items-center gap-3 mb-3">
              <CheckCircle className="w-5 h-5" style={{ color: 'var(--hc-verify-high)' }} />
              <span className="font-mono text-[12px] uppercase tracking-[0.14em]" style={{ color: 'var(--hc-verify-high)', fontWeight: 500 }}>
                NFT Created Successfully
              </span>
            </div>
            <div className="text-sm space-y-1 ml-8">
              <p>
                <span className="font-mono text-[11px] uppercase tracking-[0.12em]" style={{ color: 'var(--hc-text-muted)' }}>Product:</span>{' '}
                <span className="font-mono" style={{ color: 'var(--hc-text)' }}>{data.product_name}</span>
              </p>
              <p>
                <span className="font-mono text-[11px] uppercase tracking-[0.12em]" style={{ color: 'var(--hc-text-muted)' }}>Mint Address:</span>{' '}
                <span className="font-mono text-xs" style={{ color: 'var(--hc-info)' }}>{data.nft_mint_address}</span>
              </p>
              <p>
                <span className="font-mono text-[11px] uppercase tracking-[0.12em]" style={{ color: 'var(--hc-text-muted)' }}>Price:</span>{' '}
                <span className="font-mono tabular-nums" style={{ color: 'var(--hc-accent)' }}>{data.listing_price_sol} USDC</span>
              </p>
              <a
                href={data.nft_image_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block mt-2 font-mono text-[11px] uppercase tracking-[0.14em] hover:underline"
                style={{ color: 'var(--hc-accent)' }}
              >
                View on IPFS →
              </a>
            </div>
          </div>
        )}

        {/* Submit Button — guests are routed to sign-in before they can file */}
        <button
          type={needsAccount ? 'button' : 'submit'}
          onClick={needsAccount ? () => login() : undefined}
          disabled={loading || (!needsAccount && !preview)}
          className="w-full px-6 h-14 font-mono text-sm uppercase tracking-[0.14em] transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          style={{
            background: 'var(--hc-bg)',
            border: '1px solid var(--hc-accent)',
            color: 'var(--hc-accent)',
            clipPath:
              'polygon(12px 0, 100% 0, 100% calc(100% - 12px), calc(100% - 12px) 100%, 0 100%, 0 12px)',
            fontWeight: 500,
            boxShadow: 'inset 0 0 0px 0 transparent',
          }}
          onMouseEnter={(e) => {
            if (e.currentTarget.disabled) return;
            e.currentTarget.style.background = 'var(--hc-accent)';
            e.currentTarget.style.color = '#000';
            e.currentTarget.style.boxShadow =
              'inset 0 0 32px rgba(201, 164, 54, 0.6), 0 0 24px rgba(235, 198, 88, 0.18)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'var(--hc-bg)';
            e.currentTarget.style.color = 'var(--hc-accent)';
            e.currentTarget.style.boxShadow = 'inset 0 0 0px 0 transparent';
          }}
        >
          {loading ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              Filing Intake…
            </>
          ) : needsAccount ? (
            'Sign In to File Intake →'
          ) : (
            'File Intake →'
          )}
        </button>
      </form>
    </div>
  );
}
