# Evidence Locker Primitives

Two reusable React components that carry HypeChain's forensic-evidentiary semantics across every app surface, plus the design tokens that make them coherent.

These are the first concrete implementation of [`frontend/DESIGN.md`](../frontend/DESIGN.md)'s "Three Signature Moves" (Move 1: Case-File Ribbon, Move 2: Redacted Field). Move 3 (Mint Certificate full modal) is wired as an inline preview on the listing detail page; the full-modal component is a separate follow-up.

## Context

Before this work, the design system in [`frontend/DESIGN.md`](../frontend/DESIGN.md) was prose-only. The codebase shipped two competing visual languages — a "Verified Yellow + Evidence Chrome" landing page and a generic dark-mode marketplace UI ("JPEG mall" patterns: `rounded-lg` cards, `rounded-full` AI VERIFIED badges, `bg-gray-900` panels). [`frontend/app/listings/[id]/page.tsx`](../frontend/app/listings/[id]/page.tsx) was the most prominent offender.

The Pretext-native mockup at `~/.gstack/projects/alin9661-HypeChain/designs/listings-detail-20260516/finalized.html` proved the design system end-to-end. This documentation captures the React port — the two new primitives, the new design tokens, and the rewritten listing detail page that consumes them.

## Files Changed

| File | What changed |
|---|---|
| [`frontend/app/globals.css`](../frontend/app/globals.css) | Added `--hc-*` namespaced design tokens (DESIGN.md canonical hex values) under `:root`. Added `.hc-poly` clip-path utility class and keyframes (`hc-live-pulse`, `hc-caret-blink`, `hc-cta-pulse`). |
| [`frontend/components/case-file-ribbon.tsx`](../frontend/components/case-file-ribbon.tsx) | **New.** Move 1 primitive. |
| [`frontend/components/redacted-field.tsx`](../frontend/components/redacted-field.tsx) | **New.** Move 2 primitive. |
| [`frontend/app/listings/[id]/page.tsx`](../frontend/app/listings/[id]/page.tsx) | Full UI rewrite. Preserves all data-fetching (`apiClient.getListingDetails`), Privy wallet logic, loading/error/sold-state branches, and the existing `<PurchaseButton>` integration. |

---

## Design Tokens

All token names live under the `--hc-*` namespace so they never collide with the existing shadcn / Tailwind v4 tokens above them in [`frontend/app/globals.css`](../frontend/app/globals.css). The shadcn tokens (`--primary`, `--card`, etc.) are still in use across the codebase and have drifted slightly from DESIGN.md; rather than break those, we sit alongside.

```css
/* Backgrounds */
--hc-bg:         #000000;
--hc-surface-1:  #0A0A0A;
--hc-surface-2:  #141414;
--hc-hairline:   #1F1F1F;
--hc-border:     #2A2A2A;

/* Text */
--hc-text:       #FFFFFF;
--hc-text-body:  #E5E5E5;
--hc-text-muted: #6B6B6B;

/* Brand — retoned to evidence-locker brass on 2026-05-19 (see DESIGN.md Decisions Log) */
--hc-accent:      #EBC658;   /* Evidence-locker brass (formerly Verified Yellow #FFC700) */
--hc-accent-deep: #C9A436;
--hc-accent-tint: rgba(235, 198, 88, 0.10);

/* Verification semantics */
--hc-verify-high: #00E5A0;   /* mint — AI confidence HIGH, VERIFIED */
--hc-verify-med:  #FF9500;   /* amber — PENDING / REVIEWING */
--hc-verify-low:  #FF3B30;   /* red — SUSPICIOUS / REJECTED */

/* Functional */
--hc-info:        #4D9EFF;
--hc-redaction:   #0A0A0A;

/* Polygon clip-path roundness tiers */
--hc-poly-4:  4px;    /* chips */
--hc-poly-6:  6px;    /* pills */
--hc-poly-16: 16px;   /* buttons, panels */
--hc-poly-24: 24px;   /* hero frames */
```

### `.hc-poly` utility class

Apply polygon clip-path corners to any element by setting `--hc-poly-r` and adding the class:

