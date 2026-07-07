/**
 * Landing-page scroll-story content + DOM-free pure helpers.
 *
 * The helpers (`clamp01`, `progressToStep`, `subProgress`) are exported
 * separately so the math powering `useScrollProgress` can be unit-tested
 * without jsdom or scroll fixtures. Keep them total functions — no
 * exceptions, no side effects — so the test matrix is just boundary
 * values.
 *
 * The content arrays live here too so the section components stay focused
 * on presentation and can be re-skinned without copy edits.
 */

/* ──────────────────────────  PURE HELPERS  ────────────────────────── */

/** Clamp a number to [0, 1]. NaN collapses to 0. */
export function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

/**
 * Map progress (0..1) to a step index in [0, steps - 1].
 *
 * `progress = 1` yields the last step (not `steps`), so callers can drive
 * a fixed-size step array without an extra clamp. Negative or NaN inputs
 * collapse to step 0. Caller must pass `steps >= 1`.
 */
export function progressToStep(progress: number, steps: number): number {
  if (steps <= 1) return 0;
  const p = clamp01(progress);
  const idx = Math.floor(p * steps);
  return idx >= steps ? steps - 1 : idx;
}

/**
 * Fractional progress within the current step, 0..1.
 *
 * Useful for sub-step affordances (e.g. an in-step fill bar). At step
 * boundaries returns 0; mid-step returns ~0.5; at the very end of the
 * last step returns 1.
 */
export function subProgress(progress: number, steps: number): number {
  if (steps <= 1) return clamp01(progress);
  const p = clamp01(progress);
  const scaled = p * steps;
  const frac = scaled - Math.floor(scaled);
  // At the very end (p === 1), the floor lands on `steps` and frac is 0,
  // but visually we want a "full" sub-progress — return 1 in that case.
  if (p === 1) return 1;
  return frac;
}

/* ─────────────────────  SECTION 1 — VERIFY FLOW  ──────────────────── */

export type VerifyStep = {
  /** Stable id for keys / aria. */
  id: 'intake' | 'examine' | 'mint';
  /** Mono uppercase eyebrow label (e.g. INTAKE / EXAMINER: VISION-4O / MINT). */
  eyebrow: string;
  /** Editorial headline shown in the pinned panel. */
  title: string;
  /** Supporting copy below the title. */
  body: string;
  /** Brief operational caption — formatted like a case-file annotation. */
  caption: string;
};

export const VERIFY_STEPS: readonly VerifyStep[] = [
  {
    id: 'intake',
    eyebrow: 'INTAKE // 01',
    title: 'Physical custody, logged on arrival.',
    body: 'Sellers ship the item to a HypeChain examiner. Each parcel is photographed, weighed, and assigned a case file the moment it lands on the bench.',
    caption: 'CHAIN-OF-CUSTODY OPENED · TIMESTAMP NOTARIZED',
  },
  {
    id: 'examine',
    eyebrow: 'EXAMINER: VISION-4O // 02',
    title: 'AI examines the evidence.',
    body: 'A vision model inspects stitching, serials, sole geometry, and brand markers — cross-checked against reference exemplars. Confidence and provenance are written into the case file, not into a vibe.',
    caption: 'AI PASS RATE 98.4% · 14-POINT FORENSIC CHECKLIST',
  },
  {
    id: 'mint',
    eyebrow: 'MINT // 03',
    title: 'Certificate of authenticity, on-chain.',
    body: 'On a clean verdict, HypeChain mints a Solana NFT pinned to the dossier — image hash, examiner, confidence, IPFS report. The certificate is what trades on the marketplace, not the JPEG.',
    caption: 'SOLANA MAINNET · CERTIFICATE PINNED TO IPFS',
  },
] as const;

/* ───────────────  SECTION 2 — EVIDENCE LOCKER MOVES  ──────────────── */

export type EvidenceMove = {
  id: 'ribbon' | 'redaction' | 'certificate';
  eyebrow: string;
  title: string;
  body: string;
  /** EXHIBIT letter shown on the row's rule-breaking tag. */
  exhibit: 'A' | 'B' | 'C';
  /** Mono caption under the enlarged demo panel. */
  demoCaption: string;
};

export const EVIDENCE_MOVES: readonly EvidenceMove[] = [
  {
    id: 'ribbon',
    eyebrow: 'MOVE 01 // CHROME',
    title: 'Case-file ribbon.',
    body: 'Every app surface opens with a forensic header — case ID, intake time, examiner, chain. The page itself reads like a dossier.',
    exhibit: 'A',
    demoCaption: 'REPRODUCTION // APP CHROME, ACTUAL SIZE',
  },
  {
    id: 'redaction',
    eyebrow: 'MOVE 02 // STATE',
    title: 'Redaction bars.',
    body: 'Pending verifications render as literal █ blocks over price and seller. On clearance, the field unredacts at typewriter speed — proof, not a spinner.',
    exhibit: 'B',
    demoCaption: 'LIVE // UNREDACTS ON CLEARANCE',
  },
  {
    id: 'certificate',
    eyebrow: 'MOVE 03 // ARTIFACT',
    title: 'Mint certificate.',
    body: 'Every successful mint slides up a downloadable certificate — wordmark, case ID, examiner stamp. Built to be screenshotted.',
    exhibit: 'C',
    demoCaption: 'SPECIMEN // POST-MINT ARTIFACT',
  },
] as const;

/* ───────────────  SECTION 3 — MARKETPLACE PROOF  ──────────────────── */

export const PROOF_COPY = {
  eyebrow: 'THE VERIFIED FLOOR',
  title: 'Numbers from the locker.',
  /** Shown when verified listings exist. */
  subtitle: 'Live snapshot of the public floor. Every row above is a cleared case file.',
  /** Shown when state.listings is empty — the graceful invitation. */
  emptyTitle: 'The verified floor is open.',
  emptyBody:
    'No dossiers have cleared the public floor yet. File the first intake and watch the redaction bars unredact on-chain.',
  emptyCta: 'Open the marketplace →',
  /** Mono title on the terminal panel's header bar. */
  panelTitle: 'MARKET FEED // VERIFIED FLOOR',
  /** Placeholder row rendered while no dossier has cleared the floor. */
  emptyRow: 'AWAITING FIRST DOSSIER',
} as const;

/* ──────────────────  SECTION 4 — FINAL CTA BAND  ──────────────────── */

export const FINAL_CTA_COPY = {
  eyebrow: 'CASE OPEN',
  title: 'Trade the certificate, not the JPEG.',
  body: 'Join the waitlist for examiner access, or browse the verified floor right now.',
  primaryLabel: '[Join Waitlist]',
  primaryHref: '/waitlist',
  secondaryLabel: '[Marketplace]',
  secondaryHref: '/marketplace',
} as const;
