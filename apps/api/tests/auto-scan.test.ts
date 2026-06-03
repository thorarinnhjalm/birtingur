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
});
