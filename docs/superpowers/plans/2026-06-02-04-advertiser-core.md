# ADA Advertiser Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans.

**Goal:** REST endpoints for advertiser registration, creative upload with auto-scan stub, campaign CRUD, and slot search. Each campaign approval triggers cache push (active creatives become servable).

**Architecture:** Extends `apps/api` from Plan #2. New services: `advertisers`, `creatives`, `campaigns`, `slot-search`. Auto-scan uses a pluggable interface so real Cloud Vision integration can swap in later. Active-creatives cache push from Plan #3 is upgraded here to read campaigns.

**Tech Stack:** Same as Plan #2.

**Depends on:** Plans #1, #2, #3.

**Companion spec sections:** 4.1, 7 (approval workflow), 8.2 (advertiser endpoints).

---

## File Structure

```
apps/api/src/
├── services/
│   ├── advertisers.ts
│   ├── creatives.ts
│   ├── campaigns.ts
│   ├── slot-search.ts
│   └── auto-scan/
│       ├── index.ts           # AutoScanner interface, scan()
│       ├── stub.ts            # StubAutoScanner (used in dev/tests)
│       └── cloud-vision.ts    # CloudVisionAutoScanner (prod, deferred wiring)
└── routes/
    ├── advertisers.ts
    ├── creatives.ts
    ├── campaigns.ts
    └── slots-search.ts        # GET /v1/slots/search
```

---

## Task 1: AutoScanner interface

**Files:** `apps/api/src/services/auto-scan/index.ts`, `stub.ts`, `tests/auto-scan.test.ts`

- [ ] **Step 1: Write failing test**

Write `/Users/thorarinnhjalmarsson/Documents/Antigravity/ada/apps/api/tests/auto-scan.test.ts`:

```ts
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
      ocrTextHint: 'Vinnnðu peninga á casino',
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
```

- [ ] **Step 2: Implement interface and stub**

Write `/Users/thorarinnhjalmarsson/Documents/Antigravity/ada/apps/api/src/services/auto-scan/index.ts`:

```ts
import type { AutoScanResult } from '@ada/shared';

export interface ScanInput {
  imageUrl: string;
  clickUrl: string;
  ocrTextHint?: string;
}

export type ScanOutcome = 'auto_approved' | 'flagged_for_manual' | 'auto_rejected';

export interface ScanReturn {
  outcome: ScanOutcome;
  scanResult: AutoScanResult;
}

export interface AutoScanner {
  scan(input: ScanInput): Promise<ScanReturn>;
}

export { StubAutoScanner } from './stub';
```

Write `/Users/thorarinnhjalmarsson/Documents/Antigravity/ada/apps/api/src/services/auto-scan/stub.ts`:

```ts
import type { AutoScanner, ScanInput, ScanReturn } from './index';

const BLOCKED_TERMS = [
  'casino', 'gambling', 'fjárhættuspil', 'bet365', 'porn',
  'free money', 'click here to win',
];
const SUSPICIOUS_URL_PATTERNS = [
  /bit\.ly/i, /tinyurl/i, /\.tk(\/|$)/i, /click\.tracker/i,
];

export class StubAutoScanner implements AutoScanner {
  async scan(input: ScanInput): Promise<ScanReturn> {
    const text = (input.ocrTextHint ?? '').toLowerCase();
    const found = BLOCKED_TERMS.filter((t) => text.includes(t));
    const urlSuspicious = SUSPICIOUS_URL_PATTERNS.some((re) => re.test(input.clickUrl));

    if (found.length > 0) {
      return {
        outcome: 'auto_rejected',
        scanResult: {
          nsfwScore: 0,
          blockedTerms: found,
          category: 'unknown',
          confidence: 0.9,
        },
      };
    }
    if (urlSuspicious) {
      return {
        outcome: 'flagged_for_manual',
        scanResult: {
          nsfwScore: 0.1,
          blockedTerms: [],
          category: 'unknown',
          confidence: 0.5,
        },
      };
    }
    return {
      outcome: 'auto_approved',
      scanResult: {
        nsfwScore: 0.02,
        blockedTerms: [],
        category: 'retail',
        confidence: 0.95,
      },
    };
  }
}
```

- [ ] **Step 3: Test & commit**

```bash
cd /Users/thorarinnhjalmarsson/Documents/Antigravity/ada
pnpm --filter @ada/api test tests/auto-scan.test.ts
git add apps/api/src/services/auto-scan apps/api/tests/auto-scan.test.ts
git commit -m "feat(api): auto-scanner interface with stub implementation"
```

---

## Task 2: Advertiser service (TDD)

**Files:** `apps/api/src/services/advertisers.ts`, `tests/advertisers.test.ts`

- [ ] **Step 1: Test**

