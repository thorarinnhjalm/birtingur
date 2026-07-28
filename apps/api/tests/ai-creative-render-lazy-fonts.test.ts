import { describe, it, expect, vi, beforeEach } from 'vitest';

// Fix 3 (adversarial review): services/ai-creative/render.ts used to resolve
// its bundled .ttf font paths via createRequire at MODULE TOP LEVEL. Since
// render.ts is transitively imported by api/index.js (which serves every
// route), a missing/mis-bundled font asset in the Vercel deploy would throw
// at IMPORT time and 500 the entire API, not just /v1/creatives/generate.
// The fix moves resolution inside renderSvgToPng, lazily, memoized after the
// first success. These tests exercise that behavior directly by mocking
// node:module's createRequire so resolution fails on demand.
describe('ai-creative render.ts lazy font resolution', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.doUnmock('node:module');
  });

  it('does not throw at import time even when font resolution would fail', async () => {
    vi.doMock('node:module', () => ({
      createRequire: () => {
        throw new Error('simulated: font module not resolvable in this bundle');
      },
    }));

    // Must succeed — proves the module has no top-level call into
    // createRequire()/require.resolve() anymore.
    await expect(import('../src/services/ai-creative/render')).resolves.toBeDefined();
  });

  it('scopes a font-resolution failure to renderSvgToPng itself, with a clear /generate-scoped message', async () => {
    vi.doMock('node:module', () => ({
      createRequire: () => {
        throw new Error('simulated: font module not resolvable in this bundle');
      },
    }));

    const { renderSvgToPng } = await import('../src/services/ai-creative/render');
    expect(() => renderSvgToPng('<svg></svg>')).toThrow(/creatives\/generate/);
  });

  it('renders successfully (real fonts) across multiple calls — memoized resolution does not break repeat use', async () => {
    const { renderSvgToPng } = await import('../src/services/ai-creative/render');
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="20">' +
      '<rect width="40" height="20" fill="#10265c"/>' +
      '<text x="2" y="14" font-family="Inter" font-size="10" fill="#fff">Hi</text>' +
      '</svg>';

    const first = renderSvgToPng(svg);
    const second = renderSvgToPng(svg);
    expect(first.length).toBeGreaterThan(0);
    expect(second.length).toBeGreaterThan(0);
  });
});
