import { describe, it, expect } from 'vitest';
import { generateSnippet } from '../src/lib/snippet';

describe('Snippet Builder', () => {
  const cdnUrl = process.env.CDN_BASE_URL ?? 'https://serving.birtingur.app/widget.js';

  it('generates a standard HTML snippet with data-adplatform-slot and dimensions', () => {
    const html = generateSnippet({
      slotId: 'slot_123',
      width: 300,
      height: 250,
    });

    expect(html).toContain(
      '<div data-adplatform-slot="slot_123" data-adplatform-width="300" data-adplatform-height="250"></div>',
    );
    expect(html).toContain(`<script async src="${cdnUrl}"></script>`);
  });

  // The generated string is pasted into a publisher's own site, so a host
  // that does not resolve is a silent, permanent breakage on someone else's
  // page — nothing errors, the ad just never appears. Two hosts have already
  // shipped in this position without ever being attached to a deployment
  // (`cdn.birtingur.app`, `cdn.adplatform.is`) and one that does not exist in
  // DNS at all (`cdn.birtingur.is`). Pin the live origin explicitly.
  it('points at the live serving origin, not a CDN host that was never deployed', () => {
    const html = generateSnippet({ slotId: 'slot_123' });

    if (!process.env.CDN_BASE_URL) {
      expect(html).toContain('src="https://serving.birtingur.app/widget.js"');
    }
    for (const deadHost of ['cdn.birtingur.app', 'cdn.birtingur.is', 'adplatform.is']) {
      expect(html).not.toContain(deadHost);
    }
  });

  it('escapes slotId correctly to prevent HTML/attribute injection', () => {
    const html = generateSnippet({
      slotId: 'slot_123" onclick="alert(1)"',
      width: 300,
      height: 250,
    });

    expect(html).toContain('data-adplatform-slot="slot_123&quot; onclick=&quot;alert(1)&quot;"');
    expect(html).not.toContain('onclick="alert(1)"');
  });

  it('allows snippet generation without dimensions', () => {
    const html = generateSnippet({
      slotId: 'slot_abc',
    });

    expect(html).toContain('<div data-adplatform-slot="slot_abc"></div>');
    expect(html).not.toContain('data-adplatform-width');
    expect(html).not.toContain('data-adplatform-height');
  });
});
