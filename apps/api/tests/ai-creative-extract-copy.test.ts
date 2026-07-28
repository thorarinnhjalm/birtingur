import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { extractSiteContext, ruleBasedCopyVariants } from '../src/services/ai-creative/index';
import { GeminiCreativeGenerator } from '../src/services/ai-creative/gemini';
import { StubCreativeGenerator } from '../src/services/ai-creative/stub';

const FIXTURE_HTML = `<!DOCTYPE html>
<html lang="is">
  <head>
    <title>Blómabúð Vesturbæjar - Ferskir blómvendir</title>
    <meta name="description" content="Falleg blóm og blómvendir send samdægurs um allt land.">
    <meta property="og:site_name" content="Blómabúð Vesturbæjar">
    <meta property="og:image" content="/images/hero.jpg">
  </head>
  <body>Efni síðunnar</body>
</html>`;

describe('extractSiteContext', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('extracts title, description, site name and resolves og:image against the final URL', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(FIXTURE_HTML, { headers: { 'content-type': 'text/html' } })),
    );

    const ctx = await extractSiteContext('https://blomabud.is/');

    expect(ctx.title).toBe('Blómabúð Vesturbæjar - Ferskir blómvendir');
    expect(ctx.description).toContain('Falleg blóm');
    expect(ctx.siteName).toBe('Blómabúð Vesturbæjar');
    expect(ctx.ogImage).toBe('https://blomabud.is/images/hero.jpg');
  });

  it('falls back to the hostname as siteName when og:site_name is missing', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response('<title>Test</title>', { headers: { 'content-type': 'text/html' } }),
      ),
    );

    const ctx = await extractSiteContext('https://8.8.8.8/');
    expect(ctx.siteName).toBe('8.8.8.8');
  });

  it('never throws on a page with no meta tags at all', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('<html><body>Ekkert hér</body></html>')),
    );

    const ctx = await extractSiteContext('https://8.8.8.8/');
    expect(ctx.title).toBe('');
    expect(ctx.description).toBe('');
    expect(ctx.ogImage).toBeUndefined();
  });
});

describe('ruleBasedCopyVariants', () => {
  it('produces exactly n variants, each within the character caps', () => {
    const variants = ruleBasedCopyVariants(
      { url: 'https://a.is', title: 'A', description: 'B'.repeat(200), siteName: 'A' },
      3,
    );
    expect(variants).toHaveLength(3);
    for (const v of variants) {
      expect(v.headline.length).toBeLessThanOrEqual(30);
      expect(v.subline.length).toBeLessThanOrEqual(60);
      expect(v.cta.length).toBeLessThanOrEqual(15);
    }
  });

  it('clamps n to at least 1 and at most the number of built-in variants', () => {
    const ctx = { url: 'https://a.is', title: 'A', description: '', siteName: 'A' };
    expect(ruleBasedCopyVariants(ctx, 0)).toHaveLength(1);
    expect(ruleBasedCopyVariants(ctx, 99)).toHaveLength(3);
  });
});

describe('GeminiCreativeGenerator without GEMINI_API_KEY', () => {
  const originalKey = process.env.GEMINI_API_KEY;

  beforeEach(() => {
    delete process.env.GEMINI_API_KEY;
  });

  afterEach(() => {
    if (originalKey) process.env.GEMINI_API_KEY = originalKey;
  });

  it('generateCopy falls back to rule-based variants (keyless pipeline works end-to-end)', async () => {
    const gen = new GeminiCreativeGenerator();
    const ctx = { url: 'https://a.is', title: 'Titill', description: 'Lýsing', siteName: 'A' };
    const variants = await gen.generateCopy(ctx, 2);
    expect(variants).toEqual(ruleBasedCopyVariants(ctx, 2));
  });

  it('generateBackground returns null (flat-template fallback)', async () => {
    const gen = new GeminiCreativeGenerator();
    const ctx = { url: 'https://a.is', title: 'Titill', description: 'Lýsing', siteName: 'A' };
    const bg = await gen.generateBackground(ctx, 0);
    expect(bg).toBeNull();
  });
});

describe('StubCreativeGenerator', () => {
  it('is deterministic and never calls the network', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => {
        throw new Error('StubCreativeGenerator must never call fetch');
      }),
    );
    const gen = new StubCreativeGenerator();
    const ctx = { url: 'https://a.is', title: 'Titill', description: 'Lýsing', siteName: 'A' };
    const variants = await gen.generateCopy(ctx, 2);
    expect(variants).toHaveLength(2);
    expect(await gen.generateBackground(ctx, 0)).toBeNull();
    vi.unstubAllGlobals();
  });
});
