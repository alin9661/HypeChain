'use client';

import React, { useState, useEffect } from 'react';
import { Wallet, LogOut, Copy, ExternalLink, Check } from 'lucide-react';
import { useWallet } from '@/contexts/AppContext';
import { SolanaService } from '@/lib/solana';

/**
 * Wallet connection component with Solana integration
 *
 * Note: For production use, integrate with Solana Wallet Adapter:
 * - @solana/wallet-adapter-react
 * - @solana/wallet-adapter-wallets (Phantom, Solflare, etc.)
 * - @solana/wallet-adapter-react-ui
 *
 * This is a simplified version for demo purposes
 */
export function WalletConnect() {
  const { wallet, connectWallet, disconnectWallet } = useWallet();
  const [showDropdown, setShowDropdown] = useState(false);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);

  // Fetch balance when wallet is connected
  useEffect(() => {
    if (wallet.connected && wallet.address) {
      fetchBalance(wallet.address);
    }
  }, [wallet.connected, wallet.address]);

  const fetchBalance = async (address: string) => {
    try {
      const solanaService = new SolanaService();
      const balance = await solanaService.getBalance(address);
      // Update balance in context - we'd need to add an updateBalance action
      console.log('Wallet balance:', balance);
    } catch (error) {
      console.error('Failed to fetch balance:', error);
    }
  };

  const handleConnect = async () => {
    setLoading(true);
    try {
      // Check if window.solana (Phantom) is available
      if (typeof window !== 'undefined' && (window as any).solana) {
        const provider = (window as any).solana;

        // Request connection
        const resp = await provider.connect();
        const publicKey = resp.publicKey.toString();

        // Get balance
        const solanaService = new SolanaService();
        const balance = await solanaService.getBalance(publicKey);

        // Connect wallet
        connectWallet(publicKey, balance);
      } else {
        // Fallback: Use demo wallet
        alert('No Solana wallet found. Using demo wallet for testing.');
        const demoWallet = '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU';
        connectWallet(demoWallet, 1.5);
      }
    } catch (error) {
      console.error('Failed to connect wallet:', error);
      alert('Failed to connect wallet. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleDisconnect = () => {
    disconnectWallet();
    setShowDropdown(false);
  };

  const copyAddress = () => {
    if (wallet.address) {
      navigator.clipboard.writeText(wallet.address);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const openExplorer = () => {
    if (wallet.address) {
      window.open(
        `https://explorer.solana.com/address/${wallet.address}?cluster=devnet`,
        '_blank'
      );
    }
  };

  if (!wallet.connected) {
    return (
      <button
        onClick={handleConnect}
        disabled={loading}
        className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:opacity-90 transition flex items-center gap-2 disabled:opacity-50"
      >
        <Wallet className="w-4 h-4" />
        {loading ? 'Connecting...' : 'Connect Wallet'}
      </button>
    );
  }

  return (
    <div className="relative">
      <button
        onClick={() => setShowDropdown(!showDropdown)}
        className="px-4 py-2 bg-card border border-border rounded-lg hover:bg-muted transition flex items-center gap-2"
      >
        <Wallet className="w-4 h-4 text-green-500" />
        <span className="font-mono text-sm hidden md:inline">
          {wallet.address.slice(0, 4)}...{wallet.address.slice(-4)}
        </span>
        {wallet.balance !== null && (
          <span className="text-sm font-medium hidden lg:inline">
            {wallet.balance.toFixed(2)} SOL
          </span>
        )}
      </button>

      {showDropdown && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setShowDropdown(false)}
          />

          {/* Dropdown */}
          <div className="absolute right-0 mt-2 w-80 bg-card border border-border rounded-lg shadow-lg z-50 p-4 space-y-4">
            {/* Wallet Address */}
            <div>
              <p className="text-xs text-muted-foreground mb-1">
                Wallet Address
              </p>
              <div className="flex items-center gap-2">
                <p className="font-mono text-sm flex-1 truncate">
                  {wallet.address}
                </p>
                <button
                  onClick={copyAddress}
                  className="p-2 hover:bg-muted rounded transition"
                  title="Copy address"
                >
                  {copied ? (
                    <Check className="w-4 h-4 text-green-500" />
                  ) : (
                    <Copy className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>

            {/* Balance */}
            {wallet.balance !== null && (
              <div>
                <p className="text-xs text-muted-foreground mb-1">Balance</p>
                <p className="text-2xl font-bold font-mono">
                  {wallet.balance.toFixed(4)} SOL
                </p>
                <p className="text-sm text-muted-foreground">
                  ≈ ${(wallet.balance * 100).toFixed(2)} USD
                </p>
              </div>
            )}

            {/* Actions */}
            <div className="space-y-2 pt-2 border-t border-border">
              <button
                onClick={openExplorer}
                className="w-full px-4 py-2 bg-muted hover:bg-muted/80 rounded-lg transition flex items-center justify-center gap-2 text-sm"
              >
                <ExternalLink className="w-4 h-4" />
                View on Explorer
              </button>
              <button
                onClick={handleDisconnect}
                className="w-full px-4 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-500 rounded-lg transition flex items-center justify-center gap-2 text-sm"
              >
                <LogOut className="w-4 h-4" />
                Disconnect
              </button>
            </div>

            {/* Network */}
            <div className="pt-2 border-t border-border">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Network</span>
                <span className="px-2 py-1 bg-yellow-500/10 text-yellow-500 rounded">
                  Devnet
                </span>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
