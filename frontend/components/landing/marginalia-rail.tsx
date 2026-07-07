'use client';

import type { RefObject } from 'react';
import { DOSSIER_SECTIONS } from './dossier-data';

type MarginaliaRailProps = {
  side: 'left' | 'right';
  /** Index into DOSSIER_SECTIONS of the section straddling the viewport. */
  activeIndex: number;
  /**
   * Ref to the sticky inner block — DossierShell's shared rAF writes the
   * parallax transform here directly (never on the outer rail, which must
   * stay untransformed so `sticky` keeps its containing block).
   */
  innerRef: RefObject<HTMLDivElement | null>;
};

/**
 * Case-file marginalia rail — the mono micro-labels living in the page
 * margins beside the dossier. Left rail lists all four section labels
 * (active one lit in accent); right rail shows the active section's
 * plate coordinate + filed stamp.
 *
 * Entirely decorative: `aria-hidden`, `pointer-events-none`, and hidden
 * below 1440px — at 1280–1439px viewports the 1280px content column
 * leaves too little margin for a 48px rail.
 */
export function MarginaliaRail({ side, activeIndex, innerRef }: MarginaliaRailProps) {
  return (
    <div
      aria-hidden
      className={`pointer-events-none absolute inset-y-0 z-[5] hidden w-12 min-[1440px]:block ${
        side === 'left' ? 'left-0' : 'right-0'
      }`}
    >
      <div
        ref={innerRef}
        className="sticky top-24 flex h-[calc(100svh-8rem)] flex-col items-center justify-between py-8"
        style={{ willChange: 'transform' }}
      >
        <RegistrationMark />
        {side === 'left' ? <SectionIndex activeIndex={activeIndex} /> : <ActivePlate activeIndex={activeIndex} />}
        <RegistrationMark />
      </div>
    </div>
  );
}

/** Blueprint registration cross — anchors the rail top and bottom. */
function RegistrationMark() {
  return (
    <span
      className="font-mono text-[10px] leading-none"
      style={{ color: 'var(--hc-text-muted)', opacity: 0.6 }}
    >
      +
    </span>
  );
}

function SectionIndex({ activeIndex }: { activeIndex: number }) {
  return (
    <div className="flex flex-col items-center gap-8" style={{ writingMode: 'vertical-rl' }}>
      {DOSSIER_SECTIONS.map((s, i) => {
        const active = i === activeIndex;
        return (
          <span
            key={s.id}
            className="font-mono text-[10px] uppercase tracking-[0.14em] whitespace-nowrap"
            style={{
              color: active ? 'var(--hc-accent)' : 'var(--hc-text-muted)',
              opacity: active ? 1 : 0.55,
              transition: 'color 180ms ease-out, opacity 180ms ease-out',
            }}
          >
            {s.railLabel}
          </span>
        );
      })}
    </div>
  );
}

function ActivePlate({ activeIndex }: { activeIndex: number }) {
  const meta = DOSSIER_SECTIONS[activeIndex] ?? DOSSIER_SECTIONS[0];
  return (
    // Keyed on the section id so the 180ms swap animation replays when the
    // active section changes (CSS drops it under reduced motion).
    <div
      key={meta.id}
      className="hc-rail-swap-anim flex flex-col items-center gap-8"
      style={{ writingMode: 'vertical-rl' }}
    >
      <span
        className="font-mono text-[10px] uppercase tracking-[0.14em] tabular-nums whitespace-nowrap"
        style={{ color: 'var(--hc-text-muted)' }}
      >
        {meta.plate}
      </span>
      <span
        className="font-mono text-[10px] uppercase tracking-[0.14em] tabular-nums whitespace-nowrap"
        style={{ color: 'var(--hc-text-muted)', opacity: 0.7 }}
      >
        {meta.stamp}
      </span>
    </div>
  );
}
