import { describe, it, expect } from 'vitest';
import { generateSnippet } from '../src/lib/snippet';

describe('Snippet Builder', () => {
  const cdnUrl = 'https://cdn.birta.is/widget.js';

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
