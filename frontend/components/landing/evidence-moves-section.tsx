'use client';

import { useEffect, useState } from 'react';
import { Pill } from '@/components/pill';
import { RedactedField } from '@/components/redacted-field';
import { useInView } from '@/hooks/useInView';
import { Reveal } from './reveal';
import { EVIDENCE_MOVES, type EvidenceMove } from './landing-section-data';

/**
 * Section 2 — the three signature Evidence Locker moves, laid out as
 * full-width EXHIBIT rows (A/B/C) like tabbed exhibits in a case file.
 *
 * Each row: a hairline top rule broken by the EXHIBIT tag, then demo
 * panel and copy in an alternating 3fr/2fr split. The demos are live:
 *   A. Case-File Ribbon — vocabulary reproduced inline. The literal
 *      `<CaseFileRibbon>` is forbidden on `/` per DESIGN.md, so we
 *      borrow the format string and render it as a static strip.
 *   B. Redaction Bars — real `<RedactedField>` instances. `pending`
 *      flips true → false when the row enters view, and a [RE-RUN]
 *      control replays the typewriter unredact on demand.
 *   C. Mint Certificate — specimen certificate card.
 *
 * The section background is transparent — the DossierShell chart paper
 * reads through between rows.
 */
export function EvidenceMovesSection() {
  return (
    <section
      aria-labelledby="landing-moves-title"
      className="relative w-full px-6 py-32 md:py-40"
    >
      <div className="mx-auto max-w-[1280px]">
        <Reveal>
          <div className="flex items-end justify-between gap-6">
            <div>
              <Pill>EVIDENCE LOCKER</Pill>
              <h2
                id="landing-moves-title"
                className="mt-8 max-w-[820px] font-sentient italic font-extralight leading-[1.05] tracking-[-0.02em] text-white"
                style={{ fontSize: 'clamp(2.25rem, 5vw, 3.75rem)' }}
              >
                Three moves no other marketplace makes.
              </h2>
            </div>
            <span
              aria-hidden
              className="hidden shrink-0 pb-2 font-mono text-[10px] uppercase tracking-[0.14em] tabular-nums sm:inline"
              style={{ color: 'var(--hc-text-muted)' }}
            >
              EXHIBITS A–C // 3 ENCLOSED
            </span>
          </div>
        </Reveal>

        <div className="mt-16 flex flex-col gap-16 md:mt-20 md:gap-20">
          {EVIDENCE_MOVES.map((move, i) => (
            <ExhibitRow key={move.id} move={move} index={i} />
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────  EXHIBIT ROW  ──────────────────────────── */

function ExhibitRow({ move, index }: { move: EvidenceMove; index: number }) {
  const demoRight = index % 2 === 1;
  return (
    <Reveal>
      <article aria-label={`Exhibit ${move.exhibit} — ${move.title}`}>
        {/* Top rule broken by the exhibit tag. */}
        <div className="flex items-center gap-4">
          <span
            className="hc-poly shrink-0 border px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.14em]"
            style={{
              borderColor: 'var(--hc-accent)',
              color: 'var(--hc-accent)',
              background: 'var(--hc-accent-tint)',
              ['--hc-poly-r' as string]: 'var(--hc-poly-4, 4px)',
            }}
          >
            EXHIBIT {move.exhibit} {'//'} {move.eyebrow.split(' // ')[1]}
          </span>
          <span aria-hidden className="h-px flex-1" style={{ background: 'var(--hc-hairline)' }} />
          <span
            className="shrink-0 font-mono text-[10px] tabular-nums"
            style={{ color: 'var(--hc-text-muted)' }}
          >
            {String(index + 1).padStart(2, '0')} / 03
          </span>
        </div>

        <div className="mt-8 grid grid-cols-1 items-center gap-8 md:grid-cols-[3fr_2fr] md:gap-12">
          {/* Demo panel — order alternates per row on md+. */}
          <Reveal
            delayMs={160}
            className={demoRight ? 'md:order-2' : undefined}
          >
            <div
              className="hc-poly flex min-h-[220px] flex-col justify-center gap-4 border p-6 md:p-8"
              style={{
                borderColor: 'var(--hc-border)',
                background: 'var(--hc-surface-1)',
                ['--hc-poly-r' as string]: 'var(--hc-poly-16, 16px)',
              }}
            >
              {renderExhibitDemo(move.id)}
              <span
                className="font-mono text-[9px] uppercase tracking-[0.14em]"
                style={{ color: 'var(--hc-text-muted)' }}
              >
                {move.demoCaption}
              </span>
            </div>
          </Reveal>

          {/* Copy column. */}
          <div className={demoRight ? 'md:order-1' : undefined}>
            <span
              className="font-mono text-[10px] uppercase tracking-[0.14em]"
              style={{ color: 'var(--hc-text-muted)' }}
            >
              {move.eyebrow}
            </span>
            <h3 className="mt-3 font-mono text-2xl leading-tight text-white">{move.title}</h3>
            <p
              className="mt-4 max-w-[480px] font-mono text-sm leading-relaxed sm:text-base"
              style={{ color: 'var(--hc-text-body)' }}
            >
              {move.body}
            </p>
          </div>
        </div>
      </article>
    </Reveal>
  );
}

function renderExhibitDemo(id: EvidenceMove['id']) {
  switch (id) {
    case 'ribbon':
      return <RibbonDemo />;
    case 'redaction':
      return <RedactionDemo />;
    case 'certificate':
      return <CertificateDemo />;
  }
}

/* ─────────────  EXHIBIT A — Case-File Ribbon vocabulary  ──────────── */

function RibbonDemo() {
  return (
    <div
      className="overflow-x-auto whitespace-nowrap border-y px-4 py-3 font-mono text-[11px] uppercase tracking-[0.12em] [scrollbar-width:none]"
      style={{
        borderColor: 'var(--hc-hairline)',
        background: 'var(--hc-surface-2)',
        color: 'var(--hc-text-muted)',
      }}
    >
      <span style={{ color: 'var(--hc-text-body)' }}>HC-2026-005847</span>
      <span className="mx-2 opacity-60">{'//'}</span>
      <span>INTAKE 14:32:08 EST</span>
      <span className="mx-2 opacity-60">{'//'}</span>
      <span>EXAMINER: VISION-4O</span>
      <span className="mx-2 opacity-60">{'//'}</span>
      <span>CHAIN: SOL</span>
      <span className="mx-2 opacity-60">{'//'}</span>
      <span
        aria-hidden
        className="inline-block h-1.5 w-1.5 rounded-full align-middle"
        style={{
          background: 'var(--hc-verify-high)',
          boxShadow: '0 0 6px var(--hc-verify-high)',
          animation: 'hc-live-pulse 1.6s ease-in-out infinite',
        }}
      />
      <span className="ml-1.5" style={{ color: 'var(--hc-verify-high)' }}>
        LIVE
      </span>
    </div>
  );
}

/* ─────────────  EXHIBIT B — Redaction bars w/ RE-RUN  ─────────────── */

function RedactionDemo() {
  const { ref, state } = useInView<HTMLDivElement>({ threshold: 0.4 });
  const [pending, setPending] = useState(true);
  // Bumped by [RE-RUN]; remounting the fields replays the typewriter pass.
  const [runNonce, setRunNonce] = useState(0);

  // Once the row is revealed, hold the redaction for a beat then unredact —
  // gives users time to register "the bars are real" before the typewriter
  // reveal kicks in. RM users get the unredacted value immediately because
  // useInView short-circuits to 'revealed' under reduced motion.
  useEffect(() => {
    if (state !== 'revealed') return;
    const t = setTimeout(() => setPending(false), 450);
    return () => clearTimeout(t);
  }, [state, runNonce]);

  const rerun = () => {
    setPending(true);
    setRunNonce((n) => n + 1);
  };

  return (
    <div ref={ref} className="flex flex-col gap-3">
      <div
        className="flex flex-col gap-2.5 border-l-2 pl-4 font-mono text-sm"
        style={{ borderColor: 'var(--hc-accent)' }}
      >
        <div className="flex items-center justify-between" key={`price-${runNonce}`}>
          <span style={{ color: 'var(--hc-text-muted)' }}>PRICE</span>
          <RedactedField pending={pending} value="11,250 USDC" widthCh={11} />
        </div>
        <div className="flex items-center justify-between" key={`seller-${runNonce}`}>
          <span style={{ color: 'var(--hc-text-muted)' }}>SELLER</span>
          <RedactedField pending={pending} value="0x7f…3c2a" widthCh={11} />
        </div>
        <div className="flex items-center justify-between" key={`prov-${runNonce}`}>
          <span style={{ color: 'var(--hc-text-muted)' }}>PROVENANCE</span>
          <RedactedField pending={pending} value="IPFS QM…9F2" widthCh={11} />
        </div>
      </div>
      <button
        type="button"
        onClick={rerun}
        className="hc-poly self-start border px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.14em] transition-colors duration-[180ms] hover:text-black focus-visible:text-black"
        style={{
          borderColor: 'var(--hc-border)',
          color: 'var(--hc-text-muted)',
          ['--hc-poly-r' as string]: 'var(--hc-poly-4, 4px)',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = 'var(--hc-accent)';
          e.currentTarget.style.borderColor = 'var(--hc-accent)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'transparent';
          e.currentTarget.style.borderColor = 'var(--hc-border)';
        }}
        onFocus={(e) => {
          e.currentTarget.style.background = 'var(--hc-accent)';
          e.currentTarget.style.borderColor = 'var(--hc-accent)';
        }}
        onBlur={(e) => {
          e.currentTarget.style.background = 'transparent';
          e.currentTarget.style.borderColor = 'var(--hc-border)';
        }}
      >
        [RE-RUN CLEARANCE]
      </button>
    </div>
  );
}

/* ─────────────  EXHIBIT C — Mint certificate specimen  ────────────── */

function CertificateDemo() {
  return (
    <div
      className="hc-poly relative mx-auto flex w-full max-w-[380px] flex-col gap-2.5 border p-5"
      style={{
        borderColor: 'var(--hc-accent)',
        background: 'var(--hc-surface-2)',
        ['--hc-poly-r' as string]: 'var(--hc-poly-6, 6px)',
      }}
    >
      <div className="flex items-center justify-between">
        <span
          className="font-mono text-[9px] uppercase tracking-[0.14em]"
          style={{ color: 'var(--hc-text-muted)' }}
        >
          CERTIFICATE OF AUTHENTICITY
        </span>
        <span
          className="font-mono text-[9px] uppercase tracking-[0.14em]"
          style={{ color: 'var(--hc-verify-high)' }}
        >
          ● MINTED
        </span>
      </div>
      <div
        className="font-mono text-xs tabular-nums"
        style={{ color: 'var(--hc-text-body)' }}
      >
        HC-2026-005847
      </div>
      <div className="font-sentient italic text-xl text-white" style={{ lineHeight: 1.1 }}>
        Yeezy Boost 350 v2
      </div>
      <div
        className="mt-1 flex items-center justify-between font-mono text-[9px] uppercase tracking-[0.12em]"
        style={{ color: 'var(--hc-text-muted)' }}
      >
        <span>EXAMINER VISION-4O</span>
        <span style={{ color: 'var(--hc-accent)' }}>98.4%</span>
      </div>
      <div
        className="mt-2 flex items-center justify-between border-t pt-2 font-mono text-[9px] uppercase tracking-[0.12em]"
        style={{ borderColor: 'var(--hc-hairline)', color: 'var(--hc-text-muted)' }}
      >
        <span>SERIAL 0001-EBC658</span>
        <span>SOLANA · MAINNET</span>
      </div>
    </div>
  );
}
