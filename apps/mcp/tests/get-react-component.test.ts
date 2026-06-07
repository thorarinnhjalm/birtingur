import { describe, it, expect } from 'vitest';
import { buildBirtingurReactDoc } from '../src/tools/publisher/get-react-component';

describe('buildBirtingurReactDoc', () => {
  it('bakes the real slotId and dimensions into a ready-to-paste usage example', () => {
    const doc = buildBirtingurReactDoc({
      slotId: 'slot_d9e8f575bb5fcd828401fd5a',
      width: 980,
      height: 120,
    });
    expect(doc).toContain('slotId="slot_d9e8f575bb5fcd828401fd5a"');
    expect(doc).toContain('width={980}');
    expect(doc).toContain('height={120}');
  });

  it('still includes the full component definition and the ad fetch', () => {
    const doc = buildBirtingurReactDoc({ slotId: 'slot_x', width: 300, height: 250 });
    expect(doc).toContain('export function BirtingurAdSlot');
    expect(doc).toContain('/v1/ad?slot=');
  });

  it('warns against sourcing slotId from a value that can be undefined in production', () => {
    // This is the exact failure mode seen in the wild: <BirtingurAdSlot slotId={undefined} />
    // because slotId was wired to an env var missing in the prod build.
    const doc = buildBirtingurReactDoc({ slotId: 'slot_x', width: 300, height: 250 });
    expect(doc.toLowerCase()).toContain('undefined');
  });
});
