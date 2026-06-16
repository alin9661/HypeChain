'use client'

/**
 * Transaction history — per-wallet buy/sell ledger (workstream C2).
 *
 * Wires the already-implemented apiClient.getTransactionHistory (no page used
 * it before). Buyer/seller/all filter runs server-side (one indexed query);
 * an empty result is the honest day-one state, not seeded rows. Terminal /
 * case-file aesthetic per frontend/DESIGN.md (Geist Mono, no spinners — a
 * blinking caret while loading; tabular-nums for amounts).
 */

import { useEffect, useState } from 'react'
import { AppLayout } from '@/components/app-layout'
import { useWallet } from '@/contexts/AppContext'
import { apiClient, type Transaction } from '@/lib/api-client'
import { ArrowDownLeft, ArrowUpRight, ExternalLink } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'

type Filter = 'all' | 'buyer' | 'seller'

const SOLSCAN_TX = (sig: string) => `https://solscan.io/tx/${sig}?cluster=devnet`

function shorten(addr: string | null): string {
  if (!addr) return '—'
  return `${addr.slice(0, 4)}…${addr.slice(-4)}`
}

export default function TransactionsPage() {
  const { wallet } = useWallet()
  const [filter, setFilter] = useState<Filter>('all')
  const [txns, setTxns] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!wallet.address) {
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    setError(null)
    apiClient
      .getTransactionHistory(wallet.address, filter)
      .then((res) => {
        if (cancelled) return
        if (res.success && res.data) {
          setTxns(res.data.transactions)
        } else {
          setError(res.error || 'Failed to load transaction history')
          setTxns([])
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [wallet.address, filter])

  const isBuy = (t: Transaction) => t.buyer_wallet === wallet.address

  return (
    <AppLayout>
      <div className="mx-auto max-w-5xl">
        <header className="mb-8 border-b border-[var(--hc-hairline)] pb-4">
          <h1 className="font-mono text-2xl font-bold uppercase tracking-widest text-white">
            Transaction Ledger
          </h1>
          <p className="mt-1 font-mono text-sm text-[var(--hc-text-muted)]">
            On-chain settled purchases and sales for your wallet.
          </p>
        </header>

        {!wallet.connected || !wallet.address ? (
          <EmptyState
            title="No wallet connected"
            body="Connect your wallet to view your buy and sell history."
          />
        ) : (
          <>
            <div className="mb-6 flex gap-2">
              {(['all', 'buyer', 'seller'] as Filter[]).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`px-4 py-2 font-mono text-xs uppercase tracking-widest transition-colors ${
                    filter === f
                      ? 'bg-[var(--hc-accent)] text-black'
                      : 'border border-[var(--hc-border)] text-[var(--hc-text-muted)] hover:text-white'
                  }`}
                >
                  {f === 'buyer' ? 'Purchases' : f === 'seller' ? 'Sales' : 'All'}
                </button>
              ))}
            </div>

            {loading ? (
              <p className="font-mono text-sm uppercase tracking-widest text-[var(--hc-accent)]">
                Reading ledger<span className="animate-pulse">▋</span>
              </p>
            ) : error ? (
              <EmptyState title="Could not load ledger" body={error} tone="error" />
            ) : txns.length === 0 ? (
              <EmptyState
                title="No transactions yet"
                body="Your purchases and sales will appear here once settled on-chain."
              />
            ) : (
              <div className="divide-y divide-[var(--hc-hairline)] border border-[var(--hc-border)]">
                {txns.map((t) => (
                  <div key={t.id} className="flex items-center gap-4 p-4">
                    <span
                      className={`flex h-9 w-9 shrink-0 items-center justify-center ${
                        isBuy(t) ? 'text-[var(--hc-verify-high)]' : 'text-[var(--hc-accent)]'
                      }`}
                    >
                      {isBuy(t) ? <ArrowDownLeft className="h-5 w-5" /> : <ArrowUpRight className="h-5 w-5" />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-mono text-sm text-white">
                        {t.listing?.product_name || shorten(t.listing?.nft_mint_address ?? null)}
                      </p>
                      <p className="font-mono text-xs uppercase tracking-widest text-[var(--hc-text-muted)]">
                        {isBuy(t) ? 'Bought from' : 'Sold to'}{' '}
                        {shorten(isBuy(t) ? t.seller_wallet : t.buyer_wallet)}
                        {' · '}
                        {t.confirmed_at || t.created_at
                          ? formatDistanceToNow(new Date(t.confirmed_at || t.created_at), { addSuffix: true })
                          : 'pending'}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-mono text-sm tabular-nums text-white">
                        {t.amount_sol} SOL
                      </p>
                      <a
                        href={SOLSCAN_TX(t.signature)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 font-mono text-xs uppercase tracking-widest text-[var(--hc-text-muted)] hover:text-[var(--hc-accent)]"
                      >
                        {t.status} <ExternalLink className="h-3 w-3" />
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </AppLayout>
  )
}

function EmptyState({
  title,
  body,
  tone = 'muted',
}: {
  title: string
  body: string
  tone?: 'muted' | 'error'
}) {
  return (
    <div className="border border-dashed border-[var(--hc-border)] p-10 text-center">
      <p
        className={`font-mono text-sm uppercase tracking-widest ${
          tone === 'error' ? 'text-[var(--hc-verify-low)]' : 'text-white'
        }`}
      >
        {title}
      </p>
      <p className="mt-2 font-mono text-xs text-[var(--hc-text-muted)]">{body}</p>
    </div>
  )
}
