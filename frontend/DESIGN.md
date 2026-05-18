# Design System — HypeChain

## Product Context
- **What this is:** AI-powered NFT marketplace on Solana. AI verifies physical product authenticity before minting.
- **Who it's for:** Crypto-native traders who care about authenticity (not floor-grinders, not NFT-art collectors).
- **Space/industry:** NFT marketplace / Solana DeFi.
- **Project type:** Hybrid — marketing site (landing, waitlist, sold) + trading app (marketplace, collections, listings).

## Memorable Thing
> "It looks like a financial terminal, not a JPEG mall."

Every page must assert: **this is a verified record**, not a JPEG mall.

## Aesthetic Direction
- **Direction:** Verified Yellow + Evidence Chrome — internal name "Notarized Cypherpunk".
- **Decoration level:** Intentional — polygon clip-path corners, hairline borders, scanline grain, case-file ribbon, redaction bars, Certificate of Authenticity.
- **Mood:** Bloomberg-density when trading; editorial restraint when communicating; authentication-lab artifacts make the AI-verification wedge legible at first glance.
- **Reference sites:** Blur (data density), Hyperliquid (editorial restraint), Tensor Foundation (mono typography).
- **Anti-references:** Magic Eden (glossy casino), OpenSea (consumer SaaS).

## Typography

| Role | Font | Notes |
|---|---|---|
| Display/Hero | Sentient italic light (200/300) | Editorial moments only: landing hero pull-quote, section openers, marketing pull quotes, 404 page |
| Body | Geist | Paragraph text, longer descriptive copy |
| UI/Labels/Nav/Buttons/Ribbon | Geist Mono UPPERCASE letter-spaced | The spine of the system. Buttons, nav, chips, tags, case-file ribbon, table headers |
| Data/Numerals | Geist Mono with `font-variant-numeric: tabular-nums` | Prices, counts, mint addresses, timestamps — non-negotiable |
| Redaction | Geist Mono rendered as `█` blocks via `background: var(--color-redaction); color: transparent` | See `<RedactedField>` primitive |
| Code | Geist Mono | Smart contract addresses, transaction hashes |

**Loading:** `next/font/google` for Geist + Geist Mono (already in `app/layout.tsx`); `@font-face` for Sentient (already in `app/globals.css`).

**Scale** (16px base, 1.25 ratio marketing / 1.125 app):

```
text-xs    12px  — mono labels, mint addresses, ribbon, timestamps
text-sm    14px  — table rows, secondary UI
text-base  16px  — body
text-lg    20px  — card titles
text-2xl   28px  — section headings (app)
text-4xl   40px  — H2 marketing
text-6xl   64px  — H1 mobile / app
text-7xl   80px  — H1 marketing tablet
text-8xl  120px  — display marketing desktop (Sentient italic moments)
```

## Color

**Approach:** restrained — one bold yellow accent + extensive neutrals + three semantic verification states + one info chip.

```css
/* Backgrounds */
--color-bg:         #000000;  /* pure black */
--color-surface-1:  #0A0A0A;  /* cards */
--color-surface-2:  #141414;  /* raised surfaces, modals, hover */
--color-hairline:   #1F1F1F;  /* faintest separators, alternating table rows */
--color-border:     #2A2A2A;  /* default borders */

/* Text */
--color-text:       #FFFFFF;  /* hero headlines only */
--color-text-body:  #E5E5E5;  /* body text */
--color-text-muted: #6B6B6B;  /* labels, metadata */

/* Brand */
--color-accent:      #FFC700;  /* "verified gold" — caution-tape + certification semiotics */
--color-accent-deep: #EBB800;  /* inset glow, hover */

/* Verification semantics */
--color-verify-high: #00E5A0;  /* mint — AI confidence HIGH, VERIFIED */
--color-verify-med:  #FF9500;  /* amber — PENDING / REVIEWING */
--color-verify-low:  #FF3B30;  /* red — SUSPICIOUS / REJECTED */

/* Functional */
--color-info:       #4D9EFF;  /* mint addresses, links */
--color-redaction:  #0A0A0A;  /* the █ blocks */
```

**Dark only.** No light mode.

## Spacing
- **Base unit:** 4px
- **Density:** comfortable on marketing, **compact on app**
- **Scale:** 2 / 4 / 8 / 12 / 16 / 24 / 32 / 48 / 64 / 96 / 128

## Layout
- **Approach:** hybrid — brutalist-minimal for marketing, financial-terminal-dense for app
- **Grid:** marketing single-column + asides; app 12-col with sortable tables
- **Max content width:** 1280px marketing, 1536px app
- **Corner treatment:** polygon clip-path via the `<Frame>` primitive with `--poly-roundness` token tiers — 4px chips, 6px pills, 16px buttons, 24px hero frames. `--radius: 0.25rem` for elements that can't use clip-path.
- **No rounded-full** anywhere except the pill indicator dot. No bubble-radius. No squircles.

## Three Signature Moves

These three carry the forensic-evidentiary semantics that make AI verification feel real, not decorative. **They are not optional.** They are what differentiates HypeChain from every other NFT marketplace.

