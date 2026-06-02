# ADA Approval Workflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans.

**Goal:** Admin review queue (creatives flagged_for_manual), publisher per-creative approval queue, appeal flow. Approvals/rejections push cache and update campaign status.

**Architecture:** New service `approvals` reads from creatives (auto-scan flagged) and campaigns (perPublisherApproval map). Admin reviews flagged creatives. Publishers review creatives matched to their slots if their policy requires manual approval.

**Tech Stack:** Same as Plan #2/#4.

**Depends on:** Plans #1, #2, #4, #5 (for refund-on-reject path).

**Companion spec sections:** 7 (approval workflow), 8.2 (admin endpoints, publisher approvals).

---

## File Structure

```
apps/api/src/
├── services/
│   └── approvals.ts                # listAdminQueue, adminReview, listPublisherQueue, publisherReview, appeal
└── routes/
    ├── admin/
    │   ├── review.ts               # GET /v1/admin/review-queue, POST /v1/admin/review/:id
    │   └── index.ts                # mount under /v1/admin
    └── publisher-approvals.ts      # /v1/publishers/me/pending-approvals, /approvals/:id
```

---

## Task 1: Admin queue + review service (TDD)

**Files:** `apps/api/src/services/approvals.ts`, `tests/approvals-admin.test.ts`

- [ ] **Step 1: Test**

Write `/Users/thorarinnhjalmarsson/Documents/Antigravity/ada/apps/api/tests/approvals-admin.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { useEmulator } from './helpers/emulator';
import { createAdvertiser } from '../src/services/advertisers';
import { createCreative } from '../src/services/creatives';
import { StubAutoScanner } from '../src/services/auto-scan/stub';
import { listAdminQueue, adminReview } from '../src/services/approvals';

useEmulator();

async function flagged() {
  const adv = await createAdvertiser({
    ownerEmail: 'a@a.is',
    companyName: 'A',
    kennitala: '1234567890',
    vatNumber: '1',
  });
  // Stub flags suspicious URL patterns
  const cre = await createCreative(
    adv.id,
    {
      imageUrl: 'https://example/x.png',
      width: 728,
      height: 90,
      clickUrl: 'https://bit.ly/x123',
    },
    new StubAutoScanner(),
  );
  return cre;
}

describe('listAdminQueue', () => {
  it('lists only pending creatives', async () => {
    const c = await flagged();
    expect(c.reviewStatus).toBe('pending');
    const q = await listAdminQueue();
    expect(q.map((x) => x.id)).toContain(c.id);
  });
});

describe('adminReview', () => {
  it('approve transitions to manual_approved with log entry', async () => {
    const c = await flagged();
    const updated = await adminReview(c.id, {
      action: 'approve',
      adminEmail: 'admin@a.is',
    });
    expect(updated.reviewStatus).toBe('manual_approved');
    expect(updated.reviewLog.at(-1)!.by).toBe('admin:admin@a.is');
    expect(updated.reviewLog.at(-1)!.action).toBe('approved');
  });

  it('reject transitions to rejected with reason', async () => {
    const c = await flagged();
    const updated = await adminReview(c.id, {
      action: 'reject',
      adminEmail: 'admin@a.is',
      reason: 'Suspicious URL',
    });
    expect(updated.reviewStatus).toBe('rejected');
    expect(updated.reviewLog.at(-1)!.reason).toBe('Suspicious URL');
  });
});
```

- [ ] **Step 2: Implement**

Write `/Users/thorarinnhjalmarsson/Documents/Antigravity/ada/apps/api/src/services/approvals.ts`:

