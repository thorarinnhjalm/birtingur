import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../src/lib/firebase';
import { COLLECTIONS, slotConverter } from '@ada/shared/firestore';
import { FLAT_CPM_ISK, IAB_STANDARD_SIZES } from '@ada/shared';
import { clearFirestoreEmulator } from './helpers/emulator';
import {
  createSlot,
  getSlot,
  listSlotsForPublisher,
  updateSlot,
  getSnippetForSlot,
} from '../src/services/slots';

describe('Slot Service', () => {
  beforeEach(async () => {
    await clearFirestoreEmulator();
  });

  const samplePricing = {
    mode: 'cpm' as const,
    cpmIsk: 150,
  };

  const samplePlacement = {
    pageMatcher: '/frettir/*',
    position: 'above_fold' as const,
  };

  const sampleSizes = [{ width: 300, height: 250 }];

  describe('createSlot', () => {
    it('creates a new slot in firestore and returns it', async () => {
      const slot = await createSlot({
        publisherId: 'pub_123',
        name: 'Forsíða stór',
        sizes: sampleSizes,
        pricing: samplePricing,
        placement: samplePlacement,
      });

      expect(slot.id).toMatch(/^slot_[a-f0-9]{24}$/);
      expect(slot.publisherId).toBe('pub_123');
      expect(slot.name).toBe('Forsíða stór');
      expect(slot.status).toBe('active');
      expect(slot.sizes).toEqual(sampleSizes);

      // Verify db
      const doc = await db
        .collection(COLLECTIONS.slots)
        .doc(slot.id)
        .withConverter(slotConverter)
        .get();

      expect(doc.exists).toBe(true);
      expect(doc.data()?.name).toBe('Forsíða stór');
    });

    it('throws validation error if sizes array is empty', async () => {
      await expect(
        createSlot({
          publisherId: 'pub_123',
          name: 'Forsíða stór',
          sizes: [],
          pricing: samplePricing,
          placement: samplePlacement,
        }),
      ).rejects.toThrow();
    });

    it('forces cpm pricing to the locked flat CPM regardless of client input', async () => {
      const slot = await createSlot({
        publisherId: 'pub_x',
        name: 'Test',
        sizes: [{ width: 300, height: 250 }],
        pricing: { type: 'cpm', amountIsk: 9999 },
        placement: { pageMatcher: '/*', position: 'sidebar' },
      });
      expect(slot.pricing.mode).toBe('cpm');
      expect((slot.pricing as { cpmIsk: number }).cpmIsk).toBe(FLAT_CPM_ISK);
    });

    // The legacy `slot` (fixed price per period) mode cost money and bought
    // nothing: accrual books FLAT_CPM_ISK regardless, and serving used to
    // skip its real-time budget decrement for such slots entirely.
    it('ignores a slot-mode pricing request and pins the slot to flat CPM', async () => {
      const slot = await createSlot({
        publisherId: 'pub_x',
        name: 'Leiga',
        sizes: [{ width: 300, height: 250 }],
        pricing: { mode: 'slot', slotPriceIsk: 25_000, slotPeriodDays: 30 },
        placement: { pageMatcher: '/*', position: 'sidebar' },
      });

      expect(slot.pricing.mode).toBe('cpm');
      expect((slot.pricing as { cpmIsk: number }).cpmIsk).toBe(FLAT_CPM_ISK);
      expect(slot.pricing).not.toHaveProperty('slotPriceIsk');
    });

    it('ignores the legacy frontend { type: "flat" } pricing shape too', async () => {
      const slot = await createSlot({
        publisherId: 'pub_x',
        name: 'Leiga',
        sizes: [{ width: 300, height: 250 }],
        pricing: { type: 'flat', amountIsk: 25_000 },
        placement: { pageMatcher: '/*', position: 'sidebar' },
      });

      expect(slot.pricing.mode).toBe('cpm');
      expect((slot.pricing as { cpmIsk: number }).cpmIsk).toBe(FLAT_CPM_ISK);
    });

    // MCP's create_slot no longer asks the caller for pricing at all, since
    // the value was always overwritten below anyway.
    it('defaults to the locked flat CPM when no pricing is supplied', async () => {
      const slot = await createSlot({
        publisherId: 'pub_x',
        name: 'Án verðs',
        sizes: [{ width: 300, height: 250 }],
        placement: { pageMatcher: '/*', position: 'sidebar' },
      });
      expect(slot.pricing.mode).toBe('cpm');
      expect((slot.pricing as { cpmIsk: number }).cpmIsk).toBe(FLAT_CPM_ISK);
    });

    // Every client surface promised IAB sizes only (dashboard picker, MCP
    // tool description, FAQ) but nothing enforced it, so an agent or raw
    // `ak_` key could create a slot in a size no creative is ever rendered
    // at — it would then serve nothing and be silently dropped from the
    // category size forecast.
    it('rejects a size outside IAB_STANDARD_SIZES', async () => {
      await expect(
        createSlot({
          publisherId: 'pub_123',
          name: 'Ólögleg stærð',
          sizes: [{ width: 970, height: 250 }],
          pricing: samplePricing,
          placement: samplePlacement,
        }),
      ).rejects.toMatchObject({ statusCode: 400, code: 'INVALID_SIZE' });
    });

    it('rejects a non-IAB size declared alongside a valid one', async () => {
      await expect(
        createSlot({
          publisherId: 'pub_123',
          name: 'Blönduð stærð',
          sizes: [
            { width: 300, height: 250 },
            { width: 970, height: 250 },
          ],
          pricing: samplePricing,
          placement: samplePlacement,
        }),
      ).rejects.toMatchObject({ code: 'INVALID_SIZE' });
    });

    it('accepts every IAB standard size', async () => {
      const slot = await createSlot({
        publisherId: 'pub_123',
        name: 'Allar stærðir',
        sizes: IAB_STANDARD_SIZES.map((s) => ({ width: s.width, height: s.height })),
        pricing: samplePricing,
        placement: samplePlacement,
      });
      expect(slot.sizes).toHaveLength(IAB_STANDARD_SIZES.length);
    });
  });

  describe('getSlot', () => {
    it('retrieves an existing slot by id', async () => {
      const created = await createSlot({
        publisherId: 'pub_123',
        name: 'Forsíða stór',
        sizes: sampleSizes,
        pricing: samplePricing,
        placement: samplePlacement,
      });

      const fetched = await getSlot(created.id);
      expect(fetched).not.toBeNull();
      expect(fetched?.id).toBe(created.id);
      expect(fetched?.name).toBe('Forsíða stór');
    });

    it('returns null if slot does not exist', async () => {
      const fetched = await getSlot('slot_nonexistent');
      expect(fetched).toBeNull();
    });
  });

  describe('listSlotsForPublisher', () => {
    it('lists all slots for a specific publisher', async () => {
      await createSlot({
        publisherId: 'pub_123',
        name: 'Slot A',
        sizes: sampleSizes,
        pricing: samplePricing,
        placement: samplePlacement,
      });

      await createSlot({
        publisherId: 'pub_123',
        name: 'Slot B',
        sizes: sampleSizes,
        pricing: samplePricing,
        placement: samplePlacement,
      });

      await createSlot({
        publisherId: 'pub_other',
        name: 'Slot C',
        sizes: sampleSizes,
        pricing: samplePricing,
        placement: samplePlacement,
      });

      const slots = await listSlotsForPublisher('pub_123');
      expect(slots).toHaveLength(2);
      expect(slots.map((s) => s.name)).toContain('Slot A');
      expect(slots.map((s) => s.name)).toContain('Slot B');
    });
  });

  describe('updateSlot', () => {
    it('updates slot fields and returns updated slot', async () => {
      const created = await createSlot({
        publisherId: 'pub_123',
        name: 'Forsíða stór',
        sizes: sampleSizes,
        pricing: samplePricing,
        placement: samplePlacement,
      });

      const updated = await updateSlot(created.id, {
        name: 'Nýtt nafn',
        status: 'paused',
      });

      expect(updated.name).toBe('Nýtt nafn');
      expect(updated.status).toBe('paused');

      const fetched = await getSlot(created.id);
      expect(fetched?.name).toBe('Nýtt nafn');
      expect(fetched?.status).toBe('paused');
    });

    it('throws AppError 404 if slot does not exist', async () => {
      await expect(
        updateSlot('slot_nonexistent', {
          name: 'Nýtt nafn',
        }),
      ).rejects.toMatchObject({ statusCode: 404 });
    });

    // Production may still hold slot-priced docs. They keep parsing, and the
    // first edit of any kind migrates them onto the flat CPM.
    it('migrates a legacy slot-priced doc to flat CPM on any edit', async () => {
      const created = await createSlot({
        publisherId: 'pub_123',
        name: 'Gamalt verð',
        sizes: sampleSizes,
        placement: samplePlacement,
      });
      await db
        .collection(COLLECTIONS.slots)
        .doc(created.id)
        .update({ pricing: { mode: 'slot', slotPriceIsk: 25_000, slotPeriodDays: 30 } });

      const updated = await updateSlot(created.id, { name: 'Nýtt nafn' });

      expect(updated.name).toBe('Nýtt nafn');
      expect(updated.pricing.mode).toBe('cpm');
      expect((updated.pricing as { cpmIsk: number }).cpmIsk).toBe(FLAT_CPM_ISK);
    });

    it('rejects a patch that tries to set slot-mode pricing', async () => {
      const created = await createSlot({
        publisherId: 'pub_123',
        name: 'Forsíða',
        sizes: sampleSizes,
        placement: samplePlacement,
      });

      const updated = await updateSlot(created.id, {
        pricing: { mode: 'slot', slotPriceIsk: 9_000, slotPeriodDays: 7 },
      } as Parameters<typeof updateSlot>[1]);

      expect(updated.pricing.mode).toBe('cpm');
      expect((updated.pricing as { cpmIsk: number }).cpmIsk).toBe(FLAT_CPM_ISK);
    });

    it('rejects a patch that introduces a non-IAB size', async () => {
      const created = await createSlot({
        publisherId: 'pub_123',
        name: 'Forsíða stór',
        sizes: sampleSizes,
        pricing: samplePricing,
        placement: samplePlacement,
      });

      await expect(
        updateSlot(created.id, { sizes: [{ width: 970, height: 250 }] }),
      ).rejects.toMatchObject({ statusCode: 400, code: 'INVALID_SIZE' });
    });

    // Legacy slots may already carry a non-IAB size (seed.ts creates one).
    // Only patches that actually touch `sizes` are validated, so their owners
    // can still rename or pause them.
    it('allows editing a legacy slot whose stored sizes are non-IAB', async () => {
      const legacy = await createSlot({
        publisherId: 'pub_123',
        name: 'Gamalt pláss',
        sizes: sampleSizes,
        pricing: samplePricing,
        placement: samplePlacement,
      });
      // Backdate it past the check, the way pre-existing production data got in.
      await db
        .collection(COLLECTIONS.slots)
        .doc(legacy.id)
        .update({ sizes: [{ width: 970, height: 250 }] });

      const updated = await updateSlot(legacy.id, { status: 'paused' });

      expect(updated.status).toBe('paused');
      expect(updated.sizes).toEqual([{ width: 970, height: 250 }]);
    });
  });

  describe('getSnippetForSlot', () => {
    it('returns a snippet with the default first size if no options provided', async () => {
      const created = await createSlot({
        publisherId: 'pub_123',
        name: 'Forsíða stór',
        sizes: [
          { width: 300, height: 250 },
          { width: 728, height: 90 },
        ],
        pricing: samplePricing,
        placement: samplePlacement,
      });

      const html = await getSnippetForSlot(created.id);
      expect(html).toContain(`data-adplatform-slot="${created.id}"`);
      expect(html).toContain('data-adplatform-width="300"');
      expect(html).toContain('data-adplatform-height="250"');
    });

    it('returns a snippet with requested dimensions if supported by slot', async () => {
      const created = await createSlot({
        publisherId: 'pub_123',
        name: 'Forsíða stór',
        sizes: [
          { width: 300, height: 250 },
          { width: 728, height: 90 },
        ],
        pricing: samplePricing,
        placement: samplePlacement,
      });

      const html = await getSnippetForSlot(created.id, { width: 728, height: 90 });
      expect(html).toContain(`data-adplatform-slot="${created.id}"`);
      expect(html).toContain('data-adplatform-width="728"');
      expect(html).toContain('data-adplatform-height="90"');
    });

    it('throws AppError 400 if requested dimensions are not supported by the slot', async () => {
      const created = await createSlot({
        publisherId: 'pub_123',
        name: 'Forsíða stór',
        sizes: [{ width: 300, height: 250 }],
        pricing: samplePricing,
        placement: samplePlacement,
      });

      await expect(getSnippetForSlot(created.id, { width: 728, height: 90 })).rejects.toThrow();
    });
  });
});