```tsx
<button
  className="hc-poly px-6 py-4"
  style={{
    background: 'var(--hc-accent)',
    color: 'var(--hc-bg)',
    ['--hc-poly-r' as string]: 'var(--hc-poly-16)',
  }}
>
  Purchase
</button>
```

Renders an 8-point polygon clip-path that bevels all four corners by 16px. This is the same pattern [`frontend/components/pill.tsx`](../frontend/components/pill.tsx) uses; the utility class hoists it so any component can reuse without inlining the 8-point polygon spec.

---

## `<CaseFileRibbon>` — Move 1

Persistent top status bar on every **app** surface. Renders on `/marketplace`, `/collections`, `/listings/[id]`, `/activities`, `/settings`. Does **NOT** render on `/`, `/waitlist`, `/sold`.

```tsx
import { CaseFileRibbon } from '@/components/case-file-ribbon';

// Listing detail page — case# derived from listing.id, intake from created_at
<CaseFileRibbon caseId={listing.id} intake={listing.created_at} />

// Non-listing app surface — omit case#, current time as intake
<CaseFileRibbon caseId={null} />
```

### Props

| Prop | Type | Default | Notes |
|---|---|---|---|
| `caseId` | `string \| null` | — | Listing ID; converts to `HC–YYYY–NNNNNN`. Pass `null` on non-listing surfaces to omit the case number. |
| `intake` | `string \| Date` | `new Date()` | ISO timestamp from `listing.created_at`, or current time on non-listing pages. Rendered in EST. |
| `examiner` | `string` | `'VISION-4O'` | AI examiner identifier. DESIGN.md default. |
| `chain` | `string` | `'SOL'` | Chain label. |

### Rendered output

```
HC–2026–005847 // INTAKE 14:32:08 EST // EXAMINER: VISION-4O // CHAIN: SOL // ● LIVE
```

32px tall, sticky to `top: 0`, hairline-bottom border, Geist Mono UPPERCASE 11px with `letter-spacing: 0.12em`. The `● LIVE` dot pulses via the `hc-live-pulse` keyframe.

---

## `<RedactedField>` — Move 2

Replaces amber spinners / skeleton loaders / pending placeholders. When AI verification is in progress, renders literal `████` characters in muted gray. When verification clears, plays a typewriter unredact reveal at 70ms/char.

```tsx
import { RedactedField } from '@/components/redacted-field';

<RedactedField
  pending={!listing.ai_verified}
  value={listing.seller_wallet}
  widthCh={10}
/>

// Suspicious state — red blocks + [REVIEW] affordance
<RedactedField
  pending
  suspicious
  value={listing.price_sol.toString()}
  widthCh={8}
  onReview={() => router.push(`/listings/${listing.id}/verification-report`)}
/>
```

### Props

| Prop | Type | Default | Notes |
|---|---|---|---|
| `pending` | `boolean` | — | True while AI verification is in progress. |
| `value` | `string` | — | The value to reveal once verification clears. |
| `widthCh` | `number` | — | Width in monospace characters; controls how many `█` characters render in the pending state. |
| `suspicious` | `boolean` | `false` | Render blocks in `--hc-verify-low` red + show `[REVIEW]` affordance. |
| `onReview` | `() => void` | — | Called when `[REVIEW]` is clicked. Wire to your verification-report route. |
| `charIntervalMs` | `number` | `70` | Milliseconds per character for the unredact reveal. DESIGN.md spec is 70ms. |
| `className` | `string` | — | Pass-through for layout-level styling. |

### Behavior

- **Mount as pending** → shows `████`.
- **Mount as not-pending** → shows `value` immediately, no animation.
- **`pending` flips true → false** → plays the typewriter reveal character by character.
- **`pending` flips false → true** → snaps back to `████` (no reverse animation; this is rare).

The component tracks `wasPendingRef` so a not-pending mount doesn't trigger a fake reveal. The animation only fires on a genuine pending → not-pending transition.

---

## Listing Detail Page Rewrite

[`frontend/app/listings/[id]/page.tsx`](../frontend/app/listings/[id]/page.tsx) now uses the full Evidence Chrome stack. Structural changes:

