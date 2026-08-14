import { test, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TrafficChain } from './TrafficChain';

/**
 * The chain exists to make one number reconcilable and to keep two unrelated
 * failures apart. Both of those are arithmetic, so they are testable.
 */

function chain(props: Partial<Parameters<typeof TrafficChain>[0]> = {}) {
  render(
    <TrafficChain
      pageViewsTrue={1000}
      requests={3000}
      unfilled={600}
      impressions={2000}
      measurementStartLabel="9. ágúst 2026"
      {...props}
    />,
  );
}

test('every step is shown, so the percentages can be checked against them', () => {
  // The whole complaint was that a publisher saw a fill rate whose denominator
  // appeared nowhere. 1.000 page views, 3.000 requests, 600 of them unfilled
  // leaves 2.400 filled, of which 2.000 were seen.
  chain();
  expect(screen.getByText('1.000')).toBeDefined();
  expect(screen.getByText('3.000')).toBeDefined();
  expect(screen.getByText('2.400')).toBeDefined();
  expect(screen.getByText('2.000')).toBeDefined();
});

test('names the two gaps separately, because they have different owners', () => {
  // 600 unfilled is ours to fix by finding advertisers. 400 filled-but-unseen is
  // the publisher's, by moving the slot up the page. A single "80% fill" number
  // tells neither of us anything.
  chain();
  expect(screen.getByText(/600 beiðnir/)).toBeDefined();
  expect(screen.getByText(/400 auglýsingar/)).toBeDefined();
});

test('fill is filled over requests, not impressions over requests', () => {
  // 2400/3000 = 80%. The old ratio, 2000/3000, would read 67% and would silently
  // blame the publisher for demand we failed to sell.
  chain();
  expect(screen.getByText('80% seldust')).toBeDefined();
});

test('the view rate is measured against filled requests, not all of them', () => {
  // 2000/2400 = 83%. Against all 3000 requests it would read 67% and punish the
  // publisher for slots that never had an ad to show in the first place.
  chain();
  expect(screen.getByText('83% sáust')).toBeDefined();
});

test('shows requests per page view rather than claiming a slot count', () => {
  // 3000/1000 = 3,0. This is a ratio, not a fact about the page: a slot below
  // the fold that never loads does not produce a request, so the number is not
  // the same as "how many ad slots this site has".
  chain();
  expect(screen.getByText('3,0 beiðnir á flettingu')).toBeDefined();
});

test('falls back to one honest ratio when the split was never measured', () => {
  // Every window before 2026-08-14. The component must not invent a split, and
  // must not present the combined figure as a fill rate.
  chain({ unfilled: undefined });
  expect(screen.getByText('ekki mælt')).toBeDefined();
  // 2000/3000 = 67%, described as requests that became a visible ad.
  expect(screen.getByText(/67%/)).toBeDefined();
  expect(screen.queryByText(/seldust/)).toBeNull();
});

test('says measurement has not started rather than showing a false zero', () => {
  chain({ pageViewsTrue: undefined });
  expect(screen.getByText(/Nákvæm mæling hófst 9. ágúst 2026/)).toBeDefined();
});

test('never divides by zero on a brand-new site', () => {
  chain({ pageViewsTrue: 0, requests: 0, unfilled: 0, impressions: 0 });
  expect(document.body.textContent).not.toContain('NaN');
  expect(document.body.textContent).not.toContain('Infinity');
});

test('does not report a negative gap when impressions exceed filled requests', () => {
  // A late-firing impression pixel can land in a window whose request was
  // counted in the previous one, so impressions can briefly run ahead. Clamped
  // rather than rendered as "-50 auglýsingar hlóðust en sáust aldrei".
  chain({ requests: 1000, unfilled: 0, impressions: 1050 });
  expect(document.body.textContent).not.toContain('-50');
  expect(screen.queryByText(/sáust aldrei/)).toBeNull();
  // And the rate itself stops at 100 rather than reading "105% sáust", which
  // looks like a bug even though the underlying numbers are legitimate.
  expect(screen.getByText('100% sáust')).toBeDefined();
  expect(document.body.textContent).not.toContain('105%');
});
