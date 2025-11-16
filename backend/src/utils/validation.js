import { PublicKey } from '@solana/web3.js';

export function isValidSolanaPublicKey(publicKey) {
  try {
    const pubkey = new PublicKey(publicKey);
    return PublicKey.isOnCurve(pubkey.toBuffer());
  } catch {
    return false;
  }
}

export function validateBase64Image(base64String) {
  try {
    const base64Regex = /^data:image\/(jpeg|jpg|png|webp);base64,/;
    const match = base64String.match(base64Regex);

    if (!match) {
      return {
        valid: false,
        error: 'Invalid image format. Must be JPEG, PNG, or WebP with base64 encoding'
      };
    }

    const mimeType = `image/${match[1]}`;
    const base64Data = base64String.split(',')[1];
    const sizeInBytes = Math.ceil((base64Data.length * 3) / 4);
    const maxSize = 5 * 1024 * 1024; // 5MB

    if (sizeInBytes > maxSize) {
      return {
        valid: false,
        error: `Image size (${(sizeInBytes / 1024 / 1024).toFixed(2)}MB) exceeds maximum of 5MB`
      };
    }

    try {
      Buffer.from(base64Data, 'base64');
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

export function base64ToBuffer(base64String) {
  const base64Data = base64String.split(',')[1];
  return Buffer.from(base64Data, 'base64');
}
