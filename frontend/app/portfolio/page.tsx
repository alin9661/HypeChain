'use client'

/**
 * Portfolio — the items this wallet owns (workstream C1).
 *
 * No DAS/owned-NFT endpoint exists, so ownership is derived from the source of
 * truth for purchases: confirmed buyer-side transactions. Each owned item links
 * to its case file (/listings/[id]) and its on-chain provenance (Solscan). This
 * is the post-purchase home — where a buyer sees what they hold. Terminal /
 * case-file aesthetic per frontend/DESIGN.md.
 */

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { AppLayout } from '@/components/app-layout'
import { useWallet } from '@/contexts/AppContext'
import { apiClient, type Transaction } from '@/lib/api-client'
import { ExternalLink, ShieldCheck } from 'lucide-react'

const SOLSCAN_TOKEN = (mint: string) => `https://solscan.io/token/${mint}?cluster=devnet`

interface OwnedItem {
  listingId: string
  mint: string
  name: string
  image: string | null
  acquiredAt: string
  priceSol: number
}

export default function PortfolioPage() {
  const { wallet } = useWallet()
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
      .getTransactionHistory(wallet.address, 'buyer')
      .then((res) => {
        if (cancelled) return
        if (res.success && res.data) {
          setTxns(res.data.transactions)
        } else {
          setError(res.error || 'Failed to load portfolio')
          setTxns([])
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [wallet.address])

  // Owned = confirmed purchases. Dedupe by mint, keeping the most recent buy
  // (a re-acquired item shows once). Sells aren't subtracted here — the buy
  // ledger is what proves current custody on devnet; resale tracking is v2.
  const owned = useMemo<OwnedItem[]>(() => {
    const byMint = new Map<string, OwnedItem>()
    for (const t of txns) {
      if (t.status !== 'confirmed') continue
      const mint = t.listing?.nft_mint_address
      if (!mint) continue
      const acquiredAt = t.confirmed_at || t.created_at
      const existing = byMint.get(mint)
      if (!existing || new Date(acquiredAt) > new Date(existing.acquiredAt)) {
        byMint.set(mint, {
          listingId: t.listing_id,
          mint,
          name: t.listing?.product_name || mint,
          image: t.listing?.image_url ?? null,
          acquiredAt,
          priceSol: t.amount_sol,
        })
      }
    }
    return [...byMint.values()].sort(
      (a, b) => new Date(b.acquiredAt).getTime() - new Date(a.acquiredAt).getTime()
    )
  }, [txns])

  return (
    <AppLayout>
      <div className="mx-auto max-w-6xl">
        <header className="mb-8 border-b border-[var(--hc-hairline)] pb-4">
          <h1 className="font-mono text-2xl font-bold uppercase tracking-widest text-white">
            Custody Portfolio
          </h1>
          <p className="mt-1 font-mono text-sm text-[var(--hc-text-muted)]">
            Verified assets currently in your custody.
          </p>
        </header>

        {!wallet.connected || !wallet.address ? (
          <Empty title="No wallet connected" body="Connect your wallet to view the items you own." />
        ) : loading ? (
          <p className="font-mono text-sm uppercase tracking-widest text-[var(--hc-accent)]">
            Reading custody log<span className="animate-pulse">▋</span>
          </p>
        ) : error ? (
          <Empty title="Could not load portfolio" body={error} tone="error" />
        ) : owned.length === 0 ? (
          <Empty
            title="No assets in custody"
            body="Items you purchase will appear here with a link to their case file and on-chain provenance."
          />
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {owned.map((item) => (
              <div
                key={item.mint}
                className="group border border-[var(--hc-border)] bg-[var(--hc-surface-1)] transition-colors hover:border-[var(--hc-accent)]"
              >
                <Link href={`/listings/${item.listingId}`} className="block">
                  {item.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={item.image}
                      alt={item.name}
                      className="aspect-square w-full object-cover"
                    />
                  ) : (
                    <div className="flex aspect-square w-full items-center justify-center bg-[var(--hc-surface-2)]">
                      <ShieldCheck className="h-10 w-10 text-[var(--hc-text-muted)]" />
                    </div>
                  )}
                </Link>
                <div className="p-4">
                  <div className="mb-2 inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-widest text-[var(--hc-verify-high)]">
                    <ShieldCheck className="h-3 w-3" /> Verified · In custody
                  </div>
                  <p className="truncate font-mono text-sm text-white">{item.name}</p>
                  <p className="mt-1 font-mono text-xs tabular-nums text-[var(--hc-text-muted)]">
                    Acquired for {item.priceSol} SOL
                  </p>
                  <div className="mt-3 flex items-center justify-between">
                    <Link
                      href={`/listings/${item.listingId}`}
                      className="font-mono text-xs uppercase tracking-widest text-[var(--hc-accent)] hover:underline"
                    >
                      Case file
                    </Link>
                    <a
                      href={SOLSCAN_TOKEN(item.mint)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 font-mono text-xs uppercase tracking-widest text-[var(--hc-text-muted)] hover:text-[var(--hc-accent)]"
                    >
                      Chain <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  )
}

function Empty({
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
