# ADA Payouts & Stats Aggregation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans.

**Goal:** Monthly payout cron, admin payout UI route, hourly stats aggregation from analytics queue → Firestore aggregates, campaign stats endpoint, CDN deploy automation.

**Architecture:** Two cron jobs — hourly stats aggregator (drains Redis `events:queue` → writes `stats/...` Firestore docs) and monthly payout job (sums publisher_credit ledger entries → creates `payouts/...` docs). Admin marks payouts as completed via UI with manual bank transfer (V1).

**Tech Stack:** Same as Plan #2/#5.

**Depends on:** Plans #1, #2, #4, #5, #7.

**Companion spec sections:** 4.1 (stats collection), 4.3 (analytics), 6.4 (payout), 9.4 (deployment).

---

## File Structure

```
apps/api/
├── src/services/
│   ├── stats-aggregator.ts          # drainAndAggregate()
│   ├── campaign-stats.ts            # getCampaignStats(campaignId, period)
│   └── payouts.ts                   # generateMonthlyPayouts, listPendingPayouts, markPaid
├── src/routes/
│   ├── campaign-stats.ts            # GET /v1/campaigns/:id/stats
│   └── admin/
│       └── payouts.ts               # /v1/admin/payouts
└── api/
    ├── cron-aggregate.ts            # hourly
    └── cron-payouts.ts              # monthly (1st of month)

.github/workflows/
└── deploy-snippet.yml               # uploads snippet.js to Cloudflare R2 + purges cache
```

---

## Task 1: Stats aggregator service (TDD)

**Files:** `apps/api/src/services/stats-aggregator.ts`, `tests/stats-aggregator.test.ts`

- [ ] **Step 1: Test**

Write `/Users/thorarinnhjalmarsson/Documents/Antigravity/ada/apps/api/tests/stats-aggregator.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { useEmulator } from './helpers/emulator';
import { aggregateEvents } from '../src/services/stats-aggregator';
import { COLLECTIONS } from '@ada/shared';
import { db } from '../src/lib/firebase';

useEmulator();

describe('aggregateEvents', () => {
  it('groups impressions into hourly buckets per campaign', async () => {
    const ts = Date.UTC(2026, 5, 2, 14, 30, 0); // 2026-06-02 14:30:00 UTC
    const events = [
      {
        type: 'impression' as const,
        campaignId: 'cmp_a',
        publisherId: 'pub_a',
        creativeId: 'cre_a',
        slotId: 's1',
        advertiserId: 'adv_a',
        country: 'IS',
        visitorToken: 'v1',
        ts,
      },
      {
        type: 'impression' as const,
        campaignId: 'cmp_a',
        publisherId: 'pub_a',
        creativeId: 'cre_a',
        slotId: 's1',
        advertiserId: 'adv_a',
        country: 'IS',
        visitorToken: 'v2',
        ts: ts + 1,
      },
      {
        type: 'click' as const,
        campaignId: 'cmp_a',
        publisherId: 'pub_a',
        creativeId: 'cre_a',
        slotId: 's1',
        advertiserId: 'adv_a',
        country: 'IS',
        visitorToken: 'v1',
        ts: ts + 2,
      },
    ];
    await aggregateEvents(events);
    // Check Firestore aggregate
    const docPath = `${COLLECTIONS.stats}/campaigns/cmp_a/2026060214`;
    const snap = await db.doc(docPath).get();
    expect(snap.exists).toBe(true);
    const data = snap.data()!;
    expect(data.impressions).toBe(2);
    expect(data.clicks).toBe(1);
  });
});
```

- [ ] **Step 2: Implement**

Write `/Users/thorarinnhjalmarsson/Documents/Antigravity/ada/apps/api/src/services/stats-aggregator.ts`:

```ts
import { COLLECTIONS } from '@ada/shared';
import { db } from '../lib/firebase';
import { Redis } from '@upstash/redis';
import { FieldValue } from 'firebase-admin/firestore';

export interface QueuedEvent {
  type: 'impression' | 'click';
  slotId: string;
  publisherId: string;
  creativeId: string;
  campaignId: string;
  advertiserId: string;
  country: string;
  visitorToken: string;
  ts: number;
}

function hourKey(ts: number): string {
  const d = new Date(ts);
  return (
    d.getUTCFullYear().toString() +
    String(d.getUTCMonth() + 1).padStart(2, '0') +
    String(d.getUTCDate()).padStart(2, '0') +
    String(d.getUTCHours()).padStart(2, '0')
  );
}

function dayKey(ts: number): string {
  const d = new Date(ts);
  return (
    d.getUTCFullYear().toString() +
    String(d.getUTCMonth() + 1).padStart(2, '0') +
    String(d.getUTCDate()).padStart(2, '0')
  );
}

export async function aggregateEvents(events: QueuedEvent[]): Promise<void> {
  if (events.length === 0) return;

  // Buckets: campaign-hour, publisher-day, publisher-slot-day
  interface Bucket {
    impressions: number;
    clicks: number;
  }
  const campaignHour = new Map<string, Bucket>();
  const publisherDay = new Map<string, Bucket>();
  const publisherSlotDay = new Map<string, Bucket>();

  for (const ev of events) {
    const ch = `${ev.campaignId}/${hourKey(ev.ts)}`;
    const pd = `${ev.publisherId}/${dayKey(ev.ts)}`;
    const psd = `${ev.publisherId}/${ev.slotId}/${dayKey(ev.ts)}`;
    for (const map of [campaignHour, publisherDay, publisherSlotDay]) {
      const key = map === campaignHour ? ch : map === publisherDay ? pd : psd;
      const b = map.get(key) ?? { impressions: 0, clicks: 0 };
      if (ev.type === 'impression') b.impressions++;
      else b.clicks++;
      map.set(key, b);
    }
  }

  const batch = db.batch();

  for (const [key, b] of campaignHour) {
    const [campaignId, hk] = key.split('/');
    const ref = db.doc(`${COLLECTIONS.stats}/campaigns/${campaignId}/${hk}`);
    batch.set(
      ref,
      {
        impressions: FieldValue.increment(b.impressions),
        clicks: FieldValue.increment(b.clicks),
      },
      { merge: true },
    );
  }
  for (const [key, b] of publisherDay) {
    const [publisherId, dk] = key.split('/');
    const ref = db.doc(`${COLLECTIONS.stats}/publishers/${publisherId}/${dk}`);
    batch.set(
      ref,
      {
        impressions: FieldValue.increment(b.impressions),
        clicks: FieldValue.increment(b.clicks),
      },
      { merge: true },
    );
  }
  for (const [key, b] of publisherSlotDay) {
    const [publisherId, slotId, dk] = key.split('/');
    const ref = db.doc(`${COLLECTIONS.stats}/publisher_slots/${publisherId}_${slotId}/${dk}`);
    batch.set(
      ref,
      {
        impressions: FieldValue.increment(b.impressions),
        clicks: FieldValue.increment(b.clicks),
      },
      { merge: true },
    );
  }

  await batch.commit();
}

let _redis: Redis | null = null;
function redis() {
  if (_redis) return _redis;
  _redis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL!,
    token: process.env.UPSTASH_REDIS_REST_TOKEN!,
  });
  return _redis;
}

export async function drainAndAggregate(batchSize = 1000): Promise<number> {
  const events: QueuedEvent[] = [];
  for (let i = 0; i < batchSize; i++) {
    const raw = await redis().rpop<string>('events:queue');
    if (!raw) break;
    try {
      events.push(JSON.parse(raw) as QueuedEvent);
    } catch {
      /* skip */
    }
  }
  await aggregateEvents(events);
  return events.length;
}
```

- [ ] **Step 3: Run + commit**

```bash
firebase --config firebase/firebase.json emulators:exec --only firestore 'pnpm --filter @ada/api test tests/stats-aggregator.test.ts'
git add apps/api/src/services/stats-aggregator.ts apps/api/tests/stats-aggregator.test.ts
git commit -m "feat(api): hourly stats aggregator"
```

---

## Task 2: Hourly cron endpoint

**Files:** `apps/api/api/cron-aggregate.ts`, update `vercel.json`

- [ ] **Step 1: Endpoint**

Write `/Users/thorarinnhjalmarsson/Documents/Antigravity/ada/apps/api/api/cron-aggregate.ts`:

```ts
import { drainAndAggregate } from '../src/services/stats-aggregator';

export const config = { runtime: 'nodejs' };

export default async function handler(req: Request): Promise<Response> {
  if (req.headers.get('Authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('forbidden', { status: 403 });
  }
  const total: number[] = [];
  // Drain up to 5 batches per cron run (5000 events max)
  for (let i = 0; i < 5; i++) {
    const n = await drainAndAggregate(1000);
    total.push(n);
    if (n === 0) break;
  }
  return new Response(JSON.stringify({ batches: total }), {
    headers: { 'Content-Type': 'application/json' },
  });
}
```

- [ ] **Step 2: Cron schedule**

Modify `apps/api/vercel.json` `crons` array:

```json
"crons": [
  { "path": "/api/cron-accrue", "schedule": "*/15 * * * *" },
  { "path": "/api/cron-aggregate", "schedule": "0 * * * *" }
]
```

- [ ] **Step 3: Commit**

```bash
git add apps/api/api/cron-aggregate.ts apps/api/vercel.json
git commit -m "feat(api): hourly stats aggregation cron"
```

---

## Task 3: Campaign stats endpoint

**Files:** `apps/api/src/services/campaign-stats.ts`, `apps/api/src/routes/campaign-stats.ts`, modify `apps/api/src/routes/campaigns.ts`

- [ ] **Step 1: Service**

Write `/Users/thorarinnhjalmarsson/Documents/Antigravity/ada/apps/api/src/services/campaign-stats.ts`:

```ts
import { COLLECTIONS } from '@ada/shared';
import { db } from '../lib/firebase';

export interface CampaignStatsResponse {
  impressions: number;
  clicks: number;
  hours: Array<{ hour: string; impressions: number; clicks: number }>;
}

export async function getCampaignStats(
  campaignId: string,
  hours = 24 * 30,
): Promise<CampaignStatsResponse> {
  const out: CampaignStatsResponse['hours'] = [];
  let impressions = 0;
  let clicks = 0;
  const now = new Date();

  for (let i = 0; i < hours; i++) {
    const d = new Date(now.getTime() - i * 3600_000);
    const hk =
      d.getUTCFullYear().toString() +
      String(d.getUTCMonth() + 1).padStart(2, '0') +
      String(d.getUTCDate()).padStart(2, '0') +
      String(d.getUTCHours()).padStart(2, '0');
    const snap = await db.doc(`${COLLECTIONS.stats}/campaigns/${campaignId}/${hk}`).get();
    if (!snap.exists) continue;
    const data = snap.data()!;
    impressions += (data.impressions as number) ?? 0;
    clicks += (data.clicks as number) ?? 0;
    out.push({
      hour: hk,
      impressions: (data.impressions as number) ?? 0,
      clicks: (data.clicks as number) ?? 0,
    });
  }

  return { impressions, clicks, hours: out };
}
```

- [ ] **Step 2: Add stats endpoint to campaigns route**

Modify `/Users/thorarinnhjalmarsson/Documents/Antigravity/ada/apps/api/src/routes/campaigns.ts` — add:

```ts
import { getCampaignStats } from '../services/campaign-stats';

campaignsRoutes.get('/:id/stats', async (c) => {
  try {
    const user = c.get('user');
    const adv = await getAdvertiserByOwnerEmail(user.email);
    if (!adv) throw notFound('advertiser_not_found', 'No advertiser');
    const id = c.req.param('id');
    const cmp = await getCampaign(id);
    if (!cmp) throw notFound('campaign_not_found', 'Not found');
    if (cmp.advertiserId !== adv.id) throw forbidden();
    const stats = await getCampaignStats(id);
    return c.json({ stats });
  } catch (e) {
    return handleError(e, c);
  }
});
```

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/services/campaign-stats.ts apps/api/src/routes/campaigns.ts
git commit -m "feat(api): GET /v1/campaigns/:id/stats reads hourly aggregates"
```

---

## Task 4: Payouts service (TDD)

**Files:** `apps/api/src/services/payouts.ts`, `tests/payouts.test.ts`

- [ ] **Step 1: Test**

Write `/Users/thorarinnhjalmarsson/Documents/Antigravity/ada/apps/api/tests/payouts.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { useEmulator } from './helpers/emulator';
import { createPublisher } from '../src/services/publishers';
import { creditPublisher } from '../src/services/wallet';
import {
  generateMonthlyPayouts,
  listPendingPayouts,
  markPayoutCompleted,
} from '../src/services/payouts';

