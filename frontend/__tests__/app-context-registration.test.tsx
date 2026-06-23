/**
 * Regression tests for AppProvider's wallet-registration effect
 * (contexts/AppContext.tsx).
 *
 * Guards the ISSUE-009 fix: registration must source the wallet from Privy's
 * SOLANA hook (`useWallets` from `@privy-io/react-auth/solana`) and must only
 * POST /api/users/register once `authenticated`, `walletsReady`, a wallet
 * address, and `user.id` are all present. Firing early sent undefined fields
 * and produced the backend 400 "Missing required fields".
 *
 * jsdom: we only assert WHICH path the effect takes (does registerUser fire,
 * and with what payload), not Privy internals — both Privy hooks are mocked.
 */

import React from 'react';
import { render, act, waitFor } from '@testing-library/react';

jest.mock('@privy-io/react-auth', () => ({
  usePrivy: jest.fn(),
}));

jest.mock('@privy-io/react-auth/solana', () => ({
  useWallets: jest.fn(),
}));

jest.mock('@/lib/api-client', () => ({
  apiClient: {
    registerUser: jest.fn(),
  },
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { AppProvider } =
  require('@/contexts/AppContext') as typeof import('@/contexts/AppContext');

const { usePrivy } = jest.requireMock('@privy-io/react-auth');
const { useWallets: useSolanaWallets } = jest.requireMock(
  '@privy-io/react-auth/solana'
);
const { apiClient } = jest.requireMock('@/lib/api-client');

const SOLANA_ADDRESS = '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU';
const PRIVY_USER_ID = 'did:privy:abc123';

function mockState({
  authenticated = true,
  ready = true,
  user = { id: PRIVY_USER_ID, email: { address: 'seller@hypechain.test' } } as
    | { id: string; email?: { address: string } }
    | undefined,
  wallets = [{ address: SOLANA_ADDRESS }] as Array<{ address: string }>,
}: {
  authenticated?: boolean;
  ready?: boolean;
  user?: { id: string; email?: { address: string } } | undefined;
  wallets?: Array<{ address: string }>;
}) {
  usePrivy.mockReturnValue({ authenticated, user });
  useSolanaWallets.mockReturnValue({ ready, wallets });
}

beforeEach(() => {
  jest.clearAllMocks();
  apiClient.registerUser.mockResolvedValue({
    success: true,
    data: {
      user: {
        id: 'db-1',
        walletAddress: SOLANA_ADDRESS,
        chainType: 'solana',
        username: null,
        email: 'seller@hypechain.test',
        profileImage: null,
        createdAt: '2026-06-16T00:00:00.000Z',
        totalVolume: 0,
        isNewUser: true,
      },
    },
  });
});

function renderProvider() {
  return render(
    <AppProvider>
      <div data-testid="child" />
    </AppProvider>
  );
}

describe('AppProvider wallet registration', () => {
  it('registers with the Solana address and chainType "solana" once ready', async () => {
    mockState({});
    renderProvider();

    await waitFor(() => expect(apiClient.registerUser).toHaveBeenCalledTimes(1));
    expect(apiClient.registerUser).toHaveBeenCalledWith({
      walletAddress: SOLANA_ADDRESS,
      privyUserId: PRIVY_USER_ID,
      chainType: 'solana',
      email: 'seller@hypechain.test',
    });
  });

  it('does NOT register before the Solana wallets are ready (walletsReady gate)', async () => {
    mockState({ ready: false });
    renderProvider();

    // Flush effects, then assert the POST was suppressed.
    await act(async () => {
      await Promise.resolve();
    });
    expect(apiClient.registerUser).not.toHaveBeenCalled();
  });

  it('does NOT register when no Solana wallet is connected', async () => {
    mockState({ wallets: [] });
    renderProvider();

    await act(async () => {
      await Promise.resolve();
    });
    expect(apiClient.registerUser).not.toHaveBeenCalled();
  });

  it('does NOT register when the Privy user id is missing (field guard)', async () => {
    mockState({ user: { id: '' } });
    renderProvider();

    await act(async () => {
      await Promise.resolve();
    });
    expect(apiClient.registerUser).not.toHaveBeenCalled();
  });

  it('retries after a failed POST (dedupe marker rolled back on error)', async () => {
    mockState({});
    // First attempt fails; the dedupe marker must be rolled back so a later
    // effect run re-attempts instead of being permanently skipped.
    apiClient.registerUser.mockResolvedValueOnce({ success: false, error: 'boom' });

    const { rerender } = renderProvider();
    await waitFor(() => expect(apiClient.registerUser).toHaveBeenCalledTimes(1));

    // Re-run the effect with a fresh wallets array reference (same address).
    useSolanaWallets.mockReturnValue({
      ready: true,
      wallets: [{ address: SOLANA_ADDRESS }],
    });
    rerender(
      <AppProvider>
        <div data-testid="child" />
      </AppProvider>
    );

    await waitFor(() => expect(apiClient.registerUser).toHaveBeenCalledTimes(2));
  });

  it('STOPS retrying after the attempt cap (no unbounded POST storm)', async () => {
    mockState({});
    // Backend is hard-down: every POST fails. Privy hands back a fresh wallets
    // array reference on each re-render, re-running the effect every time.
    apiClient.registerUser.mockResolvedValue({ success: false, error: 'down' });

    const { rerender } = renderProvider();
    await waitFor(() => expect(apiClient.registerUser).toHaveBeenCalledTimes(1));

    // Re-run the effect far more times than the cap allows.
    for (let i = 0; i < 8; i++) {
      useSolanaWallets.mockReturnValue({
        ready: true,
        wallets: [{ address: SOLANA_ADDRESS }],
      });
      rerender(
        <AppProvider>
          <div data-testid="child" />
        </AppProvider>
      );
      // Let the in-flight POST settle to 'failed' before the next re-render.
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });
    }

    // Capped at MAX_REGISTRATION_ATTEMPTS (3) — not once per re-render.
    await waitFor(() => expect(apiClient.registerUser).toHaveBeenCalledTimes(3));
    expect(apiClient.registerUser).toHaveBeenCalledTimes(3);
  });

  it('does NOT re-POST after a successful registration (dedupe on success)', async () => {
    mockState({});
    const { rerender } = renderProvider();
    await waitFor(() => expect(apiClient.registerUser).toHaveBeenCalledTimes(1));

    // Fresh wallets array ref, same address — must be skipped, not re-POSTed.
    useSolanaWallets.mockReturnValue({
      ready: true,
      wallets: [{ address: SOLANA_ADDRESS }],
    });
    rerender(
      <AppProvider>
        <div data-testid="child" />
      </AppProvider>
    );
    await act(async () => {
      await Promise.resolve();
    });

    expect(apiClient.registerUser).toHaveBeenCalledTimes(1);
  });

  it('re-registers after disconnect + reconnect (progress cleared on disconnect)', async () => {
    mockState({});
    const { rerender } = renderProvider();
    await waitFor(() => expect(apiClient.registerUser).toHaveBeenCalledTimes(1));

    // Disconnect: not authenticated, no wallets. This must clear progress so a
    // later reconnect isn't stranded connected-but-without-a-profile.
    usePrivy.mockReturnValue({ authenticated: false, user: undefined });
    useSolanaWallets.mockReturnValue({ ready: true, wallets: [] });
    rerender(
      <AppProvider>
        <div data-testid="child" />
      </AppProvider>
    );
    await act(async () => {
      await Promise.resolve();
    });

    // Reconnect the same wallet — registration must run again.
    mockState({});
    rerender(
      <AppProvider>
        <div data-testid="child" />
      </AppProvider>
    );
    await waitFor(() => expect(apiClient.registerUser).toHaveBeenCalledTimes(2));
  });
});
