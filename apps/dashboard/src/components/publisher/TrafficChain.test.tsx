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
      requestsWithFillData={3000}
      impressionsWithFillData={2000}
      requestsWithTrafficData={3000}
      impressions={2000}
      measurementStartLabel="9. ágúst 2026"
      fillMeasurementStartLabel="14. ágúst 2026"
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

/**
 * The counter that feeds `unfilled` started on 2026-08-14, so until a window is
 * fully measured its unfilled count covers fewer days than its request count.
 * Dividing one by the other compared two different periods: a 30-day window put
 * 30 days of requests under 1 day of unfilled, and a site with a real 50% fill
 * rate rendered 98% — in green — while the copy below blamed the publisher's
 * slot placement for inventory we had failed to sell.
 *
 * Every figure in the fill half of the chain now comes from the measured days,
 * and the step says which days those are.
 */
test('computes fill over the measured days, not the whole window', () => {
  // 30 days of traffic, one measured day: 1.000 requests of which 500 found no
  // advertiser. That is 50%, and 98% against the full 30.000.
  chain({
    requests: 30_000,
    unfilled: 500,
    requestsWithFillData: 1000,
    impressionsWithFillData: 400,
    impressions: 12_000,
  });

  expect(screen.getByText('50% seldust')).toBeDefined();
  expect(document.body.textContent).not.toContain('98% seldust');
});

test('says which days the fill figures cover when they are a shorter window', () => {
  chain({
    requests: 30_000,
    unfilled: 500,
    requestsWithFillData: 1000,
    impressionsWithFillData: 400,
    impressions: 12_000,
  });

  // The denominator is on screen, so 50% can be checked against it.
  expect(screen.getByText(/af 1.000 beiðnum frá 14. ágúst 2026/)).toBeDefined();
});

test('measures the view rate against the same days as the fill rate', () => {
  // 400 of the 500 filled requests on the measured day became visible: 80%.
  // Against the whole window's 12.000 impressions it would have read 100% and
  // the gap below would have been negative.
  chain({
    requests: 30_000,
    unfilled: 500,
    requestsWithFillData: 1000,
    impressionsWithFillData: 400,
    impressions: 12_000,
  });

  expect(screen.getByText('80% sáust')).toBeDefined();
  expect(screen.getByText(/100 auglýsingar/)).toBeDefined();
  expect(document.body.textContent).not.toContain('-11.500');
});

test('requests per page view uses the days that measured page views', () => {
  // 3.000 requests against 1.000 page views on the measured days is 3,0. Against
  // the full window's 15.000 requests it would read 15,0 and imply five times
  // as many ad slots as the site has.
  chain({
    requests: 15_000,
    pageViewsTrue: 1000,
    requestsWithTrafficData: 3000,
  });

  expect(screen.getByText('3,0 beiðnir á flettingu')).toBeDefined();
  expect(document.body.textContent).not.toContain('15,0 beiðnir');
});

test('treats an unpaired unfilled count as unmeasured rather than guessing', () => {
  // An older API build, or a partial response. Falling back to the whole-window
  // request count here would quietly restore the very mismatch above.
  chain({ requestsWithFillData: undefined });

  expect(screen.getByText('ekki mælt')).toBeDefined();
  expect(document.body.textContent).not.toContain('seldust');
});

test('falls back to one honest ratio when the split was never measured', () => {
  // Every window before 2026-08-14. The component must not invent a split, and
  // must not present the combined figure as a fill rate.
  chain({ unfilled: undefined, requestsWithFillData: undefined });
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
  chain({
    pageViewsTrue: 0,
    requests: 0,
    unfilled: 0,
    requestsWithFillData: 0,
    impressionsWithFillData: 0,
    requestsWithTrafficData: 0,
    impressions: 0,
  });
  expect(document.body.textContent).not.toContain('NaN');
  expect(document.body.textContent).not.toContain('Infinity');
});

test('does not report a negative gap when impressions exceed filled requests', () => {
  // A late-firing impression pixel can land in a window whose request was
  // counted in the previous one, so impressions can briefly run ahead. Clamped
  // rather than rendered as "-50 auglýsingar hlóðust en sáust aldrei".
  chain({
    requests: 1000,
    unfilled: 0,
    requestsWithFillData: 1000,
    impressionsWithFillData: 1050,
    impressions: 1050,
  });
  expect(document.body.textContent).not.toContain('-50');
  expect(screen.queryByText(/sáust aldrei/)).toBeNull();
  // And the rate itself stops at 100 rather than reading "105% sáust", which
  // looks like a bug even though the underlying numbers are legitimate.
  expect(screen.getByText('100% sáust')).toBeDefined();
  expect(document.body.textContent).not.toContain('105%');
});

test('one definition of fill, shared by every surface that shows it', () => {
  // Three places compute fill from the same publisher's numbers: this chain,
  // the per-site table (Dashboard.tsx), the slot page (SlotDetail.tsx), and the
  // CSV export. They disagreed once — the table said 80% while the slot page and
  // the CSV said 50% for the same site and window, because those two were still
  // on impressions/requests. Under one word, "Fyllihlutfall", that is the exact
  // confusion this whole change exists to remove.
  //
  // The definition, in one place, is: filled requests over all requests, where
  // filled is requests minus unfilled. Impressions do not enter into it.
  chain({
    requests: 2000,
    unfilled: 400,
    requestsWithFillData: 2000,
    impressionsWithFillData: 1000,
    impressions: 1000,
  });

  expect(screen.getByText('80% seldust')).toBeDefined();
  // 50% would be impressions/requests, the definition the other surfaces used.
  expect(document.body.textContent).not.toContain('50% seldust');
});
