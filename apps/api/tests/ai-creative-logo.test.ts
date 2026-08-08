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

  it('skips a logo-matching <img> with no usable src and keeps scanning for the next one', () => {
    const HTML_LAZY = `
      <html><body>
        <img class="logo lazyload" data-src="/lazy-logo.png" alt="Merki">
        <img class="site-logo" src="/real-logo.png" alt="Merki">
      </body></html>`;
    const candidates = extractLogoCandidates(HTML_LAZY, 'https://example.is/');
    expect(candidates).toEqual(['https://example.is/real-logo.png']);
  });

  it('picks the largest declared size out of a multi-size sizes attribute', () => {
    const HTML_MULTI_SIZE = `
      <html><head>
        <link rel="icon" sizes="16x16 32x32 48x48" href="/favicon-multi.png">
        <link rel="icon" sizes="24x24" href="/favicon-24.png">
      </head><body></body></html>`;
    const candidates = extractLogoCandidates(HTML_MULTI_SIZE, 'https://example.is/');
    expect(candidates).toEqual([
      'https://example.is/favicon-multi.png',
      'https://example.is/favicon-24.png',
    ]);
  });

  // IMPORTANT-2 (adversarial review): a hostile page can declare an
  // unbounded number of icon links, each becoming a distinct candidate URL —
  // acquireScrapedLogo tries them serially at up to 5s/1MB each, so an
  // unbounded list is a request-stalling amplifier. The list must be capped.
  it('caps the candidate list at 4 even when the page declares many more icons', () => {
    const manyIcons = Array.from(
      { length: 50 },
      (_, i) => `<link rel="icon" href="/icon-${i}.png">`,
    ).join('\n');
    const HTML_MANY = `<html><head>${manyIcons}</head><body></body></html>`;
    const candidates = extractLogoCandidates(HTML_MANY, 'https://example.is/');
    expect(candidates).toHaveLength(4);
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

  it('returns null when every candidate has an unsupported content type', async () => {
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

  it('returns null when every candidate is truncated', async () => {
    fetchBinaryMock.mockResolvedValue({
      body: TINY_PNG,
      finalUrl: 'https://example.is/big.png',
      contentType: 'image/png',
      truncated: true,
    });
    const logo = await acquireScrapedLogo({
      advertiserId: 'adv_1',
      candidates: ['https://example.is/big.png'],
      uploader: new StubCreativeUploader(),
    });
    expect(logo).toBeNull();
  });

  it('returns null when every candidate fails outright (network error)', async () => {
    fetchBinaryMock
      .mockRejectedValueOnce(new Error('boom'))
      .mockRejectedValueOnce(new Error('boom'));
    const logo = await acquireScrapedLogo({
      advertiserId: 'adv_1',
      candidates: ['https://example.is/a.png', 'https://example.is/b.png'],
      uploader: new StubCreativeUploader(),
    });
    expect(logo).toBeNull();
  });

  // IMPORTANT-2 (adversarial review): an already-exceeded deadline must stop
  // the loop before it makes a single fetch — this is what actually bounds
  // the overall wall-clock cost of a hostile candidate list.
  it('returns null and never fetches when the deadline has already passed', async () => {
    const logo = await acquireScrapedLogo({
      advertiserId: 'adv_1',
      candidates: ['https://example.is/a.png', 'https://example.is/b.png'],
      uploader: new StubCreativeUploader(),
      deadline: Date.now() - 1,
    });
    expect(logo).toBeNull();
    expect(fetchBinaryMock).not.toHaveBeenCalled();
  });

  it('stops trying further candidates once the deadline passes mid-loop', async () => {
    fetchBinaryMock.mockImplementation(async () => {
      // Simulate the deadline elapsing during the first (slow) candidate.
      await new Promise((r) => setTimeout(r, 5));
      return {
        body: TINY_PNG,
        finalUrl: 'x',
        contentType: 'image/vnd.microsoft.icon',
        truncated: false,
      };
    });
    const logo = await acquireScrapedLogo({
      advertiserId: 'adv_1',
      candidates: [
        'https://example.is/a.png',
        'https://example.is/b.png',
        'https://example.is/c.png',
      ],
      uploader: new StubCreativeUploader(),
      deadline: Date.now() + 2,
    });
    expect(logo).toBeNull();
    // First candidate is always attempted (deadline checked at loop top);
    // the deadline elapsing during that fetch must prevent later candidates.
    expect(fetchBinaryMock.mock.calls.length).toBeLessThan(3);
  });
});

// 1x1 opaque black JPEG (minimal valid JFIF)
const TINY_JPEG = Buffer.from(
  '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAMCAgICAgMCAgIDAwMDBAYEBAQEBAgGBgUGCQgKCgkICQkKDA8MCgsOCwkJDRENDg8QEBEQCgwSExIQEw8QEBD/2wBDAQMDAwQDBAgEBAgQCwkLEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBD/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAn/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCdABmX/9k=',
  'base64',
);

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

  // CRITICAL-1 (adversarial review): a tiny-width, huge-height viewBox
  // rasterizes to a giant canvas once fitTo scales it to SVG_RASTER_SIZE
  // wide (e.g. viewBox="0 0 1 600" -> 512x307200, ~629MB RGBA) — reachable
  // via upload OR a hostile scraped landing-page logo.svg. Must be rejected
  // BEFORE the allocating .render() call, not just eventually survive it.
  it('rejects an extreme-aspect-ratio SVG that would blow up the rasterized canvas', () => {
    const svg = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 600"><rect width="1" height="600" fill="red"/></svg>',
    );
    expect(normalizeLogoBuffer(svg, 'image/svg+xml')).toBeNull();
  });

  it('still rasterizes a normal-aspect-ratio SVG that stays well under the height ceiling', () => {
    const svg = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 100"><rect width="200" height="100" fill="blue"/></svg>',
    );
    const out = normalizeLogoBuffer(svg, 'image/svg+xml');
    expect(out?.mime).toBe('image/png');
    expect(out!.buffer.subarray(1, 4).toString()).toBe('PNG');
  });

  // MINOR-4 (adversarial review): magic bytes must match the declared mime
  // regardless of what the caller/scrape claimed — a PNG blob labelled
  // image/jpeg (or vice versa) must not be stored under a lying content type.
  it('rejects PNG bytes labelled image/jpeg', () => {
    expect(normalizeLogoBuffer(TINY_PNG, 'image/jpeg')).toBeNull();
  });

  it('rejects JPEG bytes labelled image/png', () => {
    expect(normalizeLogoBuffer(TINY_JPEG, 'image/png')).toBeNull();
  });

  it('accepts JPEG bytes correctly labelled image/jpeg', () => {
    expect(normalizeLogoBuffer(TINY_JPEG, 'image/jpeg')?.mime).toBe('image/jpeg');
  });

  // Blocking finding (adversarial re-review, follow-up to CRITICAL-1): the
  // SVG raster bomb had a PNG/JPEG twin — normalizeLogoBuffer stored
  // PNG/JPEG bytes undecoded, but resvg still decodes+rasterizes the
  // EMBEDDED image at banner-render time. A flat-color PNG compresses a huge
  // declared canvas into well under the 1MB cap, so dimensions must be read
  // from the header (IHDR for PNG, SOF0/1/2 for JPEG) WITHOUT decoding, and
  // rejected past MAX_RASTER_DIMENSION (4096) before the bytes are ever
  // stored/rasterized.
  describe('raster-dimension ceiling (PNG/JPEG headers, no decode)', () => {
    function makePngWithDimensions(width: number, height: number): Buffer {
      const buf = Buffer.alloc(24);
      // 8-byte PNG signature
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(buf, 0);
      buf.writeUInt32BE(13, 8); // IHDR chunk length
      buf.write('IHDR', 12, 'ascii');
      buf.writeUInt32BE(width, 16);
      buf.writeUInt32BE(height, 20);
      return buf;
    }

    it('rejects a crafted PNG header declaring 50000x50000', () => {
      const bomb = makePngWithDimensions(50_000, 50_000);
      expect(normalizeLogoBuffer(bomb, 'image/png')).toBeNull();
    });

    it('still passes a normal small PNG', () => {
      expect(normalizeLogoBuffer(TINY_PNG, 'image/png')?.mime).toBe('image/png');
    });

    it('parses real JPEG dimensions and passes a normal small JPEG', () => {
      expect(normalizeLogoBuffer(TINY_JPEG, 'image/jpeg')?.mime).toBe('image/jpeg');
    });

    it('rejects an unparseable PNG header (valid magic bytes, too short for IHDR)', () => {
      // Passes hasPngMagicBytes (first 4 bytes) but is too short for
      // pngDimensions to read the IHDR width/height fields.
      const short = Buffer.alloc(12);
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(short, 0);
      expect(normalizeLogoBuffer(short, 'image/png')).toBeNull();
    });

    it('rejects an unparseable JPEG header (valid SOI, no SOF segment before EOI)', () => {
      // FFD8 (SOI) immediately followed by FFD9 (EOI) — valid magic bytes,
      // but jpegDimensions never finds an SOF0/1/2 segment to read from.
      const noSof = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
      expect(normalizeLogoBuffer(noSof, 'image/jpeg')).toBeNull();
    });
  });
});
