'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Pill } from '@/components/pill';
import { RedactedField } from '@/components/redacted-field';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { useScrollProgress } from '@/hooks/useScrollProgress';
import { Reveal } from './reveal';
import { VERIFY_STEPS, type VerifyStep } from './landing-section-data';
import { stepBlockState, type BlockState } from './dossier-data';

/**
 * Section 1 — How verification works (sticky-pinned cinematic).
 *
 * Renders two render-paths from one component:
 *
 *   • Static flow — the SSR / first-client / reduced-motion / mobile path.
 *     Three step cards stacked in normal flow, each pairing the step copy
 *     with its dossier block in `complete` state. Fully visible without
 *     JS; matches DESIGN.md spacing.
 *
 *   • Cinematic flow — desktop + motion-OK only. A tall track wraps a
 *     viewport-height sticky panel. The left column crossfades the step
 *     copy as `useScrollProgress` advances; the right column is ONE
 *     persistent case-file document (`DossierPanel`) whose three blocks
 *     fill in as steps pass — scrolling reads as progress through a
 *     single dossier, not a card carousel. Scrolling back un-fills
 *     (states derive purely from stepIndex; RedactedField supports the
 *     pending round-trip).
 *
 * The cinematic path is opt-in post-mount only, so the server renders
 * the static path and the first hydration paint matches. Switching is a
 * one-shot decision after mount; no flash, no hydration mismatch.
 */
