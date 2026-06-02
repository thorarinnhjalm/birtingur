# ADA Billing & Wallet Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans.

**Goal:** Implement the prepaid wallet model with Teya checkout integration. Top-ups create immutable ledger entries; campaign charges debit wallet via streaming CPM accruals or single slot-purchase debits; refunds credit back.

**Architecture:** Ledger is append-only (`ledger/{id}`). `advertiser.walletBalanceIsk` mirrors `SUM(ledger WHERE party={type:advertiser,id})`. Top-ups go through Teya hosted checkout → webhook → signature verification → ledger entry. CPM accrual job (Vercel cron) consumes Redis impression queue → batches into ledger entries hourly.

**Tech Stack:** Same as Plan #2/#4 + Teya API (or stub).

**Depends on:** Plans #1, #2, #4.

**Companion spec sections:** 6 (billing & wallet).

---

## File Structure

```
apps/api/src/
├── services/
│   ├── ledger.ts                  # appendLedger, sumByParty, recomputeWallet
│   ├── wallet.ts                  # getWallet, topUp, charge, refund, creditPublisher
│   └── teya/
│       ├── index.ts               # TeyaClient interface
│       ├── stub.ts                # StubTeyaClient (dev)
│       ├── http.ts                # HttpTeyaClient (prod)
│       └── webhook.ts             # signature verification
└── routes/
    ├── wallet.ts                  # /v1/advertisers/me/wallet/*
    └── webhooks/
        └── teya.ts                # POST /api/teya/webhook
```

---

## Task 1: Ledger service (TDD)

**Files:** `apps/api/src/services/ledger.ts`, `tests/ledger.test.ts`

- [ ] **Step 1: Test**

Write `/Users/thorarinnhjalmarsson/Documents/Antigravity/ada/apps/api/tests/ledger.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { useEmulator } from './helpers/emulator';
import { appendLedger, sumByParty } from '../src/services/ledger';

useEmulator();

describe('appendLedger', () => {
  it('inserts an entry and assigns id', async () => {
    const e = await appendLedger({
      party: { type: 'advertiser', id: 'adv_a' },
      type: 'topup',
      amountIsk: 5000,
      relatedId: 'teya_tx_1',
    });
    expect(e.id).toMatch(/^led_/);
  });

  it('rejects zero amount', async () => {
    await expect(
      appendLedger({
        party: { type: 'advertiser', id: 'adv_a' },
        type: 'topup',
        amountIsk: 0,
        relatedId: 'x',
      }),
    ).rejects.toThrow();
  });
});

describe('sumByParty', () => {
  it('sums entries for a party', async () => {
    await appendLedger({ party: { type: 'advertiser', id: 'adv_a' }, type: 'topup', amountIsk: 20000, relatedId: 't1' });
    await appendLedger({ party: { type: 'advertiser', id: 'adv_a' }, type: 'campaign_charge', amountIsk: -3000, relatedId: 'c1' });
    await appendLedger({ party: { type: 'advertiser', id: 'adv_b' }, type: 'topup', amountIsk: 9999, relatedId: 't2' });
    expect(await sumByParty({ type: 'advertiser', id: 'adv_a' })).toBe(17000);
    expect(await sumByParty({ type: 'advertiser', id: 'adv_b' })).toBe(9999);
  });
});
```

- [ ] **Step 2: Implement**

Write `/Users/thorarinnhjalmarsson/Documents/Antigravity/ada/apps/api/src/services/ledger.ts`:

```ts
import {
  COLLECTIONS,
  ledgerEntryConverter,
  LedgerEntrySchema,
} from '@ada/shared';
import type { LedgerEntry, LedgerParty, LedgerEntryType } from '@ada/shared';
import { db } from '../lib/firebase';
import { generateId } from '../lib/id';

export interface AppendInput {
  party: LedgerParty;
  type: LedgerEntryType;
  amountIsk: number;
  relatedId: string;
}

export async function appendLedger(input: AppendInput): Promise<LedgerEntry> {
  const entry: LedgerEntry = LedgerEntrySchema.parse({
    id: generateId('led'),
    party: input.party,
    type: input.type,
    amountIsk: input.amountIsk,
    relatedId: input.relatedId,
    createdAt: new Date(),
  });
  await db.collection(COLLECTIONS.ledger).doc(entry.id).withConverter(ledgerEntryConverter).set(entry);
  return entry;
}

export async function sumByParty(party: LedgerParty): Promise<number> {
  const snap = await db
    .collection(COLLECTIONS.ledger)
    .where('party.type', '==', party.type)
    .where('party.id', '==', party.id)
    .withConverter(ledgerEntryConverter)
    .get();
  return snap.docs.reduce((acc, d) => acc + d.data().amountIsk, 0);
}

export async function listLedger(party: LedgerParty, limit = 100): Promise<LedgerEntry[]> {
  const snap = await db
    .collection(COLLECTIONS.ledger)
    .where('party.type', '==', party.type)
    .where('party.id', '==', party.id)
    .orderBy('createdAt', 'desc')
    .limit(limit)
    .withConverter(ledgerEntryConverter)
    .get();
  return snap.docs.map((d) => d.data());
}
```

