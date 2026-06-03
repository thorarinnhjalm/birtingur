import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { scrapeAndClassifyDomain } from '../src/services/domain-classifier';

vi.mock('../src/lib/firebase', () => ({
  db: {
    doc: vi.fn().mockReturnValue({
      get: vi.fn().mockResolvedValue({
        exists: false,
      }),
    }),
  },
}));

describe('Domain Classifier Service', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('correctly parses titles and description, and classifies as sports', async () => {
    const mockHtml = `
      <html>
        <head>
          <title>Fótbolti.net - Íslenskar íþróttir</title>
          <meta name="description" content="Nýjustu fréttir og úrslit í fótbolta og öðrum íþróttum á Íslandi.">
          <meta name="keywords" content="íþróttir, fótbolti, handbolti">
        </head>
        <body>Efni síðu</body>
      </html>
    `;

    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      text: async () => mockHtml,
    } as any);

    const result = await scrapeAndClassifyDomain('fotbolti.net');

    expect(result.title).toContain('Fótbolti.net');
    expect(result.description).toContain('Nýjustu fréttir og úrslit');
    expect(result.category).toBe('sports');
    expect(result.confidence).toBeGreaterThanOrEqual(0.6);
  });

  it('falls back to "other" with lower confidence if no matches are found', async () => {
    const mockHtml = `
      <html>
        <head>
          <title>Eitthvað dularfullt heiti</title>
        </head>
        <body>Ekkert sérstakt efni hér.</body>
      </html>
    `;

    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      text: async () => mockHtml,
    } as any);

    const result = await scrapeAndClassifyDomain('mysterious-site.is');
    expect(result.category).toBe('other');
    expect(result.confidence).toBeLessThanOrEqual(0.5);
  });
});
