import bs58 from 'bs58';
import { PublicKey } from '@solana/web3.js';

/**
 * Validates if a string is a valid Solana public key
 */
export function isValidSolanaPublicKey(publicKey: string): boolean {
  try {
    const pubkey = new PublicKey(publicKey);
    return PublicKey.isOnCurve(pubkey.toBuffer());
  } catch {
    return false;
  }
}

/**
 * Validates base64 encoded image
 * Checks format, size, and mime type
 */
export function validateBase64Image(base64String: string): {
  valid: boolean;
  error?: string;
  mimeType?: string;
  size?: number;
} {
  try {
    // Check if it's a valid base64 data URL
    const base64Regex = /^data:image\/(jpeg|jpg|png|webp);base64,/;
    const match = base64String.match(base64Regex);

    if (!match) {
      return {
        valid: false,
        error: 'Invalid image format. Must be JPEG, PNG, or WebP with base64 encoding'
      };
    }

    const mimeType = `image/${match[1]}`;

    // Extract base64 data
    const base64Data = base64String.split(',')[1];

    // Calculate size in bytes
    const sizeInBytes = Math.ceil((base64Data.length * 3) / 4);
    const maxSize = 5 * 1024 * 1024; // 5MB

    if (sizeInBytes > maxSize) {
      return {
        valid: false,
        error: `Image size (${(sizeInBytes / 1024 / 1024).toFixed(2)}MB) exceeds maximum of 5MB`
      };
    }

    // Try to decode to verify it's valid base64
    try {
      atob(base64Data);
    } catch {
      return {
        valid: false,
        error: 'Invalid base64 encoding'
      };
    }

    return {
      valid: true,
      mimeType,
      size: sizeInBytes
    };
  } catch (error) {
    return {
      valid: false,
      error: 'Failed to validate image'
    };
  }
}

/**
 * Converts base64 data URL to File object
 */
export function base64ToFile(base64String: string, filename: string = 'image.jpg'): File {
  const arr = base64String.split(',');
  const mime = arr[0].match(/:(.*?);/)?.[1] || 'image/jpeg';
  const bstr = atob(arr[1]);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);

  while (n--) {
    u8arr[n] = bstr.charCodeAt(n);
  }

  return new File([u8arr], filename, { type: mime });
}

/**
 * Converts base64 to Buffer for Node.js environments
 */
export function base64ToBuffer(base64String: string): Buffer {
  const base64Data = base64String.split(',')[1];
  return Buffer.from(base64Data, 'base64');
}
