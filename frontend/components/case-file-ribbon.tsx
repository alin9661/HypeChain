/**
 * Case-File Ribbon — DESIGN.md Move 1.
 *
 * Persistent top status bar on every app surface (NOT marketing).
 * Format: `HC–YYYY–NNNNNN // INTAKE HH:MM:SS EST // EXAMINER: VISION-4O // CHAIN: SOL // ● LIVE`
 *
 * Renders on /marketplace, /collections, /listings/[id], /activities, /settings.
 * Does NOT render on /, /waitlist, /sold.
 *
 * On non-listing pages, pass `caseId={null}` to omit the case number and show
 * only INTAKE + EXAMINER + CHAIN + LIVE.
 */
'use client';

import { useEffect, useState } from 'react';

type CaseFileRibbonProps = {
  /** Listing ID — converted to HC–YYYY–NNNNNN format. Pass null on non-listing pages. */
  caseId: string | null;
  /** ISO timestamp from listing.created_at, or current time on non-listing pages. */
  intake?: string | Date;
  /** AI examiner identifier. Defaults to VISION-4O per DESIGN.md. */
  examiner?: string;
  /** Chain label. Defaults to SOL. */
  chain?: string;
};

function formatCaseNumber(caseId: string): string {
  // Pad to 6 digits if the id is numeric; otherwise take the first 6 alphanumerics.
  const numeric = caseId.replace(/[^0-9]/g, '');
  const padded = numeric.length > 0 ? numeric.padStart(6, '0').slice(-6) : caseId.slice(0, 6).toUpperCase();
  const year = new Date().getFullYear();
  return `HC–2${String(year).slice(1)}–${padded}`;
}

function formatIntake(intake: string | Date | undefined): string {
  const d = intake ? new Date(intake) : new Date();
  // Render in EST as HH:MM:SS — `en-US` with `America/New_York` keeps the format stable.
  return d.toLocaleTimeString('en-US', {
    timeZone: 'America/New_York',
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export function CaseFileRibbon({
  caseId,
  intake,
  examiner = 'VISION-4O',
  chain = 'SOL',
}: CaseFileRibbonProps) {
  const caseLabel = caseId ? formatCaseNumber(caseId) : null;

  // When no `intake` is supplied we fall back to "now", which differs between
  // the SSR render and the client render and breaks hydration. Defer that
  // current-time value to a client-only effect so the server and first client
  // paint agree on a stable placeholder. A supplied `intake` is deterministic
  // (fixed timestamp + explicit timeZone) and renders directly.
  const [clientNow, setClientNow] = useState<string | null>(null);
  useEffect(() => {
    if (intake) return;
    // No `intake` => "now". Set on mount (post-hydration) and tick every second
    // so the ● LIVE clock actually advances instead of freezing at first paint.
    setClientNow(formatIntake(undefined));
    const id = setInterval(() => setClientNow(formatIntake(undefined)), 1000);
    return () => clearInterval(id);
  }, [intake]);
  const intakeLabel = intake ? formatIntake(intake) : clientNow ?? '--:--:--';

  return (
    <div
      role="status"
      aria-label="Case file status"
      className="sticky top-0 z-10 flex h-8 items-center gap-4 overflow-x-auto whitespace-nowrap border-b px-6 font-mono text-[11px] font-medium uppercase tracking-[0.12em] [scrollbar-width:none]"
      style={{
        background: 'var(--hc-surface-1)',
        borderBottomColor: 'var(--hc-hairline)',
        color: 'var(--hc-text-muted)',
      }}
    >
      {caseLabel && (
        <>
          <span>{caseLabel}</span>
          <span style={{ color: 'var(--hc-border)' }}>//</span>
        </>
      )}
      <span>INTAKE {intakeLabel} EST</span>
      <span style={{ color: 'var(--hc-border)' }}>//</span>
      <span>EXAMINER: {examiner}</span>
      <span style={{ color: 'var(--hc-border)' }}>//</span>
      <span>CHAIN: {chain}</span>
      <span style={{ color: 'var(--hc-border)' }}>//</span>
      <span className="inline-flex items-center gap-2" style={{ color: 'var(--hc-text-body)' }}>
        <span
          aria-hidden
          className="inline-block h-2 w-2 rounded-full"
          style={{
            background: 'var(--hc-verify-high)',
            boxShadow: '0 0 8px rgba(0, 229, 160, 0.65)',
            animation: 'hc-live-pulse 1.6s ease-in-out infinite',
          }}
        />
        LIVE
      </span>
    </div>
  );
}
