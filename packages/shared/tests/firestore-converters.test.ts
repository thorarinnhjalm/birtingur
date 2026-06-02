import { describe, it, expect } from 'vitest';
import { Timestamp } from 'firebase-admin/firestore';
import { publisherConverter } from '../src/firestore/converters';

describe('publisherConverter', () => {
  it('serializes dates to Firestore Timestamps', () => {
    const date = new Date('2026-06-02T12:00:00Z');
    const publisher = {
      id: 'pub_a',
      ownerEmail: 'a@b.is',
      domain: 'example.is',
      displayName: 'Example',
      payoutMethod: {
        type: 'bank' as const,
        iban: 'IS140159260076545510730339',
        kennitala: '1234567890',
        accountName: 'Example ehf',
      },
      contentPolicy: { blockedCategories: [], requireManualApproval: false },
      status: 'active' as const,
      createdAt: date,
    };

    const serialized = publisherConverter.toFirestore(publisher);

    expect(serialized.createdAt).toBeInstanceOf(Timestamp);
    expect((serialized.createdAt as Timestamp).toMillis()).toBe(date.getTime());
  });

  it('deserializes Firestore Timestamps to Dates', () => {
    const ts = Timestamp.fromDate(new Date('2026-06-02T12:00:00Z'));
    const snapshot = {
      id: 'pub_a',
      data: () => ({
        ownerEmail: 'a@b.is',
        domain: 'example.is',
        displayName: 'Example',
        payoutMethod: {
          type: 'bank',
          iban: 'IS140159260076545510730339',
          kennitala: '1234567890',
          accountName: 'Example ehf',
        },
        contentPolicy: { blockedCategories: [], requireManualApproval: false },
        status: 'active',
        createdAt: ts,
      }),
    } as never;

    const deserialized = publisherConverter.fromFirestore(snapshot);

    expect(deserialized.createdAt).toBeInstanceOf(Date);
    expect(deserialized.createdAt.getTime()).toBe(ts.toMillis());
    expect(deserialized.id).toBe('pub_a');
  });

  it('rejects invalid data on deserialize', () => {
    const snapshot = {
      id: 'pub_a',
      data: () => ({
        ownerEmail: 'not-an-email',
        domain: 'example.is',
        displayName: 'Example',
        payoutMethod: {
          type: 'bank',
          iban: 'IS140159260076545510730339',
          kennitala: '1234567890',
          accountName: 'Example',
        },
        contentPolicy: { blockedCategories: [], requireManualApproval: false },
        status: 'active',
        createdAt: Timestamp.now(),
      }),
    } as never;

    expect(() => publisherConverter.fromFirestore(snapshot)).toThrow();
  });
});
