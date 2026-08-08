import { describe, it, expect, vi, beforeEach } from 'vitest';

const fetchBinaryMock = vi.fn();
vi.mock('../src/services/ai-creative/ssrf', async (importOriginal) => {
  const original = await importOriginal<any>();
  return { ...original, ssrfGuardedFetchBinary: (...a: unknown[]) => fetchBinaryMock(...a) };
});

import { extractLogoCandidates } from '../src/services/ai-creative/index';
import { acquireScrapedLogo, normalizeLogoBuffer } from '../src/services/ai-creative/logo';
import { StubCreativeUploader } from '../src/services/ai-creative/storage';

// 1x1 transparent PNG
const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

beforeEach(() => fetchBinaryMock.mockReset());

describe('logo candidate extraction', () => {
  const HTML = `
    <html><head>
      <link rel="icon" sizes="32x32" href="/favicon-32.png">
      <link rel="apple-touch-icon" href="/apple-icon.png">
      <meta property="og:image" content="https://cdn.example.is/hero-photo.jpg">
    </head><body>
      <img class="site-logo" src="/img/logo.svg" alt="Merki">
    </body></html>`;

  it('orders candidates apple-touch-icon > img-logo > icon and never og:image', () => {
    const candidates = extractLogoCandidates(HTML, 'https://example.is/');
    expect(candidates).toEqual([
      'https://example.is/apple-icon.png',
      'https://example.is/img/logo.svg',
      'https://example.is/favicon-32.png',
    ]);
  });
});

describe('acquireScrapedLogo', () => {
  it('uploads the first viable candidate and returns a scraped logo', async () => {
    fetchBinaryMock.mockResolvedValueOnce({
      body: TINY_PNG,
      finalUrl: 'https://example.is/apple-icon.png',
      contentType: 'image/png',
      truncated: false,
    });
    const logo = await acquireScrapedLogo({
      advertiserId: 'adv_1',
      candidates: ['https://example.is/apple-icon.png'],
      uploader: new StubCreativeUploader(),
    });
    expect(logo).toMatchObject({ source: 'scraped', mime: 'image/png' });
    expect(logo!.storagePath).toMatch(/^creatives\/adv_1\/logo_/);
  });

  it('falls through failed candidates to the next one', async () => {
    fetchBinaryMock.mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce({
      body: TINY_PNG,
      finalUrl: 'https://example.is/b.png',
      contentType: 'image/png',
      truncated: false,
    });
    const logo = await acquireScrapedLogo({
      advertiserId: 'adv_1',
      candidates: ['https://example.is/a.png', 'https://example.is/b.png'],
      uploader: new StubCreativeUploader(),
    });
    expect(logo).not.toBeNull();
    expect(fetchBinaryMock).toHaveBeenCalledTimes(2);
  });

  it('returns null when every candidate fails, is truncated, or has a bad type', async () => {
    fetchBinaryMock.mockResolvedValue({
      body: TINY_PNG,
      finalUrl: 'https://example.is/x.ico',
      contentType: 'image/vnd.microsoft.icon',
      truncated: false,
    });
    const logo = await acquireScrapedLogo({
      advertiserId: 'adv_1',
      candidates: ['https://example.is/x.ico'],
      uploader: new StubCreativeUploader(),
    });
    expect(logo).toBeNull();
  });
});

describe('normalizeLogoBuffer', () => {
  it('passes png/jpeg through and rejects unsupported types', () => {
    expect(normalizeLogoBuffer(TINY_PNG, 'image/png')?.mime).toBe('image/png');
    expect(normalizeLogoBuffer(TINY_PNG, 'image/gif')).toBeNull();
  });

  it('rasterizes svg to png', () => {
    const svg = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10" fill="red"/></svg>',
    );
    const out = normalizeLogoBuffer(svg, 'image/svg+xml');
    expect(out?.mime).toBe('image/png');
    expect(out!.buffer.subarray(1, 4).toString()).toBe('PNG');
  });

  it('returns null for an undecodable svg', () => {
    expect(normalizeLogoBuffer(Buffer.from('<svg'), 'image/svg+xml')).toBeNull();
  });
});
