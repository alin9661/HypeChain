'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { DOSSIER_SECTIONS, railParallax, wrapOffset } from './dossier-data';
import { MarginaliaRail } from './marginalia-rail';

/** Coarse grid period — must match .hc-dossier-grid's 120px tier. */
const GRID_COARSE_PERIOD = 120;
/** Grid drifts at 6% of scroll speed — chart paper, not a parallax ride. */
const GRID_DRIFT_SPEED = 0.06;
/** Rail parallax: 2% of scroll, clamped to ±24px. */
const RAIL_PARALLAX_FACTOR = 0.02;
const RAIL_PARALLAX_MAX = 24;

/**
 * Dossier chassis — wraps everything below the hero in the "case file on
 * chart paper" ambient layer: drifting hairline grid, scoped scanline
 * grain, and the marginalia rails.
 *
 * Layering rules (load-bearing — see the transform note below):
 *
 *   z-0   .hc-dossier-grid   absolute, oversized by one coarse period,
 *                            drifted via rAF transform
 *   z-[5] marginalia rails   sticky inner blocks, parallax via the same rAF
 *   z-10  {children}         the sections + tickers
 *   z-20  scanline grain     ::before overlay, pointer-events-none
 *
 * The OUTER wrapper is never transformed. A transform on an ancestor turns
 * it into the containing block for fixed/sticky descendants — it would
 * break the verify-flow sticky pin and the rails. All rAF writes target
 * the dedicated decoration refs only, bypassing React state entirely (the
 * page re-renders zero times per scroll frame for the ambient layer).
 *
 * Section tracking: children mark themselves with `data-dossier-sec` ids
 * (see app/page.tsx); one IntersectionObserver with a viewport-midline
 * band (`rootMargin: -45% 0px -45%`) decides which section is active for
 * the rails. Initial index is 0 on the server and first client paint, so
 * there is no hydration mismatch.
 *
 * Reduced motion / <768px: no scroll listener at all — grid and rails
 * render static. The chart paper itself is pure CSS and SSR-safe.
 */
export function DossierShell({ children }: { children: ReactNode }) {
  const reduced = useReducedMotion();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const gridRef = useRef<HTMLDivElement | null>(null);
  const leftRailRef = useRef<HTMLDivElement | null>(null);
  const rightRailRef = useRef<HTMLDivElement | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  /* Ambient drift — one passive listener, rAF-coalesced, ref-writes only
     (same discipline as hooks/useScrollProgress.ts). */
  useEffect(() => {
    if (reduced) return;
    const grid = gridRef.current;
    if (!grid) return;

    const mq = window.matchMedia('(min-width: 768px)');
    let frame = 0;

    const write = () => {
      const y = window.scrollY;
      grid.style.transform = `translate3d(0, ${wrapOffset(y, GRID_DRIFT_SPEED, GRID_COARSE_PERIOD)}px, 0)`;
      const p = railParallax(y, RAIL_PARALLAX_FACTOR, RAIL_PARALLAX_MAX);
      // Rails counter-drift for a hint of depth; hidden below 1440px, where
      // the writes are harmless no-ops on display:none elements.
      if (leftRailRef.current) {
        leftRailRef.current.style.transform = `translate3d(0, ${p}px, 0)`;
      }
      if (rightRailRef.current) {
        rightRailRef.current.style.transform = `translate3d(0, ${-p}px, 0)`;
      }
    };

    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        write();
      });
    };

    const attach = () => {
      write();
      window.addEventListener('scroll', onScroll, { passive: true });
    };
    const detach = () => {
      if (frame) {
        cancelAnimationFrame(frame);
        frame = 0;
      }
      window.removeEventListener('scroll', onScroll);
      grid.style.transform = '';
      if (leftRailRef.current) leftRailRef.current.style.transform = '';
      if (rightRailRef.current) rightRailRef.current.style.transform = '';
    };

    if (mq.matches) attach();
    const onMqChange = (e: MediaQueryListEvent) => (e.matches ? attach() : detach());
    mq.addEventListener('change', onMqChange);

    return () => {
      mq.removeEventListener('change', onMqChange);
      detach();
    };
  }, [reduced]);

  /* Active-section tracking for the rails — midline straddle. */
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const marked = Array.from(root.querySelectorAll<HTMLElement>('[data-dossier-sec]'));
    if (marked.length === 0) return;

    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const id = (entry.target as HTMLElement).dataset.dossierSec;
          const idx = DOSSIER_SECTIONS.findIndex((s) => s.id === id);
          if (idx >= 0) setActiveIndex(idx);
        }
      },
      // A ±5%-tall band around the viewport midline: exactly one section
      // intersects it at a time, so the last isIntersecting entry wins.
      { rootMargin: '-45% 0px -45% 0px', threshold: 0 },
    );
    marked.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  return (
    <div ref={rootRef} className="relative">
      {/* Chart paper — oversized by one coarse period each way so the
          wrapped drift never exposes an edge. */}
      <div
        aria-hidden
        ref={gridRef}
        className="hc-dossier-grid pointer-events-none absolute inset-x-0 z-0"
        style={{
          top: -GRID_COARSE_PERIOD,
          height: `calc(100% + ${GRID_COARSE_PERIOD * 2}px)`,
          willChange: 'transform',
        }}
      />

      <MarginaliaRail side="left" activeIndex={activeIndex} innerRef={leftRailRef} />
      <MarginaliaRail side="right" activeIndex={activeIndex} innerRef={rightRailRef} />

      <div className="relative z-10">{children}</div>

      {/* Scanline grain above everything (z-20 > content z-10) — the
          Evidence Locker mood layer. ::before carries the texture. */}
      <div aria-hidden className="hc-scanlines-local pointer-events-none absolute inset-0 z-20" />
    </div>
  );
}
