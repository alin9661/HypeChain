import { NFTStorage, File, Blob } from 'nft.storage';
import { base64ToBuffer } from '../utils/validation.js';

const NFT_STORAGE_API_KEY = process.env.HACKNYU_NFT_STORAGE_API_KEY;

if (!NFT_STORAGE_API_KEY) {
  throw new Error('HACKNYU_NFT_STORAGE_API_KEY is not set in environment variables');
}

const nftStorageClient = new NFTStorage({ token: NFT_STORAGE_API_KEY });

/**
 * Uploads an image to IPFS via nft.storage
 */
export async function uploadImageToIPFS(base64Image, filename = 'product.png') {
  try {
    const imageBuffer = base64ToBuffer(base64Image);
    const mimeType = base64Image.match(/data:([^;]+);/)?.[1] || 'image/png';
    const imageFile = new File([imageBuffer], filename, { type: mimeType });
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
 */
export async function uploadMetadataToIPFS(metadata) {
  try {
    const metadataJSON = JSON.stringify(metadata, null, 2);
    const metadataBlob = new Blob([metadataJSON], { type: 'application/json' });
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
 */
export async function createAndUploadNFTMetadata(
  imageBase64,
  productName,
  description,
  attributes
) {
  try {
    const { cid: imageCid, url: imageUrl } = await uploadImageToIPFS(imageBase64);

    const metadata = {
      name: productName,
      description,
      image: `ipfs://${imageCid}`,
      attributes
    };

    const { uri: metadataUri } = await uploadMetadataToIPFS(metadata);

    return {
      metadataUri,
      imageUrl
    };
  } catch (error) {
    console.error('NFT metadata creation error:', error);
    throw new Error(`Failed to create NFT metadata: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Checks NFT.Storage service status
 */
export async function checkIPFSStatus() {
  try {
    const testBlob = new Blob(['test'], { type: 'text/plain' });
    await nftStorageClient.storeBlob(testBlob);
    return true;
  } catch (error) {
    console.error('IPFS status check failed:', error);
    return false;
  }
}