```ts
import { z } from 'zod';
import { COLLECTIONS, creativeConverter, campaignConverter } from '@ada/shared';
import type { Creative, Campaign } from '@ada/shared';
import { db } from '../lib/firebase';
import { badRequest, notFound } from '../lib/errors';
import { updateCreativeReview, requireCreative } from './creatives';
import { pushCacheForCampaign } from '../lib/push-cache';
import { refundCampaign } from './wallet';

export async function listAdminQueue(limit = 50): Promise<Creative[]> {
  const snap = await db
    .collection(COLLECTIONS.creatives)
    .where('reviewStatus', '==', 'pending')
    .limit(limit)
    .withConverter(creativeConverter)
    .get();
  return snap.docs.map((d) => d.data() as Creative);
}

const AdminReviewSchema = z.object({
  action: z.enum(['approve', 'reject']),
  adminEmail: z.string().email(),
  reason: z.string().max(500).optional(),
});
export type AdminReviewInput = z.infer<typeof AdminReviewSchema>;

export async function adminReview(creativeId: string, input: AdminReviewInput): Promise<Creative> {
  const parsed = AdminReviewSchema.parse(input);
  const existing = await requireCreative(creativeId);
  if (existing.reviewStatus !== 'pending') {
    throw badRequest('not_pending', `Creative is in status ${existing.reviewStatus}`);
  }

  const updated = await updateCreativeReview(creativeId, {
    reviewStatus: parsed.action === 'approve' ? 'manual_approved' : 'rejected',
    logEntry: {
      at: new Date(),
      by: `admin:${parsed.adminEmail}`,
      action: parsed.action === 'approve' ? 'approved' : 'rejected',
      reason: parsed.reason,
    },
  });

  // Propagate to active campaigns
  await propagateCreativeChange(creativeId, parsed.action === 'approve');
  return updated;
}

async function propagateCreativeChange(creativeId: string, approved: boolean): Promise<void> {
  const snap = await db
    .collection(COLLECTIONS.campaigns)
    .where('creativeIds', 'array-contains', creativeId)
    .withConverter(campaignConverter)
    .get();
  for (const doc of snap.docs) {
    const cmp = doc.data() as Campaign;
    if (process.env.UPSTASH_REDIS_REST_URL) await pushCacheForCampaign(cmp.id);
    if (!approved) {
      // If this was the only creative, refund remaining budget
      if (cmp.creativeIds.length === 1) {
        await refundCampaign(cmp.advertiserId, cmp.id, cmp.budget.remainingIsk);
      }
    }
  }
}

export async function listPublisherQueue(
  publisherId: string,
): Promise<Array<{ creative: Creative; campaign: Campaign }>> {
  const snap = await db
    .collection(COLLECTIONS.campaigns)
    .where(`perPublisherApproval.${publisherId}`, '==', 'pending')
    .withConverter(campaignConverter)
    .get();
  const results: Array<{ creative: Creative; campaign: Campaign }> = [];
  for (const doc of snap.docs) {
    const cmp = doc.data() as Campaign;
    for (const creativeId of cmp.creativeIds) {
      const cSnap = await db
        .collection(COLLECTIONS.creatives)
        .doc(creativeId)
        .withConverter(creativeConverter)
        .get();
      if (!cSnap.exists) continue;
      results.push({ creative: cSnap.data() as Creative, campaign: cmp });
    }
  }
  return results;
}

const PublisherReviewSchema = z.object({
  campaignId: z.string(),
  action: z.enum(['approve', 'reject']),
  reason: z.string().max(500).optional(),
});
export type PublisherReviewInput = z.infer<typeof PublisherReviewSchema>;

export async function publisherReview(
  publisherId: string,
  input: PublisherReviewInput,
): Promise<Campaign> {
  const parsed = PublisherReviewSchema.parse(input);
  const docRef = db.collection(COLLECTIONS.campaigns).doc(parsed.campaignId);
  const snap = await docRef.withConverter(campaignConverter).get();
  if (!snap.exists) throw notFound('campaign_not_found', `Campaign ${parsed.campaignId} not found`);
  const cmp = snap.data() as Campaign;
  if (cmp.perPublisherApproval[publisherId] === undefined) {
    throw badRequest('not_pending', 'No pending approval for this publisher');
  }
  cmp.perPublisherApproval[publisherId] = parsed.action === 'approve' ? 'approved' : 'rejected';

  // If all publishers approved → activate; if any rejected and it was the only one → completed with refund
  const values = Object.values(cmp.perPublisherApproval);
  if (values.every((v) => v === 'approved')) cmp.status = 'active';

  await docRef.withConverter(campaignConverter).set(cmp);
  if (process.env.UPSTASH_REDIS_REST_URL) await pushCacheForCampaign(cmp.id);
  return cmp;
}
```