### Move 1 — Case-File Ribbon (`<CaseFileRibbon>`)
Persistent top status bar on every **app** surface (not marketing):

```
HC–2026–005847 // INTAKE 14:32:08 EST // EXAMINER: VISION-4O // CHAIN: SOL // ● LIVE
```

- 32-40px tall, sticky, `background: var(--color-surface-1)`, 1px hairline bottom border
- Geist Mono UPPERCASE 11px, letter-spacing 0.12em, `color: var(--color-text-muted)`
- Per-page case# derived: `HC–${year}–${listing.id.padStart(6,'0')}`. On non-listing pages, omit case# and show INTAKE + EXAMINER + CHAIN + LIVE only.
- `● LIVE` dot in `var(--color-verify-high)` with subtle pulse
- Renders on `/marketplace`, `/collections`, `/listings/[id]`, `/activities`, `/settings`. **NOT** on `/`, `/waitlist`, `/sold`.

### Move 2 — Redaction Bars (`<RedactedField>`)
Replace amber spinners / skeleton loaders / pending placeholders. When AI verification is in progress, render literal `████` over price, seller wallet, and provenance. On verification cleared, animate a typewriter unredact reveal.

```
Pending:        Verified:
PRICE:  ████    PRICE:  11,250 USDC
SELLER: ████    SELLER: 0x7f...3c2a
```

- Pending: `display: inline-block; background: var(--color-redaction); color: transparent; user-select: none; width: Xch;`
- Reveal: ~70ms per character, single pass, mono cursor caret blinks at end
- Suspicious: `████` bar in `var(--color-verify-low)` red, with `[REVIEW]` link to verification report

### Move 3 — Certificate of Authenticity (`<MintCertificate>`)
Full-page modal that slides up after every successful mint. Renders a downloadable Certificate of Authenticity in the Verified Yellow language. Designed to be screenshotted and posted.

- Slide up from below, 480ms `cubic-bezier(0.16, 1, 0.3, 1)`
- Document with polygon clip-path corners (24px tier)
- Header: HypeChain wordmark + `CERTIFICATE OF AUTHENTICITY` in Geist Mono caps
- Body: case# + intake + examiner + product name (Sentient italic for product name) + confidence% with mint-green gauge + mint address + IPFS hash
- Yellow rotary stamp at 7° tilt in the bottom-right: `VERIFIED // ${date} // ${examiner}` — the **only** place we let the Evidence Locker stamp gesture in the system
- Footer: signature line, serial number, download / share / twitter buttons
- PDF generation via `@react-pdf/renderer` (dynamic import — load only post-mint)

## Motion
- **Approach:** minimal-functional + two signature moments
- **Easing:** enter `cubic-bezier(0.16, 1, 0.3, 1)`, exit `ease-in`, transform `ease-out`
- **Duration:** micro 80ms / short 180ms / medium 280ms / long 480ms
- **Signature 1:** yellow inset-glow pulse on primary CTA hover
- **Signature 2:** typewriter-unredact reveal when redaction bars resolve (~70ms/char, single pass, mono cursor blink)
- **Brand asset:** the WebGL shader hero on the landing page (`components/gl/`) is untouched — it IS the motion identity

## Banned

- **Fonts (overused):** Inter, Roboto, Open Sans, Lato, Montserrat, Poppins, Space Grotesk
- **Fonts (display):** system-ui, anything cursive
- **Patterns:** gradient text fill, decorative blur orbs, glassmorphism, drop shadows other than the yellow inset glow on primary CTAs
- **Geometry:** `rounded-full` outside the pill indicator dot, bubble-radius, iOS squircles
- **AI slop:** purple gradients, 3-column icon feature grids with circles, centered-everything layouts, "Built for X / Designed for Y" copy patterns

## Coherence Audit (grep gates)

Run these before any visual PR merges:

```bash
# Must return ZERO hits each:
grep -rn "from-blue\|from-cyan\|from-purple" frontend/components/
grep -rn "bg-gradient" frontend/
grep -rn "hero-section" frontend/
grep -rn "text-blue-400" frontend/

# Must return only the pill indicator dot:
grep -rn "rounded-full" frontend/components/
```

## Decisions Log

| Date | Decision | Rationale |
|---|---|---|
| 2026-05-14 | Initial design system codified — direction "Verified Yellow + Evidence Chrome" (Hybrid) | Created by /design-consultation after HackNYU 2025 first-place finish. Codifies the cypherpunk-financial-terminal aesthetic already in `app/page.tsx`. Kills `components/hero-section.tsx` v0 slop. Unifies `nft-card.tsx` via `<Frame>` primitive. Adds three Evidence Locker moves (case-file ribbon, redaction bars, Certificate of Authenticity) to carry forensic-evidentiary semantics on the existing chassis. Implementation plan: `~/.claude/plans/sparkling-wobbling-wirth.md`. Visual reference: `~/.gstack/projects/alin9661-HypeChain/designs/hypechain-design-system-20260514-143236/comparison.html`. |
