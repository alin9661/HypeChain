'use client';

import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Upload, Loader2, CheckCircle, XCircle, Wallet } from 'lucide-react';
import { useCreateListing, useImageUpload } from '@/hooks/useApi';
import { useWallet } from '@/contexts/AppContext';

// Validation schema
const listingFormSchema = z.object({
  userWallet: z
    .string()
    .min(32, 'Invalid Solana wallet address')
    .max(44, 'Invalid Solana wallet address'),
  optionalPriceSol: z
    .number()
    .min(0, 'Price must be positive')
    .optional()
    .or(z.literal('')),
});

type ListingFormData = z.infer<typeof listingFormSchema>;

export function CreateListingForm() {
  const { wallet, connectWallet } = useWallet();
  const { createListing, loading, error, progress, data, reset } =
    useCreateListing();
  const { preview, handleFileChange, reset: resetImage } = useImageUpload();
  const [dragActive, setDragActive] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
    setValue,
    watch,
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
    if (!preview) {
      alert('Please upload a product image');
      return;
    }

    const result = await createListing({
      userWallet: formData.userWallet,
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
    <div className="max-w-2xl mx-auto p-6 bg-card border border-border rounded-lg">
      <h2 className="text-2xl font-bold mb-6">Create NFT Listing</h2>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        {/* Wallet Connection */}
        <div>
          <label className="block text-sm font-medium mb-2">
            Solana Wallet Address
          </label>
          {!wallet.connected ? (
            <button
              type="button"
              onClick={handleConnectWallet}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-primary text-primary-foreground rounded-lg hover:opacity-90 transition"
            >
              <Wallet className="w-5 h-5" />
              Connect Wallet
            </button>
          ) : (
            <div className="flex items-center gap-2 p-3 bg-muted rounded-lg">
              <CheckCircle className="w-5 h-5 text-green-500" />
              <span className="font-mono text-sm truncate flex-1">
                {wallet.address}
              </span>
              <span className="text-sm text-muted-foreground">
                {wallet.balance?.toFixed(2)} SOL
              </span>
            </div>
          )}
          <input
            type="text"
            {...register('userWallet')}
            className="mt-2 w-full px-4 py-2 bg-background border border-border rounded-lg focus:ring-2 focus:ring-primary font-mono text-sm"
            placeholder="Enter Solana wallet address"
          />
          {errors.userWallet && (
            <p className="mt-1 text-sm text-red-500">
              {errors.userWallet.message}
            </p>
          )}
        </div>

        {/* Image Upload */}
        <div>
          <label className="block text-sm font-medium mb-2">
            Product Image
          </label>
          <div
            className={`relative border-2 border-dashed rounded-lg transition ${
              dragActive
                ? 'border-primary bg-primary/10'
                : 'border-border hover:border-primary/50'
            }`}
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
                  className="w-full h-full object-cover rounded-lg"
                />
                <button
                  type="button"
                  onClick={() => {
                    resetImage();
                  }}
                  className="absolute top-2 right-2 p-2 bg-red-500 text-white rounded-full hover:bg-red-600"
                >
                  <XCircle className="w-5 h-5" />
                </button>
              </div>
            ) : (
              <label className="flex flex-col items-center justify-center py-12 cursor-pointer">
                <Upload className="w-12 h-12 text-muted-foreground mb-3" />
                <p className="text-sm text-muted-foreground mb-1">
                  Drag & drop or click to upload
                </p>
                <p className="text-xs text-muted-foreground">
                  JPEG, PNG, or WebP (max 5MB)
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
          <label className="block text-sm font-medium mb-2">
            Price (SOL) - Optional
          </label>
          <input
            type="number"
            step="0.01"
            {...register('optionalPriceSol', { valueAsNumber: true })}
            className="w-full px-4 py-2 bg-background border border-border rounded-lg focus:ring-2 focus:ring-primary"
            placeholder="0.00"
          />
          {errors.optionalPriceSol && (
            <p className="mt-1 text-sm text-red-500">
              {errors.optionalPriceSol.message}
            </p>
          )}
        </div>

        {/* Progress Indicator */}
        {loading && progress && (
          <div className="p-4 bg-blue-500/10 border border-blue-500/20 rounded-lg">
            <div className="flex items-center gap-3">
              <Loader2 className="w-5 h-5 animate-spin text-blue-500" />
              <span className="text-sm text-blue-500">{progress}</span>
            </div>
          </div>
        )}

        {/* Error Display */}
        {error && (
          <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg">
            <div className="flex items-center gap-3">
              <XCircle className="w-5 h-5 text-red-500" />
              <span className="text-sm text-red-500">{error}</span>
            </div>
          </div>
        )}

        {/* Success Display */}
        {data && !loading && (
          <div className="p-4 bg-green-500/10 border border-green-500/20 rounded-lg">
            <div className="flex items-center gap-3 mb-2">
              <CheckCircle className="w-5 h-5 text-green-500" />
              <span className="text-sm font-medium text-green-500">
                NFT Created Successfully!
              </span>
            </div>
            <div className="text-sm space-y-1 ml-8">
              <p>
                <span className="text-muted-foreground">Product:</span>{' '}
                <span className="font-medium">{data.product_name}</span>
              </p>
              <p>
                <span className="text-muted-foreground">Mint Address:</span>{' '}
                <span className="font-mono text-xs">{data.nft_mint_address}</span>
              </p>
              <p>
                <span className="text-muted-foreground">Price:</span>{' '}
                <span className="font-medium">{data.listing_price_sol} SOL</span>
              </p>
              <a
                href={data.nft_image_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block text-primary hover:underline"
              >
                View on IPFS →
              </a>
            </div>
          </div>
        )}

        {/* Submit Button */}
        <button
          type="submit"
          disabled={loading || !preview}
          className="w-full px-6 py-3 bg-primary text-primary-foreground rounded-lg font-medium hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition flex items-center justify-center gap-2"
        >
          {loading ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              Creating NFT...
            </>
          ) : (
            'Create NFT Listing'
          )}
        </button>
      </form>
    </div>
  );
}