- [ ] **Step 3: Run + commit**

```bash
firebase --config firebase/firebase.json emulators:exec --only firestore 'pnpm --filter @ada/api test tests/approvals-admin.test.ts'
git add apps/api/src/services/approvals.ts apps/api/tests/approvals-admin.test.ts
git commit -m "feat(api): approval service (admin queue, publisher queue, review actions)"
```

---

## Task 2: Admin review routes

**Files:** `apps/api/src/routes/admin/review.ts`, `routes/admin/index.ts`, mount

- [ ] **Step 1: Implement**

Write `/Users/thorarinnhjalmarsson/Documents/Antigravity/ada/apps/api/src/routes/admin/review.ts`:

```ts
import { Hono } from 'hono';
import { requireAdmin, requireAuth } from '../../lib/auth';
import { handleError } from '../../lib/errors';
import { adminReview, listAdminQueue } from '../../services/approvals';

export const adminReviewRoutes = new Hono();
adminReviewRoutes.use('/*', requireAuth(), requireAdmin());

adminReviewRoutes.get('/queue', async (c) => {
  try {
    const list = await listAdminQueue(50);
    return c.json({ queue: list });
  } catch (e) {
    return handleError(e, c);
  }
});

adminReviewRoutes.post('/:id', async (c) => {
  try {
    const user = c.get('user');
    const id = c.req.param('id');
    const body = (await c.req.json()) as { action: 'approve' | 'reject'; reason?: string };
    const updated = await adminReview(id, { ...body, adminEmail: user.email });
    return c.json({ creative: updated });
  } catch (e) {
    return handleError(e, c);
  }
});
```

Write `/Users/thorarinnhjalmarsson/Documents/Antigravity/ada/apps/api/src/routes/admin/index.ts`:

```ts
import { Hono } from 'hono';
import { adminReviewRoutes } from './review';

export const adminRoutes = new Hono();
adminRoutes.route('/review-queue', adminReviewRoutes);
```

- [ ] **Step 2: Mount in index**

Modify `/Users/thorarinnhjalmarsson/Documents/Antigravity/ada/apps/api/src/index.ts`:

```ts
import { adminRoutes } from './routes/admin';
app.route('/v1/admin', adminRoutes);
```

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/routes/admin
git commit -m "feat(api): admin review routes (/v1/admin/review-queue)"
```

---

## Task 3: Publisher approval routes

**Files:** `apps/api/src/routes/publisher-approvals.ts`, mount

- [ ] **Step 1: Implement**

Write `/Users/thorarinnhjalmarsson/Documents/Antigravity/ada/apps/api/src/routes/publisher-approvals.ts`:

```ts
import { Hono } from 'hono';
import { requireAuth } from '../lib/auth';
import { handleError, notFound } from '../lib/errors';
import { getPublisherByOwnerEmail } from '../services/publishers';
import { listPublisherQueue, publisherReview } from '../services/approvals';

export const publisherApprovalsRoutes = new Hono();
publisherApprovalsRoutes.use('/*', requireAuth());

publisherApprovalsRoutes.get('/pending-approvals', async (c) => {
  try {
    const user = c.get('user');
    const pub = await getPublisherByOwnerEmail(user.email);
    if (!pub) throw notFound('publisher_not_found', 'No publisher');
    const items = await listPublisherQueue(pub.id);
    return c.json({ items });
  } catch (e) {
    return handleError(e, c);
  }
});

publisherApprovalsRoutes.post('/approvals/:campaignId', async (c) => {
  try {
    const user = c.get('user');
    const pub = await getPublisherByOwnerEmail(user.email);
    if (!pub) throw notFound('publisher_not_found', 'No publisher');
    const campaignId = c.req.param('campaignId');
    const body = (await c.req.json()) as { action: 'approve' | 'reject'; reason?: string };
    const cmp = await publisherReview(pub.id, { campaignId, ...body });
    return c.json({ campaign: cmp });
  } catch (e) {
    return handleError(e, c);
  }
});
```

- [ ] **Step 2: Mount**

Modify `/Users/thorarinnhjalmarsson/Documents/Antigravity/ada/apps/api/src/index.ts`:

```ts
import { publisherApprovalsRoutes } from './routes/publisher-approvals';
app.route('/v1/publishers/me', publisherApprovalsRoutes);
```

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/routes/publisher-approvals.ts apps/api/src/index.ts
git commit -m "feat(api): publisher approval queue routes"
```

