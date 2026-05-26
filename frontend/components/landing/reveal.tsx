'use client';

import type { CSSProperties, ReactNode } from 'react';
import { useInView } from '@/hooks/useInView';

type RevealProps = {
  children: ReactNode;
  /** Stagger delay in ms, applied via transition-delay. */
  delayMs?: number;
  /** Pixels the element starts translated below its final position. */
  offsetPx?: number;
  /** Override the default IntersectionObserver threshold (default 0.15). */
  threshold?: number;
  className?: string;
};

/**
 * Reveal-on-scroll wrapper. Uses the design system's enter easing
 * (`cubic-bezier(0.16, 1, 0.3, 1)`) and longest spec duration (480ms).
 *
 * SSR-safe: renders children with no inline styles during the `pristine`
 * state (server + first client paint), so no-JS users, crawlers, and
 * above-the-fold content never flash invisible. See `useInView` for the
 * tri-state model.
 */
export function Reveal({
  children,
  delayMs = 0,
  offsetPx = 12,
  threshold,
  className,
}: RevealProps) {
  const { ref, state } = useInView<HTMLDivElement>({ threshold });

  const style: CSSProperties =
    state === 'hidden'
      ? { opacity: 0, transform: `translateY(${offsetPx}px)` }
      : state === 'revealed'
        ? {
            opacity: 1,
            transform: 'translateY(0)',
            transitionProperty: 'opacity, transform',
            transitionDuration: '480ms',
            transitionTimingFunction: 'cubic-bezier(0.16, 1, 0.3, 1)',
            transitionDelay: `${delayMs}ms`,
          }
        : {};

  return (
    <div ref={ref} className={className} style={style}>
      {children}
    </div>
  );
}
