import { AnalyticsChart } from '@ada/dashboard';

// AnalyticsChart doesn't expose recharts' isAnimationActive, so in a static capture
// the area path gets clipped mid-draw. react-smooth measures elapsed time from rAF
// timestamps (now - beginTime), so add a CUMULATIVE skew: each frame appears 2s after
// the previous one and the 1.5s draw animation completes by the second frame.
if (typeof window !== 'undefined' && !(window as any).__dsRafSkewed) {
  (window as any).__dsRafSkewed = true;
  const orig = window.requestAnimationFrame.bind(window);
  let skew = 0;
  window.requestAnimationFrame = (cb: FrameRequestCallback) =>
    orig((t) => {
      skew += 2000;
      cb(t + skew);
    });
}

// 14 days of plausible network data (impressions in the thousands, CTR ~1.5%).
const history = [
  { date: '2026-06-15', impressions: 4180, clicks: 61, spendIsk: 3520, pageviews: 6900 },
  { date: '2026-06-16', impressions: 4520, clicks: 72, spendIsk: 3800, pageviews: 7350 },
  { date: '2026-06-17', impressions: 3960, clicks: 55, spendIsk: 3330, pageviews: 6410 },
  { date: '2026-06-18', impressions: 5240, clicks: 89, spendIsk: 4400, pageviews: 8540 },
  { date: '2026-06-19', impressions: 6110, clicks: 104, spendIsk: 5130, pageviews: 9820 },
  { date: '2026-06-20', impressions: 7480, clicks: 128, spendIsk: 6280, pageviews: 11960 },
  { date: '2026-06-21', impressions: 6890, clicks: 110, spendIsk: 5790, pageviews: 11020 },
  { date: '2026-06-22', impressions: 5030, clicks: 76, spendIsk: 4230, pageviews: 8110 },
  { date: '2026-06-23', impressions: 5460, clicks: 82, spendIsk: 4590, pageviews: 8790 },
  { date: '2026-06-24', impressions: 4870, clicks: 66, spendIsk: 4090, pageviews: 7860 },
  { date: '2026-06-25', impressions: 5720, clicks: 95, spendIsk: 4800, pageviews: 9230 },
  { date: '2026-06-26', impressions: 6340, clicks: 101, spendIsk: 5330, pageviews: 10250 },
  { date: '2026-06-27', impressions: 7120, clicks: 121, spendIsk: 5980, pageviews: 11480 },
  { date: '2026-06-28', impressions: 6580, clicks: 108, spendIsk: 5530, pageviews: 10640 },
];

// Publisher dashboard usage: <AnalyticsChart data={stats.history} mode="publisher" />
// Explicitly sized wrapper so recharts ResponsiveContainer can paint in a static card.
export const Publisher = () => (
  <div
    style={{
      width: 700,
      background: '#ffffff',
      border: '1px solid #e2e8f0',
      borderRadius: 12,
      padding: 20,
    }}
  >
    <AnalyticsChart data={history} mode="publisher" />
  </div>
);

// Advertiser campaign detail usage: mode="advertiser" (money tab reads "Kostnaður").
export const Advertiser = () => (
  <div
    style={{
      width: 700,
      background: '#ffffff',
      border: '1px solid #e2e8f0',
      borderRadius: 12,
      padding: 20,
    }}
  >
    <AnalyticsChart data={history} mode="advertiser" />
  </div>
);
