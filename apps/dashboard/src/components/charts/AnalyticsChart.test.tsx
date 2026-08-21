import { test, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AnalyticsChart } from './AnalyticsChart';

// Recharts' <ResponsiveContainer> needs ResizeObserver, which jsdom doesn't
// implement — same stub as apps/dashboard/src/pages/publisher/Dashboard.test.tsx.
class MockResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal('ResizeObserver', MockResizeObserver);

const PRE_SWITCH_DATA = [
  { date: '2026-08-01', impressions: 10, clicks: 1, spendIsk: 100, pageviews: 20 },
  { date: '2026-08-02', impressions: 15, clicks: 2, spendIsk: 150, pageviews: 25 },
];

const POST_SWITCH_DATA = [
  {
    date: '2026-08-09',
    impressions: 10,
    clicks: 1,
    spendIsk: 100,
    pageviews: 20,
    pageViewsTrue: 8,
  },
  {
    date: '2026-08-10',
    impressions: 15,
    clicks: 2,
    spendIsk: 150,
    pageviews: 25,
    pageViewsTrue: 12,
  },
];

test('selecting the traffic tab on a pre-switch-only window shows the muted explanation instead of a blank chart', () => {
  render(<AnalyticsChart data={PRE_SWITCH_DATA} mode="publisher" />);

  fireEvent.click(screen.getByRole('button', { name: 'Síðuflettingar' }));

  expect(screen.getByText(/Nákvæm umferðarmæling hófst/)).toBeDefined();
});

test('selecting the traffic tab on a window with true pageviews renders the chart, not the note', () => {
  render(<AnalyticsChart data={POST_SWITCH_DATA} mode="publisher" />);

  fireEvent.click(screen.getByRole('button', { name: 'Síðuflettingar' }));

  expect(screen.queryByText(/Nákvæm umferðarmæling hófst/)).toBeNull();
});

test('the default (impressions) tab never shows the traffic-measurement note', () => {
  render(<AnalyticsChart data={PRE_SWITCH_DATA} mode="publisher" />);

  expect(screen.queryByText(/Nákvæm umferðarmæling hófst/)).toBeNull();
});
