import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../src/lib/firebase';
import { COLLECTIONS, slotConverter } from '@ada/shared/firestore';
import { FLAT_CPM_ISK } from '@ada/shared';
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
      ).rejects.toThrow();
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
