/**
 * Unit tests for the Activities page (visual restyle).
 *
 * Data logic is unchanged from the pre-restyle version — the apiClient.getActivities
 * useEffect, the client-side search filter, and the stats derivation all survived
 * the restyle. apiClient is mocked so these tests stay offline and deterministic.
 * They lock in the four render states (loading / error / empty / populated), the
 * search filter, and the address/timestamp formatting helpers (exercised through
 * the rendered rows).
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import type { ActivityItem } from '@/lib/api-client';

jest.mock('@/components/navigation', () => ({
  Navigation: () => <nav data-testid="navigation" />,
}));
jest.mock('@/components/case-file-ribbon', () => ({
  CaseFileRibbon: () => <div data-testid="case-file-ribbon" />,
}));
jest.mock('date-fns', () => ({
  formatDistanceToNow: () => '2 hours ago',
}));

const getActivities = jest.fn();
jest.mock('@/lib/api-client', () => ({
  apiClient: { getActivities: (...args: unknown[]) => getActivities(...args) },
}));

// Imported after the mock so the page picks up the mocked apiClient.
import ActivitiesPage from '@/app/activities/page';

const makeActivity = (overrides: Partial<ActivityItem> = {}): ActivityItem => ({
  id: 'a1',
  type: 'sale',
  nftName: 'Yeezy Boost 350',
  nftImage: null,
  from: '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU',
  to: 'Abc123def456ghi789jkl012mno345pqr678stu901vwx',
  price: 12,
  timestamp: Date.now(),
  txHash: 'TxHash1234567890abcdef',
  ...overrides,
});

const ok = (activities: ActivityItem[]) =>
  Promise.resolve({ success: true, data: { activities, nextCursor: null, hasMore: false } });

beforeEach(() => {
  getActivities.mockReset();
});

describe('ActivitiesPage', () => {
  it('shows the loading state before data resolves', async () => {
    let resolve: (v: unknown) => void = () => {};
    getActivities.mockReturnValueOnce(new Promise((r) => (resolve = r)));

    render(<ActivitiesPage />);
    expect(screen.getByText(/reading provenance ledger/i)).toBeInTheDocument();

    resolve(await ok([]));
  });

  it('renders activity rows once data resolves and formats the address short form', async () => {
    getActivities.mockReturnValueOnce(ok([makeActivity()]));
    render(<ActivitiesPage />);

    expect(await screen.findByText('Yeezy Boost 350')).toBeInTheDocument();
    // shortAddr: first4…last4
    expect(screen.getByText('7xKX…gAsU')).toBeInTheDocument();
    // formatTimestamp routed through mocked date-fns
    expect(screen.getByText('2 hours ago')).toBeInTheDocument();
  });

  it('renders the error state when the API reports failure', async () => {
    getActivities.mockReturnValueOnce(
      Promise.resolve({ success: false, error: 'Indexer offline' }),
    );
    render(<ActivitiesPage />);

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.getByText('Indexer offline')).toBeInTheDocument();
  });

  it('renders the day-one empty state when no activities are returned', async () => {
    getActivities.mockReturnValueOnce(ok([]));
    render(<ActivitiesPage />);

    expect(await screen.findByText(/ledger is empty/i)).toBeInTheDocument();
  });

  it('filters the feed by the client-side search query', async () => {
    getActivities.mockReturnValueOnce(
      ok([
        makeActivity({ id: 'a1', nftName: 'Yeezy Boost 350', txHash: 'TX_A' }),
        makeActivity({ id: 'a2', nftName: 'Foam Runner', txHash: 'TX_B' }),
      ]),
    );
    render(<ActivitiesPage />);

    await screen.findByText('Yeezy Boost 350');
    fireEvent.change(screen.getByLabelText('Search activity'), { target: { value: 'foam' } });

    await waitFor(() => {
      expect(screen.queryByText('Yeezy Boost 350')).not.toBeInTheDocument();
    });
    expect(screen.getByText('Foam Runner')).toBeInTheDocument();
  });

  it('omits the recipient arrow and renders an em-dash when a row has no counterparty', async () => {
    // Mints/transfers can arrive with from/to null — the row must not render the
    // "→ recipient" segment and shortAddr must fall back to '—'.
    getActivities.mockReturnValueOnce(ok([makeActivity({ type: 'mint', from: null, to: null })]));
    render(<ActivitiesPage />);

    await screen.findByText('Yeezy Boost 350');
    // The bare counterparty arrow span is exact-text '→'; absent when `to` is null.
    expect(screen.queryByText('→')).not.toBeInTheDocument();
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
  });

  it('re-queries the API when a type filter chip is selected', async () => {
    getActivities.mockReturnValue(ok([]));
    render(<ActivitiesPage />);

    await screen.findByText(/ledger is empty/i);
    // First call (mount) is the unfiltered 'all' query.
    expect(getActivities).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: /^sale$/i }));

    await waitFor(() => expect(getActivities).toHaveBeenCalledTimes(2));
    expect(getActivities).toHaveBeenLastCalledWith({ type: 'sale' });
  });
});
