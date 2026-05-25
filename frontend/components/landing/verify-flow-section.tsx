'use client';

import { useEffect, useRef, useState } from 'react';
import { Pill } from '@/components/pill';
import { RedactedField } from '@/components/redacted-field';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { useScrollProgress } from '@/hooks/useScrollProgress';
import { Reveal } from './reveal';
import { VERIFY_STEPS, type VerifyStep } from './landing-section-data';

/**
 * Section 1 — How verification works (sticky-pinned cinematic).
 *
 * Renders two render-paths from one component:
 *
 *   • Static flow — the SSR / first-client / reduced-motion / mobile path.
 *     Three step cards stacked in normal flow, each with its own Reveal.
 *     Fully visible without JS; matches DESIGN.md spacing.
 *
 *   • Cinematic flow — desktop + motion-OK only. A tall track wraps a
 *     viewport-height sticky panel; `useScrollProgress` advances a step
 *     index as the user scrolls, and the active step crossfades into
 *     view. Step 2 mounts a `<RedactedField>` to dramatize the
 *     "examination clearing" beat — the typewriter reveal fires as step
 *     2 becomes active.
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

/* ─────────────────────────  STATIC PATH  ──────────────────────────── */

function StaticFlow() {
  return (
    <section
      aria-labelledby="landing-verify-title"
      className="relative w-full px-6 py-32"
      style={{ background: 'var(--hc-bg)' }}
    >
      <div className="mx-auto max-w-[1280px]">
        <Header />
        <ol className="mt-16 grid grid-cols-1 gap-6">
          {VERIFY_STEPS.map((step, i) => (
            <Reveal key={step.id} delayMs={80 * i}>
              <StepCard step={step} index={i} active />
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
  const { progress, stepIndex } = useScrollProgress(trackRef, {
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
        background: 'var(--hc-bg)',
      }}
    >
      {/* pt-24 (96px) clears the 84px fixed Navigation that pins above */}
      <div className="sticky top-0 flex h-svh w-full flex-col justify-between px-6 pt-24 pb-16">
        <div className="mx-auto w-full max-w-[1280px]">
          <Header />
          <StepRail stepIndex={stepIndex} progress={progress} />
        </div>

        <div className="mx-auto w-full max-w-[1280px] flex-1 relative mt-12">
          {VERIFY_STEPS.map((step, i) => (
            <CinematicStep key={step.id} step={step} index={i} active={i === stepIndex} />
          ))}
        </div>
      </div>
    </section>
  );
}

function CinematicStep({
  step,
  index,
  active,
}: {
  step: VerifyStep;
  index: number;
  active: boolean;
}) {
  return (
    <div
      aria-hidden={!active}
      className="absolute inset-0 flex items-start"
      style={{
        opacity: active ? 1 : 0,
        transform: active ? 'translateY(0)' : 'translateY(12px)',
        transition:
          'opacity 480ms cubic-bezier(0.16, 1, 0.3, 1), transform 480ms cubic-bezier(0.16, 1, 0.3, 1)',
        pointerEvents: active ? 'auto' : 'none',
      }}
    >
      <StepCard step={step} index={index} active={active} />
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

function StepRail({ stepIndex, progress }: { stepIndex: number; progress: number }) {
  const fillPct = Math.max(0, Math.min(100, progress * 100));
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
                ['--poly-roundness' as string]: 'var(--hc-poly-4, 4px)',
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
                          ? `${fillPct}%`
                          : '0%',
                    transition: 'width 280ms ease-out',
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

/* ─────────────────────────  STEP CARD  ────────────────────────────── */

function StepCard({
  step,
  index,
  active,
}: {
  step: VerifyStep;
  index: number;
  active: boolean;
}) {
  return (
    <article
      className="w-full border p-8 md:p-10 hc-poly"
      style={{
        borderColor: 'var(--hc-border)',
        background: 'var(--hc-surface-1)',
        ['--poly-roundness' as string]: 'var(--hc-poly-16, 16px)',
      }}
    >
      <div className="flex flex-col gap-6 md:grid md:grid-cols-[2fr_1fr] md:gap-12">
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

        <div className="flex items-center justify-center">
          <StepArtifact step={step} index={index} active={active} />
        </div>
      </div>
    </article>
  );
}

/* ─────────  Per-step right-rail artifact (evidence flavor)  ──────── */

function StepArtifact({
  step,
  index,
  active,
}: {
  step: VerifyStep;
  index: number;
  active: boolean;
}) {
  if (step.id === 'intake') {
    return <IntakeArtifact />;
  }
  if (step.id === 'examine') {
    return <ExamineArtifact active={active} />;
  }
  return <MintArtifact />;
}

function IntakeArtifact() {
  return (
    <div
      className="w-full max-w-[280px] border p-4 font-mono text-xs hc-poly"
      style={{
        borderColor: 'var(--hc-border)',
        background: 'var(--hc-surface-2)',
        ['--poly-roundness' as string]: 'var(--hc-poly-6, 6px)',
      }}
    >
      <div
        className="mb-3 flex items-center justify-between text-[10px] uppercase tracking-[0.14em]"
        style={{ color: 'var(--hc-text-muted)' }}
      >
        <span>INTAKE FORM</span>
        <span style={{ color: 'var(--hc-verify-high)' }}>● OPEN</span>
      </div>
      <dl className="grid grid-cols-2 gap-y-2">
        <dt style={{ color: 'var(--hc-text-muted)' }}>CASE ID</dt>
        <dd className="text-right tabular-nums text-white">HC-2026-005847</dd>
        <dt style={{ color: 'var(--hc-text-muted)' }}>WEIGHT</dt>
        <dd className="text-right tabular-nums text-white">986g</dd>
        <dt style={{ color: 'var(--hc-text-muted)' }}>PARCEL</dt>
        <dd className="text-right tabular-nums text-white">UPS · 1Z…7K9</dd>
        <dt style={{ color: 'var(--hc-text-muted)' }}>BENCH</dt>
        <dd className="text-right tabular-nums text-white">NYC-04</dd>
      </dl>
    </div>
  );
}

function ExamineArtifact({ active }: { active: boolean }) {
  // While the step is active, pending=false → typewriter unredacts. While
  // inactive (or before first activation in static mode), pending=true so
  // the reveal can replay if the user scrolls back.
  return (
    <div
      className="w-full max-w-[280px] border p-4 font-mono text-xs hc-poly"
      style={{
        borderColor: 'var(--hc-accent)',
        background: 'var(--hc-surface-2)',
        ['--poly-roundness' as string]: 'var(--hc-poly-6, 6px)',
      }}
    >
      <div
        className="mb-3 flex items-center justify-between text-[10px] uppercase tracking-[0.14em]"
        style={{ color: 'var(--hc-text-muted)' }}
      >
        <span>EXAMINATION</span>
        <span style={{ color: active ? 'var(--hc-accent)' : 'var(--hc-text-muted)' }}>
          ● {active ? 'CLEARED' : 'PENDING'}
        </span>
      </div>
      <div className="flex flex-col gap-2">
        <Row label="CONFIDENCE">
          <RedactedField pending={!active} value="98.4%" widthCh={6} />
        </Row>
        <Row label="STITCHING">
          <RedactedField pending={!active} value="MATCH" widthCh={6} />
        </Row>
        <Row label="SERIAL">
          <RedactedField pending={!active} value="GW-2401" widthCh={8} />
        </Row>
      </div>
    </div>
  );
}

function MintArtifact() {
  return (
    <div
      className="w-full max-w-[280px] border p-4 hc-poly"
      style={{
        borderColor: 'var(--hc-accent)',
        background: 'var(--hc-surface-2)',
        ['--poly-roundness' as string]: 'var(--hc-poly-6, 6px)',
      }}
    >
      <div
        className="mb-2 flex items-center justify-between font-mono text-[9px] uppercase tracking-[0.14em]"
        style={{ color: 'var(--hc-text-muted)' }}
      >
        <span>CERTIFICATE</span>
        <span style={{ color: 'var(--hc-verify-high)' }}>● MINTED</span>
      </div>
      <div
        className="font-mono text-xs tabular-nums"
        style={{ color: 'var(--hc-text-body)' }}
      >
        HC-2026-005847
      </div>
      <div className="mt-1 font-sentient italic text-lg leading-tight text-white">
        Yeezy Boost 350 v2
      </div>
      <div
        className="mt-3 flex items-center justify-between font-mono text-[9px] uppercase tracking-[0.12em]"
        style={{ color: 'var(--hc-text-muted)' }}
      >
        <span>SOLANA · MAINNET</span>
        <span style={{ color: 'var(--hc-accent)' }}>98.4%</span>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <span style={{ color: 'var(--hc-text-muted)' }}>{label}</span>
      {children}
    </div>
  );
}
