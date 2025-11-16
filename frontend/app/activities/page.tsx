'use client'

import { useEffect, useState } from 'react'
import { AppLayout } from '@/components/app-layout'
import { solanaService, SolanaTransaction } from '@/lib/solana'
import { Search, Filter, RefreshCw, ExternalLink, CheckCircle, XCircle } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'

export default function ActivitiesPage() {
  const [transactions, setTransactions] = useState<SolanaTransaction[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [filterType, setFilterType] = useState<'all' | 'success' | 'failed'>('all')
  const [refreshing, setRefreshing] = useState(false)

  useEffect(() => {
    loadTransactions()

    // Set up auto-refresh every 60 seconds (reduced from 30s to prevent rate limiting)
    const interval = setInterval(() => {
      loadTransactions(true)
    }, 60000)

    return () => clearInterval(interval)
  }, [])

  const loadTransactions = async (isRefresh = false) => {
    if (isRefresh) {
      setRefreshing(true)
    } else {
      setLoading(true)
    }

    try {
      // Reduced from 50 to 10 to prevent rate limiting
      const txs = await solanaService.getRecentTransactions(10)
      setTransactions(txs)
    } catch (error) {
      console.error('Failed to load transactions:', error)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  const filteredTransactions = transactions.filter(tx => {
    const matchesSearch =
      tx.signature.toLowerCase().includes(searchQuery.toLowerCase()) ||
      tx.from.toLowerCase().includes(searchQuery.toLowerCase()) ||
      tx.to.some(addr => addr.toLowerCase().includes(searchQuery.toLowerCase()))

    const matchesFilter =
      filterType === 'all' || tx.status === filterType

    return matchesSearch && matchesFilter
  })

  const formatAddress = (address: string) => {
    if (address.length <= 16) return address
    return `${address.slice(0, 8)}...${address.slice(-8)}`
  }

  const formatTimestamp = (timestamp: number | null) => {
    if (!timestamp) return 'Unknown'
    try {
      return formatDistanceToNow(new Date(timestamp * 1000), { addSuffix: true })
    } catch {
      return 'Unknown'
    }
  }

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold text-white">Recent Activities</h1>
            <p className="mt-2 text-slate-400">
              Real-time transactions from Solana DevNet
            </p>
          </div>

          <button
            onClick={() => loadTransactions(true)}
            disabled={refreshing}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        {/* Filters */}
        <div className="flex flex-col gap-4 rounded-lg border border-slate-700 bg-slate-800/50 p-4 sm:flex-row">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search by signature or address..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-900 py-2 pl-10 pr-4 text-sm text-white placeholder-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => setFilterType('all')}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                filterType === 'all'
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
              }`}
            >
              All
            </button>
            <button
              onClick={() => setFilterType('success')}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                filterType === 'success'
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
              }`}
            >
              Success
            </button>
            <button
              onClick={() => setFilterType('failed')}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                filterType === 'failed'
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
              }`}
            >
              Failed
            </button>
          </div>
        </div>

        {/* Loading State */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
          </div>
        ) : (
          /* Transactions Table */
          <div className="overflow-hidden rounded-lg border border-slate-700 bg-slate-800/50">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="border-b border-slate-700 bg-slate-900/50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-400">
                      Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-400">
                      Signature
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-400">
                      Type
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-400">
                      From
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-400">
                      Amount
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-400">
                      Time
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-400">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700">
                  {filteredTransactions.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-6 py-8 text-center text-slate-400">
                        No transactions found
                      </td>
                    </tr>
                  ) : (
                    filteredTransactions.map((tx) => (
                      <tr
                        key={tx.signature}
                        className="transition-colors hover:bg-slate-800"
                      >
                        <td className="px-6 py-4">
                          {tx.status === 'success' ? (
                            <CheckCircle className="h-5 w-5 text-green-500" />
                          ) : (
                            <XCircle className="h-5 w-5 text-red-500" />
                          )}
                        </td>
                        <td className="px-6 py-4">
                          <code className="text-sm text-blue-400">
                            {formatAddress(tx.signature)}
                          </code>
                        </td>
                        <td className="px-6 py-4">
                          <span className="rounded-full bg-slate-700 px-2.5 py-1 text-xs font-medium text-slate-300">
                            {tx.type}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <code className="text-sm text-slate-300">
                            {formatAddress(tx.from)}
                          </code>
                        </td>
                        <td className="px-6 py-4 text-white">
                          {tx.amount > 0 ? `${tx.amount.toFixed(4)} SOL` : '-'}
                        </td>
                        <td className="px-6 py-4 text-sm text-slate-400">
                          {formatTimestamp(tx.blockTime)}
                        </td>
                        <td className="px-6 py-4">
                          <a
                            href={`https://explorer.solana.com/tx/${tx.signature}?cluster=devnet`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-blue-400 hover:text-blue-300"
                          >
                            <ExternalLink className="h-4 w-4" />
                          </a>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Stats */}
        {!loading && (
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-4">
              <p className="text-sm text-slate-400">Total Transactions</p>
              <p className="mt-1 text-2xl font-bold text-white">{filteredTransactions.length}</p>
            </div>
            <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-4">
              <p className="text-sm text-slate-400">Successful</p>
              <p className="mt-1 text-2xl font-bold text-green-500">
                {filteredTransactions.filter(tx => tx.status === 'success').length}
              </p>
            </div>
            <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-4">
              <p className="text-sm text-slate-400">Failed</p>
              <p className="mt-1 text-2xl font-bold text-red-500">
                {filteredTransactions.filter(tx => tx.status === 'failed').length}
              </p>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  )
}
