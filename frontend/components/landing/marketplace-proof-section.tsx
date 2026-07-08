'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { Pill } from '@/components/pill';
import { Button } from '@/components/ui/button';
import { useListings, type NFTListing } from '@/contexts/AppContext';
import { AnimatedNumber } from './animated-number';
import { makeDemoListings } from './demo-listings';
import { Reveal } from './reveal';
import { PROOF_COPY } from './landing-section-data';

/**
 * Section 3 — the verified floor as a terminal panel.
 *
 * One hc-poly bordered panel with a mono header bar (ribbon vocabulary
 * quoted as a static strip — the literal `<CaseFileRibbon>` is forbidden
 * on `/`), a KPI strip with count-up numerals, and hairline table rows.
 *
 * Pulls live data from `useListings()`. The panel is designed empty-first:
 * when no verified listings exist (the current default — listings aren't
 * fetched yet), the same frame renders an AWAITING FIRST DOSSIER row with
 * a blinking caret and the marketplace CTA. The band never claims more
 * than the data supports.
 *
 * KPI derivations mirror `app/marketplace/page.tsx` (~lines 78–108) so
 * both surfaces tell the same story when populated.
 */

type Status = 'verified' | 'pending';

function deriveStatus(listing: NFTListing): Status {
  return listing.nft_mint_address ? 'verified' : 'pending';
}

function caseNumber(id: string): string {
  const numeric = id.replace(/[^0-9]/g, '');
  const padded =
    numeric.length > 0 ? numeric.padStart(6, '0').slice(-6) : id.slice(0, 6).toUpperCase();
  return `HC-${new Date().getFullYear()}-${padded}`;
}

function shortAddr(addr: string): string {
  if (addr.length <= 10) return addr;
  return `${addr.slice(0, 4)}…${addr.slice(-4)}`;
}

