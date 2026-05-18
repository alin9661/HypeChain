'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { usePrivy } from '@privy-io/react-auth';
import { toast } from 'sonner';

import { apiClient, type Listing } from '@/lib/api-client';
import { PurchaseButton } from '@/components/purchase-button';
import { CaseFileRibbon } from '@/components/case-file-ribbon';
import { RedactedField } from '@/components/redacted-field';

const POLY_4 = 'var(--hc-poly-4)';
const POLY_6 = 'var(--hc-poly-6)';
const POLY_16 = 'var(--hc-poly-16)';

function shortHash(hash: string, head = 4, tail = 4): string {
  if (hash.length <= head + tail + 1) return hash;
  return `${hash.slice(0, head)}…${hash.slice(-tail)}`;
}

function formatListedDate(iso: string): string {
  const d = new Date(iso);
  const date = d.toLocaleDateString('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const time = d.toLocaleTimeString('en-US', {
    timeZone: 'America/New_York',
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
  });
  return `${date.replace(/\//g, '-')} ${time} EST`;
}

export default function ListingDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { user } = usePrivy();
  const listingId = params.id as string;

  const [listing, setListing] = useState<Listing | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Privy's LinkedAccountWithMetadata is a discriminated union; narrow to the
  // Solana wallet variant so we can reach `.address` without a runtime cast.
  const getSolanaWallet = (): string | null => {
    if (!user) return null;
    const solanaWallet = user.linkedAccounts.find(
      (account): account is typeof account & { address: string; chainType: 'solana' } =>
        account.type === 'wallet' &&
        (account as { chainType?: string }).chainType === 'solana'
    );
    return solanaWallet?.address ?? null;
  };

  useEffect(() => {
    async function fetchListing() {
      try {
        setLoading(true);
        const response = await apiClient.getListingDetails(listingId);
        if (!response.success || !response.data) {
          throw new Error(response.error || 'Failed to load listing');
        }
        setListing(response.data.listing);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Failed to load listing';
        console.error('Error fetching listing:', err);
        setError(message);
        toast.error('Failed to load listing');
      } finally {
        setLoading(false);
      }
    }
    if (listingId) fetchListing();
  }, [listingId]);

  const handlePurchaseSuccess = () => router.push('/sold');

  if (loading) {
    // Evidence Chrome loading state — no spinner (DESIGN.md bans rounded-full
    // outside the pill indicator dot). Mono caret blink + redacted-block bar
    // matches the rest of the system; the page reads as "case file being
    // assembled" instead of generic "loading spinner".
    return (
      <div
        className="flex min-h-screen items-center justify-center"
        style={{ background: 'var(--hc-bg)', color: 'var(--hc-text)' }}
      >
        <div className="flex flex-col items-center gap-4 text-center">
          <p
            className="font-mono text-xs uppercase tracking-[0.18em]"
            style={{ color: 'var(--hc-text-muted)' }}
          >
            Retrieving case file
            <span
              aria-hidden
              className="ml-2 inline-block"
              style={{
                width: '7px',
                height: '1em',
                background: 'var(--hc-accent)',
                verticalAlign: 'text-bottom',
                animation: 'hc-caret-blink 0.7s steps(1, end) infinite',
              }}
            />
          </p>
          <p
            aria-hidden
            className="font-mono text-sm leading-none tracking-[-0.05em]"
            style={{ color: 'var(--hc-text-muted)' }}
          >
            {'████████████████'}
          </p>
        </div>
      </div>
    );
  }

  if (error || !listing) {
    return (
      <div
        className="flex min-h-screen items-center justify-center"
        style={{ background: 'var(--hc-bg)', color: 'var(--hc-text)' }}
      >
        <div className="max-w-md space-y-4 text-center">
          <h1 className="font-mono text-2xl font-bold uppercase tracking-[0.12em]" style={{ color: 'var(--hc-verify-low)' }}>
            Case Not Found
          </h1>
          <p className="font-mono text-xs uppercase tracking-[0.14em]" style={{ color: 'var(--hc-text-muted)' }}>
            {error || 'Listing not found'}
          </p>
          <Link
            href="/marketplace"
            className="hc-poly inline-block px-6 py-3 font-mono text-xs font-bold uppercase tracking-[0.16em]"
            style={{
              background: 'var(--hc-accent)',
              color: 'var(--hc-bg)',
              ['--hc-poly-r' as string]: POLY_16,
            }}
          >
            ← Back to Marketplace
          </Link>
        </div>
      </div>
    );
  }

  const userWallet = getSolanaWallet();
  const isOwnListing = userWallet === listing.seller_wallet;
  const isSold = listing.status === 'sold';
  const isPending = listing.status === 'pending' || !listing.ai_verified;
  const confidenceScore = listing.ai_confidence_score ?? 0;

  // 16-block gauge: fill = round(confidence/100 * 16)
  const fullBlocks = Math.min(16, Math.round((confidenceScore / 100) * 16));

  return (
    <div className="min-h-screen" style={{ background: 'var(--hc-bg)', color: 'var(--hc-text-body)' }}>
      <CaseFileRibbon caseId={listing.id} intake={listing.created_at} />

      {/* TOP NAV */}
      <nav
        aria-label="Primary"
        className="sticky z-[9] flex items-center justify-between border-b px-6 py-4 backdrop-blur-md"
        style={{
          top: '32px',
          background: 'rgba(0, 0, 0, 0.7)',
          borderBottomColor: 'var(--hc-hairline)',
        }}
      >
        <Link
          href="/"
          className="font-mono text-lg font-bold tracking-[0.08em]"
          style={{ color: 'var(--hc-accent)' }}
        >
          HYPECHAIN
        </Link>
        <div className="flex items-center gap-4">
          <Link
            href="/marketplace"
            className="font-mono text-xs font-medium uppercase tracking-[0.12em] transition-colors hover:text-white"
            style={{ color: 'var(--hc-text-muted)' }}
          >
            ← Back to Marketplace
          </Link>
          {userWallet && (
            <div
              role="status"
              aria-label="Connected wallet"
              className="hc-poly inline-flex h-8 items-center gap-2 px-3 font-mono text-[11px] font-medium tracking-[0.06em]"
              style={{
                background: 'var(--hc-surface-2)',
                color: 'var(--hc-text-body)',
                ['--hc-poly-r' as string]: POLY_6,
              }}
            >
              <span
                aria-hidden
                className="inline-block h-1.5 w-1.5 rounded-full"
                style={{
                  background: 'var(--hc-verify-high)',
                  boxShadow: '0 0 6px rgba(0, 229, 160, 0.6)',
                }}
              />
              {shortHash(userWallet, 4, 4)}
            </div>
          )}
        </div>
      </nav>

      <main className="mx-auto max-w-[1280px] px-6 pb-32 pt-12">
        <section className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
          {/* LEFT COLUMN */}
          <aside className="flex flex-col gap-6">
            {/* Image — polygon-clipped 16px tier, hairline border via two-layer trick */}
            <div
              className="hc-poly relative aspect-square"
              style={{
                background: 'var(--hc-border)',
                padding: '1px',
                ['--hc-poly-r' as string]: POLY_16,
              }}
            >
              <div
                className="hc-poly relative h-full w-full overflow-hidden"
                style={{
                  background: 'var(--hc-surface-1)',
                  ['--hc-poly-r' as string]: '15px',
                }}
              >
                <img
                  src={listing.image_url}
                  alt={listing.product_name}
                  className="h-full w-full object-cover"
                />
                {/* SOLD overlay */}
                {isSold && (
                  <div
                    className="absolute inset-0 flex flex-col items-center justify-center gap-2"
                    style={{ background: 'rgba(0, 0, 0, 0.78)' }}
                  >
                    <span
                      className="font-mono text-5xl font-bold tracking-[0.08em]"
                      style={{ color: 'var(--hc-verify-low)' }}
                    >
                      SOLD
                    </span>
                    {listing.sold_at && (
                      <span
                        className="font-mono text-[10px] uppercase tracking-[0.18em]"
                        style={{ color: 'var(--hc-text-muted)' }}
                      >
                        {new Date(listing.sold_at).toLocaleDateString('en-US')}
                      </span>
                    )}
                  </div>
                )}
                {/* VERIFIED stamp top-right */}
                {listing.ai_verified && !isSold && (
                  <span
                    className="hc-poly absolute right-4 top-4 inline-flex items-center gap-2 px-3 py-2 font-mono text-[10px] font-semibold uppercase tracking-[0.16em]"
                    style={{
                      background: 'var(--hc-bg)',
                      border: '1px solid var(--hc-verify-high)',
                      color: 'var(--hc-verify-high)',
                      ['--hc-poly-r' as string]: POLY_4,
                    }}
                  >
                    <span
                      aria-hidden
                      className="inline-block h-1.5 w-1.5 rounded-full"
                      style={{
                        background: 'var(--hc-verify-high)',
                        boxShadow: '0 0 4px rgba(0, 229, 160, 0.7)',
                      }}
                    />
                    Verified
                  </span>
                )}
              </div>
            </div>

            {/* AI Examination panel */}
            <section
              aria-label="AI examination details"
              className="flex flex-col gap-4 p-6"
              style={{
                background: 'var(--hc-surface-1)',
                border: '1px solid var(--hc-hairline)',
              }}
            >
              <h2
                className="border-b pb-3 font-mono text-[10px] font-semibold uppercase tracking-[0.18em]"
                style={{ color: 'var(--hc-text-muted)', borderBottomColor: 'var(--hc-hairline)' }}
              >
                AI Examination
              </h2>
              <div className="flex flex-col gap-2">
                <div className="flex items-baseline justify-between font-mono text-[11px] uppercase tracking-[0.12em]">
                  <span style={{ color: 'var(--hc-text-muted)' }}>Confidence</span>
                  <span
                    className="font-bold tabular-nums"
                    style={{
                      color: listing.ai_verified ? 'var(--hc-verify-high)' : 'var(--hc-verify-med)',
                      fontSize: '14px',
                    }}
                  >
                    {confidenceScore ? `${confidenceScore.toFixed(1)}%` : '— —'}
                  </span>
                </div>
                {listing.ai_verified && (
                  <div
                    aria-hidden
                    className="font-mono text-sm leading-none tracking-[-0.05em]"
                    style={{ color: 'var(--hc-verify-high)' }}
                  >
                    {'█'.repeat(fullBlocks)}
                    <span style={{ color: 'var(--hc-hairline)' }}>{'█'.repeat(16 - fullBlocks)}</span>
                  </div>
                )}
              </div>
              <dl className="grid grid-cols-[max-content_1fr] gap-x-6 gap-y-2 font-mono text-[11px] tracking-[0.08em]">
                <dt className="uppercase" style={{ color: 'var(--hc-text-muted)' }}>Examiner</dt>
                <dd style={{ color: 'var(--hc-text-body)' }}>VISION-4O</dd>
                <dt className="uppercase" style={{ color: 'var(--hc-text-muted)' }}>Intake</dt>
                <dd className="tabular-nums" style={{ color: 'var(--hc-text-body)' }}>
                  {formatListedDate(listing.created_at)}
                </dd>
                <dt className="uppercase" style={{ color: 'var(--hc-text-muted)' }}>Method</dt>
                <dd style={{ color: 'var(--hc-text-body)' }}>Serial + Provenance Match</dd>
              </dl>
            </section>
          </aside>

          {/* RIGHT COLUMN */}
          <article className="flex flex-col gap-8">
            <header className="flex flex-col gap-3">
              <h1
                className="font-mono font-semibold uppercase leading-[1.1] tracking-[-0.01em]"
                style={{
                  color: 'var(--hc-text)',
                  fontSize: 'clamp(28px, 4vw, 40px)',
                }}
              >
                {listing.product_name}
              </h1>
              <span
                className="hc-poly inline-flex h-7 items-center gap-2 self-start px-3 font-mono text-[10px] font-medium uppercase tracking-[0.18em]"
                style={{
                  background: 'var(--hc-surface-2)',
                  border: '1px solid var(--hc-border)',
                  color: 'var(--hc-text-muted)',
                  ['--hc-poly-r' as string]: POLY_6,
                }}
              >
                <span>{listing.category || 'Luxury Goods'}</span>
                {listing.condition && (
                  <>
                    <span style={{ color: 'var(--hc-border)' }}>·</span>
                    <span>{listing.condition.split(' ')[0]}</span>
                  </>
                )}
              </span>
            </header>

            {/* PRICE BLOCK — redacts while pending */}
            <div
              className="flex flex-col gap-2 p-6"
              style={{
                background: 'var(--hc-surface-1)',
                border: '1px solid var(--hc-border)',
              }}
            >
              <span
                className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em]"
                style={{ color: 'var(--hc-text-muted)' }}
              >
                Current Price
              </span>
              <span
                className="font-mono font-bold leading-none tracking-[-0.01em] tabular-nums"
                style={{
                  color: 'var(--hc-accent)',
                  fontSize: 'clamp(32px, 5vw, 48px)',
                }}
              >
                <RedactedField
                  pending={isPending}
                  value={`${listing.price_sol.toLocaleString()}`}
                  widthCh={8}
                />{' '}
                <span
                  className="font-medium uppercase"
                  style={{
                    color: 'var(--hc-text-muted)',
                    fontSize: '0.42em',
                    letterSpacing: '0.18em',
                  }}
                >
                  USDC
                </span>
              </span>
              {listing.price_usdc && (
                <span
                  className="font-mono text-xs tabular-nums"
                  style={{ color: 'var(--hc-text-muted)' }}
                >
                  ≈ {listing.price_usdc.toFixed(2)} USDC · locked at intake{' '}
                  {formatListedDate(listing.created_at)}
                </span>
              )}
            </div>

            {/* DESCRIPTION */}
            {listing.description && (
              <section className="flex flex-col gap-2">
                <h3
                  className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em]"
                  style={{ color: 'var(--hc-text-muted)' }}
                >
                  Description
                </h3>
                <p
                  className="text-[15px] leading-[1.6]"
                  style={{ color: 'var(--hc-text-body)' }}
                >
                  {listing.description}
                </p>
              </section>
            )}

            {/* CONDITION */}
            {listing.condition && (
              <section className="flex flex-col gap-2">
                <h3
                  className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em]"
                  style={{ color: 'var(--hc-text-muted)' }}
                >
                  Condition
                </h3>
                <p
                  className="font-mono text-sm tracking-[0.02em]"
                  style={{ color: 'var(--hc-text-body)' }}
                >
                  {listing.condition}
                </p>
              </section>
            )}

            {/* NFT DETAILS — alternating-hairline rows */}
            <dl
              aria-label="NFT details"
              style={{
                background: 'var(--hc-surface-1)',
                border: '1px solid var(--hc-hairline)',
              }}
            >
              <NftRow label="Mint Addr">
                {isPending ? (
                  <RedactedField pending value={shortHash(listing.nft_mint_address)} widthCh={10} />
                ) : (
                  <a
                    href={`https://solscan.io/token/${listing.nft_mint_address}?cluster=devnet`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="transition-colors hover:underline"
                    style={{ color: 'var(--hc-info)' }}
                  >
                    {shortHash(listing.nft_mint_address)}{' '}
                    <span aria-hidden style={{ color: 'var(--hc-text-muted)' }}>↗</span>
                  </a>
                )}
              </NftRow>
              <NftRow label="Seller">
                <RedactedField
                  pending={isPending}
                  value={shortHash(listing.seller_wallet)}
                  widthCh={10}
                />
              </NftRow>
              <NftRow label="Listed">
                <span className="tabular-nums" style={{ color: 'var(--hc-text-body)' }}>
                  {formatListedDate(listing.created_at)}
                </span>
              </NftRow>
              {listing.metadata_uri && (
                <NftRow label="IPFS">
                  {isPending ? (
                    <RedactedField pending value="Qm…aB7xK" widthCh={10} />
                  ) : (
                    <a
                      href={listing.metadata_uri.replace('ipfs://', 'https://ipfs.io/ipfs/')}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="transition-colors hover:underline"
                      style={{ color: 'var(--hc-info)' }}
                    >
                      {shortHash(listing.metadata_uri.replace('ipfs://', ''), 2, 5)}{' '}
                      <span aria-hidden style={{ color: 'var(--hc-text-muted)' }}>↗</span>
                    </a>
                  )}
                </NftRow>
              )}
              {listing.transaction_signature && (
                <NftRow label="Tx Sig">
                  <a
                    href={`https://solscan.io/tx/${listing.transaction_signature}?cluster=devnet`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="transition-colors hover:underline"
                    style={{ color: 'var(--hc-info)' }}
                  >
                    {shortHash(listing.transaction_signature)}{' '}
                    <span aria-hidden style={{ color: 'var(--hc-text-muted)' }}>↗</span>
                  </a>
                </NftRow>
              )}
            </dl>

            {/* PURCHASE CTA / state messages */}
            <div className="pt-2">
              {isSold ? (
                <div
                  className="p-4 text-center"
                  style={{
                    background: 'rgba(255, 59, 48, 0.08)',
                    border: '1px solid rgba(255, 59, 48, 0.3)',
                  }}
                >
                  <p
                    className="font-mono text-xs font-bold uppercase tracking-[0.14em]"
                    style={{ color: 'var(--hc-verify-low)' }}
                  >
                    This case has been closed
                  </p>
                  {listing.sold_at && (
                    <p
                      className="mt-1 font-mono text-[11px] tabular-nums"
                      style={{ color: 'var(--hc-text-muted)' }}
                    >
                      Sold on {new Date(listing.sold_at).toLocaleDateString('en-US')}
                    </p>
                  )}
                </div>
              ) : isOwnListing ? (
                <div
                  className="p-4 text-center"
                  style={{
                    background: 'rgba(77, 158, 255, 0.08)',
                    border: '1px solid rgba(77, 158, 255, 0.3)',
                  }}
                >
                  <p
                    className="font-mono text-xs font-bold uppercase tracking-[0.14em]"
                    style={{ color: 'var(--hc-info)' }}
                  >
                    This is your listing
                  </p>
                  <p
                    className="mt-1 font-mono text-[11px]"
                    style={{ color: 'var(--hc-text-muted)' }}
                  >
                    You cannot purchase your own item
                  </p>
                </div>
              ) : (
                <PurchaseButton
                  listingId={listing.id}
                  price={listing.price_sol}
                  sellerWallet={listing.seller_wallet}
                  productName={listing.product_name}
                  onSuccess={handlePurchaseSuccess}
                />
              )}
            </div>

            {/* MINT CERTIFICATE PREVIEW */}
            {listing.ai_verified && !isSold && (
              <section
                aria-label="Certificate of Authenticity preview"
                className="relative flex flex-col gap-3 overflow-hidden p-6"
                style={{
                  background: 'var(--hc-surface-1)',
                  border: '1px solid var(--hc-border)',
                }}
              >
                <span
                  className="absolute right-3 top-3 px-2 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-[0.2em]"
                  style={{
                    color: 'var(--hc-text-muted)',
                    border: '1px solid var(--hc-hairline)',
                  }}
                >
                  PREVIEW
                </span>
                <span
                  className="font-mono text-[10px] font-semibold uppercase tracking-[0.2em]"
                  style={{ color: 'var(--hc-text-muted)' }}
                >
                  Post-Mint Artifact
                </span>
                <h3
                  className="font-mono text-[13px] font-bold uppercase tracking-[0.18em]"
                  style={{ color: 'var(--hc-text)' }}
                >
                  Certificate of Authenticity
                </h3>
                <p
                  className="py-2 italic leading-[1.1]"
                  style={{
                    fontFamily: 'var(--font-sentient, Sentient), Geist, serif',
                    fontWeight: 300,
                    fontSize: '28px',
                    color: 'var(--hc-text)',
                  }}
                >
                  {listing.product_name}
                </p>
                <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 font-mono text-[11px] tracking-[0.04em]">
                  <dt
                    className="font-semibold uppercase tracking-[0.14em]"
                    style={{ color: 'var(--hc-text-muted)', fontSize: '9px' }}
                  >
                    Case
                  </dt>
                  <dd className="tabular-nums" style={{ color: 'var(--hc-text-body)' }}>
                    HC–2026–{listing.id.replace(/[^0-9]/g, '').padStart(6, '0').slice(-6)}
                  </dd>
                  <dt
                    className="font-semibold uppercase tracking-[0.14em]"
                    style={{ color: 'var(--hc-text-muted)', fontSize: '9px' }}
                  >
                    Examiner
                  </dt>
                  <dd style={{ color: 'var(--hc-text-body)' }}>VISION-4O</dd>
                  <dt
                    className="font-semibold uppercase tracking-[0.14em]"
                    style={{ color: 'var(--hc-text-muted)', fontSize: '9px' }}
                  >
                    Confidence
                  </dt>
                  <dd className="tabular-nums" style={{ color: 'var(--hc-text-body)' }}>
                    {confidenceScore.toFixed(1)}%
                  </dd>
                  <dt
                    className="font-semibold uppercase tracking-[0.14em]"
                    style={{ color: 'var(--hc-text-muted)', fontSize: '9px' }}
                  >
                    Mint
                  </dt>
                  <dd className="tabular-nums" style={{ color: 'var(--hc-text-body)' }}>
                    {shortHash(listing.nft_mint_address)}
                  </dd>
                </dl>
                <a
                  href="#"
                  className="mt-2 self-start border-b pb-0.5 font-mono text-[11px] font-semibold uppercase tracking-[0.18em]"
                  style={{ color: 'var(--hc-accent)', borderBottomColor: 'var(--hc-accent)' }}
                >
                  View Full Certificate →
                </a>
                {/* Rotary stamp — DESIGN.md Move 3, the allowed circle exception */}
                <div
                  aria-hidden
                  className="pointer-events-none absolute flex flex-col items-center justify-center rounded-full text-center font-mono font-bold leading-[1.3]"
                  style={{
                    bottom: '24px',
                    right: '24px',
                    width: '88px',
                    height: '88px',
                    border: '2px solid var(--hc-accent)',
                    transform: 'rotate(-7deg)',
                    fontSize: '8px',
                    letterSpacing: '0.14em',
                    color: 'var(--hc-accent)',
                    opacity: 0.88,
                  }}
                >
                  <span
                    aria-hidden
                    className="absolute rounded-full"
                    style={{
                      inset: '4px',
                      border: '1px solid var(--hc-accent)',
                      opacity: 0.5,
                    }}
                  />
                  <span>VERIFIED</span>
                  <span className="tabular-nums">
                    {new Date(listing.created_at).toISOString().slice(0, 10)}
                  </span>
                  <span>VISION-4O</span>
                </div>
              </section>
            )}

            {/* STATS */}
            <div
              className="flex items-center gap-6 border-t pt-2 font-mono text-[11px] font-medium uppercase tracking-[0.14em]"
              style={{ color: 'var(--hc-text-muted)', borderTopColor: 'var(--hc-hairline)' }}
            >
              <span>
                <span
                  className="font-bold tabular-nums tracking-[0.02em]"
                  style={{ color: 'var(--hc-text)' }}
                >
                  {listing.views.toLocaleString()}
                </span>{' '}
                Views
              </span>
              <span style={{ color: 'var(--hc-border)' }}>·</span>
              <span>
                <span
                  className="font-bold tabular-nums tracking-[0.02em]"
                  style={{ color: 'var(--hc-text)' }}
                >
                  {listing.favorites.toLocaleString()}
                </span>{' '}
                Favorites
              </span>
            </div>
          </article>
        </section>
      </main>
    </div>
  );
}

function NftRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div
      className="grid grid-cols-[max-content_1fr] items-center gap-6 border-b px-6 py-3 font-mono text-xs tracking-[0.04em] even:bg-white/[0.012] last:border-b-0"
      style={{ borderBottomColor: 'var(--hc-hairline)' }}
    >
      <dt
        className="font-semibold uppercase tracking-[0.14em]"
        style={{ color: 'var(--hc-text-muted)', fontSize: '10px' }}
      >
        {label}
      </dt>
      <dd
        className="m-0 flex items-center justify-end gap-2 tabular-nums"
        style={{ color: 'var(--hc-text-body)' }}
      >
        {children}
      </dd>
    </div>
  );
}
