/**
 * Unit tests for ApiClient.cosignPurchase (PR2).
 *
 * The co-sign endpoint lives on the Express write service, which may be
 * deployed separately from the payments API — NEXT_PUBLIC_WRITE_API_URL
 * overrides the base URL, falling back to the regular API base.
 */

import ApiClient from '@/lib/api-client';

global.fetch = jest.fn();

describe('ApiClient.cosignPurchase', () => {
  const ORIGINAL_WRITE_URL = process.env.NEXT_PUBLIC_WRITE_API_URL;

  afterEach(() => {
    if (ORIGINAL_WRITE_URL === undefined) {
      delete process.env.NEXT_PUBLIC_WRITE_API_URL;
    } else {
      process.env.NEXT_PUBLIC_WRITE_API_URL = ORIGINAL_WRITE_URL;
    }
    jest.clearAllMocks();
  });

  const okPayload = {
    success: true,
    transaction: 'c3R1Yg==',
    priceLamports: '10000000',
    priceSol: 0.01,
    blockhash: 'hash',
    lastValidBlockHeight: 1,
    nftMint: 'mint',
    listingPda: 'pda',
    seller: 'seller',
  };

  it('POSTs listingId + buyerWallet to /api/payments/cosign-purchase on the API base by default', async () => {
    delete process.env.NEXT_PUBLIC_WRITE_API_URL;
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => okPayload,
    });

    const client = new ApiClient();
    const result = await client.cosignPurchase({ listingId: 'l1', buyerWallet: 'w1' });

    expect(result.success).toBe(true);
    expect(result.data?.transaction).toBe('c3R1Yg==');
    const [url, options] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toBe(`${client.getBaseURL()}/api/payments/cosign-purchase`);
    expect(options.method).toBe('POST');
    expect(JSON.parse(options.body)).toEqual({ listingId: 'l1', buyerWallet: 'w1' });
  });

  it('uses NEXT_PUBLIC_WRITE_API_URL when set', async () => {
    process.env.NEXT_PUBLIC_WRITE_API_URL = 'https://write.example.com';
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => okPayload,
    });

    const client = new ApiClient();
    await client.cosignPurchase({ listingId: 'l1', buyerWallet: 'w1' });

    const [url] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toBe('https://write.example.com/api/payments/cosign-purchase');
  });

  it('surfaces the machine-readable error code on failure', async () => {
    delete process.env.NEXT_PUBLIC_WRITE_API_URL;
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 409,
      statusText: 'Conflict',
      json: async () => ({
        success: false,
        error: 'On-chain seller is not the platform custodial wallet',
        code: 'SELLER_NOT_CUSTODIAL',
      }),
    });

    const client = new ApiClient();
    const result = await client.cosignPurchase({ listingId: 'l1', buyerWallet: 'w1' });

    expect(result.success).toBe(false);
    expect(result.code).toBe('SELLER_NOT_CUSTODIAL');
    expect(result.error).toMatch(/custodial/i);
  });
});