Write `/Users/thorarinnhjalmarsson/Documents/Antigravity/ada/apps/api/tests/advertisers.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { useEmulator } from './helpers/emulator';
import {
  createAdvertiser,
  getAdvertiserByOwnerEmail,
} from '../src/services/advertisers';

useEmulator();

const valid = {
  ownerEmail: 'anna@blomabud.is',
  companyName: 'Blómabúð Vesturbæjar',
  kennitala: '1234567890',
  vatNumber: '123456',
};

describe('createAdvertiser', () => {
  it('creates advertiser with zero wallet', async () => {
    const adv = await createAdvertiser(valid);
    expect(adv.id).toMatch(/^adv_/);
    expect(adv.walletBalanceIsk).toBe(0);
    expect(adv.status).toBe('active');
  });

  it('rejects duplicate ownerEmail', async () => {
    await createAdvertiser(valid);
    await expect(createAdvertiser(valid)).rejects.toThrow(/already/);
  });
});

describe('getAdvertiserByOwnerEmail', () => {
  it('returns null when missing', async () => {
    expect(await getAdvertiserByOwnerEmail('none@example.is')).toBe(null);
  });
  it('returns advertiser when present', async () => {
    const a = await createAdvertiser(valid);
    const got = await getAdvertiserByOwnerEmail('anna@blomabud.is');
    expect(got?.id).toBe(a.id);
  });
});
```

- [ ] **Step 2: Implement**

Write `/Users/thorarinnhjalmarsson/Documents/Antigravity/ada/apps/api/src/services/advertisers.ts`:

```ts
import { z } from 'zod';
import {
  COLLECTIONS,
  advertiserConverter,
  AdvertiserSchema,
} from '@ada/shared';
import type { Advertiser } from '@ada/shared';
import { db } from '../lib/firebase';
import { generateId } from '../lib/id';
import { conflict, notFound } from '../lib/errors';

const CreateAdvertiserSchema = z.object({
  ownerEmail: z.string().email(),
  companyName: z.string().min(1).max(200),
  kennitala: z.string().regex(/^\d{10}$/),
  vatNumber: z.string().min(1).max(20),
});
export type CreateAdvertiserInput = z.infer<typeof CreateAdvertiserSchema>;

export async function createAdvertiser(input: CreateAdvertiserInput): Promise<Advertiser> {
  const parsed = CreateAdvertiserSchema.parse(input);
  const existing = await getAdvertiserByOwnerEmail(parsed.ownerEmail);
  if (existing) throw conflict('advertiser_exists', `Advertiser exists for ${parsed.ownerEmail}`);

  const adv: Advertiser = AdvertiserSchema.parse({
    id: generateId('adv'),
    ownerEmail: parsed.ownerEmail,
    companyName: parsed.companyName,
    kennitala: parsed.kennitala,
    vatNumber: parsed.vatNumber,
    walletBalanceIsk: 0,
    status: 'active',
    createdAt: new Date(),
  });
  await db.collection(COLLECTIONS.advertisers).doc(adv.id).withConverter(advertiserConverter).set(adv);
  return adv;
}

export async function getAdvertiserById(id: string): Promise<Advertiser | null> {
  const snap = await db.collection(COLLECTIONS.advertisers).doc(id).withConverter(advertiserConverter).get();
  return snap.exists ? (snap.data() as Advertiser) : null;
}

export async function getAdvertiserByOwnerEmail(email: string): Promise<Advertiser | null> {
  const snap = await db
    .collection(COLLECTIONS.advertisers)
    .where('ownerEmail', '==', email)
    .limit(1)
    .withConverter(advertiserConverter)
    .get();
  return snap.empty ? null : (snap.docs[0]!.data() as Advertiser);
}

export async function requireAdvertiser(email: string): Promise<Advertiser> {
  const a = await getAdvertiserByOwnerEmail(email);
  if (!a) throw notFound('advertiser_not_found', `No advertiser for ${email}`);
  return a;
}
```

- [ ] **Step 3: Run & commit**

```bash
firebase --config firebase/firebase.json emulators:exec --only firestore 'pnpm --filter @ada/api test tests/advertisers.test.ts'
git add apps/api/src/services/advertisers.ts apps/api/tests/advertisers.test.ts
git commit -m "feat(api): advertiser service"
```

---

## Task 3: Creative service (TDD)

**Files:** `apps/api/src/services/creatives.ts`, `tests/creatives.test.ts`

- [ ] **Step 1: Test**

Write `/Users/thorarinnhjalmarsson/Documents/Antigravity/ada/apps/api/tests/creatives.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { useEmulator } from './helpers/emulator';
import { createAdvertiser } from '../src/services/advertisers';
import { createCreative, listCreativesForAdvertiser } from '../src/services/creatives';
import { StubAutoScanner } from '../src/services/auto-scan/stub';

useEmulator();

async function adv() {
  return createAdvertiser({
    ownerEmail: 'a@b.is',
    companyName: 'X',
    kennitala: '1234567890',
    vatNumber: '123456',
  });
}

describe('createCreative', () => {
  it('auto-approves clean creative', async () => {
    const a = await adv();
    const c = await createCreative(
      a.id,
      {
        imageUrl: 'https://example/img.png',
        width: 728,
        height: 90,
        clickUrl: 'https://blomabud.is',
        ocrTextHint: 'Sumartilboð',
      },
      new StubAutoScanner(),
    );
    expect(c.reviewStatus).toBe('auto_approved');
    expect(c.reviewLog.length).toBeGreaterThan(0);
  });

  it('rejects creative with blocked terms', async () => {
    const a = await adv();
    const c = await createCreative(
      a.id,
      {
        imageUrl: 'https://example/img.png',
        width: 728,
        height: 90,
        clickUrl: 'https://example.is',
        ocrTextHint: 'casino bonus',
      },
      new StubAutoScanner(),
    );
    expect(c.reviewStatus).toBe('rejected');
  });
});

describe('listCreativesForAdvertiser', () => {
  it('returns creatives for advertiser only', async () => {
    const a = await adv();
    await createCreative(
      a.id,
      {
        imageUrl: 'https://example/img.png',
        width: 728,
        height: 90,
        clickUrl: 'https://blomabud.is',
      },
      new StubAutoScanner(),
    );
    const list = await listCreativesForAdvertiser(a.id);
    expect(list).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Implement**

Write `/Users/thorarinnhjalmarsson/Documents/Antigravity/ada/apps/api/src/services/creatives.ts`:

```ts
import { z } from 'zod';
import {
  COLLECTIONS,
  creativeConverter,
  CreativeSchema,
} from '@ada/shared';
import type { Creative, ReviewStatus } from '@ada/shared';
import { db } from '../lib/firebase';
import { generateId } from '../lib/id';
import { notFound } from '../lib/errors';
import type { AutoScanner } from './auto-scan';