useEmulator();

async function pub() {
  return createPublisher({
    ownerEmail: 'p@p.is',
    domain: 'p.is',
    displayName: 'P',
    payoutMethod: {
      type: 'bank',
      iban: 'IS140159260076545510730339',
      kennitala: '1234567890',
      accountName: 'P',
    },
  });
}

describe('generateMonthlyPayouts', () => {
  it('creates pending payout from publisher credits in period', async () => {
    const p = await pub();
    // 10.000 gross → 8.000 net (after 20% fee)
    await creditPublisher(p.id, 'cmp_1', 10000);
    const periodStart = new Date(Date.now() - 86400_000 * 30);
    const periodEnd = new Date(Date.now() + 86400_000);
    const created = await generateMonthlyPayouts(periodStart, periodEnd);
    expect(created.length).toBe(1);
    expect(created[0]!.publisherId).toBe(p.id);
    expect(created[0]!.netIsk).toBe(8000);
    expect(created[0]!.status).toBe('pending');
  });

  it('skips publishers with net under MIN_PAYOUT_ISK', async () => {
    const p = await pub();
    await creditPublisher(p.id, 'cmp_2', 1000); // net=800, under 5000 threshold
    const periodStart = new Date(Date.now() - 86400_000 * 30);
    const periodEnd = new Date(Date.now() + 86400_000);
    const created = await generateMonthlyPayouts(periodStart, periodEnd);
    expect(created.length).toBe(0);
  });
});

describe('markPayoutCompleted', () => {
  it('marks payout completed and appends payout ledger entry', async () => {
    const p = await pub();
    await creditPublisher(p.id, 'cmp_3', 20000);
    const periodStart = new Date(Date.now() - 86400_000 * 30);
    const periodEnd = new Date(Date.now() + 86400_000);
    const [payout] = await generateMonthlyPayouts(periodStart, periodEnd);
    await markPayoutCompleted(payout!.id, 'BANK_REF_123');
    const pending = await listPendingPayouts();
    expect(pending.find((x) => x.id === payout!.id)).toBeUndefined();
  });
});
```

- [ ] **Step 2: Implement**

Write `/Users/thorarinnhjalmarsson/Documents/Antigravity/ada/apps/api/src/services/payouts.ts`:

```ts
import {
  COLLECTIONS,
  payoutConverter,
  PayoutSchema,
  MIN_PAYOUT_ISK,
  DEFAULT_PLATFORM_FEE_PERCENT,
  ledgerEntryConverter,
} from '@ada/shared';
import type { Payout } from '@ada/shared';
import { db } from '../lib/firebase';
import { generateId } from '../lib/id';
import { appendLedger } from './ledger';
import { notFound } from '../lib/errors';

export async function generateMonthlyPayouts(
  periodStart: Date,
  periodEnd: Date,
): Promise<Payout[]> {
  // Sum publisher_credit entries per publisher in period
  const snap = await db
    .collection(COLLECTIONS.ledger)
    .where('type', '==', 'publisher_credit')
    .where('createdAt', '>=', periodStart)
    .where('createdAt', '<=', periodEnd)
    .withConverter(ledgerEntryConverter)
    .get();

  const byPublisher = new Map<string, number>();
  for (const doc of snap.docs) {
    const e = doc.data();
    if (e.party.type !== 'publisher') continue;
    byPublisher.set(e.party.id, (byPublisher.get(e.party.id) ?? 0) + e.amountIsk);
  }

  const created: Payout[] = [];
  for (const [publisherId, netIsk] of byPublisher) {
    if (netIsk < MIN_PAYOUT_ISK) continue;
    const grossIsk = Math.round(netIsk / (1 - DEFAULT_PLATFORM_FEE_PERCENT / 100));
    const platformFeeIsk = grossIsk - netIsk;

    const payout: Payout = PayoutSchema.parse({
      id: generateId('pay'),
      publisherId,
      periodStart,
      periodEnd,
      grossIsk,
      platformFeeIsk,
      netIsk,
      status: 'pending',
      bankReference: '',
    });
    await db
      .collection(COLLECTIONS.payouts)
      .doc(payout.id)
      .withConverter(payoutConverter)
      .set(payout);
    created.push(payout);
  }
  return created;
}