1. **`<CaseFileRibbon>`** sits at the top, derived from `listing.id` + `listing.created_at`.
2. **Top nav** uses the polygon-clipped wallet chip pattern from [`frontend/components/pill.tsx`](../frontend/components/pill.tsx).
3. **Two-column layout** (image + AI Examination panel on the left, product details + price + NFT details + CTA + Cert Preview on the right). Single column at `< 900px`.
4. **`<RedactedField>`** wraps price, seller wallet, mint address, and IPFS hash. When `listing.status === 'pending' || !listing.ai_verified`, those fields render as `████`; on flip to verified, they typewriter-reveal.
5. **AI Examination panel** renders the 16-block confidence gauge: `Math.round((confidenceScore / 100) * 16)` full `█` characters, the remainder in `--hc-hairline`.
6. **NFT details panel** — alternating-hairline rows via Tailwind `even:bg-white/[0.012]`.
7. **Purchase CTA** keeps the existing `<PurchaseButton>` component; the wrapper styling matches the design system (yellow inset-glow pulse on hover via `hc-cta-pulse`).
8. **Mint Certificate preview** — inline section showing Sentient italic product name, case#, examiner, confidence, mint, plus the rotated yellow rotary stamp at `-7°`. Only renders when `ai_verified && !isSold`.
9. **Loading state** — "Retrieving case file…" in mono uppercase, accent-yellow spinner.
10. **Error state** — "Case Not Found" in `--hc-verify-low` red, polygon-clipped Back-to-Marketplace CTA.

### Data flow preserved

The rewrite preserves every data-flow concern from the previous implementation:

- `useEffect` fetches via `apiClient.getListingDetails(listingId)`.
- `usePrivy` reads `user.linkedAccounts` and narrows to the Solana wallet variant via a type-predicate `find` (replaces the previous untyped `.address` access).
- `isOwnListing`, `isSold`, and `isPending` discriminants flow into the rendered branches.
- `<PurchaseButton>` is used as-is — no API changes.
- `handlePurchaseSuccess` still routes to `/sold`.

---

## Reusing the Primitives

These two components are the spine of the Evidence Chrome surfaces. They should appear in:

- [x] `frontend/app/marketplace/page.tsx` — `<CaseFileRibbon caseId={null} />` at top; `<RedactedField>` on pending-listing rows.
- [ ] `frontend/app/collections/page.tsx` — Same ribbon pattern.
- [ ] `frontend/app/activities/page.tsx` — Ribbon + redacted rows on in-progress transactions.
- [ ] `frontend/app/settings/page.tsx` — Ribbon only; no redactions.

When porting each, drop in `<CaseFileRibbon caseId={null} />` as the first child below `<html><body>` (or whatever root the page renders) and surface every "pending verification" placeholder as a `<RedactedField pending />`. Do not invent new placeholder UI; if you find yourself reaching for `bg-gray-900 animate-pulse skeleton`, you want `<RedactedField>` instead.

## Reference Artifacts

- **Vanilla HTML mockup** (the source of truth this React port targeted): `~/.gstack/projects/alin9661-HypeChain/designs/listings-detail-20260516/finalized.html`
- **Mockup metadata** (iteration notes, coherence-audit results, real-data seed): `~/.gstack/projects/alin9661-HypeChain/designs/listings-detail-20260516/finalized.json`
- **Implementation plan**: `~/.claude/plans/immutable-sleeping-cray.md`
- **Design system spec**: [`frontend/DESIGN.md`](../frontend/DESIGN.md)

## Coherence Audit

Run these greps before merging any visual PR — see [`frontend/DESIGN.md`](../frontend/DESIGN.md) lines 154-163. All four must return zero hits across `frontend/components/` and `frontend/app/`:

```bash
grep -rn "from-blue\|from-cyan\|from-purple" frontend/components/ frontend/app/
grep -rn "bg-gradient" frontend/components/ frontend/app/
grep -rn "hero-section" frontend/components/ frontend/app/
grep -rn "text-blue-400" frontend/components/ frontend/app/
```

The only legitimate `border-radius: 50%` / `rounded-full` instances are:
- The LIVE pulse dot in `<CaseFileRibbon>`.
- The wallet status dot in the top nav.
- The "Verified" stamp dot on the product image.
- The Mint Certificate rotary stamp (DESIGN.md line 130: "the **only** place we let the Evidence Locker stamp gesture in the system").
