/**
 * Unit test for <Navigation>'s Connect Wallet button (components/navigation.tsx).
 *
 * Guards the ISSUE-009 change: the custom wallet modal was removed, so the
 * Connect button must open Privy's built-in modal by calling `login()`
 * directly (and still fire the optional onConnectWalletClick ripple hook).
 * When a wallet is already connected, the button is replaced by the wallet
 * dropdown and `login()` must NOT fire.
 *
 * Shallow integration: Privy, the Solana wallets hook, usePathname, the
 * AppContext wallet hook, and WalletDropdown are mocked; we only assert WHICH
 * branch renders and which handler the click invokes, not Privy internals.
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';

const login = jest.fn();
const SOLANA_ADDRESS = '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU';

jest.mock('@privy-io/react-auth', () => ({
  usePrivy: jest.fn(),
}));

jest.mock('@privy-io/react-auth/solana', () => ({
  useWallets: jest.fn(),
}));

jest.mock('next/navigation', () => ({
  usePathname: jest.fn(() => '/'),
}));

jest.mock('@/contexts/AppContext', () => ({
  useWallet: jest.fn(() => ({
    wallet: { address: null, connected: false, balance: null },
  })),
}));

// Stub the dropdown so we can assert the authenticated branch without pulling
// in WalletDropdown's own Privy/logout internals.
jest.mock('@/components/wallet-dropdown', () => ({
  WalletDropdown: ({ address }: { address: string }) => (
    <div data-testid="wallet-dropdown">{address}</div>
  ),
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

const { usePrivy } = jest.requireMock('@privy-io/react-auth');
const { useWallets: useSolanaWallets } = jest.requireMock(
  '@privy-io/react-auth/solana'
);

describe('Navigation Connect Wallet button', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Default: unauthenticated, no wallets.
    usePrivy.mockReturnValue({ authenticated: false, login });
    useSolanaWallets.mockReturnValue({ ready: true, wallets: [] });
  });

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

  it('renders the wallet dropdown (not the connect button) when authenticated with a wallet', () => {
    usePrivy.mockReturnValue({ authenticated: true, login });
    useSolanaWallets.mockReturnValue({
      ready: true,
      wallets: [{ address: SOLANA_ADDRESS }],
    });

    render(<Navigation items={[]} showConnectWallet />);

    // Connect button is gone; the dropdown shows the connected address.
    expect(
      screen.queryByRole('button', { name: /connect wallet/i })
    ).toBeNull();
    expect(screen.getByTestId('wallet-dropdown')).toBeTruthy();
    expect(login).not.toHaveBeenCalled();
  });
});