export async function listPendingPayouts(): Promise<Payout[]> {
  const snap = await db
    .collection(COLLECTIONS.payouts)
    .where('status', 'in', ['pending', 'processing'])
    .withConverter(payoutConverter)
    .get();
  return snap.docs.map((d) => d.data());
}

export async function markPayoutCompleted(
  payoutId: string,
  bankReference: string,
): Promise<Payout> {
  const ref = db.collection(COLLECTIONS.payouts).doc(payoutId);
  const snap = await ref.withConverter(payoutConverter).get();
  if (!snap.exists) throw notFound('payout_not_found', `Payout ${payoutId} not found`);
  const payout = snap.data() as Payout;
  const updated: Payout = PayoutSchema.parse({ ...payout, status: 'completed', bankReference });
  await ref.withConverter(payoutConverter).set(updated);
  // Drain ledger by adding a payout entry (negative for publisher)
  await appendLedger({
    party: { type: 'publisher', id: payout.publisherId },
    type: 'payout',
    amountIsk: -payout.netIsk,
    relatedId: payoutId,
  });
  return updated;
}
```

- [ ] **Step 3: Run + commit**

```bash
firebase --config firebase/firebase.json emulators:exec --only firestore 'pnpm --filter @ada/api test tests/payouts.test.ts'
git add apps/api/src/services/payouts.ts apps/api/tests/payouts.test.ts
git commit -m "feat(api): monthly payouts generator and completion"
```

---

## Task 5: Monthly payout cron + admin routes

**Files:** `apps/api/api/cron-payouts.ts`, `apps/api/src/routes/admin/payouts.ts`

- [ ] **Step 1: Cron**

Write `/Users/thorarinnhjalmarsson/Documents/Antigravity/ada/apps/api/api/cron-payouts.ts`:

```ts
import { generateMonthlyPayouts } from '../src/services/payouts';

export const config = { runtime: 'nodejs' };

export default async function handler(req: Request): Promise<Response> {
  if (req.headers.get('Authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('forbidden', { status: 403 });
  }
  // Run on the 1st of month; period is the previous month
  const now = new Date();
  const periodEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0, 23, 59, 59));
  const periodStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const created = await generateMonthlyPayouts(periodStart, periodEnd);
  return new Response(JSON.stringify({ created: created.length }), {
    headers: { 'Content-Type': 'application/json' },
  });
}
```

Modify `apps/api/vercel.json` crons:

```json
"crons": [
  { "path": "/api/cron-accrue", "schedule": "*/15 * * * *" },
  { "path": "/api/cron-aggregate", "schedule": "0 * * * *" },
  { "path": "/api/cron-payouts", "schedule": "0 6 1 * *" }
]
```

- [ ] **Step 2: Admin payout routes**

Write `/Users/thorarinnhjalmarsson/Documents/Antigravity/ada/apps/api/src/routes/admin/payouts.ts`:

```ts
import { Hono } from 'hono';
import { requireAdmin, requireAuth } from '../../lib/auth';
import { handleError } from '../../lib/errors';
import { listPendingPayouts, markPayoutCompleted } from '../../services/payouts';

export const adminPayoutsRoutes = new Hono();
adminPayoutsRoutes.use('/*', requireAuth(), requireAdmin());

adminPayoutsRoutes.get('/pending', async (c) => {
  try {
    const items = await listPendingPayouts();
    return c.json({ payouts: items });
  } catch (e) {
    return handleError(e, c);
  }
});

adminPayoutsRoutes.post('/:id/mark-completed', async (c) => {
  try {
    const id = c.req.param('id');
    const body = (await c.req.json()) as { bankReference: string };
    const updated = await markPayoutCompleted(id, body.bankReference);
    return c.json({ payout: updated });
  } catch (e) {
    return handleError(e, c);
  }
});
```

Modify `apps/api/src/routes/admin/index.ts`:

```ts
import { adminPayoutsRoutes } from './payouts';
adminRoutes.route('/payouts', adminPayoutsRoutes);
```

- [ ] **Step 3: Commit**

```bash
git add apps/api/api/cron-payouts.ts apps/api/src/routes/admin/payouts.ts apps/api/src/routes/admin/index.ts apps/api/vercel.json
git commit -m "feat(api): monthly payout cron + admin payout management routes"
```

---

## Task 6: Snippet CDN deploy workflow

**Files:** `.github/workflows/deploy-snippet.yml`

- [ ] **Step 1: Workflow**

Write `/Users/thorarinnhjalmarsson/Documents/Antigravity/ada/.github/workflows/deploy-snippet.yml`:

```yaml
name: Deploy Snippet to Cloudflare CDN

