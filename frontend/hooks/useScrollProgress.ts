'use client';

import { useEffect, useRef, useState } from 'react';
import { clamp01, progressToStep, subProgress } from '@/components/landing/landing-section-data';
import { useReducedMotion } from './useReducedMotion';

type UseScrollProgressOptions = {
  /** Number of discrete steps to quantize progress into. Defaults to 1. */
  steps?: number;
  /**
   * Quantize the progress value to this fraction before committing to React
   * state. ~200 buckets (0.005) is smooth enough for visual scrub while
   * cutting per-frame re-renders by ~150x compared to raw progress.
   */
  quantize?: number;
};

type UseScrollProgressResult = {
  /** 0..1 across the pinned region. Quantized to `quantize`. */
  progress: number;
  /** Discrete step index in [0, steps - 1]. */
  stepIndex: number;
  /** Fractional progress within the current step (0..1). */
  sub: number;
};

const DEFAULT_QUANTIZE = 0.005;

/**
 * Native scroll-progress hook for sticky-pinned cinematic scroll.
 *
 * Math: `progress = clamp01(-rect.top / (rect.height - viewportHeight))`.
 * `rect.top` is 0 when the track top first reaches the top of the viewport
 * (and the inner sticky panel starts pinning), and reaches `-(rect.height
 * - viewportHeight)` exactly when the track's bottom passes the viewport's
 * bottom (and the sticky panel releases). Clamping makes over/under-scroll
 * inert.
 *
 * Performance discipline:
 *   - Listener is `passive: true` so scrolling stays on the compositor.
 *   - Bursts are coalesced via `requestAnimationFrame` — at most one
 *     measurement per animation frame.
 *   - Exactly one `getBoundingClientRect` READ per frame; zero style
 *     WRITES inside the handler (React commits the writes during render).
 *   - The committed `progress` is quantized + compared against a ref;
 *     `setState` only fires when the quantized value actually changes.
 *
 * Reduced-motion: returns a stable `{ progress: 0, stepIndex: 0, sub: 0 }`
 * and attaches no listeners. Consumers should branch on `useReducedMotion`
 * separately and render the full stacked layout — the return value here
 * exists only to keep the call-site shape stable.
 *
 * Cleanup: cancels any pending rAF and removes both `scroll` and `resize`
 * listeners on unmount or dep change.
 */
export function useScrollProgress(
  trackRef: React.RefObject<HTMLElement | null>,
  { steps = 1, quantize = DEFAULT_QUANTIZE }: UseScrollProgressOptions = {},
): UseScrollProgressResult {
  const reduced = useReducedMotion();
  const [progress, setProgress] = useState(0);
  const lastQuantized = useRef(0);

  useEffect(() => {
    if (reduced) return;
    const el = trackRef.current;
    if (!el) return;

    let frame = 0;

    const compute = () => {
      const rect = el.getBoundingClientRect();
      const scrollable = rect.height - window.innerHeight;
      if (scrollable <= 0) {
        // Track is shorter than the viewport — no meaningful scrub. Pin
        // at progress 0 so the first step renders.
        if (lastQuantized.current !== 0) {
          lastQuantized.current = 0;
          setProgress(0);
        }
        return;
      }
      const raw = -rect.top / scrollable;
      const clamped = clamp01(raw);
      // Quantize to ~200 buckets so we re-render at most ~200 times across
      // the entire pinned region, instead of once per scroll event.
      const q = Math.round(clamped / quantize) * quantize;
      if (q !== lastQuantized.current) {
        lastQuantized.current = q;
        setProgress(q);
      }
    };

    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        compute();
      });
    };

    // Sync initial position on mount — covers refresh-mid-scroll.
    compute();

    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });

    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, [reduced, trackRef, quantize]);

  // Pure derivations — no extra renders.
  const stepIndex = progressToStep(progress, steps);
  const sub = subProgress(progress, steps);

  return { progress, stepIndex, sub };
}
