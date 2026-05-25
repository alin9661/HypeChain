'use client';

import { useEffect, useState } from 'react';
import { Pill } from '@/components/pill';
import { RedactedField } from '@/components/redacted-field';
import { useInView } from '@/hooks/useInView';
import { Reveal } from './reveal';
import { EVIDENCE_MOVES } from './landing-section-data';

/**
 * Section 2 — the three signature Evidence Locker moves.
 *
 * Three reveal-on-scroll cards, each demoing one signature move:
 *   1. Case-File Ribbon — vocabulary reproduced inline. The literal
 *      `<CaseFileRibbon>` is forbidden on `/` per DESIGN.md, so we
 *      borrow the format string and render it as a static strip.
 *   2. Redaction Bars — real `<RedactedField>` instances. A local
 *      `pending` state flips `true → false` when the card enters view,
 *      so the typewriter unredact plays on scroll-in instead of mount.
 *   3. Mint Certificate — static certificate card.
 */
export function EvidenceMovesSection() {
  return (
    <section
      aria-labelledby="landing-moves-title"
      className="relative w-full px-6 py-32 md:py-40"
      style={{ background: 'var(--hc-bg)' }}
    >
      <div className="mx-auto max-w-[1280px]">
        <Reveal>
          <div className="flex justify-center">
            <Pill>EVIDENCE LOCKER</Pill>
          </div>
        </Reveal>

        <Reveal delayMs={80}>
          <h2
            id="landing-moves-title"
            className="mx-auto mt-8 max-w-[820px] text-center font-sentient italic font-extralight leading-[1.05] tracking-[-0.02em] text-white"
            style={{ fontSize: 'clamp(2.25rem, 5vw, 3.75rem)' }}
          >
            Three moves no other marketplace makes.
          </h2>
        </Reveal>

        <div className="mt-20 grid grid-cols-1 gap-6 md:grid-cols-3 md:gap-5">
          {EVIDENCE_MOVES.map((move, i) => (
            <Reveal key={move.id} delayMs={80 * i}>
              <MoveCard move={move} index={i} />
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────────────────────────────────────────────── */

function MoveCard({
  move,
  index,
}: {
  move: (typeof EVIDENCE_MOVES)[number];
  index: number;
}) {
  return (
    <article
      className="relative flex h-full flex-col gap-5 border p-6 hc-poly"
      style={{
        borderColor: 'var(--hc-border)',
        background: 'var(--hc-surface-1)',
        // Force the consistent polychromatic corner radius — set the local
        // CSS variable that components/pill.tsx and others read.
        ['--hc-poly-r' as string]: 'var(--hc-poly-16, 16px)',
      }}
    >
      <header className="flex items-center justify-between">
        <span
          className="font-mono text-[10px] uppercase tracking-[0.14em]"
          style={{ color: 'var(--hc-text-muted)' }}
        >
          {move.eyebrow}
        </span>
        <span
          className="font-mono text-[10px] tabular-nums"
          style={{ color: 'var(--hc-text-muted)' }}
        >
          {String(index + 1).padStart(2, '0')} / 03
        </span>
      </header>

      <h3 className="font-mono text-xl leading-tight text-white">{move.title}</h3>

      <div className="min-h-[88px]">{renderMoveDemo(move.id)}</div>

      <p
        className="mt-auto font-mono text-sm leading-relaxed"
        style={{ color: 'var(--hc-text-body)' }}
      >
        {move.body}
      </p>
    </article>
  );
}

function renderMoveDemo(id: 'ribbon' | 'redaction' | 'certificate') {
  switch (id) {
    case 'ribbon':
      return <RibbonDemo />;
    case 'redaction':
      return <RedactionDemo />;
    case 'certificate':
      return <CertificateDemo />;
  }
}

/* ─────────────────  MOVE 1 — Case-File Ribbon vocabulary  ───────── */

function RibbonDemo() {
  return (
    <div
      className="overflow-x-auto whitespace-nowrap border-y px-3 py-2 font-mono text-[10px] uppercase tracking-[0.12em] [scrollbar-width:none]"
      style={{
        borderColor: 'var(--hc-hairline)',
        background: 'var(--hc-surface-2)',
        color: 'var(--hc-text-muted)',
      }}
    >
      <span style={{ color: 'var(--hc-text-body)' }}>HC-2026-005847</span>
      <span className="mx-2 opacity-60">//</span>
      <span>INTAKE 14:32:08 EST</span>
      <span className="mx-2 opacity-60">//</span>
      <span>EXAMINER: VISION-4O</span>
      <span className="mx-2 opacity-60">//</span>
      <span>CHAIN: SOL</span>
      <span className="mx-2 opacity-60">//</span>
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

/* ─────────────────  MOVE 2 — Redaction Bars w/ unredact  ────────── */

function RedactionDemo() {
  const { ref, state } = useInView<HTMLDivElement>({ threshold: 0.4 });
  const [pending, setPending] = useState(true);

  // Once the card is revealed, hold the redaction for a beat then unredact —
  // gives users time to register "the bars are real" before the typewriter
  // reveal kicks in. RM users get the unredacted value immediately because
  // useInView short-circuits to 'revealed' under reduced motion.
  useEffect(() => {
    if (state !== 'revealed') return;
    const t = setTimeout(() => setPending(false), 450);
    return () => clearTimeout(t);
  }, [state]);

  return (
    <div
      ref={ref}
      className="flex flex-col gap-2 border-l-2 pl-4 font-mono text-sm"
      style={{ borderColor: 'var(--hc-accent)' }}
    >
      <div className="flex items-center justify-between">
        <span style={{ color: 'var(--hc-text-muted)' }}>PRICE</span>
        <RedactedField pending={pending} value="11,250 USDC" widthCh={11} />
      </div>
      <div className="flex items-center justify-between">
        <span style={{ color: 'var(--hc-text-muted)' }}>SELLER</span>
        <RedactedField pending={pending} value="0x7f…3c2a" widthCh={11} />
      </div>
    </div>
  );
}

/* ─────────────────  MOVE 3 — Mint Certificate card  ─────────────── */

function CertificateDemo() {
  return (
    <div
      className="relative flex flex-col gap-2 border p-3 hc-poly"
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
      <div className="font-sentient italic text-lg text-white" style={{ lineHeight: 1.1 }}>
        Yeezy Boost 350 v2
      </div>
      <div
        className="mt-1 flex items-center justify-between font-mono text-[9px] uppercase tracking-[0.12em]"
        style={{ color: 'var(--hc-text-muted)' }}
      >
        <span>EXAMINER VISION-4O</span>
        <span style={{ color: 'var(--hc-accent)' }}>98.4%</span>
      </div>
    </div>
  );
}
