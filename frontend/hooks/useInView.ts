'use client';

import { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from './useReducedMotion';

type RevealState = 'pristine' | 'hidden' | 'revealed';

type UseInViewOptions = {
  /** Fraction of the element that must intersect to reveal. Default 0.15. */
  threshold?: number;
  /** rootMargin string — defaults to firing slightly before fully on-screen. */
  rootMargin?: string;
};

const DEFAULT_THRESHOLD = 0.15;
const DEFAULT_ROOT_MARGIN = '0px 0px -10% 0px';

/**
 * One-shot IntersectionObserver reveal with a SSR-safe tri-state model.
 *
 * Why tri-state: a naive boolean (`opacity-0` → `opacity-1`) would render
 * the hidden state during SSR/hydration, causing above-the-fold content to
 * flash invisible. Instead:
 *
 *   - `pristine`  — server + first client render. No hide style applied.
 *   - `hidden`    — first IO callback reports "not intersecting". Element
 *                   jumps invisible (off-screen, user doesn't see) and will
 *                   fade in when scrolled to.
 *   - `revealed`  — IO reports intersecting. Element fades to full opacity;
 *                   observer disconnects (one-shot — never re-hides).
 *
 * Reduced-motion: skips the observer entirely, jumps straight to `revealed`.
 */
export function useInView<T extends HTMLElement = HTMLElement>(
  options: UseInViewOptions = {},
): { ref: React.RefObject<T | null>; state: RevealState } {
  const reduced = useReducedMotion();
  const ref = useRef<T | null>(null);
  const [state, setState] = useState<RevealState>('pristine');

  const { threshold = DEFAULT_THRESHOLD, rootMargin = DEFAULT_ROOT_MARGIN } = options;

  useEffect(() => {
    if (reduced) {
      setState('revealed');
      return;
    }
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setState('revealed');
          observer.disconnect();
        } else {
          // First-time-not-intersecting: enter hidden state so the next
          // intersection fades in. Only promote from `pristine` so we
          // never clobber a later `revealed`.
          setState((prev) => (prev === 'pristine' ? 'hidden' : prev));
        }
      },
      { threshold, rootMargin },
    );
    observer.observe(el);

    return () => observer.disconnect();
  }, [reduced, threshold, rootMargin]);

  return { ref, state };
}