function timeAgo(iso: string): string {
  const d = new Date(iso);
  const diffMs = Date.now() - d.getTime();
  const m = Math.floor(diffMs / 60_000);
  if (m < 1) return 'JUST NOW';
  if (m < 60) return `${m} M AGO`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} H AGO`;
  const days = Math.floor(h / 24);
  return days === 1 ? 'YESTERDAY' : `${days} D AGO`;
}

function formatPrice(n: number): string {
  return n.toLocaleString('en-US', { maximumFractionDigits: 0 });
}

/**
 * Design-review seed: dev builds only, and only with `?demo=1` in the URL.
 * Returns placeholder listings so the panel's populated mode is reviewable
 * without a running backend. `NODE_ENV` is inlined at build time, so the
 * entire branch (and the fixture import) is dead code in production.
 */
function useDemoListings(): NFTListing[] | null {
  const [demo, setDemo] = useState<NFTListing[] | null>(null);
  useEffect(() => {
    if (process.env.NODE_ENV !== 'development') return;
    if (new URLSearchParams(window.location.search).get('demo') === '1') {
      setDemo(makeDemoListings(Date.now()));
    }
  }, []);
  return demo;
}

export function MarketplaceProofSection() {
  const { listings: liveListings } = useListings();
  const demoListings = useDemoListings();
  const listings = demoListings ?? liveListings;

  const { kpis, recent, hasData } = useMemo(() => {
    const verified = listings.filter((l) => deriveStatus(l) === 'verified');
    const prices = verified
      .map((l) => Number(l.listing_price_sol))
      .filter((n) => Number.isFinite(n) && n > 0);
    const floor = prices.length > 0 ? Math.min(...prices) : null;

    const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
    const volume24h = listings
      .filter((l) => new Date(l.createdAt).getTime() > dayAgo)
      .reduce((sum, l) => {
        const n = Number(l.listing_price_sol);
        return Number.isFinite(n) ? sum + n : sum;
      }, 0);

    const recent = [...verified]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 5);

    return {
      kpis: {
        volume24h,
        floor,
        verifiedCount: verified.length,
      },
      recent,
      hasData: verified.length > 0,
    };
  }, [listings]);

  return (
    <section
      aria-labelledby="landing-proof-title"
      className="relative w-full px-6 py-32 md:py-40"
    >
      <div className="mx-auto max-w-[1280px]">
        <Reveal>
          <div className="flex items-end justify-between gap-6">
            <div>
              <Pill>{PROOF_COPY.eyebrow}</Pill>
              <h2
                id="landing-proof-title"
                className="mt-8 max-w-[820px] font-sentient italic font-extralight leading-[1.05] tracking-[-0.02em] text-white"
                style={{ fontSize: 'clamp(2.25rem, 5vw, 3.75rem)' }}
              >
                {hasData ? PROOF_COPY.title : PROOF_COPY.emptyTitle}
              </h2>
              <p
                className="mt-6 max-w-[560px] font-mono text-sm sm:text-base"
                style={{ color: 'var(--hc-text-muted)' }}
              >
                {hasData ? PROOF_COPY.subtitle : PROOF_COPY.emptyBody}
              </p>
            </div>
          </div>
        </Reveal>

        <Reveal delayMs={160}>
          <div
            className="hc-poly mt-14 border"
            style={{
              borderColor: 'var(--hc-border)',
              background: 'var(--hc-surface-1)',
              ['--hc-poly-r' as string]: 'var(--hc-poly-16, 16px)',
            }}
          >
            {/* Header bar — ribbon vocabulary, quoted. */}
            <div
              className="flex items-center justify-between border-b px-5 py-3 md:px-8"
              style={{ borderColor: 'var(--hc-hairline)' }}
            >
              <span
                className="font-mono text-[10px] uppercase tracking-[0.14em]"
                style={{ color: 'var(--hc-text-muted)' }}
              >
                {PROOF_COPY.panelTitle}
              </span>
              <span className="flex items-center gap-1.5">
                <span
                  aria-hidden
                  className="inline-block h-1.5 w-1.5 rounded-full"
                  style={{
                    background: 'var(--hc-verify-high)',
                    boxShadow: '0 0 6px var(--hc-verify-high)',
                    animation: 'hc-live-pulse 1.6s ease-in-out infinite',
                  }}
                />
                <span
                  className="font-mono text-[10px] uppercase tracking-[0.14em]"
                  style={{ color: 'var(--hc-verify-high)' }}
                >
                  LIVE
                </span>
              </span>
            </div>

            {hasData ? (
              <PopulatedPanel kpis={kpis} recent={recent} />
            ) : (
              <EmptyPanel />
            )}
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/* ─────────────────────────  POPULATED MODE  ───────────────────────── */

function PopulatedPanel({
  kpis,
  recent,
}: {
  kpis: { volume24h: number; floor: number | null; verifiedCount: number };
  recent: NFTListing[];
}) {
  return (
    <>
      <div
        className="grid grid-cols-1 gap-8 border-b px-5 py-8 sm:grid-cols-3 md:px-8"
        style={{ borderColor: 'var(--hc-hairline)' }}
      >
        <KpiCell
          label="24H VOLUME"
          value={kpis.volume24h}
          unit="USDC"
          barPct={Math.min(100, (kpis.volume24h / 10_000) * 100)}
        />
        <KpiCell
          label="FLOOR (VERIFIED)"
          value={kpis.floor}
          unit="USDC"
          barPct={kpis.floor != null ? 65 : 0}
        />
        <KpiCell
          label="VERIFIED COUNT"
          value={kpis.verifiedCount}
          unit="DOSSIERS"
          valueTone="verify-high"
          barPct={Math.min(100, (kpis.verifiedCount / 25) * 100)}
        />
      </div>

      {/* Column headers + rows. */}
      <div className="px-5 pb-2 md:px-8">
        <div
          className="hidden grid-cols-[100px_1fr_auto_auto] items-center gap-4 border-b py-3 font-mono text-[9px] uppercase tracking-[0.14em] sm:grid"
          style={{ borderColor: 'var(--hc-hairline)', color: 'var(--hc-text-muted)' }}
        >
          <span>CASE NO.</span>
          <span>DOSSIER</span>
          <span className="text-right">PRICE</span>
          <span className="text-right">SELLER · FILED</span>
        </div>
        <ul className="divide-y" style={{ borderColor: 'var(--hc-hairline)' }}>
          {recent.map((l) => (
            <li key={l.id} className="py-4">
              <RecentRow listing={l} />
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}

function KpiCell({
  label,
  value,
  unit,
  barPct,
  valueTone,
}: {
  label: string;
  value: number | null;
  unit?: string;
  barPct: number;
  valueTone?: 'verify-high';
}) {
  const valueColor = valueTone === 'verify-high' ? 'var(--hc-verify-high)' : 'var(--hc-text)';
  return (
    <div className="flex flex-col gap-2">
      <span
        className="font-mono text-[10px] uppercase tracking-[0.14em]"
        style={{ color: 'var(--hc-text-muted)' }}
      >
        {label}
      </span>
      <span
        className="font-mono leading-none"
        style={{ color: valueColor, fontSize: 28, fontWeight: 500 }}
      >
        {value != null ? <AnimatedNumber value={value} format={formatPrice} /> : '—'}
        {unit && (
          <span
            className="ml-1.5 font-mono text-[12px]"
            style={{ color: 'var(--hc-text-muted)', fontWeight: 400 }}
          >
            {unit}
          </span>
        )}
      </span>
      <span
        aria-hidden
        className="relative mt-1 block h-[3px]"
        style={{ background: 'var(--hc-hairline)' }}
      >
        <span
          className="absolute inset-y-0 left-0"
          style={{
            background:
              valueTone === 'verify-high' ? 'var(--hc-verify-high)' : 'var(--hc-accent)',
            width: `${Math.max(0, Math.min(100, barPct))}%`,
          }}
        />
      </span>
    </div>
  );
}

function RecentRow({ listing }: { listing: NFTListing }) {
  const price = Number(listing.listing_price_sol);
  const priceLabel = Number.isFinite(price) ? `${formatPrice(price)} USDC` : '—';

  return (
    <div className="grid grid-cols-[1fr_auto] items-center gap-4 sm:grid-cols-[100px_1fr_auto_auto]">
      <span
        className="hidden font-mono text-[10px] uppercase tracking-[0.14em] tabular-nums sm:inline"
        style={{ color: 'var(--hc-text-muted)' }}
      >
        {caseNumber(listing.id)}
      </span>

      <span
        className="font-mono text-sm leading-tight text-white"
        title={listing.product_name ?? ''}
      >
        {listing.product_name ?? 'Unnamed dossier'}
      </span>

      <span
        className="text-right font-mono text-sm tabular-nums"
        style={{ color: 'var(--hc-text)' }}
      >
        {priceLabel}
      </span>

      <span
        className="hidden text-right font-mono text-[11px] uppercase tracking-[0.06em] tabular-nums sm:inline"
        style={{ color: 'var(--hc-text-muted)' }}
      >
        {shortAddr(listing.userWallet)} · {timeAgo(listing.createdAt)}
      </span>
    </div>
  );
}

/* ──────────────────────────  EMPTY MODE  ──────────────────────────── */

function EmptyPanel() {
  return (
    <div className="flex flex-col gap-6 px-5 py-8 md:px-8">
      <div
        className="flex items-center gap-2 border-b pb-6 font-mono text-sm"
        style={{ borderColor: 'var(--hc-hairline)' }}
      >
        <span style={{ color: 'var(--hc-text-muted)' }}>{PROOF_COPY.emptyRow}</span>
        <span
          aria-hidden
          className="inline-block h-[1.1em] w-[1px] align-middle"
          style={{
            background: 'var(--hc-text-muted)',
            animation: 'hc-caret-blink 1.1s step-end infinite',
          }}
        />
      </div>
      <div>
        <Link href="/marketplace">
          <Button variant="outline">{PROOF_COPY.emptyCta}</Button>
        </Link>
      </div>
    </div>
  );
}
