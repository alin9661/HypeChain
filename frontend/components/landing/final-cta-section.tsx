'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Pill } from '@/components/pill';
import { Reveal } from './reveal';
import { FINAL_CTA_COPY } from './landing-section-data';

/**
 * Section 4 — closing CTA band. Reveal-on-scroll, brass CTA + outline pair
 * mirroring the hero. The editorial headline uses Sentient italic per
 * DESIGN.md (Sentient = display/editorial moments only).
 */
export function FinalCtaSection() {
  return (
    <section
      aria-labelledby="landing-final-cta-title"
      className="relative w-full px-6 py-32 md:py-48"
      style={{ background: 'var(--hc-bg)' }}
    >
      <div className="mx-auto max-w-[1280px]">
        <Reveal>
          <div className="flex justify-center">
            <Pill>{FINAL_CTA_COPY.eyebrow}</Pill>
          </div>
        </Reveal>

        <Reveal delayMs={80}>
          <h2
            id="landing-final-cta-title"
            className="mx-auto mt-8 max-w-[820px] text-center font-sentient italic font-extralight leading-[1.05] tracking-[-0.02em] text-white"
            style={{ fontSize: 'clamp(2.5rem, 6vw, 4.5rem)' }}
          >
            {FINAL_CTA_COPY.title}
          </h2>
        </Reveal>

        <Reveal delayMs={160}>
          <p
            className="mx-auto mt-6 max-w-[560px] text-center font-mono text-sm sm:text-base"
            style={{ color: 'var(--hc-text-muted)' }}
          >
            {FINAL_CTA_COPY.body}
          </p>
        </Reveal>

        <Reveal delayMs={240}>
          <div className="mt-12 flex flex-wrap justify-center gap-4">
            <Link href={FINAL_CTA_COPY.primaryHref}>
              <Button>{FINAL_CTA_COPY.primaryLabel}</Button>
            </Link>
            <Link href={FINAL_CTA_COPY.secondaryHref}>
              <Button variant="outline">{FINAL_CTA_COPY.secondaryLabel}</Button>
            </Link>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
