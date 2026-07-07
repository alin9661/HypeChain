'use client';

import { useEffect, useRef, useState } from 'react';
import { useInView } from '@/hooks/useInView';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { countUpValue } from './dossier-data';

type AnimatedNumberProps = {
  value: number;
  /** Formats the interpolated value for display (e.g. toLocaleString). */
  format: (n: number) => string;
  durationMs?: number;
  className?: string;
};

/**
 * Terminal-panel count-up. Renders the FINAL formatted value on the server
 * and on first client paint (no hydration mismatch, correct for no-JS and
 * reduced-motion users), then — motion permitting — snaps to 0 and counts
 * up with `countUpValue`'s ease-out once the element scrolls into view.
 *
 * Layout-shift guard: the span reserves the final value's width in `ch`
 * (tabular-nums makes every digit 1ch), so the count never reflows its
 * neighbors. This is the page's only text-mutating animation — one pass,
 * ≤ durationMs, small damage region.
 */
export function AnimatedNumber({
  value,
  format,
  durationMs = 800,
  className,
}: AnimatedNumberProps) {
  const reduced = useReducedMotion();
  const { ref, state } = useInView<HTMLSpanElement>({ threshold: 0.5 });
  const [display, setDisplay] = useState(() => format(value));
  const played = useRef(false);

  useEffect(() => {
    if (reduced || state !== 'revealed' || played.current) return;
    played.current = true;

    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = (now - start) / durationMs;
      setDisplay(format(countUpValue(value, t)));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
    // `format` is intentionally not a dep — callers pass inline lambdas;
    // the animation is one-shot and re-arming on identity churn would
    // restart it mid-flight.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduced, state, value, durationMs]);

  return (
    <span
      ref={ref}
      className={`inline-block text-right tabular-nums ${className ?? ''}`}
      style={{ minWidth: `${format(value).length}ch` }}
    >
      {display}
    </span>
  );
}
