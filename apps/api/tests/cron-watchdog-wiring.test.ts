import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';

// The dead-man's switch (checkCronHeartbeats) must be hosted by MORE THAN ONE
// cron: whichever single cron hosts it, that cron dying silences the alerting
// for every other cron — which is exactly what happened when cron-aggregate
// 504'd hourly on 2026-08-11 and nothing anywhere said so. Two hosts close
// that for the pair (see the module docstring in services/ops-alerts.ts).
//
// This is a wiring fact in the untypechecked committed-JS entrypoints, so no
// behaviour test can see it — a tidy-up that drops one call site would pass
// every other suite. Reading the entrypoint source is ugly and correct.
//
// If this test is failing because the wiring CHANGED ON PURPOSE, the bar is:
// at least two independently scheduled crons call checkCronHeartbeats, and
// only the hourly one runs the queue-depth growth checks (a 10-minute
// sampling interval would flag the normal pile-up between cron-accrue runs
// as a backlog — see the includeQueueDepth note in ops-alerts.ts).

const here = dirname(fileURLToPath(import.meta.url));

/** Entrypoint source with comments stripped, so "retry"/"entrypoint" in prose
 *  can never satisfy a structural assertion — adversarial review showed the
 *  raw-source variant passing with the real try/catch deleted and the word
 *  "retry" sitting in a nearby comment. */
function entrypoint(name: string): string {
  return readFileSync(resolve(here, `../api/${name}`), 'utf8')
    .replace(/\/\/[^\n]*/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '');
}

describe('cron watchdog wiring (api/*.js entrypoints)', () => {
  it('cron-aggregate hosts the watchdog with the queue-depth checks on', () => {
    const src = entrypoint('cron-aggregate.js');
    // The paren matters: the bare name is satisfied by the import statement
    // alone (mutation-tested — deleting the call passed a `toContain` pin).
    expect(src).toMatch(/await checkCronHeartbeats\(/);
    // The hourly caller must NOT pass includeQueueDepth: false — it is the
    // one caller whose interval makes the growth baselines meaningful.
    expect(src).not.toMatch(/includeQueueDepth:\s*false/);
  });

  it('cron-refresh-cache hosts the watchdog too, staleness-only', () => {
    const src = entrypoint('cron-refresh-cache.js');
    expect(src).toMatch(/await checkCronHeartbeats\(/);
    expect(src).toMatch(/includeQueueDepth:\s*false/);
  });

  it('the second host cannot take down the cache refresh it rides on', () => {
    // The watchdog call in cron-refresh-cache must be isolated: the cache
    // refresh is what keeps ads serving (budget:{id} keys carry a 1h TTL and
    // the serve gate is fail-closed), so a throwing watchdog must never
    // propagate. Pinned structurally on comment-stripped source: a dedicated
    // `try {` opens between the heartbeat write and the watchdog call, and a
    // `catch` follows the call. Not a full parser, but it kills the realistic
    // mutations (guard deleted, call moved out of the guard).
    const src = entrypoint('cron-refresh-cache.js');
    const callIndex = src.indexOf('checkCronHeartbeats(');
    const recordIndex = src.indexOf("recordHeartbeat('cron-refresh-cache')");
    expect(callIndex).toBeGreaterThan(-1);
    expect(recordIndex).toBeGreaterThan(-1);

    const between = src.slice(recordIndex, callIndex);
    expect(between).toMatch(/try\s*\{/);
    const afterCall = src.slice(callIndex);
    expect(afterCall).toMatch(/\}\s*catch/);
  });
});
