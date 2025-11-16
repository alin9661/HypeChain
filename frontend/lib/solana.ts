import { Connection, PublicKey, ParsedTransactionWithMeta, ConfirmedSignatureInfo } from '@solana/web3.js'

// Use custom RPC URL from environment or fallback to public DevNet
const DEVNET_URL = process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 'https://api.devnet.solana.com'

export interface SolanaTransaction {
  signature: string
  blockTime: number | null
  slot: number
  fee: number
  status: 'success' | 'failed'
  from: string
  to: string[]
  amount: number
  type: string
}

interface CacheEntry {
  data: SolanaTransaction[]
  timestamp: number
}

export class SolanaService {
  private connection: Connection
  private cache: Map<string, CacheEntry> = new Map()
  private readonly CACHE_TTL = 30000 // 30 seconds
  private readonly MAX_RETRIES = 3
  private readonly INITIAL_RETRY_DELAY = 1000 // 1 second

  constructor() {
    this.connection = new Connection(DEVNET_URL, 'confirmed')
  }

  async getRecentTransactions(limit: number = 10, retries = 0): Promise<SolanaTransaction[]> {
    const cacheKey = `recent-${limit}`

    // Check cache first
    const cached = this.cache.get(cacheKey)
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      console.log('Returning cached transactions')
      return cached.data
    }

    try {
      // Get recent signatures from a known active address
      // For demo purposes, we'll fetch from the system program
      const systemProgram = new PublicKey('11111111111111111111111111111111')

      const signatures = await this.connection.getSignaturesForAddress(
        systemProgram,
        { limit }
      )

      const transactions = await this.getTransactionDetails(signatures)

      // Cache the results
      this.cache.set(cacheKey, {
        data: transactions,
        timestamp: Date.now()
      })

      return transactions
    } catch (error: any) {
      // Check if it's a rate limit error
      const isRateLimitError = error?.message?.includes('429') ||
                               error?.message?.includes('Too Many Requests')

      // Return cached data if available during rate limiting
      if (isRateLimitError && cached) {
        console.warn('Rate limited, returning stale cache')
        return cached.data
      }

      // Retry with exponential backoff
      if (isRateLimitError && retries < this.MAX_RETRIES) {
        const delay = this.INITIAL_RETRY_DELAY * Math.pow(2, retries)
        console.log(`Rate limited. Retrying after ${delay}ms (attempt ${retries + 1}/${this.MAX_RETRIES})`)

        await this.sleep(delay)
        return this.getRecentTransactions(limit, retries + 1)
      }

      console.error('Error fetching recent transactions:', error)
      return []
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  async getTransactionsByAddress(
    address: string,
    limit: number = 10,
    retries = 0
  ): Promise<SolanaTransaction[]> {
    const cacheKey = `address-${address}-${limit}`

    // Check cache first
    const cached = this.cache.get(cacheKey)
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      console.log('Returning cached address transactions')
      return cached.data
    }

    try {
      const publicKey = new PublicKey(address)
      const signatures = await this.connection.getSignaturesForAddress(publicKey, { limit })
      const transactions = await this.getTransactionDetails(signatures)

      // Cache the results
      this.cache.set(cacheKey, {
        data: transactions,
        timestamp: Date.now()
      })

      return transactions
    } catch (error: any) {
      const isRateLimitError = error?.message?.includes('429') ||
                               error?.message?.includes('Too Many Requests')

      if (isRateLimitError && cached) {
        console.warn('Rate limited, returning stale cache')
        return cached.data
      }

      if (isRateLimitError && retries < this.MAX_RETRIES) {
        const delay = this.INITIAL_RETRY_DELAY * Math.pow(2, retries)
        console.log(`Rate limited. Retrying after ${delay}ms (attempt ${retries + 1}/${this.MAX_RETRIES})`)

        await this.sleep(delay)
        return this.getTransactionsByAddress(address, limit, retries + 1)
      }

      console.error('Error fetching transactions by address:', error)
      return []
    }
  }

  private async getTransactionDetails(
    signatures: ConfirmedSignatureInfo[]
  ): Promise<SolanaTransaction[]> {
    const transactions: SolanaTransaction[] = []

    for (const sig of signatures) {
      try {
        const tx = await this.connection.getParsedTransaction(sig.signature, {
          maxSupportedTransactionVersion: 0
        })

        if (!tx) continue

        const transaction = this.parseTransaction(tx, sig)
        if (transaction) {
          transactions.push(transaction)
        }
      } catch (error) {
        console.error('Error parsing transaction:', error)
      }
    }

    return transactions
  }

  private parseTransaction(
    tx: ParsedTransactionWithMeta,
    sig: ConfirmedSignatureInfo
  ): SolanaTransaction | null {
    try {
      const accountKeys = tx.transaction.message.accountKeys
      const from = accountKeys[0]?.pubkey.toString() || 'Unknown'
      const to = accountKeys.slice(1, 3).map(key => key.pubkey.toString())

      // Calculate total amount transferred
      let amount = 0
      if (tx.meta?.preBalances && tx.meta?.postBalances) {
        const balanceChange = Math.abs(
          (tx.meta.postBalances[0] || 0) - (tx.meta.preBalances[0] || 0)
        )
        amount = balanceChange / 1e9 // Convert lamports to SOL
      }

      return {
        signature: sig.signature,
        blockTime: tx.blockTime,
        slot: sig.slot,
        fee: (tx.meta?.fee || 0) / 1e9,
        status: tx.meta?.err ? 'failed' : 'success',
        from,
        to,
        amount,
        type: this.determineTransactionType(tx)
      }
    } catch (error) {
      console.error('Error parsing transaction details:', error)
      return null
    }
  }

  private determineTransactionType(tx: ParsedTransactionWithMeta): string {
    const instructions = tx.transaction.message.instructions

    if (instructions.length === 0) return 'Unknown'

    // Check for common transaction types
    const firstInstruction = instructions[0]

    if ('parsed' in firstInstruction) {
      const parsed = firstInstruction.parsed
      if (parsed?.type === 'transfer') return 'Transfer'
      if (parsed?.type === 'create') return 'Create Account'
      if (parsed?.type === 'createAccount') return 'Create Account'
    }

    return 'Transaction'
  }

  async getCurrentSlot(): Promise<number> {
    return await this.connection.getSlot()
  }

  async getClusterNodes() {
    return await this.connection.getClusterNodes()
  }
}

export const solanaService = new SolanaService()
