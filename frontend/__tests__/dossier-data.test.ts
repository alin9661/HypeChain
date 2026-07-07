/**
 * @jest-environment node
 *
 * Unit tests for the pure helpers behind the dossier chassis: grid drift,
 * rail parallax, KPI count-up easing, and the accumulating dossier-panel
 * block states. DOM-free on purpose — same discipline as
 * `landing-section-data.test.ts`.
 */

import {
  wrapOffset,
  railParallax,
  easeOutCubic,
  countUpValue,
  stepBlockState,
  DOSSIER_SECTIONS,
  TICKER_ENTRIES,
} from '@/components/landing/dossier-data';
import { EVIDENCE_MOVES } from '@/components/landing/landing-section-data';

describe('wrapOffset', () => {
  it('is 0 at scroll 0', () => {
    expect(wrapOffset(0, 0.06, 120)).toBe(0);
  });

  it('wraps back to exactly 0 (not -0) at period multiples', () => {
    // scroll * speed === period → offset wraps to 0
    expect(wrapOffset(2000, 0.06, 120)).toBe(0); // 2000*0.06 = 120
    expect(wrapOffset(4000, 0.06, 120)).toBe(0);
  });

  it('always returns a value in (-period, 0]', () => {
    for (let scroll = 0; scroll <= 100_000; scroll += 777) {
      const v = wrapOffset(scroll, 0.06, 120);
      expect(v).toBeLessThanOrEqual(0);
      expect(v).toBeGreaterThan(-120);
    }
  });

  it('stays bounded for negative scroll (rubber-banding)', () => {
    const v = wrapOffset(-500, 0.06, 120);
    expect(v).toBeLessThanOrEqual(0);
    expect(v).toBeGreaterThan(-120);
  });

  it('collapses NaN and non-positive periods to 0', () => {
    expect(wrapOffset(NaN, 0.06, 120)).toBe(0);
    expect(wrapOffset(1000, NaN, 120)).toBe(0);
    expect(wrapOffset(1000, 0.06, 0)).toBe(0);
    expect(wrapOffset(1000, 0.06, -120)).toBe(0);
    expect(wrapOffset(1000, 0.06, NaN)).toBe(0);
  });
});

describe('railParallax', () => {
  it('is 0 at scroll 0 and scales linearly in range', () => {
    expect(railParallax(0, 0.02, 24)).toBe(0);
    expect(railParallax(500, 0.02, 24)).toBe(10);
  });

  it('clamps at ±maxPx', () => {
    expect(railParallax(1e6, 0.02, 24)).toBe(24);
    expect(railParallax(-1e6, 0.02, 24)).toBe(-24);
  });

  it('collapses NaN and negative maxPx to 0', () => {
    expect(railParallax(NaN, 0.02, 24)).toBe(0);
    expect(railParallax(500, NaN, 24)).toBe(0);
    expect(railParallax(500, 0.02, -1)).toBe(0);
    expect(railParallax(500, 0.02, NaN)).toBe(0);
  });
});

describe('easeOutCubic', () => {
  it('hits the endpoints exactly', () => {
    expect(easeOutCubic(0)).toBe(0);
    expect(easeOutCubic(1)).toBe(1);
  });

  it('decelerates: first half covers more than half the distance', () => {
    expect(easeOutCubic(0.5)).toBeGreaterThan(0.5);
  });

  it('is monotonically non-decreasing over a sample sweep', () => {
    let prev = -Infinity;
    for (let t = 0; t <= 1.0001; t += 0.05) {
      const v = easeOutCubic(t);
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
  });

  it('clamps out-of-range and NaN inputs', () => {
    expect(easeOutCubic(-1)).toBe(0);
    expect(easeOutCubic(2)).toBe(1);
    expect(easeOutCubic(NaN)).toBe(0);
  });
});

describe('countUpValue', () => {
  it('starts at 0 and ends exactly at target', () => {
    expect(countUpValue(11_250, 0)).toBe(0);
    expect(countUpValue(11_250, 1)).toBe(11_250);
    expect(countUpValue(11_250, 1.5)).toBe(11_250);
  });

  it('never overshoots the target for t in [0,1]', () => {
    for (let t = 0; t <= 1.0001; t += 0.05) {
      const v = countUpValue(100, t);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(100);
    }
  });

  it('collapses non-finite targets to 0', () => {
    expect(countUpValue(NaN, 0.5)).toBe(0);
    expect(countUpValue(Infinity, 0.5)).toBe(0);
  });
});

describe('stepBlockState', () => {
  it('covers the full 3×3 step/block matrix', () => {
    // stepIndex 0
    expect(stepBlockState(0, 0)).toBe('active');
    expect(stepBlockState(0, 1)).toBe('pending');
    expect(stepBlockState(0, 2)).toBe('pending');
    // stepIndex 1
    expect(stepBlockState(1, 0)).toBe('complete');
    expect(stepBlockState(1, 1)).toBe('active');
    expect(stepBlockState(1, 2)).toBe('pending');
    // stepIndex 2
    expect(stepBlockState(2, 0)).toBe('complete');
    expect(stepBlockState(2, 1)).toBe('complete');
    expect(stepBlockState(2, 2)).toBe('active');
  });

  it('collapses degenerate inputs to pending', () => {
    expect(stepBlockState(NaN, 0)).toBe('pending');
    expect(stepBlockState(0, NaN)).toBe('pending');
    expect(stepBlockState(0, -1)).toBe('pending');
  });
});

describe('dossier copy invariants', () => {
  it('DOSSIER_SECTIONS has exactly the 4 section ids in page order', () => {
    expect(DOSSIER_SECTIONS.map((s) => s.id)).toEqual(['verify', 'moves', 'proof', 'cta']);
  });

  it('rail labels carry the SEC 0X/04 index matching array order', () => {
    DOSSIER_SECTIONS.forEach((s, i) => {
      expect(s.railLabel.startsWith(`SEC 0${i + 1}/04 // `)).toBe(true);
    });
  });

  it('every ticker entry matches the case-file format and is uppercase', () => {
    expect(TICKER_ENTRIES.length).toBeGreaterThanOrEqual(8);
    for (const entry of TICKER_ENTRIES) {
      expect(entry).toMatch(/^HC-\d{4}-\d{6} \/\/ .+ \/\/ VERIFIED \d{2}\.\d% \/\/ SOL$/);
      expect(entry).toBe(entry.toUpperCase());
    }
  });

  it('EVIDENCE_MOVES exhibits are A, B, C in order', () => {
    expect(EVIDENCE_MOVES.map((m) => m.exhibit)).toEqual(['A', 'B', 'C']);
  });
});
