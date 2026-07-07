/**
 * Dossier-chassis content + DOM-free pure helpers.
 *
 * Sibling to `landing-section-data.ts` (section copy + scrub math). This
 * file owns the ambient "dossier on chart paper" layer: marginalia rail
 * labels, ticker entries, and the math for grid drift, rail parallax,
 * KPI count-ups, and the accumulating dossier panel.
 *
 * Same rules as the sibling: helpers are total functions — no exceptions,
 * no side effects — so `__tests__/dossier-data.test.ts` is just boundary
 * values. All strings are static (no `new Date()`, no `Math.random()`);
 * dynamic values at render time caused a hydration mismatch in
 * CaseFileRibbon once already.
 */

import { clamp01 } from './landing-section-data';

/* ──────────────────────────  PURE HELPERS  ────────────────────────── */

/**
 * Vertical drift offset for the chart-paper grid, wrapped to the grid's
 * coarse period so the translate value stays tiny on arbitrarily long
 * scrolls (no float-precision drift) and the wrap is invisible because
 * the pattern repeats at exactly `period`.
 *
 * Returns a value in (-period, 0]. NaN inputs and non-positive periods
 * collapse to 0.
 */
export function wrapOffset(scroll: number, speed: number, period: number): number {
  if (!Number.isFinite(scroll) || !Number.isFinite(speed)) return 0;
  if (!Number.isFinite(period) || period <= 0) return 0;
  const wrapped = (((scroll * speed) % period) + period) % period;
  // Avoid -0 at exact period multiples so callers can compare with ===.
  return wrapped === 0 ? 0 : -wrapped;
}

/**
 * Small clamped parallax offset for the marginalia rails.
 * Returns `scroll * factor` clamped to [-maxPx, maxPx]. NaN → 0.
 */
export function railParallax(scroll: number, factor: number, maxPx: number): number {
  if (!Number.isFinite(scroll) || !Number.isFinite(factor)) return 0;
  if (!Number.isFinite(maxPx) || maxPx < 0) return 0;
  const raw = scroll * factor;
  if (raw > maxPx) return maxPx;
  if (raw < -maxPx) return -maxPx;
  return raw;
}

/** Cubic ease-out over clamped t — the count-up's deceleration curve. */
export function easeOutCubic(t: number): number {
  const p = clamp01(t);
  const inv = 1 - p;
  return 1 - inv * inv * inv;
}

/**
 * Value shown at normalized time `t` (0..1) of a count-up toward `target`.
 * t <= 0 → 0, t >= 1 → exactly target. Non-finite targets collapse to 0.
 */
export function countUpValue(target: number, t: number): number {
  if (!Number.isFinite(target)) return 0;
  return target * easeOutCubic(t);
}

/** Visual state of one dossier-panel block during the verify-flow scrub. */
export type BlockState = 'pending' | 'active' | 'complete';

/**
 * State of block `block` while step `stepIndex` is active.
 * Blocks before the active step are complete, the active block is active,
 * later blocks are pending. Negative/NaN indices collapse to pending so a
 * degenerate scrub state never lights a block early.
 */
export function stepBlockState(stepIndex: number, block: number): BlockState {
  if (!Number.isFinite(stepIndex) || !Number.isFinite(block)) return 'pending';
  if (block < 0) return 'pending';
  if (block < stepIndex) return 'complete';
  if (block === stepIndex) return 'active';
  return 'pending';
}

/* ─────────────────────  MARGINALIA RAIL SECTIONS  ─────────────────── */

export type DossierSectionMeta = {
  /** Stable id — matches the section's position in `app/page.tsx`. */
  id: 'verify' | 'moves' | 'proof' | 'cta';
  /** `SEC 0X/04 // NAME` label shown on the rail while active. */
  railLabel: string;
  /** Fake plate coordinate — static string, evidence-photo vocabulary. */
  plate: string;
  /** Filed stamp — static string, never derived from Date. */
  stamp: string;
};

export const DOSSIER_SECTIONS: readonly DossierSectionMeta[] = [
  {
    id: 'verify',
    railLabel: 'SEC 01/04 // VERIFY FLOW',
    plate: 'PLT 40.7128N 74.0060W',
    stamp: 'FILED 14:32:08 EST',
  },
  {
    id: 'moves',
    railLabel: 'SEC 02/04 // EVIDENCE LOCKER',
    plate: 'PLT 40.7306N 73.9866W',
    stamp: 'FILED 14:47:51 EST',
  },
  {
    id: 'proof',
    railLabel: 'SEC 03/04 // VERIFIED FLOOR',
    plate: 'PLT 40.7580N 73.9855W',
    stamp: 'FILED 15:02:19 EST',
  },
  {
    id: 'cta',
    railLabel: 'SEC 04/04 // CASE OPEN',
    plate: 'PLT 40.7061N 74.0087W',
    stamp: 'FILED 15:18:44 EST',
  },
] as const;

/* ───────────────────────  VERIFIED-MINTS TICKER  ──────────────────── */

/**
 * Deterministic ticker entries — the divider marquee between sections.
 * Format: `HC-2026-XXXXXX // <ITEM> // VERIFIED XX.X% // SOL`.
 * Confidence values stay in the high-90s band the product story claims.
 */
export const TICKER_ENTRIES: readonly string[] = [
  'HC-2026-005847 // YEEZY BOOST 350 V2 // VERIFIED 98.4% // SOL',
  'HC-2026-005851 // JORDAN 1 RETRO CHICAGO // VERIFIED 99.1% // SOL',
  'HC-2026-005853 // ROLEX SUBMARINER 124060 // VERIFIED 97.8% // SOL',
  'HC-2026-005859 // SUPREME BOX LOGO FW21 // VERIFIED 98.9% // SOL',
  'HC-2026-005862 // PATEK NAUTILUS 5711 // VERIFIED 96.7% // SOL',
  'HC-2026-005868 // TRAVIS SCOTT AJ1 LOW // VERIFIED 99.3% // SOL',
  'HC-2026-005874 // HERMES BIRKIN 30 TOGO // VERIFIED 97.2% // SOL',
  'HC-2026-005880 // NIKE MAG 2016 // VERIFIED 98.1% // SOL',
  'HC-2026-005886 // CARTIER SANTOS WSSA0018 // VERIFIED 98.6% // SOL',
  'HC-2026-005891 // OFF-WHITE CHICAGO THE TEN // VERIFIED 99.0% // SOL',
] as const;
