/**
 * Unit tests for the Collections page (visual restyle).
 *
 * Data logic is unchanged from the pre-restyle version: MOCK_COLLECTIONS is
 * hardcoded, so the page is fully synchronous (no API mock needed). These tests
 * lock in the user-facing behaviour that survived the restyle — search filter,
 * sort, grid/list toggle, the COL-### case label, and the empty state — so a
 * future refactor that breaks the logic gets caught.
 */

import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import CollectionsPage from '@/app/collections/page';

// Presentational chrome — not under test here. Stub to keep the render light.
jest.mock('@/components/navigation', () => ({
  Navigation: () => <nav data-testid="navigation" />,
}));
jest.mock('@/components/case-file-ribbon', () => ({
  CaseFileRibbon: () => <div data-testid="case-file-ribbon" />,
}));

describe('CollectionsPage', () => {
  it('renders all mock collections by default', () => {
    render(<CollectionsPage />);
    expect(screen.getByText('Yeezy Boost Collection')).toBeInTheDocument();
    expect(screen.getByText('Foam Runner Series')).toBeInTheDocument();
    expect(screen.getByText('QNTM Collection')).toBeInTheDocument();
  });

  it('renders the forensic case label (COL-### zero-padded) for a collection', () => {
    render(<CollectionsPage />);
    // id '1' -> COL-001 (appears in the card strip)
    expect(screen.getAllByText('COL-001').length).toBeGreaterThan(0);
  });

  it('filters collections by search query (name / creator / description)', () => {
    render(<CollectionsPage />);
    const search = screen.getByLabelText('Search collections');
    fireEvent.change(search, { target: { value: 'Foam' } });

    expect(screen.getByText('Foam Runner Series')).toBeInTheDocument();
    expect(screen.queryByText('Yeezy Boost Collection')).not.toBeInTheDocument();
  });

  it('also filters by creator and description fragments (not just name)', () => {
    render(<CollectionsPage />);
    const search = screen.getByLabelText('Search collections');

    // '742d35' appears only in Yeezy Boost Collection's creator (0x742d35…a5f4),
    // never in any name — exercises the creator arm of the filter predicate.
    fireEvent.change(search, { target: { value: '742d35' } });
    expect(screen.getByText('Yeezy Boost Collection')).toBeInTheDocument();
    expect(screen.queryByText('Foam Runner Series')).not.toBeInTheDocument();

    // 'masterpieces' appears only in 700 V3 Archive's description, not its name —
    // exercises the description arm.
    fireEvent.change(search, { target: { value: 'masterpieces' } });
    expect(screen.getByText('700 V3 Archive')).toBeInTheDocument();
    expect(screen.queryByText('Yeezy Boost Collection')).not.toBeInTheDocument();
  });

  it('shows the search-active empty state with a Clear Search action when nothing matches', () => {
    render(<CollectionsPage />);
    const search = screen.getByLabelText('Search collections');
    fireEvent.change(search, { target: { value: 'zzz-no-such-collection' } });

    expect(screen.getByText('No Collections Found')).toBeInTheDocument();
    const clear = screen.getByRole('button', { name: /clear search/i });
    expect(clear).toBeInTheDocument();

    // Clearing restores the full list.
    fireEvent.click(clear);
    expect(screen.getByText('Yeezy Boost Collection')).toBeInTheDocument();
  });

  it('toggles between grid and list views', () => {
    render(<CollectionsPage />);
    const gridBtn = screen.getByRole('button', { name: 'Grid view' });
    const listBtn = screen.getByRole('button', { name: 'List view' });

    // Grid is the default.
    expect(gridBtn).toHaveAttribute('aria-pressed', 'true');
    expect(listBtn).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(listBtn);
    expect(listBtn).toHaveAttribute('aria-pressed', 'true');
    expect(gridBtn).toHaveAttribute('aria-pressed', 'false');

    // List rows surface the case label inline (grid puts it in the strip).
    expect(screen.getAllByText(/COL-\d{3}/).length).toBeGreaterThan(0);
  });

  it('sorts by name (A–Z) when chosen from the sort dropdown', () => {
    render(<CollectionsPage />);
    // Open the sort menu and pick Name (A–Z).
    fireEvent.click(screen.getByRole('button', { name: /sort:/i }));
    fireEvent.click(screen.getByRole('option', { name: 'Name (A–Z)' }));

    const headings = screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent);
    const sorted = [...headings].sort((a, b) => (a ?? '').localeCompare(b ?? ''));
    expect(headings).toEqual(sorted);
  });

  it('marks verified vs unverified collections', () => {
    render(<CollectionsPage />);
    // 5 verified in MOCK_COLLECTIONS, 3 unverified.
    expect(screen.getAllByText('Verified').length).toBe(5);
    expect(screen.getAllByText('Unverified').length).toBe(3);
  });
});