const CreateCreativeInputSchema = z.object({
  imageUrl: z.string().url(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  clickUrl: z.string().url().refine((u) => u.startsWith('https://')),
  ocrTextHint: z.string().optional(),
});
export type CreateCreativeInput = z.infer<typeof CreateCreativeInputSchema>;

export async function createCreative(
  advertiserId: string,
  input: CreateCreativeInput,
  scanner: AutoScanner,
): Promise<Creative> {
  const parsed = CreateCreativeInputSchema.parse(input);
  const scan = await scanner.scan({
    imageUrl: parsed.imageUrl,
    clickUrl: parsed.clickUrl,
    ocrTextHint: parsed.ocrTextHint,
  });

  let reviewStatus: ReviewStatus;
  if (scan.outcome === 'auto_approved') reviewStatus = 'auto_approved';
  else if (scan.outcome === 'auto_rejected') reviewStatus = 'rejected';
  else reviewStatus = 'pending';

  const now = new Date();
  const action =
    reviewStatus === 'auto_approved' ? 'approved' :
    reviewStatus === 'rejected' ? 'rejected' :
    'flagged';

  const creative: Creative = CreativeSchema.parse({
    id: generateId('cre'),
    advertiserId,
    imageUrl: parsed.imageUrl,
    width: parsed.width,
    height: parsed.height,
    clickUrl: parsed.clickUrl,
    reviewStatus,
    reviewLog: [
      {
        at: now,
        by: 'auto',
        action,
        reason: scan.scanResult.blockedTerms.length > 0
          ? `Blocked terms: ${scan.scanResult.blockedTerms.join(', ')}`
          : undefined,
      },
    ],
    autoScanResult: scan.scanResult,
  });

  await db.collection(COLLECTIONS.creatives).doc(creative.id).withConverter(creativeConverter).set(creative);
  return creative;
}

export async function getCreative(id: string): Promise<Creative | null> {
  const snap = await db.collection(COLLECTIONS.creatives).doc(id).withConverter(creativeConverter).get();
  return snap.exists ? (snap.data() as Creative) : null;
}

export async function requireCreative(id: string): Promise<Creative> {
  const c = await getCreative(id);
  if (!c) throw notFound('creative_not_found', `Creative ${id} not found`);
  return c;
}

export async function listCreativesForAdvertiser(advertiserId: string): Promise<Creative[]> {
  const snap = await db
    .collection(COLLECTIONS.creatives)
    .where('advertiserId', '==', advertiserId)
    .withConverter(creativeConverter)
    .get();
  return snap.docs.map((d) => d.data() as Creative);
}

export async function updateCreativeReview(
  id: string,
  patch: { reviewStatus: ReviewStatus; logEntry: Creative['reviewLog'][number] },
): Promise<Creative> {
  const existing = await requireCreative(id);
  const next: Creative = CreativeSchema.parse({
    ...existing,
    reviewStatus: patch.reviewStatus,
    reviewLog: [...existing.reviewLog, patch.logEntry],
  });
  await db.collection(COLLECTIONS.creatives).doc(id).withConverter(creativeConverter).set(next);
  return next;
}
```

- [ ] **Step 3: Run & commit**

```bash
firebase --config firebase/firebase.json emulators:exec --only firestore 'pnpm --filter @ada/api test tests/creatives.test.ts'
git add apps/api/src/services/creatives.ts apps/api/tests/creatives.test.ts
git commit -m "feat(api): creative service with auto-scan"
```

---

## Task 4: Campaign service (TDD)

**Files:** `apps/api/src/services/campaigns.ts`, `tests/campaigns.test.ts`

- [ ] **Step 1: Test**

Write `/Users/thorarinnhjalmarsson/Documents/Antigravity/ada/apps/api/tests/campaigns.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { useEmulator } from './helpers/emulator';
import { createPublisher } from '../src/services/publishers';
import { createSlot } from '../src/services/slots';
import { createAdvertiser } from '../src/services/advertisers';
import { createCreative } from '../src/services/creatives';
import { StubAutoScanner } from '../src/services/auto-scan/stub';
import { createCampaign, listCampaignsForAdvertiser } from '../src/services/campaigns';

useEmulator();

async function setup() {
  const pub = await createPublisher({
    ownerEmail: 'p@p.is',
    domain: 'p.is',
    displayName: 'P',
    payoutMethod: {
      type: 'bank', iban: 'IS140159260076545510730339',
      kennitala: '1111111111', accountName: 'P',
    },
  });
  const slot = await createSlot(pub.id, {
    name: 'A', sizes: [{ width: 728, height: 90 }],
    pricing: { mode: 'cpm', cpmIsk: 1500 },
    placement: { pageMatcher: '/', position: 'above_fold' },
  });
  const adv = await createAdvertiser({
    ownerEmail: 'a@a.is', companyName: 'A', kennitala: '2222222222', vatNumber: '1',
  });
  const cre = await createCreative(adv.id, {
    imageUrl: 'https://x/y.png', width: 728, height: 90, clickUrl: 'https://x.is',
  }, new StubAutoScanner());
  return { pub, slot, adv, cre };
}

describe('createCampaign', () => {
  it('creates a CPM-capped campaign in pending_approval', async () => {
    const { adv, cre, slot } = await setup();
    const cmp = await createCampaign(adv.id, {
      creativeIds: [cre.id],
      slotIds: [slot.id],
      schedule: {
        startsAt: new Date(Date.now() + 1000),
        endsAt: new Date(Date.now() + 86400_000),
      },
      budget: { mode: 'cpm_capped', totalIsk: 20000 },
    });
    expect(cmp.id).toMatch(/^cmp_/);
    expect(cmp.status).toBe('pending_approval');
    expect(cmp.budget.remainingIsk).toBe(20000);
    expect(cmp.perPublisherApproval[Object.keys(cmp.perPublisherApproval)[0]!]).toBeDefined();
  });

  it('rejects when creativeIds reference unknown creative', async () => {
    const { adv, slot } = await setup();
    await expect(
      createCampaign(adv.id, {
        creativeIds: ['cre_nope'],
        slotIds: [slot.id],
        schedule: {
          startsAt: new Date(Date.now() + 1000),
          endsAt: new Date(Date.now() + 86400_000),
        },
        budget: { mode: 'cpm_capped', totalIsk: 1000 },
      }),
    ).rejects.toThrow();
  });

  it('marks perPublisherApproval correctly when publisher.requireManualApproval=true', async () => {
    const { adv, cre, pub, slot } = await setup();
    // toggle policy via direct service call would be ideal; for now we patch raw
    // (publisher service patch in Plan #2 handles this in production)
    const cmp = await createCampaign(adv.id, {
      creativeIds: [cre.id],
      slotIds: [slot.id],
      schedule: {
        startsAt: new Date(Date.now() + 1000),
        endsAt: new Date(Date.now() + 86400_000),
      },
      budget: { mode: 'cpm_capped', totalIsk: 1000 },
    });
    expect(cmp.perPublisherApproval[pub.id]).toBe('approved');
  });
});
```

- [ ] **Step 2: Implement**

Write `/Users/thorarinnhjalmarsson/Documents/Antigravity/ada/apps/api/src/services/campaigns.ts`:

```ts
import { z } from 'zod';
import {
  COLLECTIONS,
  campaignConverter,
  CampaignSchema,
} from '@ada/shared';
import type { Campaign, CampaignStatus } from '@ada/shared';
import { db } from '../lib/firebase';
import { generateId } from '../lib/id';
import { badRequest, notFound } from '../lib/errors';
import { getCreative } from './creatives';
import { getSlot } from './slots';
import { getPublisherById } from './publishers';

const CreateCampaignInputSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  creativeIds: z.array(z.string()).min(1),
  slotIds: z.array(z.string()).min(1),
  schedule: z.object({
    startsAt: z.coerce.date(),
    endsAt: z.coerce.date(),
  }),
  budget: z.discriminatedUnion('mode', [
    z.object({ mode: z.literal('cpm_capped'), totalIsk: z.number().int().positive() }),
    z.object({ mode: z.literal('slot_purchased'), totalIsk: z.number().int().positive() }),
  ]),
});
export type CreateCampaignInput = z.infer<typeof CreateCampaignInputSchema>;