on:
  push:
    branches: [main]
    paths:
      - 'packages/snippet/**'
  workflow_dispatch:

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v3
        with:
          version: 9
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'pnpm'
      - run: pnpm install --frozen-lockfile
      - run: pnpm --filter @ada/snippet build

      - name: Upload to Cloudflare R2
        env:
          AWS_ACCESS_KEY_ID: ${{ secrets.R2_ACCESS_KEY_ID }}
          AWS_SECRET_ACCESS_KEY: ${{ secrets.R2_SECRET_ACCESS_KEY }}
          AWS_DEFAULT_REGION: auto
        run: |
          aws s3 cp packages/snippet/dist/snippet.js \
            s3://ada-cdn/v1/snippet.js \
            --endpoint-url ${{ secrets.R2_ENDPOINT_URL }} \
            --content-type application/javascript \
            --cache-control "public, max-age=300"

      - name: Purge Cloudflare cache
        run: |
          curl -X POST \
            -H "Authorization: Bearer ${{ secrets.CLOUDFLARE_API_TOKEN }}" \
            -H "Content-Type: application/json" \
            --data '{"files":["https://cdn.adplatform.is/v1/snippet.js"]}' \
            https://api.cloudflare.com/client/v4/zones/${{ secrets.CLOUDFLARE_ZONE_ID }}/purge_cache
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/deploy-snippet.yml
git commit -m "ci: auto-deploy snippet.js to Cloudflare R2 on main push"
```

---

## Task 7: End-to-end smoke test

**Files:** `apps/api/tests/e2e.test.ts`

- [ ] **Step 1: Integration test covering full flow**

Write `/Users/thorarinnhjalmarsson/Documents/Antigravity/ada/apps/api/tests/e2e.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { useEmulator } from './helpers/emulator';
import { createHmac } from 'crypto';

vi.mock('../src/lib/firebase', async () => {
  const actual = await vi.importActual<typeof import('../src/lib/firebase')>('../src/lib/firebase');
  return {
    ...actual,
    auth: {
      verifyIdToken: vi.fn(async (token: string) => {
        const map: Record<string, { uid: string; email: string; admin?: boolean }> = {
          'pub-tok': { uid: 'up', email: 'pub@p.is' },
          'adv-tok': { uid: 'ua', email: 'adv@a.is' },
          'admin-tok': { uid: 'um', email: 'admin@a.is', admin: true },
        };
        const u = map[token];
        if (!u) throw new Error('bad');
        return u;
      }),
    },
  };
});

import app from '../src/index';

useEmulator();
process.env.TEYA_WEBHOOK_SECRET = 'whsec_e2e';

