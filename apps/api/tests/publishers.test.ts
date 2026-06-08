import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../src/lib/firebase';
import { COLLECTIONS, publisherConverter } from '@ada/shared/firestore';
import { clearFirestoreEmulator } from './helpers/emulator';
import {
  createPublisher,
  getPublisherById,
  getPublisherByOwnerEmail,
  getPublishersByOwnerEmail,
  updatePublisher,
} from '../src/services/publishers';
import { getAggregatedPublisherStats } from '../src/services/publisher-stats';

describe('Publisher Service', () => {
  beforeEach(async () => {
    await clearFirestoreEmulator();
  });

  const samplePayout = {
    type: 'bank' as const,
    iban: 'IS260123456789012345678901',
    kennitala: '1234567890',
    accountName: 'Test Publisher ehf.',
  };

  const samplePolicy = {
    blockedCategories: ['gambling', 'alcohol'],
    requireManualApproval: true,
  };

  describe('createPublisher', () => {
    it('creates a new publisher in firestore and returns it', async () => {
      const pub = await createPublisher({
        ownerEmail: 'owner@test.is',
        domain: 'test.is',
        displayName: 'Test Publisher',
        payoutMethod: samplePayout,
        contentPolicy: samplePolicy,
        categories: ['taekni'],
      });

      expect(pub.id).toMatch(/^pub_[a-f0-9]{24}$/);
      expect(pub.ownerEmail).toBe('owner@test.is');
      expect(pub.domain).toBe('test.is');
      expect(pub.displayName).toBe('Test Publisher');
      expect(pub.status).toBe('active');
      expect(pub.createdAt).toBeInstanceOf(Date);

      // Verify in DB directly
      const doc = await db
        .collection(COLLECTIONS.publishers)
        .doc(pub.id)
        .withConverter(publisherConverter)
        .get();

      expect(doc.exists).toBe(true);
      const data = doc.data();
      expect(data?.displayName).toBe('Test Publisher');
    });

    it('throws validation error if domain is invalid', async () => {
      await expect(
        createPublisher({
          ownerEmail: 'owner@test.is',
          domain: 'not-a-domain',
          displayName: 'Test Publisher',
          payoutMethod: samplePayout,
          contentPolicy: samplePolicy,
          categories: ['taekni'],
        }),
      ).rejects.toThrow();
    });

    it('throws validation error if ownerEmail is invalid', async () => {
      await expect(
        createPublisher({
          ownerEmail: 'not-an-email',
          domain: 'test.is',
          displayName: 'Test Publisher',
          payoutMethod: samplePayout,
          contentPolicy: samplePolicy,
          categories: ['taekni'],
        }),
      ).rejects.toThrow();
    });
  });

  describe('getPublisherById', () => {
    it('retrieves an existing publisher by id', async () => {
      const created = await createPublisher({
        ownerEmail: 'owner@test.is',
        domain: 'test.is',
        displayName: 'Test Publisher',
        payoutMethod: samplePayout,
        contentPolicy: samplePolicy,
        categories: ['taekni'],
      });

      const fetched = await getPublisherById(created.id);
      expect(fetched).not.toBeNull();
      expect(fetched?.id).toBe(created.id);
      expect(fetched?.displayName).toBe('Test Publisher');
    });

    it('returns null if publisher does not exist', async () => {
      const fetched = await getPublisherById('pub_nonexistent');
      expect(fetched).toBeNull();
    });
  });

  describe('getPublisherByOwnerEmail', () => {
    it('retrieves publisher by owner email', async () => {
      const created = await createPublisher({
        ownerEmail: 'owner@test.is',
        domain: 'test.is',
        displayName: 'Test Publisher',
        payoutMethod: samplePayout,
        contentPolicy: samplePolicy,
        categories: ['taekni'],
      });

      const fetched = await getPublisherByOwnerEmail('owner@test.is');
      expect(fetched).not.toBeNull();
      expect(fetched?.id).toBe(created.id);
    });

    it('returns null if owner email is not found', async () => {
      const fetched = await getPublisherByOwnerEmail('unknown@test.is');
      expect(fetched).toBeNull();
    });
  });

  describe('updatePublisher', () => {
    it('updates publisher fields successfully', async () => {
      const created = await createPublisher({
        ownerEmail: 'owner@test.is',
        domain: 'test.is',
        displayName: 'Test Publisher',
        payoutMethod: samplePayout,
        contentPolicy: samplePolicy,
        categories: ['taekni'],
      });

      const updated = await updatePublisher(created.id, {
        displayName: 'New Name',
        domain: 'newdomain.is',
      });

      expect(updated.displayName).toBe('New Name');
      expect(updated.domain).toBe('newdomain.is');

      // Verify db changes
      const fetched = await getPublisherById(created.id);
      expect(fetched?.displayName).toBe('New Name');
      expect(fetched?.domain).toBe('newdomain.is');
    });

    it('throws if updated fields fail validation', async () => {
      const created = await createPublisher({
        ownerEmail: 'owner@test.is',
        domain: 'test.is',
        displayName: 'Test Publisher',
        payoutMethod: samplePayout,
        contentPolicy: samplePolicy,
        categories: ['taekni'],
      });

      await expect(
        updatePublisher(created.id, {
          domain: 'invalid-domain-format',
        }),
      ).rejects.toThrow();
    });

    it('throws AppError with 404 if publisher is not found', async () => {
      await expect(
        updatePublisher('pub_nonexistent', {
          displayName: 'New Name',
        }),
      ).rejects.toThrow();
    });
  });

  describe('getPublishersByOwnerEmail', () => {
    it('retrieves all publishers owned by an email', async () => {
      await createPublisher({
        ownerEmail: 'multi@test.is',
        domain: 'site1.is',
        displayName: 'Site 1',
        payoutMethod: samplePayout,
        contentPolicy: samplePolicy,
        categories: ['taekni'],
      });

      await createPublisher({
        ownerEmail: 'multi@test.is',
        domain: 'site2.is',
        displayName: 'Site 2',
        payoutMethod: samplePayout,
        contentPolicy: samplePolicy,
        categories: ['taekni'],
      });

      const list = await getPublishersByOwnerEmail('multi@test.is');
      expect(list).toHaveLength(2);
      expect(list.map((p) => p.domain)).toContain('site1.is');
      expect(list.map((p) => p.domain)).toContain('site2.is');
    });

    it('returns empty array if email owns no publishers', async () => {
      const list = await getPublishersByOwnerEmail('none@test.is');
      expect(list).toEqual([]);
    });
  });

  describe('getAggregatedPublisherStats', () => {
    it('returns empty aggregated stats for empty publisherIds list', async () => {
      const stats = await getAggregatedPublisherStats([], 7);
      expect(stats.impressions).toBe(0);
      expect(stats.history).toEqual([]);
    });

    it('returns aggregated stats for multiple publisherIds', async () => {
      const stats = await getAggregatedPublisherStats(['pub_1', 'pub_2'], 7);
      expect(stats.impressions).toBeGreaterThan(0);
      expect(stats.history).toHaveLength(7);
      expect(stats.history[0]?.impressions).toBeGreaterThan(0);
    });
  });
});