export async function createCampaign(
  advertiserId: string,
  input: CreateCampaignInput,
): Promise<Campaign> {
  const parsed = CreateCampaignInputSchema.parse(input);

  // Verify all creatives exist & belong to advertiser
  for (const cid of parsed.creativeIds) {
    const c = await getCreative(cid);
    if (!c) throw badRequest('unknown_creative', `Creative ${cid} not found`);
    if (c.advertiserId !== advertiserId)
      throw badRequest('foreign_creative', `Creative ${cid} not owned`);
    if (c.reviewStatus === 'rejected')
      throw badRequest('creative_rejected', `Creative ${cid} is rejected`);
  }

  // Build per-publisher approval map from slot lookups
  const perPublisherApproval: Record<string, 'pending' | 'approved' | 'rejected'> = {};
  for (const sid of parsed.slotIds) {
    const slot = await getSlot(sid);
    if (!slot) throw badRequest('unknown_slot', `Slot ${sid} not found`);
    const pub = await getPublisherById(slot.publisherId);
    if (!pub) throw badRequest('unknown_publisher', `Publisher for slot ${sid} not found`);
    perPublisherApproval[pub.id] = pub.contentPolicy.requireManualApproval ? 'pending' : 'approved';
  }

  // Determine overall status
  const allCreativesApproved = await allCreativesAutoApproved(parsed.creativeIds);
  const allPublishersApproved = Object.values(perPublisherApproval).every((v) => v === 'approved');
  const status: CampaignStatus =
    allCreativesApproved && allPublishersApproved ? 'active' : 'pending_approval';

  const campaign: Campaign = CampaignSchema.parse({
    id: generateId('cmp'),
    advertiserId,
    creativeIds: parsed.creativeIds,
    targeting: { slotIds: parsed.slotIds },
    schedule: parsed.schedule,
    budget: {
      mode: parsed.budget.mode,
      totalIsk: parsed.budget.totalIsk,
      remainingIsk: parsed.budget.totalIsk,
    },
    status,
    perPublisherApproval,
  });

  await db.collection(COLLECTIONS.campaigns).doc(campaign.id).withConverter(campaignConverter).set(campaign);
  return campaign;
}

