'use client';

import Link from 'next/link';
import type { CSSProperties } from 'react';
import { Button } from '@/components/ui/button';
import { Pill } from '@/components/pill';
import { useInView } from '@/hooks/useInView';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { Reveal } from './reveal';
import { FINAL_CTA_COPY } from './landing-section-data';

/**
 * Section 4 — the closing CTA as a CASE OPEN document: one 24px-tier
 * hc-poly frame with a case header row, left-aligned editorial headline
 * and CTA pair, a rotary CASE OPEN stamp settling into the top-right
 * corner (hc-stamp-settle quotes the MintCertificate gesture), and a
 * signature-line footer. The editorial headline uses Sentient italic per
 * DESIGN.md (Sentient = display/editorial moments only).
 */
export function FinalCtaSection() {
  return (
    <section
      aria-labelledby="landing-final-cta-title"
      className="relative w-full px-6 py-32 md:py-48"
    >
      <div className="mx-auto max-w-[880px]">
        <Reveal>
          <div
            className="hc-poly relative border px-6 py-10 md:px-12 md:py-14"
            style={{
              borderColor: 'var(--hc-border)',
              background: 'var(--hc-surface-1)',
              ['--hc-poly-r' as string]: 'var(--hc-poly-24, 24px)',
            }}
          >
            {/* Case header row. */}
            <div
              className="flex items-center justify-between gap-4 border-b pb-5"
              style={{ borderColor: 'var(--hc-hairline)' }}
            >
              <Pill>{FINAL_CTA_COPY.eyebrow}</Pill>
              <span
                className="font-mono text-[10px] uppercase tracking-[0.14em] tabular-nums"
                style={{ color: 'var(--hc-text-muted)' }}
              >
                HC-2026-005847 {'//'} SOL
              </span>
            </div>

            <CornerStamp />

            <Reveal delayMs={80}>
              <h2
                id="landing-final-cta-title"
                className="mt-10 max-w-[640px] font-sentient italic font-extralight leading-[1.05] tracking-[-0.02em] text-white"
                style={{ fontSize: 'clamp(2.25rem, 5vw, 3.75rem)' }}
              >
                {FINAL_CTA_COPY.title}
              </h2>
            </Reveal>

            <Reveal delayMs={160}>
              <p
                className="mt-6 max-w-[520px] font-mono text-sm sm:text-base"
                style={{ color: 'var(--hc-text-muted)' }}
              >
                {FINAL_CTA_COPY.body}
              </p>
            </Reveal>

            <Reveal delayMs={240}>
              <div className="mt-10 flex flex-wrap gap-4">
                <Link href={FINAL_CTA_COPY.primaryHref}>
                  <Button>{FINAL_CTA_COPY.primaryLabel}</Button>
                </Link>
                <Link href={FINAL_CTA_COPY.secondaryHref}>
                  <Button variant="outline">{FINAL_CTA_COPY.secondaryLabel}</Button>
                </Link>
              </div>
            </Reveal>

            {/* Signature-line footer. */}
            <Reveal delayMs={320}>
              <div
                className="mt-14 flex flex-wrap items-end justify-between gap-6 border-t pt-5"
                style={{ borderColor: 'var(--hc-hairline)' }}
              >
                <span className="flex flex-col gap-2">
                  <span
                    aria-hidden
                    className="block h-px w-44"
                    style={{ background: 'var(--hc-text-muted)' }}
                  />
                  <span
                    className="font-mono text-[9px] uppercase tracking-[0.14em]"
                    style={{ color: 'var(--hc-text-muted)' }}
                  >
                    AUTHORIZED SIGNATURE
                  </span>
                </span>
                <span
                  className="font-mono text-[9px] uppercase tracking-[0.14em] tabular-nums"
                  style={{ color: 'var(--hc-text-muted)' }}
                >
                  SERIAL 0002-EBC658
                </span>
              </div>
            </Reveal>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/**
 * Rotary CASE OPEN stamp — settles into the frame's top-right corner
 * (hc-stamp-settle, the MintCertificate -7° gesture) only once it scrolls
 * into view. Can't be a mount-time CSS animation: below the fold it would
 * finish long before anyone saw it. `pristine` (SSR / no-JS) and reduced
 * motion render it statically visible.
 */
function CornerStamp() {
  const reduced = useReducedMotion();
  const { ref, state } = useInView<HTMLSpanElement>({ threshold: 0.5 });

  const style: CSSProperties = {
    borderColor: 'var(--hc-accent)',
    color: 'var(--hc-accent)',
    background: 'var(--hc-accent-tint)',
    transform: 'rotate(-7deg)',
    ['--hc-poly-r' as string]: 'var(--hc-poly-4, 4px)',
  };
  if (!reduced && state === 'hidden') {
    style.opacity = 0;
  }
  if (!reduced && state === 'revealed') {
    style.animation = 'hc-stamp-settle 280ms cubic-bezier(0.16, 1, 0.3, 1) 560ms both';
  }

  return (
    <span
      ref={ref}
      aria-hidden
      className="hc-poly absolute right-6 top-24 inline-block border-2 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.18em] md:right-10 md:top-28"
      style={style}
    >
      CASE OPEN
    </span>
  );
}