- [ ] **Step 3: Run + commit**

```bash
firebase --config firebase/firebase.json emulators:exec --only firestore 'pnpm --filter @ada/api test tests/ledger.test.ts'
git add apps/api/src/services/ledger.ts apps/api/tests/ledger.test.ts
git commit -m "feat(api): immutable ledger service"
```

---

## Task 2: Wallet service (TDD)

**Files:** `apps/api/src/services/wallet.ts`, `tests/wallet.test.ts`

- [ ] **Step 1: Test**

Write `/Users/thorarinnhjalmarsson/Documents/Antigravity/ada/apps/api/tests/wallet.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { useEmulator } from './helpers/emulator';
import { createAdvertiser, getAdvertiserById } from '../src/services/advertisers';
import { topUp, getWallet, chargeCampaign, refundCampaign, creditPublisher } from '../src/services/wallet';
import { DEFAULT_PLATFORM_FEE_PERCENT } from '@ada/shared';

useEmulator();

async function adv() {
  return createAdvertiser({
    ownerEmail: 'a@a.is', companyName: 'A', kennitala: '1234567890', vatNumber: '1',
  });
}

describe('topUp', () => {
  it('increments wallet balance', async () => {
    const a = await adv();
    await topUp(a.id, 20000, 'teya_tx_1');
    const w = await getWallet(a.id);
    expect(w.balanceIsk).toBe(20000);
    const updated = await getAdvertiserById(a.id);
    expect(updated!.walletBalanceIsk).toBe(20000);
  });

  it('rejects negative amount', async () => {
    const a = await adv();
    await expect(topUp(a.id, -100, 'x')).rejects.toThrow();
  });
});

describe('chargeCampaign', () => {
  it('decrements wallet by charge amount', async () => {
    const a = await adv();
    await topUp(a.id, 10000, 't');
    await chargeCampaign(a.id, 'cmp_x', 3000);
    expect((await getWallet(a.id)).balanceIsk).toBe(7000);
  });

  it('rejects when balance insufficient', async () => {
    const a = await adv();
    await topUp(a.id, 1000, 't');
    await expect(chargeCampaign(a.id, 'cmp_x', 5000)).rejects.toThrow(/insufficient/);
  });
});

describe('refundCampaign', () => {
  it('restores balance', async () => {
    const a = await adv();
    await topUp(a.id, 10000, 't');
    await chargeCampaign(a.id, 'cmp_x', 3000);
    await refundCampaign(a.id, 'cmp_x', 1500);
    expect((await getWallet(a.id)).balanceIsk).toBe(8500);
  });
});

describe('creditPublisher', () => {
  it('credits publisher net and platform fee', async () => {
    await creditPublisher('pub_x', 'cmp_y', 1000);
    // Implementation will split: 80% to publisher, 20% to platform
    // Verified by ledger sums below
    const { sumByParty } = await import('../src/services/ledger');
    const pubSum = await sumByParty({ type: 'publisher', id: 'pub_x' });
    expect(pubSum).toBe(800); // 1000 * (1 - 20/100)
    const platSum = await sumByParty({ type: 'platform', id: 'platform' });
    expect(platSum).toBe(200);
  });

  it('honors DEFAULT_PLATFORM_FEE_PERCENT', () => {
    expect(DEFAULT_PLATFORM_FEE_PERCENT).toBe(20);
  });
});
```

- [ ] **Step 2: Implement**

Write `/Users/thorarinnhjalmarsson/Documents/Antigravity/ada/apps/api/src/services/wallet.ts`:

```ts
import { COLLECTIONS, advertiserConverter, DEFAULT_PLATFORM_FEE_PERCENT } from '@ada/shared';
import type { Advertiser } from '@ada/shared';
import { db } from '../lib/firebase';
import { appendLedger, sumByParty } from './ledger';
import { badRequest, notFound } from '../lib/errors';

export interface Wallet {
  advertiserId: string;
  balanceIsk: number;
}

export async function getWallet(advertiserId: string): Promise<Wallet> {
  const balanceIsk = await sumByParty({ type: 'advertiser', id: advertiserId });
  return { advertiserId, balanceIsk };
}

async function syncMirror(advertiserId: string): Promise<void> {
  const balance = await sumByParty({ type: 'advertiser', id: advertiserId });
  await db
    .collection(COLLECTIONS.advertisers)
    .doc(advertiserId)
    .update({ walletBalanceIsk: balance });
}

export async function topUp(advertiserId: string, amountIsk: number, teyaTxnId: string): Promise<void> {
  if (amountIsk <= 0) throw badRequest('invalid_amount', 'amountIsk must be positive');
  // Idempotency: if a ledger entry with this relatedId exists, skip
  const existing = await db
    .collection(COLLECTIONS.ledger)
    .where('relatedId', '==', teyaTxnId)
    .where('type', '==', 'topup')
    .limit(1)
    .get();
  if (!existing.empty) return;
  await appendLedger({
    party: { type: 'advertiser', id: advertiserId },
    type: 'topup',
    amountIsk,
    relatedId: teyaTxnId,
  });
  await syncMirror(advertiserId);
}

export async function chargeCampaign(advertiserId: string, campaignId: string, amountIsk: number): Promise<void> {
  if (amountIsk <= 0) throw badRequest('invalid_amount', 'must be positive');
  const wallet = await getWallet(advertiserId);
  if (wallet.balanceIsk < amountIsk) {
    throw badRequest('insufficient_balance', `Wallet has ${wallet.balanceIsk}, needed ${amountIsk}`);
  }
  await appendLedger({
    party: { type: 'advertiser', id: advertiserId },
    type: 'campaign_charge',
    amountIsk: -amountIsk,
    relatedId: campaignId,
  });
  await syncMirror(advertiserId);
}

export async function refundCampaign(advertiserId: string, campaignId: string, amountIsk: number): Promise<void> {
  if (amountIsk <= 0) throw badRequest('invalid_amount', 'must be positive');
  await appendLedger({
    party: { type: 'advertiser', id: advertiserId },
    type: 'refund',
    amountIsk,
    relatedId: campaignId,
  });
  await syncMirror(advertiserId);
}

export async function creditPublisher(publisherId: string, campaignId: string, grossIsk: number): Promise<void> {
  if (grossIsk <= 0) throw badRequest('invalid_amount', 'must be positive');
  const feeIsk = Math.round((grossIsk * DEFAULT_PLATFORM_FEE_PERCENT) / 100);
  const netIsk = grossIsk - feeIsk;
  await appendLedger({
    party: { type: 'publisher', id: publisherId },
    type: 'publisher_credit',
    amountIsk: netIsk,
    relatedId: campaignId,
  });
  await appendLedger({
    party: { type: 'platform', id: 'platform' },
    type: 'platform_fee',
    amountIsk: feeIsk,
    relatedId: campaignId,
  });
}
```

- [ ] **Step 3: Run + commit**

```bash
firebase --config firebase/firebase.json emulators:exec --only firestore 'pnpm --filter @ada/api test tests/wallet.test.ts'
git add apps/api/src/services/wallet.ts apps/api/tests/wallet.test.ts
git commit -m "feat(api): wallet service (topUp, charge, refund, creditPublisher)"
```

---

## Task 3: Teya client interface + stub

**Files:** `apps/api/src/services/teya/index.ts`, `stub.ts`, `http.ts`, `webhook.ts`, `tests/teya.test.ts`

- [ ] **Step 1: Interface and stub**

Write `/Users/thorarinnhjalmarsson/Documents/Antigravity/ada/apps/api/src/services/teya/index.ts`:

```ts
export interface CheckoutSession {
  url: string;
  sessionId: string;
}

export interface TeyaClient {
  createCheckoutSession(opts: {
    advertiserId: string;
    amountIsk: number;
    successUrl: string;
    cancelUrl: string;
    idempotencyKey: string;
  }): Promise<CheckoutSession>;
}

export { StubTeyaClient } from './stub';
export { HttpTeyaClient } from './http';
```