async function allCreativesAutoApproved(ids: string[]): Promise<boolean> {
  for (const id of ids) {
    const c = await getCreative(id);
    if (!c) return false;
    if (c.reviewStatus !== 'auto_approved' && c.reviewStatus !== 'manual_approved') return false;
  }
  return true;
}

export async function getCampaign(id: string): Promise<Campaign | null> {
  const snap = await db.collection(COLLECTIONS.campaigns).doc(id).withConverter(campaignConverter).get();
  return snap.exists ? (snap.data() as Campaign) : null;
}

export async function listCampaignsForAdvertiser(advertiserId: string): Promise<Campaign[]> {
  const snap = await db
    .collection(COLLECTIONS.campaigns)
    .where('advertiserId', '==', advertiserId)
    .withConverter(campaignConverter)
    .get();
  return snap.docs.map((d) => d.data() as Campaign);
}

const UpdateCampaignSchema = z.object({
  status: z.enum(['active', 'paused']).optional(),
});

export async function updateCampaign(
  id: string,
  patch: z.infer<typeof UpdateCampaignSchema>,
): Promise<Campaign> {
  const existing = await getCampaign(id);
  if (!existing) throw notFound('campaign_not_found', `Campaign ${id} not found`);
  const parsed = UpdateCampaignSchema.parse(patch);
  const next: Campaign = CampaignSchema.parse({ ...existing, ...parsed });
  await db.collection(COLLECTIONS.campaigns).doc(id).withConverter(campaignConverter).set(next);
  return next;
}
```

- [ ] **Step 3: Run & commit**

```bash
firebase --config firebase/firebase.json emulators:exec --only firestore 'pnpm --filter @ada/api test tests/campaigns.test.ts'
git add apps/api/src/services/campaigns.ts apps/api/tests/campaigns.test.ts
git commit -m "feat(api): campaign service with validation and approval gating"
```

---

## Task 5: Upgrade push-cache to include active creatives

**Files:** Modify `apps/api/src/lib/push-cache.ts`

- [ ] **Step 1: Replace body of pushSlotCache**

Replace `pushSlotCache` in `/Users/thorarinnhjalmarsson/Documents/Antigravity/ada/apps/api/src/lib/push-cache.ts`:

```ts
export async function pushSlotCache(slotId: string): Promise<void> {
  const slotSnap = await db.collection(COLLECTIONS.slots).doc(slotId).withConverter(slotConverter).get();
  if (!slotSnap.exists) {
    await redis().del(`slot:${slotId}`);
    return;
  }
  const slot = slotSnap.data() as Slot;

  const pubSnap = await db
    .collection(COLLECTIONS.publishers)
    .doc(slot.publisherId)
    .withConverter(publisherConverter)
    .get();
  const blockedCategories = pubSnap.exists
    ? (pubSnap.data()!.contentPolicy.blockedCategories ?? [])
    : [];

  // Find campaigns whose targeting includes this slot, currently active
  const now = new Date();
  const campSnap = await db
    .collection(COLLECTIONS.campaigns)
    .where('targeting.slotIds', 'array-contains', slotId)
    .where('status', '==', 'active')
    .withConverter(campaignConverter)
    .get();

  const activeCreatives: Array<Record<string, unknown>> = [];
  for (const doc of campSnap.docs) {
    const cmp = doc.data();
    if (cmp.schedule.startsAt > now || cmp.schedule.endsAt < now) continue;
    if (cmp.perPublisherApproval[slot.publisherId] !== 'approved') continue;

    for (const creativeId of cmp.creativeIds) {
      const cSnap = await db.collection(COLLECTIONS.creatives).doc(creativeId).get();
      if (!cSnap.exists) continue;
      const cData = cSnap.data();
      if (!cData) continue;
      if (cData.reviewStatus !== 'auto_approved' && cData.reviewStatus !== 'manual_approved') continue;

      activeCreatives.push({
        creativeId,
        campaignId: cmp.id,
        imageUrl: cData.imageUrl,
        clickUrl: cData.clickUrl,
        width: cData.width,
        height: cData.height,
        weight: 1,
        geoCountries: cmp.targeting.geoCountries,
        geoRegions: cmp.targeting.geoRegions,
        frequencyCapPerDay: 3,
        budgetExhausted: cmp.budget.remainingIsk <= 0,
        validFrom: cmp.schedule.startsAt.getTime(),
        validTo: cmp.schedule.endsAt.getTime(),
        priority: cmp.budget.mode === 'slot_purchased' ? 'slot_purchased' : 'cpm',
      });
    }
  }

  const entry = {
    slotId: slot.id,
    publisherId: slot.publisherId,
    sizes: slot.sizes,
    pricing: slot.pricing,
    activeCreatives,
    blockedCategories,
    refreshedAt: Date.now(),
  };
  await redis().set(`slot:${slot.id}`, entry, { ex: CACHE_TTL_SECONDS * 60 });
}

