import { describe, it, expect } from 'vitest';
import { StubAutoScanner } from '../src/services/auto-scan/stub';

describe('StubAutoScanner', () => {
  const scanner = new StubAutoScanner();

  it('approves a clean image+URL', async () => {
    const result = await scanner.scan({
      imageUrl: 'https://example.com/clean.png',
      clickUrl: 'https://blomabud.is/sumartilbod',
      ocrTextHint: 'Sumartilboð á blómum',
    });
    expect(result.outcome).toBe('auto_approved');
  });

  it('flags content containing a blocked term', async () => {
    const r = await scanner.scan({
      imageUrl: 'https://example.com/img.png',
      clickUrl: 'https://example.com',
      ocrTextHint: 'Vinndu peninga á casino',
    });
    expect(r.outcome).toBe('auto_rejected');
    expect(r.scanResult.blockedTerms.length).toBeGreaterThan(0);
  });

  it('flags suspicious URL for manual review', async () => {
    const r = await scanner.scan({
      imageUrl: 'https://example.com/img.png',
      clickUrl: 'https://bit.ly/x123',
      ocrTextHint: 'Sumarferð',
    });
    expect(r.outcome).toBe('flagged_for_manual');
  });

  it('returns sensitiveCategories: [] for a clean creative (scanned-clean, not absent)', async () => {
    const res = await scanner.scan({
      imageUrl: 'https://example.com/clean.png',
      clickUrl: 'https://example.com/landing',
    });
    expect(res.scanResult.sensitiveCategories).toEqual([]);
  });

  it('flags gambling terms as vedmal', async () => {
    const res = await scanner.scan({
      imageUrl: 'https://example.com/casino.png',
      clickUrl: 'https://example.com/landing',
      ocrTextHint: 'best casino bonus',
    });
    expect(res.scanResult.sensitiveCategories).toEqual(['vedmal']);
    expect(res.outcome).toBe('auto_rejected'); // casino is also a blocked term
  });
});