export function VerifyFlowSection() {
  const reduced = useReducedMotion();
  const [enhanced, setEnhanced] = useState(false);

  useEffect(() => {
    if (reduced) {
      setEnhanced(false);
      return;
    }
    // Match Tailwind's `md:` breakpoint (768px).
    const mq = window.matchMedia('(min-width: 768px)');
    setEnhanced(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setEnhanced(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [reduced]);

  return enhanced ? <CinematicFlow /> : <StaticFlow />;
}

/** Case-file status word shown on the panel header per active step. */
const PANEL_STATUS: readonly string[] = ['OPEN', 'EXAMINING', 'MINTED'];

/* ─────────────────────────  STATIC PATH  ──────────────────────────── */

function StaticFlow() {
  return (
    <section
      aria-labelledby="landing-verify-title"
      className="relative w-full px-6 py-32"
    >
      <div className="mx-auto max-w-[1280px]">
        <Header />
        <ol className="mt-16 grid grid-cols-1 gap-6">
          {VERIFY_STEPS.map((step, i) => (
            <Reveal key={step.id} delayMs={80 * i}>
              <li
                className="hc-poly w-full border p-8 md:p-10"
                style={{
                  borderColor: 'var(--hc-border)',
                  background: 'var(--hc-surface-1)',
                  ['--hc-poly-r' as string]: 'var(--hc-poly-16, 16px)',
                }}
              >
                <div className="flex flex-col gap-6 md:grid md:grid-cols-[2fr_1fr] md:gap-12">
                  <StepCopy step={step} />
                  <div className="flex items-center justify-center">
                    <div className="w-full max-w-[300px]">
                      <DossierBlock index={i} state="complete" sub={0} />
                    </div>
                  </div>
                </div>
              </li>
            </Reveal>
          ))}
        </ol>
      </div>
    </section>
  );
}

/* ────────────────────────  CINEMATIC PATH  ────────────────────────── */

function CinematicFlow() {
  const trackRef = useRef<HTMLElement | null>(null);
  const { stepIndex, sub } = useScrollProgress(trackRef, {
    steps: VERIFY_STEPS.length,
  });

  return (
    <section
      ref={trackRef}
      aria-labelledby="landing-verify-title"
      className="relative w-full"
      style={{
        // Track height = (steps + 1) × viewport. One viewport of dwell per
        // step plus an entry slot before the first step settles.
        minHeight: `${(VERIFY_STEPS.length + 1) * 100}svh`,
      }}
    >
      {/* pt-24 (96px) clears the 84px fixed Navigation that pins above */}
      <div className="sticky top-0 flex h-svh w-full flex-col justify-between px-6 pt-24 pb-16">
        <div className="mx-auto w-full max-w-[1280px]">
          <Header />
          <StepRail stepIndex={stepIndex} sub={sub} />
        </div>

        <div className="mx-auto mt-12 grid w-full max-w-[1280px] flex-1 grid-cols-[3fr_2fr] items-start gap-12">
          {/* Left — crossfading step copy. */}
          <div className="relative h-full">
            {VERIFY_STEPS.map((step, i) => (
              <CinematicStepCopy key={step.id} step={step} active={i === stepIndex} />
            ))}
          </div>

          {/* Right — ONE persistent dossier that fills in as steps pass. */}
          <DossierPanel stepIndex={stepIndex} sub={sub} />
        </div>
      </div>
    </section>
  );
}

function CinematicStepCopy({ step, active }: { step: VerifyStep; active: boolean }) {
  return (
    <div
      aria-hidden={!active}
      className="absolute inset-0"
      style={{
        opacity: active ? 1 : 0,
        transform: active ? 'translateY(0)' : 'translateY(12px)',
        transition:
          'opacity 480ms cubic-bezier(0.16, 1, 0.3, 1), transform 480ms cubic-bezier(0.16, 1, 0.3, 1)',
        pointerEvents: active ? 'auto' : 'none',
      }}
    >
      <StepCopy step={step} />
    </div>
  );
}

/* ─────────────────────────  SHARED CHROME  ────────────────────────── */

function Header() {
  return (
    <>
      <div className="flex justify-center">
        <Pill>HOW VERIFICATION WORKS</Pill>
      </div>
      <h2
        id="landing-verify-title"
        className="mx-auto mt-8 max-w-[920px] text-center font-sentient italic font-extralight leading-[1.04] tracking-[-0.02em] text-white"
        style={{ fontSize: 'clamp(2.5rem, 6vw, 4.5rem)' }}
      >
        Three steps from box to on-chain.
      </h2>
    </>
  );
}

function StepRail({ stepIndex, sub }: { stepIndex: number; sub: number }) {
  // `sub` is 0..1 within the active step. Past steps fill 100%, future 0%.
  // Using global `progress` here would make each segment jump backward at
  // step boundaries (segment N fills to N/(steps-1)% then resets to 0).
  const activeFillPct = Math.max(0, Math.min(100, Math.round(sub * 100)));
  return (
    <div className="mx-auto mt-10 flex max-w-[640px] items-center gap-3">
      {VERIFY_STEPS.map((step, i) => {
        const isActive = i === stepIndex;
        const isPast = i < stepIndex;
        const color = isActive || isPast ? 'var(--hc-accent)' : 'var(--hc-text-muted)';
        return (
          <div key={step.id} className="flex flex-1 items-center gap-3">
            <span
              className="grid h-6 w-6 place-items-center border font-mono text-[10px] tabular-nums hc-poly"
              style={{
                borderColor: color,
                color,
                background: isActive ? 'var(--hc-accent-tint)' : 'transparent',
                ['--hc-poly-r' as string]: 'var(--hc-poly-4, 4px)',
              }}
            >
              {i + 1}
            </span>
            {i < VERIFY_STEPS.length - 1 && (
              <span
                aria-hidden
                className="relative h-px flex-1"
                style={{ background: 'var(--hc-hairline)' }}
              >
                <span
                  className="absolute inset-y-0 left-0"
                  style={{
                    background: 'var(--hc-accent)',
                    width:
                      i < stepIndex
                        ? '100%'
                        : i === stepIndex
                          ? `${activeFillPct}%`
                          : '0%',
                    // No transition on the active segment — width is already
                    // quantized + the user is driving it via scroll, so any
                    // CSS transition trails the scroll position visibly.
                    transition:
                      i < stepIndex ? 'width 280ms ease-out' : 'none',
                  }}
                />
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Step copy column — shared verbatim between static and cinematic. */
function StepCopy({ step }: { step: VerifyStep }) {
  return (
    <div className="flex flex-col gap-4">
      <span
        className="font-mono text-[10px] uppercase tracking-[0.14em]"
        style={{ color: 'var(--hc-text-muted)' }}
      >
        {step.eyebrow}
      </span>
      <h3
        className="font-sentient italic font-extralight leading-[1.1] text-white"
        style={{ fontSize: 'clamp(1.75rem, 3.5vw, 2.5rem)' }}
      >
        {step.title}
      </h3>
      <p
        className="max-w-[560px] font-mono text-sm leading-relaxed sm:text-base"
        style={{ color: 'var(--hc-text-body)' }}
      >
        {step.body}
      </p>
      <span
        className="mt-2 font-mono text-[10px] uppercase tracking-[0.14em]"
        style={{ color: 'var(--hc-text-muted)' }}
      >
        {step.caption}
      </span>
    </div>
  );
}

/* ─────────────────────  THE ACCUMULATING DOSSIER  ─────────────────── */

/**
 * One persistent case-file document. All three blocks always occupy
 * layout — only opacity, border-color, and the sub-progress fill change
 * during scrub, so the panel never reflows while pinned.
 */
function DossierPanel({ stepIndex, sub }: { stepIndex: number; sub: number }) {
  return (
    <div
      className="hc-poly w-full border p-5 md:p-6"
      style={{
        borderColor: 'var(--hc-border)',
        background: 'var(--hc-surface-1)',
        ['--hc-poly-r' as string]: 'var(--hc-poly-16, 16px)',
      }}
    >
      <div
        className="mb-4 flex items-center justify-between border-b pb-3 font-mono text-[10px] uppercase tracking-[0.14em]"
        style={{ borderColor: 'var(--hc-hairline)' }}
      >
        <span style={{ color: 'var(--hc-text-muted)' }}>
          CASE FILE <span style={{ color: 'var(--hc-text-body)' }}>HC-2026-005847</span>
        </span>
        <span style={{ color: 'var(--hc-accent)' }}>
          ● {PANEL_STATUS[stepIndex] ?? PANEL_STATUS[0]}
        </span>
      </div>

      <div className="flex flex-col gap-3">
        {VERIFY_STEPS.map((_, i) => (
          <DossierBlock key={i} index={i} state={stepBlockState(stepIndex, i)} sub={sub} />
        ))}
      </div>
    </div>
  );
}

const BLOCK_LABELS = ['INTAKE', 'EXAMINATION', 'CERTIFICATE'] as const;

/**
 * One dossier block. `state` drives everything:
 *   pending  — dimmed, waiting its turn
 *   active   — full ink, accent left border, sub-progress fill underneath
 *   complete — full ink, muted FILED tag
 */
function DossierBlock({
  index,
  state,
  sub,
}: {
  index: number;
  state: BlockState;
  sub: number;
}) {
  const active = state === 'active';
  return (
    <div
      className="relative border-l-2 py-2.5 pl-4"
      style={{
        opacity: state === 'pending' ? 0.4 : 1,
        borderColor: active ? 'var(--hc-accent)' : 'var(--hc-hairline)',
        transition:
          'opacity 280ms cubic-bezier(0.16, 1, 0.3, 1), border-color 280ms cubic-bezier(0.16, 1, 0.3, 1)',
      }}
    >
      <div
        className="mb-2 flex items-center justify-between font-mono text-[9px] uppercase tracking-[0.14em]"
        style={{ color: 'var(--hc-text-muted)' }}
      >
        <span>{BLOCK_LABELS[index]}</span>
        {state === 'complete' && (
          <span style={{ color: 'var(--hc-text-muted)' }}>● FILED</span>
        )}
        {active && <span style={{ color: 'var(--hc-accent)' }}>● IN PROGRESS</span>}
      </div>

      <BlockContent index={index} state={state} />

      {/* Scrub-driven fill under the active block. No transition — the
          user drives width via scroll; a transition would trail it. */}
      {active && (
        <span
          aria-hidden
          className="absolute bottom-0 left-0 block h-[2px]"
          style={{
            background: 'var(--hc-accent)',
            width: `${Math.max(0, Math.min(100, Math.round(sub * 100)))}%`,
          }}
        />
      )}
    </div>
  );
}

function BlockContent({ index, state }: { index: number; state: BlockState }) {
  if (index === 0) return <IntakeBlock />;
  if (index === 1) return <ExamineBlock state={state} />;
  return <MintBlock state={state} />;
}

function IntakeBlock() {
  return (
    <dl className="grid grid-cols-2 gap-y-1.5 font-mono text-xs">
      <dt style={{ color: 'var(--hc-text-muted)' }}>WEIGHT</dt>
      <dd className="text-right tabular-nums text-white">986g</dd>
      <dt style={{ color: 'var(--hc-text-muted)' }}>PARCEL</dt>
      <dd className="text-right tabular-nums text-white">UPS · 1Z…7K9</dd>
      <dt style={{ color: 'var(--hc-text-muted)' }}>BENCH</dt>
      <dd className="text-right tabular-nums text-white">NYC-04</dd>
    </dl>
  );
}

function ExamineBlock({ state }: { state: BlockState }) {
  // Pending until the examination step activates; RedactedField plays the
  // typewriter unredact on the flip and re-redacts if the user scrolls back.
  const pending = state === 'pending';
  return (
    <div className="flex flex-col gap-1.5 font-mono text-xs">
      <BlockRow label="CONFIDENCE">
        <RedactedField pending={pending} value="98.4%" widthCh={6} />
      </BlockRow>
      <BlockRow label="STITCHING">
        <RedactedField pending={pending} value="MATCH" widthCh={6} />
      </BlockRow>
      <BlockRow label="SERIAL">
        <RedactedField pending={pending} value="GW-2401" widthCh={8} />
      </BlockRow>
    </div>
  );
}

function MintBlock({ state }: { state: BlockState }) {
  const lit = state !== 'pending';
  return (
    <div className="flex items-end justify-between gap-3">
      <div className="min-w-0">
        <div className="font-sentient italic text-lg leading-tight text-white">
          Yeezy Boost 350 v2
        </div>
        <div
          className="mt-1 font-mono text-[9px] uppercase tracking-[0.12em]"
          style={{ color: 'var(--hc-text-muted)' }}
        >
          SOLANA · MAINNET · IPFS PINNED
        </div>
      </div>
      {/* Stamp chip settles when the mint step lights up. */}
      <span
        aria-hidden
        className="hc-poly shrink-0 border px-2 py-1 font-mono text-[9px] uppercase tracking-[0.14em]"
        style={{
          borderColor: lit ? 'var(--hc-accent)' : 'var(--hc-border)',
          color: lit ? 'var(--hc-accent)' : 'var(--hc-text-muted)',
          background: lit ? 'var(--hc-accent-tint)' : 'transparent',
          transform: 'rotate(-7deg)',
          animation: lit
            ? 'hc-stamp-settle 280ms cubic-bezier(0.16, 1, 0.3, 1) both'
            : undefined,
          ['--hc-poly-r' as string]: 'var(--hc-poly-4, 4px)',
        }}
      >
        VERIFIED {'//'} VISION-4O
      </span>
    </div>
  );
}

function BlockRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <span style={{ color: 'var(--hc-text-muted)' }}>{label}</span>
      {children}
    </div>
  );
}
