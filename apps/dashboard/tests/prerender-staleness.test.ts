import { describe, it, expect } from 'vitest';
// @ts-expect-error - plain .mjs build script, intentionally untyped
import { findStaleSources } from '../scripts/prerender-lib.mjs';

/**
 * prerender:capture renders the built dist/, not src/. It only ever checked
 * that dist/index.html EXISTS, never that it was current, so running capture
 * without building first silently recaptured the previous build's copy and
 * reported success — the snapshot cache then shipped stale text to crawlers.
 */
describe('findStaleSources', () => {
  it('reports nothing when every source predates the build', () => {
    expect(findStaleSources(2000, [{ path: 'src/a.tsx', mtimeMs: 1000 }])).toEqual([]);
  });

  it('reports the sources modified after the build', () => {
    const stale = findStaleSources(1000, [
      { path: 'src/a.tsx', mtimeMs: 500 },
      { path: 'src/b.tsx', mtimeMs: 1500 },
      { path: 'src/c.tsx', mtimeMs: 2500 },
    ]);
    expect(stale).toEqual(['src/b.tsx', 'src/c.tsx']);
  });

  it('treats a source saved in the same millisecond as the build as fresh', () => {
    expect(findStaleSources(1000, [{ path: 'src/a.tsx', mtimeMs: 1000 }])).toEqual([]);
  });

  it('handles an empty source list', () => {
    expect(findStaleSources(1000, [])).toEqual([]);
  });
});