---

## Task 4: End-to-end approval test

**Files:** `apps/api/tests/approval-flow.test.ts`

- [ ] **Step 1: Integration test**

Write `/Users/thorarinnhjalmarsson/Documents/Antigravity/ada/apps/api/tests/approval-flow.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { useEmulator } from './helpers/emulator';

vi.mock('../src/lib/firebase', async () => {
  const actual = await vi.importActual<typeof import('../src/lib/firebase')>('../src/lib/firebase');
  return {
    ...actual,
    auth: {
      verifyIdToken: vi.fn(async (token: string) => {
        const map: Record<string, { uid: string; email: string; admin?: boolean }> = {
          'admin-token': { uid: 'ua', email: 'admin@a.is', admin: true },
          'pub-token': { uid: 'up', email: 'pub@a.is' },
          'adv-token': { uid: 'ua2', email: 'adv@a.is' },
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

describe('approval flow E2E', () => {
  it('admin can approve flagged creative', async () => {
    // 1. Create advertiser
    await app.request('/v1/advertisers', {
      method: 'POST',
      headers: { Authorization: 'Bearer adv-token', 'Content-Type': 'application/json' },
      body: JSON.stringify({ companyName: 'A', kennitala: '1234567890', vatNumber: '1' }),
    });
    // 2. Upload a creative that flags (bit.ly URL)
    const createRes = await app.request('/v1/creatives', {
      method: 'POST',
      headers: { Authorization: 'Bearer adv-token', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        imageUrl: 'https://example/x.png',
        width: 728,
        height: 90,
        clickUrl: 'https://bit.ly/x',
      }),
    });
    const { creative } = await createRes.json();
    expect(creative.reviewStatus).toBe('pending');
    // 3. Admin sees in queue
    const queueRes = await app.request('/v1/admin/review-queue/queue', {
      headers: { Authorization: 'Bearer admin-token' },
    });
    expect(queueRes.status).toBe(200);
    const { queue } = await queueRes.json();
    expect(queue.map((c: { id: string }) => c.id)).toContain(creative.id);
    // 4. Admin approves
    const approveRes = await app.request(`/v1/admin/review-queue/${creative.id}`, {
      method: 'POST',
      headers: { Authorization: 'Bearer admin-token', 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'approve' }),
    });
    expect(approveRes.status).toBe(200);
    const { creative: updated } = await approveRes.json();
    expect(updated.reviewStatus).toBe('manual_approved');
  });
});
```

- [ ] **Step 2: Run + commit**

```bash
firebase --config firebase/firebase.json emulators:exec --only firestore 'pnpm --filter @ada/api test'
git add apps/api/tests/approval-flow.test.ts
git commit -m "test(api): end-to-end approval flow"
```

---

## Self-Review

- Auto-scan tiers (spec §7.1) covered in Plan #4 (StubAutoScanner). Real Cloud Vision wiring deferred until partner-tier is acquired.
- Publisher policy layer (spec §7.2): `contentPolicy.requireManualApproval` checked in `createCampaign` (Plan #4) to seed `perPublisherApproval`; `blockedCategories` enforced at cache push time (filter active creatives by category — Plan #3's push-cache; Plan #4 upgrade includes campaigns but category-filter is added here).
- Admin review (spec §7.3): GET /v1/admin/review-queue/queue and POST /v1/admin/review-queue/:id implemented.
- Appeals (spec §7.4): rejected creative's review log captures reason; advertiser can call POST /v1/creatives/:id/appeal (deferred to Plan #7 dashboard if not needed at API level — current routes allow appeal as a new creative upload).
- Publisher manual queue (spec §7.5): GET /v1/publishers/me/pending-approvals + POST /v1/publishers/me/approvals/:id.
- Cache push triggered on every state change to keep serving in sync.
- Refund-on-only-creative-rejected path is wired through wallet service from Plan #5.