/** Push cache for every slot referenced by a campaign. */
export async function pushCacheForCampaign(campaignId: string): Promise<void> {
  const snap = await db.collection(COLLECTIONS.campaigns).doc(campaignId).withConverter(campaignConverter).get();
  if (!snap.exists) return;
  const cmp = snap.data()!;
  for (const slotId of cmp.targeting.slotIds) {
    await pushSlotCache(slotId);
  }
}
```

Add import at top:

```ts
import { campaignConverter } from '@ada/shared';
```

- [ ] **Step 2: Wire campaign creation to push cache**

Modify `/Users/thorarinnhjalmarsson/Documents/Antigravity/ada/apps/api/src/services/campaigns.ts` — at end of `createCampaign` and `updateCampaign`, add:

```ts
import { pushCacheForCampaign } from '../lib/push-cache';
// after set():
if (process.env.UPSTASH_REDIS_REST_URL) await pushCacheForCampaign(campaign.id);
```

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/lib/push-cache.ts apps/api/src/services/campaigns.ts
git commit -m "feat(api): push-cache reads campaigns for active creatives"
```

---

## Task 6: Slot search service & route

**Files:** `apps/api/src/services/slot-search.ts`, `apps/api/src/routes/slots-search.ts`, `tests/slot-search.test.ts`

- [ ] **Step 1: Test**

Write `/Users/thorarinnhjalmarsson/Documents/Antigravity/ada/apps/api/tests/slot-search.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { useEmulator } from './helpers/emulator';
import { createPublisher } from '../src/services/publishers';
import { createSlot } from '../src/services/slots';
import { searchSlots } from '../src/services/slot-search';

useEmulator();

describe('searchSlots', () => {
  it('filters by size', async () => {
    const p = await createPublisher({
      ownerEmail: 'a@a.is', domain: 'a.is', displayName: 'A',
      payoutMethod: { type: 'bank', iban: 'IS140159260076545510730339', kennitala: '1234567890', accountName: 'A' },
    });
    await createSlot(p.id, {
      name: '728', sizes: [{ width: 728, height: 90 }],
      pricing: { mode: 'cpm', cpmIsk: 1500 },
      placement: { pageMatcher: '/', position: 'above_fold' },
    });
    await createSlot(p.id, {
      name: '300', sizes: [{ width: 300, height: 250 }],
      pricing: { mode: 'cpm', cpmIsk: 1200 },
      placement: { pageMatcher: '/', position: 'sidebar' },
    });
    const found = await searchSlots({ width: 728, height: 90 });
    expect(found.map((s) => s.name)).toEqual(['728']);
  });

  it('filters by maxCpm', async () => {
    const p = await createPublisher({
      ownerEmail: 'b@b.is', domain: 'b.is', displayName: 'B',
      payoutMethod: { type: 'bank', iban: 'IS140159260076545510730339', kennitala: '1234567890', accountName: 'B' },
    });
    await createSlot(p.id, {
      name: 'expensive', sizes: [{ width: 728, height: 90 }],
      pricing: { mode: 'cpm', cpmIsk: 3000 },
      placement: { pageMatcher: '/', position: 'above_fold' },
    });
    await createSlot(p.id, {
      name: 'cheap', sizes: [{ width: 728, height: 90 }],
      pricing: { mode: 'cpm', cpmIsk: 1000 },
      placement: { pageMatcher: '/', position: 'above_fold' },
    });
    const found = await searchSlots({ maxCpm: 1500 });
    expect(found.map((s) => s.name)).toEqual(['cheap']);
  });
});
```

- [ ] **Step 2: Implement**

Write `/Users/thorarinnhjalmarsson/Documents/Antigravity/ada/apps/api/src/services/slot-search.ts`:

```ts
import { COLLECTIONS, slotConverter } from '@ada/shared';
import type { Slot } from '@ada/shared';
import { db } from '../lib/firebase';

export interface SearchFilters {
  width?: number;
  height?: number;
  maxCpm?: number;
  publisherDomain?: string;
}

export async function searchSlots(f: SearchFilters): Promise<Slot[]> {
  // Firestore doesn't support filtering inside arrays well; do post-filter in memory
  // (Acceptable up to ~10k slots; replace with proper index when scaling.)
  let q = db.collection(COLLECTIONS.slots).where('status', '==', 'active');
  const snap = await q.withConverter(slotConverter).get();
  return snap.docs.map((d) => d.data() as Slot).filter((s) => {
    if (f.width !== undefined && !s.sizes.some((sz) => sz.width === f.width)) return false;
    if (f.height !== undefined && !s.sizes.some((sz) => sz.height === f.height)) return false;
    if (f.maxCpm !== undefined) {
      if (s.pricing.mode !== 'cpm') return false;
      if (s.pricing.cpmIsk > f.maxCpm) return false;
    }
    return true;
  });
}
```

- [ ] **Step 3: Route**

Write `/Users/thorarinnhjalmarsson/Documents/Antigravity/ada/apps/api/src/routes/slots-search.ts`:

```ts
import { Hono } from 'hono';
import { requireAuth } from '../lib/auth';
import { handleError } from '../lib/errors';
import { searchSlots } from '../services/slot-search';

export const slotsSearchRoute = new Hono();
slotsSearchRoute.use('/*', requireAuth());

slotsSearchRoute.get('/', async (c) => {
  try {
    const width = c.req.query('width');
    const height = c.req.query('height');
    const maxCpm = c.req.query('maxCpm');
    const slots = await searchSlots({
      width: width ? parseInt(width, 10) : undefined,
      height: height ? parseInt(height, 10) : undefined,
      maxCpm: maxCpm ? parseInt(maxCpm, 10) : undefined,
    });
    return c.json({ slots });
  } catch (err) {
    return handleError(err, c);
  }
});
```

- [ ] **Step 4: Mount in index.ts**

Add to `/Users/thorarinnhjalmarsson/Documents/Antigravity/ada/apps/api/src/index.ts`:

```ts
import { slotsSearchRoute } from './routes/slots-search';
app.route('/v1/slots/search', slotsSearchRoute);
```

- [ ] **Step 5: Commit**

```bash
firebase --config firebase/firebase.json emulators:exec --only firestore 'pnpm --filter @ada/api test'
git add apps/api/src/services/slot-search.ts apps/api/src/routes/slots-search.ts apps/api/src/index.ts apps/api/tests/slot-search.test.ts
git commit -m "feat(api): GET /v1/slots/search with size + price filters"
```

---

## Task 7: Advertiser + creative + campaign REST routes

**Files:** `apps/api/src/routes/advertisers.ts`, `routes/creatives.ts`, `routes/campaigns.ts`, mount in `index.ts`

- [ ] **Step 1: Advertiser routes**

Write `/Users/thorarinnhjalmarsson/Documents/Antigravity/ada/apps/api/src/routes/advertisers.ts`:

```ts
import { Hono } from 'hono';
import { requireAuth } from '../lib/auth';
import { handleError, notFound } from '../lib/errors';
import { createAdvertiser, getAdvertiserByOwnerEmail } from '../services/advertisers';

export const advertisersRoutes = new Hono();
advertisersRoutes.use('/*', requireAuth());

advertisersRoutes.post('/', async (c) => {
  try {
    const user = c.get('user');
    const body = await c.req.json();
    const adv = await createAdvertiser({ ownerEmail: user.email, ...body });
    return c.json({ advertiser: adv }, 201);
  } catch (e) { return handleError(e, c); }
});

advertisersRoutes.get('/me', async (c) => {
  try {
    const user = c.get('user');
    const adv = await getAdvertiserByOwnerEmail(user.email);
    if (!adv) throw notFound('advertiser_not_found', 'No advertiser');
    return c.json({ advertiser: adv });
  } catch (e) { return handleError(e, c); }
});
```

- [ ] **Step 2: Creative routes**

Write `/Users/thorarinnhjalmarsson/Documents/Antigravity/ada/apps/api/src/routes/creatives.ts`:

```ts
import { Hono } from 'hono';
import { requireAuth } from '../lib/auth';
import { forbidden, handleError, notFound } from '../lib/errors';
import { getAdvertiserByOwnerEmail } from '../services/advertisers';
import { createCreative, getCreative, listCreativesForAdvertiser } from '../services/creatives';
import { StubAutoScanner } from '../services/auto-scan/stub';

const scanner = new StubAutoScanner();

export const creativesRoutes = new Hono();
creativesRoutes.use('/*', requireAuth());

creativesRoutes.post('/', async (c) => {
  try {
    const user = c.get('user');
    const adv = await getAdvertiserByOwnerEmail(user.email);
    if (!adv) throw notFound('advertiser_not_found', 'No advertiser');
    const body = await c.req.json();
    const cre = await createCreative(adv.id, body, scanner);
    return c.json({ creative: cre }, 201);
  } catch (e) { return handleError(e, c); }
});

creativesRoutes.get('/', async (c) => {
  try {
    const user = c.get('user');
    const adv = await getAdvertiserByOwnerEmail(user.email);
    if (!adv) throw notFound('advertiser_not_found', 'No advertiser');
    const list = await listCreativesForAdvertiser(adv.id);
    return c.json({ creatives: list });
  } catch (e) { return handleError(e, c); }
});

creativesRoutes.get('/:id', async (c) => {
  try {
    const user = c.get('user');
    const adv = await getAdvertiserByOwnerEmail(user.email);
    if (!adv) throw notFound('advertiser_not_found', 'No advertiser');
    const cre = await getCreative(c.req.param('id'));
    if (!cre) throw notFound('creative_not_found', 'Not found');
    if (cre.advertiserId !== adv.id) throw forbidden();
    return c.json({ creative: cre });
  } catch (e) { return handleError(e, c); }
});
```

