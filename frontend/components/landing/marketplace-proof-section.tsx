'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { Pill } from '@/components/pill';
import { Button } from '@/components/ui/button';
import { useListings, type NFTListing } from '@/contexts/AppContext';
import { Reveal } from './reveal';
import { PROOF_COPY } from './landing-section-data';

/**
 * Section 3 — marketplace proof band.
 *
 * Pulls live data from `useListings()`. When verified listings exist, the
 * band renders the KPI strip + a short list of recent verified rows. When
 * the state is empty (the current default — listings aren't fetched yet),
 * it collapses to a graceful "verified floor is open" invitation. Same
 * page in both modes; the band never claims more than the data supports.
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

export function MarketplaceProofSection() {
  const { listings } = useListings();

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
      style={{ background: 'var(--hc-bg)' }}
    >
      <div className="mx-auto max-w-[1280px]">
        <Reveal>
          <div className="flex justify-center">
            <Pill>{PROOF_COPY.eyebrow}</Pill>
          </div>
        </Reveal>

        <Reveal delayMs={80}>
          <h2
            id="landing-proof-title"
            className="mx-auto mt-8 max-w-[820px] text-center font-sentient italic font-extralight leading-[1.05] tracking-[-0.02em] text-white"
            style={{ fontSize: 'clamp(2.25rem, 5vw, 3.75rem)' }}
          >
            {hasData ? PROOF_COPY.title : PROOF_COPY.emptyTitle}
          </h2>
        </Reveal>

        <Reveal delayMs={160}>
          <p
            className="mx-auto mt-6 max-w-[560px] text-center font-mono text-sm sm:text-base"
            style={{ color: 'var(--hc-text-muted)' }}
          >
            {hasData ? PROOF_COPY.subtitle : PROOF_COPY.emptyBody}
          </p>
        </Reveal>

        {hasData ? (
          <>
            <Reveal delayMs={240}>
              <div className="mt-14 grid grid-cols-1 gap-8 sm:grid-cols-3">
                <KpiCell
                  label="24H VOLUME"
                  value={formatPrice(kpis.volume24h)}
                  unit="USDC"
                  barPct={Math.min(100, (kpis.volume24h / 10_000) * 100)}
                />
                <KpiCell
                  label="FLOOR (VERIFIED)"
                  value={kpis.floor != null ? formatPrice(kpis.floor) : '—'}
                  unit="USDC"
                  barPct={kpis.floor != null ? 65 : 0}
                />
                <KpiCell
                  label="VERIFIED COUNT"
                  value={String(kpis.verifiedCount)}
                  unit="DOSSIERS"
                  valueTone="verify-high"
                  barPct={Math.min(100, (kpis.verifiedCount / 25) * 100)}
                />
              </div>
            </Reveal>

            <Reveal delayMs={320}>
              <ul
                className="mt-14 divide-y"
                style={{ borderColor: 'var(--hc-hairline)' }}
              >
                {recent.map((l) => (
                  <li key={l.id} className="py-4">
                    <RecentRow listing={l} />
                  </li>
                ))}
              </ul>
            </Reveal>
          </>
        ) : (
          <Reveal delayMs={240}>
            <div className="mt-12 flex justify-center">
              <Link href="/marketplace">
                <Button variant="outline">{PROOF_COPY.emptyCta}</Button>
              </Link>
            </div>
          </Reveal>
        )}
      </div>
    </section>
  );
}

/* ─────────────────────────────────────────────────────────────────── */

function KpiCell({
  label,
  value,
  unit,
  barPct,
  valueTone,
}: {
  label: string;
  value: string;
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
        className="font-mono leading-none tabular-nums"
        style={{ color: valueColor, fontSize: 28, fontWeight: 500 }}
      >
        {value}
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
        className="hidden font-mono text-[10px] uppercase tracking-[0.14em] sm:inline"
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
        className="font-mono text-sm tabular-nums"
        style={{ color: 'var(--hc-text)' }}
      >
        {priceLabel}
      </span>

      <span
        className="hidden font-mono text-[11px] uppercase tracking-[0.06em] tabular-nums sm:inline"
        style={{ color: 'var(--hc-text-muted)' }}
      >
        {shortAddr(listing.userWallet)} · {timeAgo(listing.createdAt)}
      </span>
    </div>
  );
}
