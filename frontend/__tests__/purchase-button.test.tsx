/**
 * Component tests for <PurchaseButton> — co-sign vs legacy branching (PR2).
 *
 * jsdom environment (React Testing Library). @solana/web3.js is mocked
 * wholesale: under jsdom its Buffer/Uint8Array realms diverge from Node's,
 * which breaks real transaction serialization — and these tests only care
 * about WHICH path the component takes, not transaction byte layouts
 * (purchase-helpers.test.ts covers those under the node environment).
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

jest.mock('@solana/web3.js', () => {
  class MockPublicKey {
    private readonly value: string;
    constructor(value: unknown) {
      this.value = String(value);
    }
    toBase58() {
      return this.value;
    }
    toString() {
      return this.value;
    }
    equals(other: unknown) {
      return String(other) === this.value;
    }
  }
  class MockTransaction {
    instructions: unknown[] = [];
    recentBlockhash?: string;
    feePayer?: unknown;
    add(...ixs: unknown[]) {
      this.instructions.push(...ixs);
      return this;
    }
  }
  const connection = {
    getLatestBlockhash: jest
      .fn()
      .mockResolvedValue({ blockhash: 'legacy-blockhash', lastValidBlockHeight: 42 }),
    sendRawTransaction: jest.fn().mockResolvedValue('mock-signature-0123456789abcdef'),
    confirmTransaction: jest.fn().mockResolvedValue({ value: { err: null } }),
  };
  return {
    __connection: connection,
    Connection: jest.fn(() => connection),
    PublicKey: MockPublicKey,
    Transaction: MockTransaction,
    SystemProgram: {
      transfer: jest.fn((params) => ({ __type: 'system-transfer', ...params })),
    },
    LAMPORTS_PER_SOL: 1_000_000_000,
  };
});

jest.mock('@privy-io/react-auth', () => ({
  usePrivy: jest.fn(),
}));

jest.mock('@/lib/api-client', () => ({
  apiClient: {
    createPayment: jest.fn(),
    cosignPurchase: jest.fn(),
    verifyPayment: jest.fn(),
  },
}));

jest.mock('@/lib/purchase-helpers', () => ({
  assertPriceMatches: jest.fn(),
  deserializeCosignedTx: jest.fn(() => ({ __type: 'cosigned-tx' })),
  assertCosignedInstructions: jest.fn(),
}));

jest.mock('sonner', () => ({
  toast: { success: jest.fn(), error: jest.fn() },
}));

// The anchor path is gated on this env var at module evaluation, so it must
// be set before the component module is required (imports are hoisted).
process.env.NEXT_PUBLIC_USE_ANCHOR_PURCHASE = '1';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { PurchaseButton } =
  require('@/components/purchase-button') as typeof import('@/components/purchase-button');

const { usePrivy } = jest.requireMock('@privy-io/react-auth');
const { apiClient } = jest.requireMock('@/lib/api-client');
const helpers = jest.requireMock('@/lib/purchase-helpers');
const { toast } = jest.requireMock('sonner');
const web3 = jest.requireMock('@solana/web3.js');

const BUYER_WALLET = 'BuyerWallet1111111111111111111111111111111';
const SELLER_WALLET = 'SellerWallet222222222222222222222222222222';

const defaultProps = {
  listingId: 'listing-1',
  price: 0.01,
  sellerWallet: SELLER_WALLET,
  productName: 'Verified Sneaker',
};

function mockSolanaProvider() {
  const provider = {
    isConnected: true,
    connect: jest.fn(),
    signTransaction: jest.fn(async (tx: unknown) => ({
      __signed: tx,
      serialize: () => 'signed-bytes',
    })),
  };
  (window as any).solana = provider;
  return provider;
}

function mockHappyBackend() {
  apiClient.createPayment.mockResolvedValue({
    success: true,
    data: {
      paymentRequest: {
        recipient: SELLER_WALLET,
        amount: 0.01,
        nftMintAddress: 'Mint1111111111111111111111111111111111111',
        productName: 'Verified Sneaker',
      },
    },
  });
  apiClient.verifyPayment.mockResolvedValue({
    success: true,
    data: { verification: { valid: true } },
  });
}

async function clickBuy() {
  fireEvent.click(screen.getByRole('button'));
}

beforeEach(() => {
  jest.clearAllMocks();
  helpers.deserializeCosignedTx.mockReturnValue({ __type: 'cosigned-tx' });
  (usePrivy as jest.Mock).mockReturnValue({
    authenticated: true,
    user: {
      id: 'privy-user-1',
      linkedAccounts: [{ type: 'wallet', chainType: 'solana', address: BUYER_WALLET }],
    },
  });
  mockHappyBackend();
});

describe('PurchaseButton co-sign branching', () => {
  it('signs and sends the co-signed transaction on a successful co-sign', async () => {
    const provider = mockSolanaProvider();
    apiClient.cosignPurchase.mockResolvedValue({
      success: true,
      data: {
        transaction: 'base64-cosigned-tx',
        priceLamports: '10000000',
        blockhash: 'cosign-blockhash',
        lastValidBlockHeight: 99,
      },
    });

    render(<PurchaseButton {...defaultProps} />);
    await clickBuy();

    await waitFor(() => expect(toast.success).toHaveBeenCalled());

    expect(helpers.deserializeCosignedTx).toHaveBeenCalledWith(
      'base64-cosigned-tx',
      expect.anything()
    );
    expect(helpers.assertCosignedInstructions).toHaveBeenCalledWith(
      { __type: 'cosigned-tx' },
      expect.anything(),
      '10000000'
    );
    // The co-signed tx — not a freshly built legacy tx — is what the wallet signs.
    expect(provider.signTransaction).toHaveBeenCalledWith({ __type: 'cosigned-tx' });
    expect(web3.SystemProgram.transfer).not.toHaveBeenCalled();
    expect(web3.__connection.sendRawTransaction).toHaveBeenCalled();
    expect(toast.success).toHaveBeenCalledWith(
      'PURCHASE CONFIRMED — Verified Sneaker',
      expect.anything()
    );
  });

  it('falls back to the legacy SystemProgram.transfer on SELLER_NOT_CUSTODIAL', async () => {
    const provider = mockSolanaProvider();
    apiClient.cosignPurchase.mockResolvedValue({
      success: false,
      code: 'SELLER_NOT_CUSTODIAL',
      status: 409,
      error: 'On-chain seller is not the platform custodial wallet',
    });

    render(<PurchaseButton {...defaultProps} />);
    await clickBuy();

    await waitFor(() => expect(toast.success).toHaveBeenCalled());

    expect(web3.SystemProgram.transfer).toHaveBeenCalledTimes(1);
    const transferParams = web3.SystemProgram.transfer.mock.calls[0][0];
    expect(transferParams.fromPubkey.toBase58()).toBe(BUYER_WALLET);
    expect(transferParams.toPubkey.toBase58()).toBe(SELLER_WALLET);
    expect(provider.signTransaction).toHaveBeenCalled();
    const signedTx = provider.signTransaction.mock.calls[0][0] as { instructions: unknown[] };
    expect(signedTx.instructions).toEqual([expect.objectContaining({ __type: 'system-transfer' })]);
    expect(helpers.deserializeCosignedTx).not.toHaveBeenCalled();
  });

  it('aborts without any legacy transfer on an unknown error code', async () => {
    const provider = mockSolanaProvider();
    const onError = jest.fn();
    apiClient.cosignPurchase.mockResolvedValue({
      success: false,
      code: 'NFT_NOT_IN_CUSTODY',
      status: 409,
      error: 'Custodial wallet does not hold the NFT for this listing',
    });

    render(<PurchaseButton {...defaultProps} onError={onError} />);
    await clickBuy();

    await waitFor(() => expect(onError).toHaveBeenCalled());

    expect(onError).toHaveBeenCalledWith('Custodial wallet does not hold the NFT for this listing');
    expect(web3.SystemProgram.transfer).not.toHaveBeenCalled();
    expect(provider.signTransaction).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalled();
  });

  it('hard-fails with a friendly message on a code-less 404 (no silent legacy fallback)', async () => {
    const provider = mockSolanaProvider();
    const onError = jest.fn();
    apiClient.cosignPurchase.mockResolvedValue({
      success: false,
      status: 404,
      error: 'HTTP 404: Not Found',
    });

    render(<PurchaseButton {...defaultProps} onError={onError} />);
    await clickBuy();

    await waitFor(() => expect(onError).toHaveBeenCalled());

    expect(onError).toHaveBeenCalledWith(
      'Purchase service unavailable — please try again shortly.'
    );
    expect(web3.SystemProgram.transfer).not.toHaveBeenCalled();
    expect(provider.signTransaction).not.toHaveBeenCalled();
    expect(apiClient.verifyPayment).not.toHaveBeenCalled();
  });
});
