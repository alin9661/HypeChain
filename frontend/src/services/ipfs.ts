import { NFTStorage, File, Blob } from 'nft.storage';
import { NFTMetadata } from '@/types/listing';
import { base64ToBuffer } from '@/utils/validation';

const NFT_STORAGE_API_KEY = process.env.NFT_STORAGE_API_KEY;

if (!NFT_STORAGE_API_KEY) {
  throw new Error('NFT_STORAGE_API_KEY is not set in environment variables');
}

const nftStorageClient = new NFTStorage({ token: NFT_STORAGE_API_KEY });

/**
 * Uploads an image to IPFS via nft.storage
 * @param base64Image Base64 encoded image string
 * @param filename Optional filename
 * @returns IPFS CID and gateway URL
 */
export async function uploadImageToIPFS(
  base64Image: string,
  filename: string = 'product.png'
): Promise<{ cid: string; url: string }> {
  try {
    // Convert base64 to buffer
    const imageBuffer = base64ToBuffer(base64Image);

    // Extract mime type from base64 string
    const mimeType = base64Image.match(/data:([^;]+);/)?.[1] || 'image/png';

    // Create File object for nft.storage
    const imageFile = new File([imageBuffer], filename, { type: mimeType });

    // Upload to IPFS
    const cid = await nftStorageClient.storeBlob(imageFile);

    const url = `https://nftstorage.link/ipfs/${cid}`;

    console.log(`Image uploaded to IPFS: ${url}`);

    return { cid, url };
  } catch (error) {
    console.error('IPFS image upload error:', error);
    throw new Error(`Failed to upload image to IPFS: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Uploads NFT metadata JSON to IPFS
 * @param metadata NFT metadata object
 * @returns IPFS URI for metadata
 */
export async function uploadMetadataToIPFS(metadata: NFTMetadata): Promise<{
  uri: string;
  cid: string;
}> {
  try {
    // Convert metadata to JSON string
    const metadataJSON = JSON.stringify(metadata, null, 2);

    // Create Blob for metadata
    const metadataBlob = new Blob([metadataJSON], { type: 'application/json' });

    // Upload to IPFS
    const cid = await nftStorageClient.storeBlob(metadataBlob);

    const uri = `https://nftstorage.link/ipfs/${cid}`;

    console.log(`Metadata uploaded to IPFS: ${uri}`);

    return { uri, cid };
  } catch (error) {
    console.error('IPFS metadata upload error:', error);
    throw new Error(`Failed to upload metadata to IPFS: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Creates and uploads complete NFT metadata with image
 * @param imageBase64 Base64 encoded image
 * @param productName Product name for NFT
 * @param description Product description
 * @param attributes NFT attributes
 * @returns Metadata URI and image URL
 */
export async function createAndUploadNFTMetadata(
  imageBase64: string,
  productName: string,
  description: string,
  attributes: NFTMetadata['attributes']
): Promise<{
  metadataUri: string;
  imageUrl: string;
}> {
  try {
    // Step 1: Upload image
    const { cid: imageCid, url: imageUrl } = await uploadImageToIPFS(imageBase64);

    // Step 2: Create metadata with IPFS image reference
    const metadata: NFTMetadata = {
      name: productName,
      description,
      image: `ipfs://${imageCid}`, // Use ipfs:// protocol for metadata
      attributes
    };

    // Step 3: Upload metadata
    const { uri: metadataUri } = await uploadMetadataToIPFS(metadata);

    return {
      metadataUri,
      imageUrl // Return HTTP URL for display purposes
    };
  } catch (error) {
    console.error('NFT metadata creation error:', error);
    throw new Error(`Failed to create NFT metadata: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Checks NFT.Storage service status
 */
export async function checkIPFSStatus(): Promise<boolean> {
  try {
    // Simple check - try to create a small test blob
    const testBlob = new Blob(['test'], { type: 'text/plain' });
    await nftStorageClient.storeBlob(testBlob);
    return true;
  } catch (error) {
    console.error('IPFS status check failed:', error);
    return false;
  }
}
