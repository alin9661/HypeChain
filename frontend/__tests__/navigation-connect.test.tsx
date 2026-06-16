/**
 * Unit test for <Navigation>'s Connect Wallet button (components/navigation.tsx).
 *
 * Guards the ISSUE-009 change: the custom wallet modal was removed, so the
 * Connect button must open Privy's built-in modal by calling `login()`
 * directly (and still fire the optional onConnectWalletClick ripple hook).
 *
 * Shallow integration: Privy + the AppContext wallet hook are mocked; we only
 * assert WHICH handler the click invokes, not Privy's modal internals.
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';

const login = jest.fn();

jest.mock('@privy-io/react-auth', () => ({
  usePrivy: jest.fn(() => ({ authenticated: false, login })),
}));

jest.mock('@privy-io/react-auth/solana', () => ({
  useWallets: jest.fn(() => ({ ready: true, wallets: [] })),
}));

jest.mock('@/contexts/AppContext', () => ({
  useWallet: jest.fn(() => ({
    wallet: { address: null, connected: false, balance: null },
  })),
}));

jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { Navigation } =
  require('@/components/navigation') as typeof import('@/components/navigation');

describe('Navigation Connect Wallet button', () => {
  beforeEach(() => jest.clearAllMocks());

  it('opens Privy’s built-in modal via login() and fires the ripple hook', () => {
    const onConnectWalletClick = jest.fn();
    render(
      <Navigation
        items={[]}
        showConnectWallet
        onConnectWalletClick={onConnectWalletClick}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /connect wallet/i }));

    expect(login).toHaveBeenCalledTimes(1);
    expect(onConnectWalletClick).toHaveBeenCalledTimes(1);
  });
});
