# Changelog

All notable changes to HypeChain are recorded here. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [0.2.0.0] - 2026-05-25

### Added

- Landing page now tells a four-section product story below the WebGL hero,
  so visitors who scroll past the particle field actually learn what
  HypeChain does and what trades on the marketplace.
- New cinematic verify-flow section pins to the viewport and scrubs through
  three steps (Intake → AI Examination → Mint) as you scroll, with a
  static-stacked fallback for mobile and reduced-motion users.
- Evidence Locker section showcases the three signature design moves:
  Case-File Ribbon vocabulary, Redaction Bars with typewriter unredact on
  scroll-in, and a static Mint Certificate card.
- Marketplace proof band reads from `useListings()` and renders either a
  live KPI strip + recent verified rows (when data is populated) or a
  graceful "the verified floor is open" invitation when the data layer is
  empty.
- Final CTA band closes the scroll story with brass bullion + outline
  buttons mirroring the hero.
- Three new reusable hooks — `useReducedMotion`, `useInView`,
  `useScrollProgress` — power the scroll-story system without adding any
  third-party scroll/animation dependencies.
- Reveal wrapper component provides SSR-safe one-shot scroll reveals via a
  tri-state (pristine / hidden / revealed) model that avoids the classic
  above-the-fold flash on hydration.
- Pure scrub-math helpers (`clamp01`, `progressToStep`, `subProgress`) with
  Jest test scaffold so the math powering the cinematic scroll can be
  unit-tested independent of the DOM.

### Changed

- Landing page `app/page.tsx` wraps the existing hero in `<main>` and
  appends the four new sections in order. WebGL hero and
  `components/gl/` are untouched.
- `landingNavItems` gains an explicit `{ name: string; href: string }[]`
  type annotation so it satisfies `Navigation`'s `items` prop instead of
  inferring `never[]`.

### Fixed

- Polygon-corner CSS variable mismatch across all seven `.hc-poly`
  elements in landing scope. The new components originally set
  `--poly-roundness` but the `.hc-poly` class in `globals.css` reads
  `--hc-poly-r`, so every corner silently fell back to the 6 px default
  instead of the intended 16 px (step cards), 6 px (artifacts), and 4 px
  (rail numerals). Renamed the variable everywhere.
- Verify-flow StepRail segment fill no longer jumps backward at step
  boundaries. The active segment width is now driven by in-step
  `subProgress` (0..1 within the current step) instead of global
  `progress`, and the CSS transition on the active segment is dropped so
  the fill tracks the scroll position exactly.
- Verify-flow sticky panel padding (`pt-24`) clears the 84 px fixed
  Navigation that pins above it, so the section's Pill + headline render
  in front of the nav instead of behind it.
