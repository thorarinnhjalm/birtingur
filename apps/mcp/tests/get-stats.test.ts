import { describe, it, expect } from 'vitest';
import { statsPath } from '../src/tools/publisher/get-stats.js';

/**
 * The tool accepted `period: '7d' | '30d'` and sent it as `?period=...`, but
 * `GET /v1/publishers/me/stats` reads `timeframe` and compares it to the string
 * `'30'`. The parameter was therefore dropped and every call fell through to
 * the route's 7-day default — both periods returned identical numbers, with
 * nothing in the response to say so, while the tool described itself as
 * answering "fyrir valið tímabil".
 *
 * These assert the exact query string, because that string is the contract:
 * apps/api/src/routes/publishers.ts does `c.req.query('timeframe') === '30'`.
 */
describe('statsPath', () => {
  it('asks for 30 days as the route actually parses it', () => {
    expect(statsPath('30d')).toBe('/v1/publishers/me/stats?timeframe=30');
  });

  it('asks for 7 days as the route actually parses it', () => {
    expect(statsPath('7d')).toBe('/v1/publishers/me/stats?timeframe=7');
  });

  it('sends a different request for each period', () => {
    // The bug was not a wrong value but an ignored one: both periods produced
    // the same effective request.
    expect(statsPath('7d')).not.toBe(statsPath('30d'));
  });

  it('never sends the parameter name the route ignores', () => {
    expect(statsPath('30d')).not.toContain('period=');
  });
});
