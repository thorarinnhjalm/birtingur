import { test, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { OpsHealthCard, type OpsDiagnosticsData } from './OpsHealthCard';

function data(overrides: Partial<OpsDiagnosticsData> = {}): OpsDiagnosticsData {
  return {
    checkedAt: new Date('2026-08-11T12:00:00Z').toISOString(),
    redis: {
      status: 'ok',
      queues: { stats: 4, accrual: 2, legacy: 0 },
      oldestStatsEventAgeSeconds: 60,
    },
    crons: [
      { name: 'cron-accrue', ageMinutes: 5, stalenessThresholdMinutes: 45, stale: false },
      { name: 'cron-aggregate', ageMinutes: 20, stalenessThresholdMinutes: 130, stale: false },
    ],
    env: { CRON_SECRET: true, REDIS: true, FIREBASE_PRIVATE_KEY: true, SIGNING_SECRET: true },
    healthy: true,
    problems: [],
    ...overrides,
  };
}

test('says plainly that everything is fine when it is', () => {
  render(<OpsHealthCard data={data()} />);

  expect(screen.getByText(/Allt í lagi/)).toBeTruthy();
});

test('lists the actual problems instead of a generic failure', () => {
  render(
    <OpsHealthCard
      data={data({
        healthy: false,
        problems: ['cron-accrue hefur ekki keyrt í 120 mínútur.'],
        crons: [
          { name: 'cron-accrue', ageMinutes: 120, stalenessThresholdMinutes: 45, stale: true },
        ],
      })}
    />,
  );

  expect(screen.getByText(/cron-accrue hefur ekki keyrt í 120 mínútur/)).toBeTruthy();
  expect(screen.queryByText(/Allt í lagi/)).toBeNull();
});

// A fresh deploy has no heartbeats yet. That must not read as a dead cron.
test('shows a never-run cron as unknown rather than as a failure', () => {
  render(
    <OpsHealthCard
      data={data({
        crons: [
          { name: 'cron-accrue', ageMinutes: null, stalenessThresholdMinutes: 45, stale: false },
        ],
      })}
    />,
  );

  expect(screen.getByText('Aldrei keyrt')).toBeTruthy();
});

test('labels each cron by what it does, not just its id', () => {
  render(<OpsHealthCard data={data()} />);

  expect(screen.getByText('Bókar tekjur af birtingum')).toBeTruthy();
  expect(screen.getByText('Tekur saman tölfræði')).toBeTruthy();
});

test('distinguishes unconfigured Redis from a Redis outage', () => {
  const { unmount } = render(<OpsHealthCard data={data({ redis: { status: 'unconfigured' } })} />);
  expect(screen.getByText(/ekki stillt/)).toBeTruthy();
  unmount();

  render(<OpsHealthCard data={data({ redis: { status: 'error', message: 'timeout' } })} />);
  expect(screen.getByText(/timeout/)).toBeTruthy();
});

test('surfaces a missing required secret by name', () => {
  render(
    <OpsHealthCard
      data={data({
        env: { CRON_SECRET: true, REDIS: true, FIREBASE_PRIVATE_KEY: true, SIGNING_SECRET: false },
      })}
    />,
  );

  expect(screen.getByText('SIGNING_SECRET')).toBeTruthy();
});

test('renders a loading state instead of crashing before data arrives', () => {
  render(<OpsHealthCard />);

  expect(screen.getByText(/Hleð stöðu/)).toBeTruthy();
});
