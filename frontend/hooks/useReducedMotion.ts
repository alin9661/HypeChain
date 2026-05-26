'use client';

import { useEffect, useState } from 'react';

/**
 * SSR-safe `prefers-reduced-motion` flag.
 *
 * Single source of truth for the landing-page scroll-story system — both
 * `useScrollProgress` and `useInView` consume this to disable scrub and
 * reveal animation when the OS preference is set. Subscribes to changes
 * so a mid-session toggle is honored without a reload.
 *
 * SSR returns `false` initially (assume motion is OK), then the post-mount
 * effect reads `matchMedia` and corrects. Consumers must keep `false` as
 * the safe SSR default, because hidden states are applied only after the
 * first IntersectionObserver callback — see `useInView` / `<Reveal>`.
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  return reduced;
}