describe('end-to-end smoke', () => {
  it('publisher → slot → advertiser → topup → creative → campaign → admin approves', async () => {
    // Publisher
    const pubRes = await app.request('/v1/publishers', {
      method: 'POST',
      headers: { Authorization: 'Bearer pub-tok', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        domain: 'kjarninn.is',
        displayName: 'Kjarninn',
        payoutMethod: {
          type: 'bank',
          iban: 'IS140159260076545510730339',
          kennitala: '1111111111',
          accountName: 'K',
        },
      }),
    });
    expect(pubRes.status).toBe(201);

    // Slot
    const slotRes = await app.request('/v1/publishers/me/slots', {
      method: 'POST',
      headers: { Authorization: 'Bearer pub-tok', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Forsíða',
        sizes: [{ width: 728, height: 90 }],
        pricing: { mode: 'cpm', cpmIsk: 1500 },
        placement: { pageMatcher: '/', position: 'above_fold' },
      }),
    });
    const { slot } = await slotRes.json();

    // Advertiser
    await app.request('/v1/advertisers', {
      method: 'POST',
      headers: { Authorization: 'Bearer adv-tok', 'Content-Type': 'application/json' },
      body: JSON.stringify({ companyName: 'A', kennitala: '2222222222', vatNumber: '1' }),
    });

    // Top up via direct webhook
    const advMe = await (
      await app.request('/v1/advertisers/me', {
        headers: { Authorization: 'Bearer adv-tok' },
      })
    ).json();
    const webhookBody = JSON.stringify({
      type: 'checkout.completed',
      data: {
        sessionId: 'e2e_sess',
        amountIsk: 50000,
        metadata: { advertiserId: advMe.advertiser.id },
      },
    });
    const sig = createHmac('sha256', 'whsec_e2e').update(webhookBody).digest('hex');
    const whRes = await app.request('/api/teya/webhook', {
      method: 'POST',
      headers: { 'Teya-Signature': sig, 'Content-Type': 'application/json' },
      body: webhookBody,
    });
    expect(whRes.status).toBe(200);

    // Creative (clean → auto-approved)
    const creRes = await app.request('/v1/creatives', {
      method: 'POST',
      headers: { Authorization: 'Bearer adv-tok', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        imageUrl: 'https://example/x.png',
        width: 728,
        height: 90,
        clickUrl: 'https://blomabud.is',
      }),
    });
    const { creative } = await creRes.json();
    expect(creative.reviewStatus).toBe('auto_approved');

    // Campaign
    const cmpRes = await app.request('/v1/campaigns', {
      method: 'POST',
      headers: { Authorization: 'Bearer adv-tok', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        creativeIds: [creative.id],
        slotIds: [slot.id],
        schedule: {
          startsAt: new Date(Date.now() + 1000).toISOString(),
          endsAt: new Date(Date.now() + 86400_000).toISOString(),
        },
        budget: { mode: 'cpm_capped', totalIsk: 5000 },
      }),
    });
    expect(cmpRes.status).toBe(201);
    const { campaign } = await cmpRes.json();
    expect(campaign.status).toBe('active');
  });
});
```

- [ ] **Step 2: Run + commit**

```bash
firebase --config firebase/firebase.json emulators:exec --only firestore 'pnpm --filter @ada/api test tests/e2e.test.ts'
git add apps/api/tests/e2e.test.ts
git commit -m "test(api): end-to-end smoke test publisher → campaign → active"
```

---

## Task 8: Final verification

- [ ] **Step 1: Run everything**

```bash
cd /Users/thorarinnhjalmarsson/Documents/Antigravity/ada
firebase --config firebase/firebase.json emulators:exec --only firestore 'pnpm test'
pnpm build
pnpm typecheck
pnpm lint
pnpm test:rules
```

Expected: All green.

- [ ] **Step 2: Document deployment**

Append to `/Users/thorarinnhjalmarsson/Documents/Antigravity/ada/README.md`:

```markdown
## Deployment

| App       | Host                                 | URL                             |
| --------- | ------------------------------------ | ------------------------------- |
| API       | Vercel                               | api.adplatform.is               |
| Dashboard | Vercel                               | app.adplatform.is               |
| MCP       | Vercel                               | mcp.adplatform.is               |
| Serving   | Vercel (V1) / Cloudflare Worker (V2) | serve.adplatform.is             |
| Snippet   | Cloudflare R2 + CDN                  | cdn.adplatform.is/v1/snippet.js |
| Firestore | Firebase                             | ada-prod project                |
| Redis     | Upstash                              | ada-prod database               |

Crons (Vercel):

- `*/15 * * * *` — CPM accrual
- `0 * * * *` — Stats aggregation
- `0 6 1 * *` — Monthly payouts

Manual operations:

- Admin marks each payout `completed` after executing manual bank transfer to publisher IBAN.
- VAT invoicing handled by bookkeeper from monthly top-up summary export.
```

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: deployment topology and cron schedule"
```

---

## Self-Review

- Stats aggregation (spec §4.3): hourly cron drains Redis events queue → Firestore aggregates per campaign/publisher/slot.
- Campaign stats endpoint (spec §8.2): GET /v1/campaigns/:id/stats reads aggregated docs.
- Monthly payouts (spec §6.4): cron runs 1st of month at 06:00 UTC, sums publisher_credit entries, applies MIN_PAYOUT_ISK threshold.
- Admin payout workflow (UI spec §5.3): list pending + mark completed routes.
- Snippet CDN deployment automated on main push.
- End-to-end smoke test covers full flow: publisher creation → slot → advertiser → top-up via webhook → creative auto-approved → campaign created and active.
- All 9 plans now cover the complete Phase 1 scope from architecture spec §9.1.