Write `/Users/thorarinnhjalmarsson/Documents/Antigravity/ada/apps/api/src/services/teya/stub.ts`:

```ts
import type { CheckoutSession, TeyaClient } from './index';
import { generateId } from '../../lib/id';

export class StubTeyaClient implements TeyaClient {
  async createCheckoutSession(opts: {
    advertiserId: string;
    amountIsk: number;
    successUrl: string;
    cancelUrl: string;
    idempotencyKey: string;
  }): Promise<CheckoutSession> {
    const sessionId = generateId('teya_stub_session');
    return {
      sessionId,
      url: `https://stub-teya.local/checkout/${sessionId}?amount=${opts.amountIsk}&advertiser=${opts.advertiserId}`,
    };
  }
}
```

Write `/Users/thorarinnhjalmarsson/Documents/Antigravity/ada/apps/api/src/services/teya/http.ts`:

```ts
import type { CheckoutSession, TeyaClient } from './index';

export class HttpTeyaClient implements TeyaClient {
  constructor(
    private apiKey: string,
    private baseUrl = process.env.TEYA_BASE_URL ?? 'https://api.teya.com',
  ) {}

  async createCheckoutSession(opts: {
    advertiserId: string;
    amountIsk: number;
    successUrl: string;
    cancelUrl: string;
    idempotencyKey: string;
  }): Promise<CheckoutSession> {
    const res = await fetch(`${this.baseUrl}/v1/checkout/sessions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': opts.idempotencyKey,
      },
      body: JSON.stringify({
        amount: opts.amountIsk,
        currency: 'ISK',
        success_url: opts.successUrl,
        cancel_url: opts.cancelUrl,
        metadata: { advertiserId: opts.advertiserId },
      }),
    });
    if (!res.ok) {
      throw new Error(`Teya checkout failed: ${res.status} ${await res.text()}`);
    }
    const data = (await res.json()) as { id: string; url: string };
    return { sessionId: data.id, url: data.url };
  }
}
```

- [ ] **Step 2: Webhook verification**

Write `/Users/thorarinnhjalmarsson/Documents/Antigravity/ada/apps/api/src/services/teya/webhook.ts`:

```ts
import { createHmac, timingSafeEqual } from 'crypto';

export interface TeyaWebhookEvent {
  type: 'checkout.completed' | 'checkout.failed';
  data: {
    sessionId: string;
    amountIsk: number;
    metadata: { advertiserId: string };
  };
}

export function verifyTeyaSignature(rawBody: string, signature: string, secret: string): boolean {
  const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function parseTeyaEvent(rawBody: string): TeyaWebhookEvent {
  const data = JSON.parse(rawBody) as TeyaWebhookEvent;
  if (data.type !== 'checkout.completed' && data.type !== 'checkout.failed') {
    throw new Error(`Unsupported event type: ${data.type}`);
  }
  return data;
}
```

- [ ] **Step 3: Webhook test**

Write `/Users/thorarinnhjalmarsson/Documents/Antigravity/ada/apps/api/tests/teya.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { verifyTeyaSignature, parseTeyaEvent } from '../src/services/teya/webhook';
import { createHmac } from 'crypto';

describe('verifyTeyaSignature', () => {
  const secret = 'whsec_test';
  const body = JSON.stringify({ type: 'checkout.completed', data: { sessionId: 's', amountIsk: 1, metadata: { advertiserId: 'a' } } });
  const sig = createHmac('sha256', secret).update(body).digest('hex');

  it('passes for valid signature', () => {
    expect(verifyTeyaSignature(body, sig, secret)).toBe(true);
  });
  it('fails for wrong signature', () => {
    expect(verifyTeyaSignature(body, 'a'.repeat(64), secret)).toBe(false);
  });
  it('fails for wrong secret', () => {
    expect(verifyTeyaSignature(body, sig, 'other')).toBe(false);
  });
});

describe('parseTeyaEvent', () => {
  it('parses checkout.completed', () => {
    const ev = parseTeyaEvent(JSON.stringify({
      type: 'checkout.completed',
      data: { sessionId: 's', amountIsk: 5000, metadata: { advertiserId: 'adv_a' } },
    }));
    expect(ev.type).toBe('checkout.completed');
    expect(ev.data.amountIsk).toBe(5000);
  });
  it('throws on unsupported type', () => {
    expect(() => parseTeyaEvent(JSON.stringify({ type: 'other' }))).toThrow();
  });
});
```

- [ ] **Step 4: Run + commit**

```bash
pnpm --filter @ada/api test tests/teya.test.ts
git add apps/api/src/services/teya apps/api/tests/teya.test.ts
git commit -m "feat(api): Teya client interface, stub, and webhook signature verification"
```

---

## Task 4: Wallet routes

**Files:** `apps/api/src/routes/wallet.ts`, mount in advertiser routes

- [ ] **Step 1: Routes**

Write `/Users/thorarinnhjalmarsson/Documents/Antigravity/ada/apps/api/src/routes/wallet.ts`:

```ts
import { Hono } from 'hono';
import { requireAuth } from '../lib/auth';
import { handleError, notFound } from '../lib/errors';
import { getAdvertiserByOwnerEmail } from '../services/advertisers';
import { getWallet } from '../services/wallet';
import { StubTeyaClient, HttpTeyaClient, type TeyaClient } from '../services/teya';
import { generateId } from '../lib/id';

function getTeya(): TeyaClient {
  if (process.env.TEYA_API_KEY) return new HttpTeyaClient(process.env.TEYA_API_KEY);
  return new StubTeyaClient();
}

export const walletRoutes = new Hono();
walletRoutes.use('/*', requireAuth());

walletRoutes.get('/', async (c) => {
  try {
    const user = c.get('user');
    const adv = await getAdvertiserByOwnerEmail(user.email);
    if (!adv) throw notFound('advertiser_not_found', 'No advertiser');
    const w = await getWallet(adv.id);
    return c.json({ wallet: w });
  } catch (e) { return handleError(e, c); }
});

walletRoutes.post('/topup', async (c) => {
  try {
    const user = c.get('user');
    const adv = await getAdvertiserByOwnerEmail(user.email);
    if (!adv) throw notFound('advertiser_not_found', 'No advertiser');
    const body = await c.req.json() as { amountIsk: number };
    const teya = getTeya();
    const session = await teya.createCheckoutSession({
      advertiserId: adv.id,
      amountIsk: body.amountIsk,
      successUrl: `${process.env.APP_BASE_URL ?? 'https://app.adplatform.is'}/wallet?topup=success`,
      cancelUrl: `${process.env.APP_BASE_URL ?? 'https://app.adplatform.is'}/wallet?topup=cancelled`,
      idempotencyKey: generateId('idem'),
    });
    return c.json({ checkoutUrl: session.url, sessionId: session.sessionId }, 201);
  } catch (e) { return handleError(e, c); }
});
```

- [ ] **Step 2: Mount under advertiser path**

Modify `/Users/thorarinnhjalmarsson/Documents/Antigravity/ada/apps/api/src/index.ts` — add:

```ts
import { walletRoutes } from './routes/wallet';
app.route('/v1/advertisers/me/wallet', walletRoutes);
```

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/routes/wallet.ts apps/api/src/index.ts
git commit -m "feat(api): wallet routes (GET balance, POST topup checkout)"
```

---

## Task 5: Teya webhook route

**Files:** `apps/api/src/routes/webhooks/teya.ts`, `tests/teya-webhook.test.ts`

- [ ] **Step 1: Test**

Write `/Users/thorarinnhjalmarsson/Documents/Antigravity/ada/apps/api/tests/teya-webhook.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { useEmulator } from './helpers/emulator';
import { createHmac } from 'crypto';
import { createAdvertiser } from '../src/services/advertisers';
import { getWallet } from '../src/services/wallet';
import app from '../src/index';

useEmulator();

process.env.TEYA_WEBHOOK_SECRET = 'whsec_test';

function sign(body: string) {
  return createHmac('sha256', 'whsec_test').update(body).digest('hex');
}

describe('POST /api/teya/webhook', () => {
  it('credits wallet on checkout.completed', async () => {
    const adv = await createAdvertiser({
      ownerEmail: 'a@a.is', companyName: 'A', kennitala: '1234567890', vatNumber: '1',
    });
    const body = JSON.stringify({
      type: 'checkout.completed',
      data: { sessionId: 'sess_1', amountIsk: 5000, metadata: { advertiserId: adv.id } },
    });
    const res = await app.request('/api/teya/webhook', {
      method: 'POST',
      headers: { 'Teya-Signature': sign(body), 'Content-Type': 'application/json' },
      body,
    });
    expect(res.status).toBe(200);
    expect((await getWallet(adv.id)).balanceIsk).toBe(5000);
  });

  it('rejects on bad signature', async () => {
    const body = JSON.stringify({ type: 'checkout.completed', data: { sessionId: 's', amountIsk: 1, metadata: { advertiserId: 'x' } } });
    const res = await app.request('/api/teya/webhook', {
      method: 'POST',
      headers: { 'Teya-Signature': 'bad', 'Content-Type': 'application/json' },
      body,
    });
    expect(res.status).toBe(401);
  });

  it('is idempotent — same sessionId does not double-credit', async () => {
    const adv = await createAdvertiser({
      ownerEmail: 'b@b.is', companyName: 'B', kennitala: '1234567890', vatNumber: '1',
    });
    const body = JSON.stringify({
      type: 'checkout.completed',
      data: { sessionId: 'sess_idem', amountIsk: 3000, metadata: { advertiserId: adv.id } },
    });
    const headers = { 'Teya-Signature': sign(body), 'Content-Type': 'application/json' };
    await app.request('/api/teya/webhook', { method: 'POST', headers, body });
    await app.request('/api/teya/webhook', { method: 'POST', headers, body });
    expect((await getWallet(adv.id)).balanceIsk).toBe(3000);
  });
});
```

- [ ] **Step 2: Implement**

Write `/Users/thorarinnhjalmarsson/Documents/Antigravity/ada/apps/api/src/routes/webhooks/teya.ts`:

```ts
import { Hono } from 'hono';
import { parseTeyaEvent, verifyTeyaSignature } from '../../services/teya/webhook';
import { topUp } from '../../services/wallet';

export const teyaWebhookRoute = new Hono();

teyaWebhookRoute.post('/', async (c) => {
  const secret = process.env.TEYA_WEBHOOK_SECRET;
  if (!secret) return c.json({ error: 'webhook_misconfigured' }, 500);

  const sig = c.req.header('Teya-Signature') ?? '';
  const raw = await c.req.text();
  if (!verifyTeyaSignature(raw, sig, secret)) {
    return c.json({ error: 'invalid_signature' }, 401);
  }

  let event;
  try {
    event = parseTeyaEvent(raw);
  } catch (e) {
    return c.json({ error: 'bad_event', message: String(e) }, 400);
  }

  if (event.type === 'checkout.completed') {
    await topUp(event.data.metadata.advertiserId, event.data.amountIsk, event.data.sessionId);
  }
  return c.json({ ok: true });
});
```

- [ ] **Step 3: Mount**

Modify `/Users/thorarinnhjalmarsson/Documents/Antigravity/ada/apps/api/src/index.ts`:

```ts
import { teyaWebhookRoute } from './routes/webhooks/teya';
app.route('/api/teya/webhook', teyaWebhookRoute);
```

- [ ] **Step 4: Run + commit**

```bash
firebase --config firebase/firebase.json emulators:exec --only firestore 'pnpm --filter @ada/api test tests/teya-webhook.test.ts'
git add apps/api/src/routes/webhooks/teya.ts apps/api/src/index.ts apps/api/tests/teya-webhook.test.ts
git commit -m "feat(api): Teya webhook with signature verification and idempotency"
```

---

## Task 6: CPM accrual cron

**Files:** `apps/api/api/cron-accrue.ts`, `apps/api/src/services/accrual.ts`

- [ ] **Step 1: Accrual service**

Write `/Users/thorarinnhjalmarsson/Documents/Antigravity/ada/apps/api/src/services/accrual.ts`:

```ts
import { Redis } from '@upstash/redis';
import { COLLECTIONS, campaignConverter } from '@ada/shared';
import { db } from '../lib/firebase';
import { chargeCampaign, creditPublisher } from './wallet';

interface QueuedEvent {
  type: 'impression' | 'click';
  slotId: string;
  publisherId: string;
  creativeId: string;
  campaignId: string;
  ts: number;
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

/** Drain up to `batchSize` events and process them. Returns count drained. */
export async function drainAndAccrue(batchSize = 500): Promise<number> {
  const events: QueuedEvent[] = [];
  for (let i = 0; i < batchSize; i++) {
    const raw = await redis().rpop<string>('events:queue');
    if (!raw) break;
    try {
      events.push(JSON.parse(raw) as QueuedEvent);
    } catch {
      // skip malformed
    }
  }
  if (events.length === 0) return 0;

  // Group by campaign for charging
  const byCampaign = new Map<string, QueuedEvent[]>();
  for (const ev of events) {
    if (ev.type !== 'impression') continue;
    const list = byCampaign.get(ev.campaignId) ?? [];
    list.push(ev);
    byCampaign.set(ev.campaignId, list);
  }

  for (const [campaignId, evs] of byCampaign) {
    const cmpSnap = await db.collection(COLLECTIONS.campaigns).doc(campaignId).withConverter(campaignConverter).get();
    if (!cmpSnap.exists) continue;
    const cmp = cmpSnap.data()!;
    if (cmp.budget.mode !== 'cpm_capped') continue;

    // Determine CPM from each impression's slot (we look up the slot via its publisher)
    let totalCharge = 0;
    const publisherCharges = new Map<string, number>();

    for (const ev of evs) {
      const slotSnap = await db.collection(COLLECTIONS.slots).doc(ev.slotId).get();
      if (!slotSnap.exists) continue;
      const slot = slotSnap.data();
      const cpm = (slot?.pricing as { cpmIsk?: number } | undefined)?.cpmIsk ?? 0;
      const perImpression = Math.round(cpm / 1000);
      totalCharge += perImpression;
      publisherCharges.set(ev.publisherId, (publisherCharges.get(ev.publisherId) ?? 0) + perImpression);
    }

    if (totalCharge > 0) {
      try {
        await chargeCampaign(cmp.advertiserId, campaignId, totalCharge);
      } catch {
        // out of balance — campaign should already be marked budgetExhausted by serving counter
        continue;
      }
      for (const [publisherId, amount] of publisherCharges) {
        await creditPublisher(publisherId, campaignId, amount);
      }
    }
  }

  return events.length;
}
```

- [ ] **Step 2: Vercel cron endpoint**

Write `/Users/thorarinnhjalmarsson/Documents/Antigravity/ada/apps/api/api/cron-accrue.ts`:

```ts
import { drainAndAccrue } from '../src/services/accrual';

export const config = { runtime: 'nodejs' };

export default async function handler(req: Request): Promise<Response> {
  if (req.headers.get('Authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('forbidden', { status: 403 });
  }
  const drained = await drainAndAccrue(500);
  return new Response(JSON.stringify({ drained }), {
    headers: { 'Content-Type': 'application/json' },
  });
}
```

- [ ] **Step 3: Vercel cron config**

Modify `/Users/thorarinnhjalmarsson/Documents/Antigravity/ada/apps/api/vercel.json`:

```json
{
  "buildCommand": "pnpm build",
  "functions": {
    "api/index.ts": { "maxDuration": 30 },
    "api/cron-accrue.ts": { "maxDuration": 60 }
  },
  "crons": [
    { "path": "/api/cron-accrue", "schedule": "*/15 * * * *" }
  ],
  "rewrites": [
    { "source": "/api/cron-accrue", "destination": "/api/cron-accrue" },
    { "source": "/(.*)", "destination": "/api/index" }
  ]
}
```

- [ ] **Step 4: Commit**

```bash
git add apps/api/api/cron-accrue.ts apps/api/src/services/accrual.ts apps/api/vercel.json
git commit -m "feat(api): CPM accrual cron consumes Redis impression queue every 15 min"
```

---

## Self-Review

- Top-up flow (spec §6.1): Teya checkout creation + webhook signature verification + idempotent ledger entry.
- Campaign charging (spec §6.2): slot-purchased single charge (will be invoked by campaign create in Plan #6/admin approval); CPM streaming via 15-min accrual cron.
- Publisher credit (spec §6.3): credit splits gross into net (80%) + platform fee (20%) ledger entries.
- Refunds (spec §6.6): refundCampaign credits wallet without touching card.
- Ledger is append-only (spec §4.4 invariant): no update/delete API.
- Idempotency on Teya webhook prevents double-credit.
- Wallet balance is mirrored from ledger sum after every mutation (recomputable any time).
- VAT computation deferred to invoicing tool (out of scope of code).
