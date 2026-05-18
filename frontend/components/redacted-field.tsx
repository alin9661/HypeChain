/**
 * Redacted Field — DESIGN.md Move 2.
 *
 * Replaces amber spinners / skeleton loaders / pending placeholders. When AI
 * verification is in progress, renders literal `████` over price, seller
 * wallet, and provenance. On verification cleared, animates a typewriter
 * unredact reveal at ~70ms/char.
 *
 * Usage:
 *   <RedactedField pending={!listing.ai_verified} value={listing.seller_wallet} widthCh={10} />
 *
 * Edge cases:
 *   - Suspicious state: pass `suspicious` to render the block in verify-low red,
 *     with a [REVIEW] link to the verification report (caller wires the href).
 *   - First mount as not-pending: skips the reveal animation, shows value directly.
 *   - Transition pending → not-pending: plays the typewriter reveal.
 */
'use client';

import { useEffect, useRef, useState } from 'react';

type RedactedFieldProps = {
  /** True while AI verification is in progress. */
  pending: boolean;
  /** The value to reveal once verification clears. */
  value: string;
  /** Width in monospace characters — controls the redaction bar width. */
  widthCh: number;
  /** Suspicious-state styling: red block + review affordance. */
  suspicious?: boolean;
  /** Click handler for the [REVIEW] affordance when suspicious. */
  onReview?: () => void;
  /** Milliseconds per character for the unredact reveal. DESIGN.md spec: ~70ms. */
  charIntervalMs?: number;
  className?: string;
};

const DEFAULT_INTERVAL_MS = 70;
const BLOCK_CHAR = '█';

export function RedactedField({
  pending,
  value,
  widthCh,
  suspicious = false,
  onReview,
  charIntervalMs = DEFAULT_INTERVAL_MS,
  className,
}: RedactedFieldProps) {
  // Track whether we've ever been in the pending state. If we mount in
  // not-pending, we just show the value directly — no fake reveal animation.
  const wasPendingRef = useRef(pending);
  const [revealedChars, setRevealedChars] = useState(pending ? 0 : value.length);
  const [isRevealing, setIsRevealing] = useState(false);

  useEffect(() => {
    if (pending) {
      wasPendingRef.current = true;
      setRevealedChars(0);
      setIsRevealing(false);
      return;
    }
    if (!wasPendingRef.current) {
      // Never was pending — show the value with no animation.
      setRevealedChars(value.length);
      return;
    }
    // pending → not-pending transition: play the typewriter reveal.
    setIsRevealing(true);
    setRevealedChars(0);
    let i = 0;
    const tick = () => {
      i += 1;
      setRevealedChars(i);
      if (i < value.length) {
        timer = setTimeout(tick, charIntervalMs);
      } else {
        timer = setTimeout(() => setIsRevealing(false), 400);
      }
    };
    let timer = setTimeout(tick, charIntervalMs);
    return () => clearTimeout(timer);
  }, [pending, value, charIntervalMs]);

  if (pending) {
    return (
      <span
        aria-label={suspicious ? 'Field flagged for review' : 'Pending verification'}
        className={className}
        style={{
          display: 'inline-block',
          color: suspicious ? 'var(--hc-verify-low)' : 'var(--hc-text-muted)',
          letterSpacing: '-0.05em',
          userSelect: 'none',
        }}
      >
        {BLOCK_CHAR.repeat(widthCh)}
        {suspicious && onReview && (
          <button
            type="button"
            onClick={onReview}
            className="ml-2 font-mono text-[10px] uppercase tracking-[0.14em] underline-offset-2"
            style={{ color: 'var(--hc-verify-low)' }}
          >
            [REVIEW]
          </button>
        )}
      </span>
    );
  }

  return (
    <span
      className={className}
      style={{ display: 'inline-block', color: 'var(--hc-text)' }}
    >
      {value.slice(0, revealedChars)}
      {isRevealing && revealedChars < value.length && (
        <span
          aria-hidden
          style={{
            display: 'inline-block',
            width: '7px',
            height: '1em',
            background: 'var(--hc-accent)',
            verticalAlign: 'text-bottom',
            marginLeft: '2px',
            animation: 'hc-caret-blink 0.7s steps(1, end) infinite',
          }}
        />
      )}
    </span>
  );
}
