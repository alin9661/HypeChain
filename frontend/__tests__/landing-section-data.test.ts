/**
 * @jest-environment node
 *
 * Unit tests for the pure helpers that drive the sticky-pinned scroll-scrub
 * math. Kept DOM-free on purpose — no jsdom, no observers, no fixtures.
 * The `@jest-environment node` pragma overrides the project's jsdom default
 * so this suite runs even when `jest-environment-jsdom` is not installed.
 *
 * If any of these break, the cinematic scrub in `verify-flow-section.tsx`
 * will misbehave at step boundaries — that's the whole reason the math
 * lives in `landing-section-data.ts` instead of inline.
 */

import {
  clamp01,
  progressToStep,
  subProgress,
  VERIFY_STEPS,
  EVIDENCE_MOVES,
} from '@/components/landing/landing-section-data';

describe('clamp01', () => {
  it('passes through values in range', () => {
    expect(clamp01(0)).toBe(0);
    expect(clamp01(0.5)).toBe(0.5);
    expect(clamp01(1)).toBe(1);
  });

  it('clamps negatives to 0 and overflows to 1', () => {
    expect(clamp01(-0.5)).toBe(0);
    expect(clamp01(-1e9)).toBe(0);
    expect(clamp01(1.5)).toBe(1);
    expect(clamp01(1e9)).toBe(1);
  });

  it('collapses NaN to 0', () => {
    expect(clamp01(NaN)).toBe(0);
  });
});

describe('progressToStep', () => {
  it('maps the 3-step boundaries correctly', () => {
    expect(progressToStep(0, 3)).toBe(0);
    expect(progressToStep(0.32, 3)).toBe(0);
    expect(progressToStep(0.34, 3)).toBe(1);
    expect(progressToStep(0.66, 3)).toBe(1);
    expect(progressToStep(0.67, 3)).toBe(2);
    expect(progressToStep(0.99, 3)).toBe(2);
  });

  it('returns the last step (not steps) at progress=1', () => {
    expect(progressToStep(1, 3)).toBe(2);
    expect(progressToStep(1, 5)).toBe(4);
  });

  it('clamps under/over-range to first/last step', () => {
    expect(progressToStep(-1, 3)).toBe(0);
    expect(progressToStep(2, 3)).toBe(2);
    expect(progressToStep(NaN, 3)).toBe(0);
  });

  it('handles degenerate step counts safely', () => {
    expect(progressToStep(0.5, 1)).toBe(0);
    expect(progressToStep(0.5, 0)).toBe(0);
  });

  it('never returns a value >= steps', () => {
    for (let p = 0; p <= 1; p += 0.05) {
      for (const steps of [1, 2, 3, 4, 7]) {
        const idx = progressToStep(p, steps);
        expect(idx).toBeGreaterThanOrEqual(0);
        expect(idx).toBeLessThan(steps);
      }
    }
  });
});

describe('subProgress', () => {
  it('is 0 at step boundaries and ~0.5 mid-step', () => {
    expect(subProgress(0, 3)).toBe(0);
    expect(subProgress(1 / 3, 3)).toBeCloseTo(0, 6);
    expect(subProgress(2 / 3, 3)).toBeCloseTo(0, 6);
    expect(subProgress(1 / 6, 3)).toBeCloseTo(0.5, 6);
  });

  it('returns 1 at the very end so the last step shows full', () => {
    expect(subProgress(1, 3)).toBe(1);
    expect(subProgress(1, 5)).toBe(1);
  });

  it('clamps out-of-range inputs', () => {
    expect(subProgress(-0.5, 3)).toBe(0);
    expect(subProgress(2, 3)).toBe(1);
  });

  it('falls back to clamped progress for single-step degenerate', () => {
    expect(subProgress(0.5, 1)).toBe(0.5);
    expect(subProgress(0.5, 0)).toBe(0.5);
  });
});

describe('section copy invariants', () => {
  it('VERIFY_STEPS has exactly the 3 expected step ids in order', () => {
    expect(VERIFY_STEPS.map((s) => s.id)).toEqual(['intake', 'examine', 'mint']);
  });

  it('EVIDENCE_MOVES has exactly the 3 expected move ids in order', () => {
    expect(EVIDENCE_MOVES.map((m) => m.id)).toEqual(['ribbon', 'redaction', 'certificate']);
  });
});
