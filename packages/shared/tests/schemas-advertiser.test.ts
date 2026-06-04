import { describe, it, expect } from 'vitest';
import { AdvertiserSchema, CreativeSchema, AutoScanResultSchema } from '../src/schemas/advertiser';

describe('AdvertiserSchema', () => {
  it('accepts valid advertiser', () => {
    const valid = {
      id: 'adv_xyz',
      ownerEmail: 'anna@blomabud.is',
      companyName: 'Blómabúð Vesturbæjar',
      kennitala: '1234567890',
      vatNumber: '123456',
      walletBalanceIsk: 47250,
      status: 'active' as const,
      createdAt: new Date(),
    };
    expect(() => AdvertiserSchema.parse(valid)).not.toThrow();
  });

  it('accepts valid advertiser with websiteUrl', () => {
    const valid = {
      id: 'adv_xyz',
      ownerEmail: 'anna@blomabud.is',
      companyName: 'Blómabúð Vesturbæjar',
      kennitala: '1234567890',
      vatNumber: '123456',
      walletBalanceIsk: 47250,
      status: 'active' as const,
      createdAt: new Date(),
      websiteUrl: 'https://blomabud.is',
    };
    expect(() => AdvertiserSchema.parse(valid)).not.toThrow();
  });

  it('rejects invalid websiteUrl format', () => {
    const invalid = {
      id: 'adv_xyz',
      ownerEmail: 'anna@blomabud.is',
      companyName: 'Blómabúð Vesturbæjar',
      kennitala: '1234567890',
      vatNumber: '123456',
      walletBalanceIsk: 47250,
      status: 'active' as const,
      createdAt: new Date(),
      websiteUrl: 'invalid-url',
    };
    expect(() => AdvertiserSchema.parse(invalid)).toThrow();
  });

  it('accepts zero wallet balance', () => {
    const v = {
      id: 'adv_xyz',
      ownerEmail: 'a@b.is',
      companyName: 'X',
      kennitala: '1234567890',
      vatNumber: '123456',
      walletBalanceIsk: 0,
      status: 'active' as const,
      createdAt: new Date(),
    };
    expect(() => AdvertiserSchema.parse(v)).not.toThrow();
  });

  it('rejects negative wallet balance', () => {
    expect(() =>
      AdvertiserSchema.parse({
        id: 'adv_xyz',
        ownerEmail: 'a@b.is',
        companyName: 'X',
        kennitala: '1234567890',
        vatNumber: '123456',
        walletBalanceIsk: -100,
        status: 'active',
        createdAt: new Date(),
      }),
    ).toThrow();
  });
});

describe('AutoScanResultSchema', () => {
  it('accepts a complete scan result', () => {
    const valid = {
      nsfwScore: 0.12,
      blockedTerms: ['gambling'],
      category: 'finance',
      confidence: 0.87,
    };
    expect(() => AutoScanResultSchema.parse(valid)).not.toThrow();
  });

  it('rejects NSFW score outside [0,1]', () => {
    expect(() =>
      AutoScanResultSchema.parse({
        nsfwScore: 1.5,
        blockedTerms: [],
        category: 'tech',
        confidence: 0.9,
      }),
    ).toThrow();
  });
});

describe('CreativeSchema', () => {
  it('accepts valid creative', () => {
    const valid = {
      id: 'cre_abc',
      advertiserId: 'adv_xyz',
      imageUrl: 'https://storage.googleapis.com/ada/creatives/abc.png',
      width: 728,
      height: 90,
      clickUrl: 'https://blomabud.is/sumartilbod',
      reviewStatus: 'auto_approved' as const,
      reviewLog: [
        {
          at: new Date(),
          by: 'auto',
          action: 'approved',
        },
      ],
      autoScanResult: {
        nsfwScore: 0.05,
        blockedTerms: [],
        category: 'retail',
        confidence: 0.95,
      },
    };
    expect(() => CreativeSchema.parse(valid)).not.toThrow();
  });

  it('accepts pending review status without scan result', () => {
    const valid = {
      id: 'cre_abc',
      advertiserId: 'adv_xyz',
      imageUrl: 'https://example.com/img.png',
      width: 728,
      height: 90,
      clickUrl: 'https://example.com',
      reviewStatus: 'pending' as const,
      reviewLog: [],
    };
    expect(() => CreativeSchema.parse(valid)).not.toThrow();
  });

  it('rejects non-https click URL', () => {
    expect(() =>
      CreativeSchema.parse({
        id: 'cre_abc',
        advertiserId: 'adv_xyz',
        imageUrl: 'https://example.com/img.png',
        width: 728,
        height: 90,
        clickUrl: 'http://insecure.example.com',
        reviewStatus: 'pending',
        reviewLog: [],
      }),
    ).toThrow();
  });

  it('rejects rejection with empty reviewLog', () => {
    // Business rule: a rejected creative must have at least one log entry explaining why.
    expect(() =>
      CreativeSchema.parse({
        id: 'cre_abc',
        advertiserId: 'adv_xyz',
        imageUrl: 'https://example.com/img.png',
        width: 728,
        height: 90,
        clickUrl: 'https://example.com',
        reviewStatus: 'rejected',
        reviewLog: [],
      }),
    ).toThrow();
  });
});
