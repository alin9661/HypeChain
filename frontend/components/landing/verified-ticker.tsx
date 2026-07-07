'use client';

import { Fragment } from 'react';
import { TICKER_ENTRIES } from './dossier-data';

type VerifiedTickerProps = {
  /**
   * Loop duration for one half-track pass. Vary per instance (38s/44s/50s)
   * so stacked tickers don't move in lockstep.
   */
  durationSec?: number;
};

/**
 * Verified-mints ticker — the divider strip between landing sections,
 * streaming cleared case files in Bloomberg-crawl vocabulary.
 *
 * The track holds TWO copies of the entry list and translates -50%
 * (`hc-ticker-scroll` in globals.css), so the loop point is seamless.
 * Reduced motion freezes the animation at the CSS level — no JS fork,
 * no hydration risk; the frozen first copy still reads as an on-brand
 * mono strip.
 *
 * Decorative: `aria-hidden`, no focusables — invisible to keyboard and
 * screen-reader users (duplicated content would be read twice).
 */
export function VerifiedTicker({ durationSec = 40 }: VerifiedTickerProps) {
  return (
    <div
      aria-hidden
      className="relative w-full overflow-hidden border-y py-2.5"
      style={{ borderColor: 'var(--hc-hairline)', background: 'var(--hc-bg)' }}
    >
      <div
        className="hc-ticker-track flex w-max items-center whitespace-nowrap"
        style={{ ['--hc-ticker-dur' as string]: `${durationSec}s` }}
      >
        <TickerCopy />
        <TickerCopy />
      </div>
    </div>
  );
}

/** One copy of the full entry list — rendered twice for the -50% loop. */
function TickerCopy() {
  return (
    <div className="flex items-center">
      {TICKER_ENTRIES.map((entry, i) => (
        <Fragment key={i}>
          <TickerEntry entry={entry} />
          <span
            className="mx-6 font-mono text-[10px]"
            style={{ color: 'var(--hc-text-muted)', opacity: 0.5 }}
          >
            +
          </span>
        </Fragment>
      ))}
    </div>
  );
}

function TickerEntry({ entry }: { entry: string }) {
  // Split on ' // ' so the VERIFIED xx.x% token can carry the accent —
  // the one lit element in an otherwise muted crawl.
  const parts = entry.split(' // ');
  return (
    <span className="font-mono text-[10px] uppercase tracking-[0.12em] tabular-nums">
      {parts.map((part, i) => (
        <Fragment key={i}>
          {i > 0 && (
            <span className="mx-2" style={{ color: 'var(--hc-text-muted)', opacity: 0.6 }}>
              {'//'}
            </span>
          )}
          <span
            style={{
              color: part.startsWith('VERIFIED')
                ? 'var(--hc-accent)'
                : part.startsWith('HC-')
                  ? 'var(--hc-text-body)'
                  : 'var(--hc-text-muted)',
            }}
          >
            {part}
          </span>
        </Fragment>
      ))}
    </span>
  );
}