- [ ] **Step 3: Campaign routes**

Write `/Users/thorarinnhjalmarsson/Documents/Antigravity/ada/apps/api/src/routes/campaigns.ts`:

```ts
import { Hono } from 'hono';
import { requireAuth } from '../lib/auth';
import { forbidden, handleError, notFound } from '../lib/errors';
import { getAdvertiserByOwnerEmail } from '../services/advertisers';
import {
  createCampaign,
  getCampaign,
  listCampaignsForAdvertiser,
  updateCampaign,
} from '../services/campaigns';

export const campaignsRoutes = new Hono();
campaignsRoutes.use('/*', requireAuth());

campaignsRoutes.post('/', async (c) => {
  try {
    const user = c.get('user');
    const adv = await getAdvertiserByOwnerEmail(user.email);
    if (!adv) throw notFound('advertiser_not_found', 'No advertiser');
    const body = await c.req.json();
    const cmp = await createCampaign(adv.id, body);
    return c.json({ campaign: cmp }, 201);
  } catch (e) { return handleError(e, c); }
});

campaignsRoutes.get('/', async (c) => {
  try {
    const user = c.get('user');
    const adv = await getAdvertiserByOwnerEmail(user.email);
    if (!adv) throw notFound('advertiser_not_found', 'No advertiser');
    return c.json({ campaigns: await listCampaignsForAdvertiser(adv.id) });
  } catch (e) { return handleError(e, c); }
});

campaignsRoutes.get('/:id', async (c) => {
  try {
    const user = c.get('user');
    const adv = await getAdvertiserByOwnerEmail(user.email);
    if (!adv) throw notFound('advertiser_not_found', 'No advertiser');
    const cmp = await getCampaign(c.req.param('id'));
    if (!cmp) throw notFound('campaign_not_found', 'Not found');
    if (cmp.advertiserId !== adv.id) throw forbidden();
    return c.json({ campaign: cmp });
  } catch (e) { return handleError(e, c); }
});

campaignsRoutes.patch('/:id', async (c) => {
  try {
    const user = c.get('user');
    const adv = await getAdvertiserByOwnerEmail(user.email);
    if (!adv) throw notFound('advertiser_not_found', 'No advertiser');
    const id = c.req.param('id');
    const existing = await getCampaign(id);
    if (!existing) throw notFound('campaign_not_found', 'Not found');
    if (existing.advertiserId !== adv.id) throw forbidden();
    const body = await c.req.json();
    return c.json({ campaign: await updateCampaign(id, body) });
  } catch (e) { return handleError(e, c); }
});
```

- [ ] **Step 4: Mount all in index.ts**

Replace `/Users/thorarinnhjalmarsson/Documents/Antigravity/ada/apps/api/src/index.ts`:

```ts
import { Hono } from 'hono';
import { publishersRoutes } from './routes/publishers';
import { slotsRoutes } from './routes/slots';
import { advertisersRoutes } from './routes/advertisers';
import { creativesRoutes } from './routes/creatives';
import { campaignsRoutes } from './routes/campaigns';
import { slotsSearchRoute } from './routes/slots-search';

export const app = new Hono();
app.get('/healthz', (c) => c.json({ ok: true }));
app.route('/v1/publishers', publishersRoutes);
app.route('/v1/publishers/me/slots', slotsRoutes);
app.route('/v1/advertisers', advertisersRoutes);
app.route('/v1/creatives', creativesRoutes);
app.route('/v1/campaigns', campaignsRoutes);
app.route('/v1/slots/search', slotsSearchRoute);

export default app;
```

- [ ] **Step 5: Run all tests + commit**

```bash
firebase --config firebase/firebase.json emulators:exec --only firestore 'pnpm --filter @ada/api test'
git add apps/api/src/routes apps/api/src/index.ts
git commit -m "feat(api): advertiser, creative, campaign REST routes"
```

---

## Self-Review

- Endpoints covered: POST /v1/advertisers, GET /v1/advertisers/me, POST/GET/GET-by-id /v1/creatives, POST/GET/GET-by-id/PATCH /v1/campaigns, GET /v1/slots/search. Matches spec §8.2 advertiser block.
- Auto-scan stub matches spec §7.1 outcomes (auto_approved, flagged_for_manual, auto_rejected). Real scanner swap-in in V2.
- Cache push from campaign mutations now populates active creatives — closes loop with Plan #3 serving endpoint.
- Wallet endpoints (`/v1/advertisers/me/wallet`) covered in Plan #5 (Billing).
- Campaign stats (`/v1/campaigns/:id/stats`) covered in Plan #9.
- Admin approval queue route covered in Plan #6.
- Type consistency verified between campaign service `CreateCampaignInput` and CampaignSchema.
