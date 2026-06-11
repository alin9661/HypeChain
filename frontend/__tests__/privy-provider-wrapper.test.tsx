/**
 * Unit tests for PrivyProviderWrapper (components/privy-provider-wrapper.tsx)
 * Run with: npm test
 *
 * Covers the WalletConnect double-init fix: the config object and the Solana
 * connector list must keep a stable identity across re-renders (PrivyProvider
 * keys WalletConnect's one-time init off the config reference). Also locks in
 * the per-chain embeddedWallets shape and the appId env fallback.
 */

import React, { useState } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { PrivyProviderWrapper } from '@/components/privy-provider-wrapper';
import { toSolanaWalletConnectors } from '@privy-io/react-auth/solana';

const mockCapturedProps: any[] = [];
const mockConnectors = { marker: 'solana-connectors' };

jest.mock('@privy-io/react-auth', () => ({
  PrivyProvider: (props: any) => {
    mockCapturedProps.push(props);
    return <>{props.children}</>;
  },
}));

jest.mock('@privy-io/react-auth/solana', () => ({
  toSolanaWalletConnectors: jest.fn(() => mockConnectors),
}));

/** Forces PrivyProviderWrapper to re-render via parent state changes. */
function Host() {
  const [, setBump] = useState(0);
  return (
    <>
      <button onClick={() => setBump((n) => n + 1)}>bump</button>
      <PrivyProviderWrapper>
        <div data-testid="child" />
      </PrivyProviderWrapper>
    </>
  );
}

const ORIGINAL_APP_ID = process.env.NEXT_PUBLIC_PRIVY_APP_ID;

describe('PrivyProviderWrapper', () => {
  beforeEach(() => {
    mockCapturedProps.length = 0;
    jest.clearAllMocks();
  });

  afterEach(() => {
    process.env.NEXT_PUBLIC_PRIVY_APP_ID = ORIGINAL_APP_ID;
  });

  it('keeps config and connector identity stable across re-renders', () => {
    render(<Host />);
    fireEvent.click(screen.getByText('bump'));
    fireEvent.click(screen.getByText('bump'));

    // Three renders of the wrapper → three captured prop sets.
    expect(mockCapturedProps.length).toBeGreaterThanOrEqual(3);

    const configs = mockCapturedProps.map((p) => p.config);
    configs.forEach((config) => {
      // Same reference every render — this is the WalletConnect re-init fix.
      expect(config).toBe(configs[0]);
    });

    // The connector factory must run once, not once per render.
    expect(toSolanaWalletConnectors).toHaveBeenCalledTimes(1);
    expect(toSolanaWalletConnectors).toHaveBeenCalledWith({
      shouldAutoConnect: true,
    });
    expect(configs[0].externalWallets.solana.connectors).toBe(mockConnectors);
  });

  it('uses the per-chain embeddedWallets createOnLogin shape', () => {
    render(<Host />);
    const config = mockCapturedProps[0].config;

    expect(config.embeddedWallets).toEqual({
      ethereum: { createOnLogin: 'off' },
      solana: { createOnLogin: 'off' },
    });
    expect(config.loginMethods).toEqual(['wallet']);
    expect(config.appearance.walletChainType).toBe('ethereum-and-solana');
  });

  it('passes the env appId through, with a placeholder fallback', () => {
    process.env.NEXT_PUBLIC_PRIVY_APP_ID = 'test-app-id';
    render(<Host />);
    expect(mockCapturedProps[0].appId).toBe('test-app-id');

    mockCapturedProps.length = 0;
    delete process.env.NEXT_PUBLIC_PRIVY_APP_ID;
    render(<Host />);
    expect(mockCapturedProps[0].appId).toBe('your-privy-app-id');
  });

  it('renders its children', () => {
    render(<Host />);
    expect(screen.getByTestId('child')).toBeInTheDocument();
  });
});
