/**
 * Tests for <CaseFileRibbon> (components/case-file-ribbon.tsx).
 *
 * Covers the deterministic render branches of the ISSUE-011 hydration fix.
 * The SSR-vs-client hydration contract itself is verified out-of-band (the
 * server HTML emits the '--:--:--' placeholder); jsdom can't reproduce SSR,
 * so here we assert the two jsdom-observable branches:
 *   - a supplied `intake` renders its deterministic EST time directly, and
 *   - with no `intake`, the client effect fills a live HH:MM:SS after mount.
 */

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { CaseFileRibbon } =
  require('@/components/case-file-ribbon') as typeof import('@/components/case-file-ribbon');

describe('CaseFileRibbon', () => {
  it('renders a supplied intake as a fixed EST time (deterministic branch)', () => {
    // 2026-06-16T17:30:45Z → America/New_York (EDT, UTC-4) → 13:30:45.
    render(<CaseFileRibbon caseId={null} intake="2026-06-16T17:30:45.000Z" />);

    expect(screen.getByText(/INTAKE 13:30:45 EST/)).toBeInTheDocument();
    // Deterministic input must never fall back to the placeholder.
    expect(screen.queryByText(/--:--:--/)).not.toBeInTheDocument();
    // Defaults render.
    expect(screen.getByText(/EXAMINER: VISION-4O/)).toBeInTheDocument();
    expect(screen.getByText(/CHAIN: SOL/)).toBeInTheDocument();
  });

  it('fills the live clock after mount when no intake is supplied', async () => {
    const { container } = render(<CaseFileRibbon caseId={null} />);

    // After the client-only effect runs, the placeholder is replaced by a real
    // HH:MM:SS time — it must not stay stuck on '--:--:--'.
    await waitFor(() => {
      expect(container.textContent).toMatch(/INTAKE \d{2}:\d{2}:\d{2} EST/);
    });
    expect(container.textContent).not.toContain('--:--:--');
  });

  it('omits the case number when caseId is null', () => {
    render(<CaseFileRibbon caseId={null} intake="2026-06-16T17:30:45.000Z" />);
    expect(screen.queryByText(/HC.\d/)).not.toBeInTheDocument();
  });
});
