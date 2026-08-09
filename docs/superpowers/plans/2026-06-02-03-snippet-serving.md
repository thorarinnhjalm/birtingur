# ADA Snippet + Serving Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans.

**Goal:** Ship the publisher-side `snippet.js` (~3kb, static), the hot-path serving endpoint (`/v1/ad`, `/v1/click`, `/v1/impression`), Redis cache populated by push from API, and Analytics Engine event logging.

**Architecture:** `packages/snippet` builds a self-contained JS bundle hosted on Cloudflare CDN. `apps/serving` is a Vercel function with Upstash Redis cache. Cache is populated by `pushCache(slotId)` calls from the API on every state-changing mutation. Snippet fails silent on every error path. No PII; only `CF-IPCountry` and a hashed visitor token.

**Tech Stack:** esbuild (for snippet bundling), Hono (serving), Upstash Redis, Vercel.

**Depends on:** Plans #1, #2.

**Companion spec sections:** 3 (serving architecture), 5 (ad serving flow), 4.2 (cache structure), 4.3 (analytics).

---

## File Structure

```
packages/snippet/
├── package.json
├── tsconfig.json
├── esbuild.config.mjs
├── src/
│   ├── index.ts                # Entry: scan DOM, fetch ads, render
│   ├── consent.ts              # readConsent()
│   ├── render.ts               # renderAd(slotEl, response)
│   ├── api.ts                  # fetchAd(slotId, consent)
│   └── types.ts                # AdResponse, ConsentState
└── tests/
    └── consent.test.ts

apps/serving/
├── package.json
├── tsconfig.json
├── vercel.json
├── vitest.config.ts
├── src/
│   ├── index.ts                # Hono app
│   ├── lib/
│   │   ├── redis.ts            # Upstash client
│   │   ├── cache.ts            # SlotCacheEntry, getSlotCache, pushSlotCache
│   │   ├── select.ts           # selectCreative() — filtering + ranking
│   │   ├── analytics.ts        # logImpression, logClick (Analytics Engine)
│   │   └── visitor.ts          # hashVisitorToken, frequencyCap
│   └── routes/
│       ├── ad.ts               # GET /v1/ad
│       ├── click.ts            # GET /v1/click
│       └── impression.ts       # GET /v1/impression
├── api/
│   └── index.ts
└── tests/
    ├── select.test.ts
    ├── visitor.test.ts
    └── ad-route.test.ts

apps/api/src/lib/
└── push-cache.ts               # called by every state-changing service
```

---

## Task 1: Scaffold packages/snippet

**Files:** `packages/snippet/package.json`, `tsconfig.json`, `esbuild.config.mjs`, `src/types.ts`

- [ ] **Step 1: Create directories**

```bash
cd /Users/thorarinnhjalmarsson/Documents/Antigravity/ada
mkdir -p packages/snippet/src packages/snippet/tests packages/snippet/dist
```

- [ ] **Step 2: package.json**

Write `/Users/thorarinnhjalmarsson/Documents/Antigravity/ada/packages/snippet/package.json`:

```json
{
  "name": "@ada/snippet",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "node esbuild.config.mjs",
    "test": "vitest run",
    "typecheck": "tsc --noEmit",
    "size": "wc -c dist/snippet.js"
  },
  "devDependencies": {
    "esbuild": "^0.21.0",
    "typescript": "^5.4.0",
    "vitest": "^1.5.0",
    "jsdom": "^24.0.0"
  }
}
```

- [ ] **Step 3: tsconfig.json**

Write `/Users/thorarinnhjalmarsson/Documents/Antigravity/ada/packages/snippet/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src",
    "moduleResolution": "Node",
    "lib": ["ES2020", "DOM"],
    "module": "ESNext"
  },
  "include": ["src/**/*"]
}
```

- [ ] **Step 4: esbuild config**

Write `/Users/thorarinnhjalmarsson/Documents/Antigravity/ada/packages/snippet/esbuild.config.mjs`:

```js
import { build } from 'esbuild';

await build({
  entryPoints: ['src/index.ts'],
  bundle: true,
  minify: true,
  target: ['es2018'],
  format: 'iife',
  outfile: 'dist/snippet.js',
  legalComments: 'none',
  define: {
    'process.env.SERVE_BASE': JSON.stringify(
      process.env.SERVE_BASE ?? 'https://serving.birtingur.app',
    ),
  },
});

console.log('Built dist/snippet.js');
```

- [ ] **Step 5: types**

Write `/Users/thorarinnhjalmarsson/Documents/Antigravity/ada/packages/snippet/src/types.ts`:

```ts
export type ConsentState = 'full' | 'none';

export interface AdResponse {
  empty?: true;
  creativeId?: string;
  imageUrl?: string;
  clickUrl?: string;
  width?: number;
  height?: number;
  impressionPixel?: string;
  ttl?: number;
}
```

- [ ] **Step 6: Install & commit**

```bash
cd /Users/thorarinnhjalmarsson/Documents/Antigravity/ada
pnpm install
git add packages/snippet package.json pnpm-lock.yaml
git commit -m "chore(snippet): scaffold static JS package with esbuild"
```

---

## Task 2: Consent detection (TDD)

**Files:** `packages/snippet/src/consent.ts`, `packages/snippet/tests/consent.test.ts`

- [ ] **Step 1: Write failing test**

Write `/Users/thorarinnhjalmarsson/Documents/Antigravity/ada/packages/snippet/tests/consent.test.ts`:

```ts
/** @vitest-environment jsdom */
import { describe, it, expect, beforeEach } from 'vitest';
import { readConsent } from '../src/consent';

beforeEach(() => {
  delete (window as unknown as { __cmpConsent?: unknown }).__cmpConsent;
});

describe('readConsent', () => {
  it('returns "none" when no CMP global is set', () => {
    expect(readConsent()).toBe('none');
  });

  it('reads boolean true as full', () => {
    (window as unknown as { __cmpConsent: boolean }).__cmpConsent = true;
    expect(readConsent()).toBe('full');
  });

  it('reads boolean false as none', () => {
    (window as unknown as { __cmpConsent: boolean }).__cmpConsent = false;
    expect(readConsent()).toBe('none');
  });

  it('reads object with consent.advertising === true as full', () => {
    (window as unknown as { __cmpConsent: object }).__cmpConsent = {
      advertising: true,
    };
    expect(readConsent()).toBe('full');
  });

  it('reads object with advertising === false as none', () => {
    (window as unknown as { __cmpConsent: object }).__cmpConsent = {
      advertising: false,
    };
    expect(readConsent()).toBe('none');
  });

  it('returns "none" on unrecognized shape', () => {
    (window as unknown as { __cmpConsent: unknown }).__cmpConsent = 'maybe';
    expect(readConsent()).toBe('none');
  });
});
```

- [ ] **Step 2: Implement**

Write `/Users/thorarinnhjalmarsson/Documents/Antigravity/ada/packages/snippet/src/consent.ts`:

```ts
import type { ConsentState } from './types';

export function readConsent(): ConsentState {
  try {
    const v = (window as unknown as { __cmpConsent?: unknown }).__cmpConsent;
    if (v === true) return 'full';
    if (v === false) return 'none';
    if (v && typeof v === 'object' && 'advertising' in v) {
      return (v as { advertising: unknown }).advertising === true ? 'full' : 'none';
    }
    return 'none';
  } catch {
    return 'none';
  }
}
```

- [ ] **Step 3: Run, then commit**

```bash
cd /Users/thorarinnhjalmarsson/Documents/Antigravity/ada
pnpm --filter @ada/snippet test
git add packages/snippet/src/consent.ts packages/snippet/tests/consent.test.ts
git commit -m "feat(snippet): publisher CMP consent detection"
```

---

## Task 3: Snippet fetch + render

**Files:** `packages/snippet/src/api.ts`, `packages/snippet/src/render.ts`, `packages/snippet/src/index.ts`

- [ ] **Step 1: Implement fetchAd**

Write `/Users/thorarinnhjalmarsson/Documents/Antigravity/ada/packages/snippet/src/api.ts`:

```ts
import type { AdResponse, ConsentState } from './types';

declare const process: { env: { SERVE_BASE: string } };

const TIMEOUT_MS = 2000;

export async function fetchAd(slotId: string, consent: ConsentState): Promise<AdResponse | null> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const url = `${process.env.SERVE_BASE}/v1/ad?slot=${encodeURIComponent(slotId)}&consent=${consent}&v=1`;
    const res = await fetch(url, { credentials: 'omit', signal: controller.signal });
    clearTimeout(t);
    if (!res.ok) return null;
    return (await res.json()) as AdResponse;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}
```

- [ ] **Step 2: Implement render**

Write `/Users/thorarinnhjalmarsson/Documents/Antigravity/ada/packages/snippet/src/render.ts`:

```ts
import type { AdResponse } from './types';

export function renderAd(el: HTMLElement, ad: AdResponse): void {
  if (ad.empty || !ad.creativeId || !ad.imageUrl || !ad.clickUrl) {
    el.style.display = 'none';
    return;
  }
  const a = document.createElement('a');
  a.href = ad.clickUrl;
  a.target = '_blank';
  a.rel = 'noopener noreferrer sponsored';
  a.style.display = 'inline-block';
  a.style.lineHeight = '0';

  const img = document.createElement('img');
  img.src = ad.imageUrl;
  if (ad.width) img.width = ad.width;
  if (ad.height) img.height = ad.height;
  img.alt = '';
  img.style.maxWidth = '100%';
  img.style.height = 'auto';
  img.style.border = '0';

  a.appendChild(img);
  el.appendChild(a);

  if (ad.impressionPixel) {
    const pixel = new Image(1, 1);
    pixel.src = ad.impressionPixel;
    pixel.style.position = 'absolute';
    pixel.style.left = '-9999px';
    el.appendChild(pixel);
  }
}
```

- [ ] **Step 3: Implement entry**

Write `/Users/thorarinnhjalmarsson/Documents/Antigravity/ada/packages/snippet/src/index.ts`:

```ts
import { fetchAd } from './api';
import { renderAd } from './render';
import { readConsent } from './consent';

function init(): void {
  const slots = document.querySelectorAll<HTMLElement>('[data-adplatform-slot]');
  const consent = readConsent();
  slots.forEach((el) => {
    const slotId = el.getAttribute('data-adplatform-slot');
    if (!slotId) {
      el.style.display = 'none';
      return;
    }
    fetchAd(slotId, consent).then((ad) => {
      if (!ad) {
        el.style.display = 'none';
        return;
      }
      try {
        renderAd(el, ad);
      } catch {
        el.style.display = 'none';
      }
    });
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
```

- [ ] **Step 4: Build snippet and check size**

```bash
cd /Users/thorarinnhjalmarsson/Documents/Antigravity/ada
pnpm --filter @ada/snippet build
ls -l packages/snippet/dist/snippet.js
```

Expected: file < 4000 bytes.

- [ ] **Step 5: Commit**

```bash
git add packages/snippet/src/api.ts packages/snippet/src/render.ts packages/snippet/src/index.ts
git commit -m "feat(snippet): fetch + render with fail-silent behavior"
```

---

## Task 4: Scaffold apps/serving

**Files:** `apps/serving/package.json`, `tsconfig.json`, `vercel.json`, `vitest.config.ts`, `src/index.ts`, `api/index.ts`

- [ ] **Step 1: Directories & package.json**

```bash
cd /Users/thorarinnhjalmarsson/Documents/Antigravity/ada
mkdir -p apps/serving/src/{lib,routes} apps/serving/api apps/serving/tests
```

Write `/Users/thorarinnhjalmarsson/Documents/Antigravity/ada/apps/serving/package.json`:

```json
{
  "name": "@ada/serving",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "tsc",
    "dev": "vercel dev",
    "test": "vitest run",
    "typecheck": "tsc --noEmit",
    "lint": "eslint src tests"
  },
  "dependencies": {
    "@ada/shared": "workspace:*",
    "hono": "^4.4.0",
    "@upstash/redis": "^1.31.0"
  },
  "devDependencies": {
    "@types/node": "^20.12.0",
    "typescript": "^5.4.0",
    "vitest": "^1.5.0"
  }
}
```

- [ ] **Step 2: configs**

Write `/Users/thorarinnhjalmarsson/Documents/Antigravity/ada/apps/serving/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "moduleResolution": "Node",
    "module": "ESNext"
  },
  "include": ["src/**/*", "api/**/*"]
}
```

Write `/Users/thorarinnhjalmarsson/Documents/Antigravity/ada/apps/serving/vercel.json`:

```json
{
  "functions": { "api/index.ts": { "maxDuration": 10 } },
  "rewrites": [{ "source": "/(.*)", "destination": "/api/index" }]
}
```

Write `/Users/thorarinnhjalmarsson/Documents/Antigravity/ada/apps/serving/vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: { globals: true, environment: 'node', include: ['tests/**/*.test.ts'] },
});
```

Write `/Users/thorarinnhjalmarsson/Documents/Antigravity/ada/apps/serving/src/index.ts`:

```ts
import { Hono } from 'hono';
import { adRoute } from './routes/ad';
import { clickRoute } from './routes/click';
import { impressionRoute } from './routes/impression';

export const app = new Hono();
app.get('/healthz', (c) => c.json({ ok: true }));
app.route('/v1/ad', adRoute);
app.route('/v1/click', clickRoute);
app.route('/v1/impression', impressionRoute);

export default app;
```

Write `/Users/thorarinnhjalmarsson/Documents/Antigravity/ada/apps/serving/api/index.ts`:

```ts
import { handle } from 'hono/vercel';
import app from '../src/index';

export const config = { runtime: 'nodejs' };
export default handle(app);
```

- [ ] **Step 3: Install & commit**

```bash
pnpm install
git add apps/serving pnpm-lock.yaml
git commit -m "chore(serving): scaffold serving app"
```

---

## Task 5: Redis client and cache types

**Files:** `apps/serving/src/lib/redis.ts`, `apps/serving/src/lib/cache.ts`

- [ ] **Step 1: Redis client**

Write `/Users/thorarinnhjalmarsson/Documents/Antigravity/ada/apps/serving/src/lib/redis.ts`:

```ts
import { Redis } from '@upstash/redis';

let _redis: Redis | null = null;

export function getRedis(): Redis {
  if (_redis) return _redis;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    throw new Error('Missing UPSTASH_REDIS_REST_URL / TOKEN');
  }
  _redis = new Redis({ url, token });
  return _redis;
}

/** In-memory shim used by tests; replaces the real client via setRedis(). */
export function setRedis(client: Redis) {
  _redis = client;
}
```

- [ ] **Step 2: Cache shape**

Write `/Users/thorarinnhjalmarsson/Documents/Antigravity/ada/apps/serving/src/lib/cache.ts`:

```ts
import { getRedis } from './redis';
import { CACHE_TTL_SECONDS } from '@ada/shared';

export interface CachedCreative {
  creativeId: string;
  campaignId: string;
  imageUrl: string;
  clickUrl: string;
  width: number;
  height: number;
  weight: number;
  geoCountries?: string[];
  geoRegions?: string[];
  frequencyCapPerDay: number;
  budgetExhausted: boolean;
  validFrom: number; // ms epoch
  validTo: number; // ms epoch
  priority: 'slot_purchased' | 'cpm';
}

export interface SlotCacheEntry {
  slotId: string;
  publisherId: string;
  sizes: Array<{ width: number; height: number }>;
  pricing:
    | { mode: 'cpm'; cpmIsk: number }
    | { mode: 'slot'; slotPriceIsk: number; slotPeriodDays: number };
  activeCreatives: CachedCreative[];
  blockedCategories: string[];
  refreshedAt: number;
}

const key = (slotId: string) => `slot:${slotId}`;

export async function getSlotCache(slotId: string): Promise<SlotCacheEntry | null> {
  const raw = await getRedis().get<SlotCacheEntry>(key(slotId));
  return raw ?? null;
}

export async function pushSlotCache(entry: SlotCacheEntry): Promise<void> {
  await getRedis().set(key(entry.slotId), entry, { ex: CACHE_TTL_SECONDS * 60 });
}

export async function invalidateSlot(slotId: string): Promise<void> {
  await getRedis().del(key(slotId));
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/serving/src/lib/redis.ts apps/serving/src/lib/cache.ts
git commit -m "feat(serving): Redis client and SlotCacheEntry type"
```

---

## Task 6: Creative selection logic (TDD)

**Files:** `apps/serving/src/lib/select.ts`, `tests/select.test.ts`

- [ ] **Step 1: Write failing tests**

Write `/Users/thorarinnhjalmarsson/Documents/Antigravity/ada/apps/serving/tests/select.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { selectCreative } from '../src/lib/select';
import type { CachedCreative, SlotCacheEntry } from '../src/lib/cache';

function makeCreative(over: Partial<CachedCreative> = {}): CachedCreative {
  return {
    creativeId: 'c1',
    campaignId: 'cmp1',
    imageUrl: 'https://example/img.png',
    clickUrl: 'https://example/click',
    width: 728,
    height: 90,
    weight: 1,
    frequencyCapPerDay: 3,
    budgetExhausted: false,
    validFrom: Date.now() - 60_000,
    validTo: Date.now() + 60_000,
    priority: 'cpm',
    ...over,
  };
}

function makeSlot(creatives: CachedCreative[]): SlotCacheEntry {
  return {
    slotId: 's1',
    publisherId: 'pub1',
    sizes: [{ width: 728, height: 90 }],
    pricing: { mode: 'cpm', cpmIsk: 1000 },
    activeCreatives: creatives,
    blockedCategories: [],
    refreshedAt: Date.now(),
  };
}

describe('selectCreative', () => {
  it('returns null when no creatives', () => {
    expect(
      selectCreative(makeSlot([]), { country: 'IS', consent: 'full', visitorImpressionsToday: {} }),
    ).toBe(null);
  });

  it('skips expired creatives', () => {
    const expired = makeCreative({ validTo: Date.now() - 1000 });
    expect(
      selectCreative(makeSlot([expired]), {
        country: 'IS',
        consent: 'full',
        visitorImpressionsToday: {},
      }),
    ).toBe(null);
  });

  it('skips budget-exhausted creatives', () => {
    const dry = makeCreative({ budgetExhausted: true });
    expect(
      selectCreative(makeSlot([dry]), {
        country: 'IS',
        consent: 'full',
        visitorImpressionsToday: {},
      }),
    ).toBe(null);
  });

  it('respects geo with consent=full', () => {
    const isOnly = makeCreative({ geoCountries: ['IS'] });
    const fr = makeCreative({ creativeId: 'c2', geoCountries: ['FR'] });
    const slot = makeSlot([isOnly, fr]);
    const got = selectCreative(slot, {
      country: 'IS',
      consent: 'full',
      visitorImpressionsToday: {},
    });
    expect(got?.creativeId).toBe('c1');
  });

  it('ignores geo when consent=none', () => {
    const isOnly = makeCreative({ geoCountries: ['IS'] });
    const slot = makeSlot([isOnly]);
    const got = selectCreative(slot, {
      country: 'FR',
      consent: 'none',
      visitorImpressionsToday: {},
    });
    expect(got?.creativeId).toBe('c1');
  });

  it('prioritises slot_purchased over cpm', () => {
    const cpm = makeCreative({ creativeId: 'cpm', priority: 'cpm' });
    const slot = makeCreative({ creativeId: 'slot', priority: 'slot_purchased' });
    const got = selectCreative(makeSlot([cpm, slot]), {
      country: 'IS',
      consent: 'full',
      visitorImpressionsToday: {},
    });
    expect(got?.creativeId).toBe('slot');
  });

  it('respects frequency cap with consent=full', () => {
    const capped = makeCreative({ frequencyCapPerDay: 3 });
    const slot = makeSlot([capped]);
    expect(
      selectCreative(slot, { country: 'IS', consent: 'full', visitorImpressionsToday: { c1: 3 } }),
    ).toBe(null);
  });
});
```

- [ ] **Step 2: Implement**

Write `/Users/thorarinnhjalmarsson/Documents/Antigravity/ada/apps/serving/src/lib/select.ts`:

```ts
import type { CachedCreative, SlotCacheEntry } from './cache';

export interface SelectionContext {
  country: string;
  consent: 'full' | 'none';
  visitorImpressionsToday: Record<string, number>;
}

function isEligible(c: CachedCreative, ctx: SelectionContext, now: number): boolean {
  if (c.budgetExhausted) return false;
  if (now < c.validFrom || now > c.validTo) return false;
  if (ctx.consent === 'full') {
    if (c.geoCountries && !c.geoCountries.includes(ctx.country)) return false;
    const seen = ctx.visitorImpressionsToday[c.creativeId] ?? 0;
    if (seen >= c.frequencyCapPerDay) return false;
  }
  return true;
}

function weightedRandom(items: CachedCreative[]): CachedCreative {
  const total = items.reduce((acc, c) => acc + Math.max(c.weight, 0), 0);
  if (total <= 0) return items[0]!;
  let r = Math.random() * total;
  for (const c of items) {
    r -= Math.max(c.weight, 0);
    if (r <= 0) return c;
  }
  return items[items.length - 1]!;
}

export function selectCreative(slot: SlotCacheEntry, ctx: SelectionContext): CachedCreative | null {
  const now = Date.now();
  const eligible = slot.activeCreatives.filter((c) => isEligible(c, ctx, now));
  if (eligible.length === 0) return null;

  const slotPurchased = eligible.filter((c) => c.priority === 'slot_purchased');
  if (slotPurchased.length > 0) return weightedRandom(slotPurchased);

  return weightedRandom(eligible);
}
```

- [ ] **Step 3: Run + commit**

```bash
cd /Users/thorarinnhjalmarsson/Documents/Antigravity/ada
pnpm --filter @ada/serving test
git add apps/serving/src/lib/select.ts apps/serving/tests/select.test.ts
git commit -m "feat(serving): creative selection with geo, freq cap, priority"
```

---

## Task 7: Visitor token & frequency cap

**Files:** `apps/serving/src/lib/visitor.ts`, `tests/visitor.test.ts`

- [ ] **Step 1: Write failing test**

Write `/Users/thorarinnhjalmarsson/Documents/Antigravity/ada/apps/serving/tests/visitor.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { hashVisitorToken, getOrCreateVisitorToken } from '../src/lib/visitor';

describe('hashVisitorToken', () => {
  it('produces stable hash for same input', () => {
    expect(hashVisitorToken('abc')).toBe(hashVisitorToken('abc'));
  });

  it('produces different hash for different input', () => {
    expect(hashVisitorToken('abc')).not.toBe(hashVisitorToken('def'));
  });

  it('is 12 chars hex', () => {
    expect(hashVisitorToken('abc')).toMatch(/^[a-f0-9]{12}$/);
  });
});

describe('getOrCreateVisitorToken', () => {
  it('returns existing cookie if set', () => {
    expect(getOrCreateVisitorToken('_adp_v=abc12345')).toBe('abc12345');
  });

  it('generates new token if absent', () => {
    const t = getOrCreateVisitorToken(undefined);
    expect(t).toMatch(/^[a-f0-9]{8,16}$/);
  });
});
```

- [ ] **Step 2: Implement**

Write `/Users/thorarinnhjalmarsson/Documents/Antigravity/ada/apps/serving/src/lib/visitor.ts`:

```ts
import { createHash, randomBytes } from 'crypto';

export function hashVisitorToken(input: string): string {
  return createHash('sha256').update(input).digest('hex').slice(0, 12);
}

const COOKIE_NAME = '_adp_v';

export function getOrCreateVisitorToken(cookieHeader: string | undefined): string {
  if (cookieHeader) {
    const match = cookieHeader.split(/;\s*/).find((c) => c.startsWith(`${COOKIE_NAME}=`));
    if (match) {
      const value = match.slice(COOKIE_NAME.length + 1);
      if (/^[a-f0-9]{8,16}$/.test(value)) return value;
    }
  }
  return randomBytes(6).toString('hex');
}

export function setCookieHeader(token: string): string {
  // 90 days
  return `${COOKIE_NAME}=${token}; Max-Age=7776000; Path=/; SameSite=None; Secure`;
}

import { getRedis } from './redis';

export async function getVisitorImpressionsToday(token: string): Promise<Record<string, number>> {
  const key = `vimp:${token}:${todayKey()}`;
  const raw = await getRedis().hgetall<Record<string, string>>(key);
  if (!raw) return {};
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(raw)) out[k] = Number(v) || 0;
  return out;
}

export async function recordVisitorImpression(token: string, creativeId: string): Promise<void> {
  const key = `vimp:${token}:${todayKey()}`;
  await getRedis().hincrby(key, creativeId, 1);
  await getRedis().expire(key, 86400 * 2);
}

function todayKey(): string {
  const d = new Date();
  return (
    d.getUTCFullYear().toString() +
    String(d.getUTCMonth() + 1).padStart(2, '0') +
    String(d.getUTCDate()).padStart(2, '0')
  );
}
```

- [ ] **Step 3: Test & commit**

```bash
pnpm --filter @ada/serving test tests/visitor.test.ts
git add apps/serving/src/lib/visitor.ts apps/serving/tests/visitor.test.ts
git commit -m "feat(serving): visitor token and frequency cap counters"
```

---

## Task 8: Analytics events

**Files:** `apps/serving/src/lib/analytics.ts`

- [ ] **Step 1: Implement**

Write `/Users/thorarinnhjalmarsson/Documents/Antigravity/ada/apps/serving/src/lib/analytics.ts`:

```ts
import { getRedis } from './redis';

export interface AdEvent {
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

const QUEUE = 'events:queue';

/**
 * Push event to a Redis list; aggregation cron consumes the list and writes
 * Firestore hourly stats and ledger entries in batches.
 * (Aggregation worker is part of Plan #9.)
 */
export async function logEvent(ev: AdEvent): Promise<void> {
  await getRedis().lpush(QUEUE, JSON.stringify(ev));
}

/**
 * Decrement campaign budget counter in Redis after an impression that earns CPM.
 * Returns the new remaining budget (in ISK).
 */
export async function decrementBudget(campaignId: string, costIsk: number): Promise<number> {
  const key = `budget:${campaignId}`;
  const newVal = await getRedis().decrby(key, costIsk);
  return newVal;
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/serving/src/lib/analytics.ts
git commit -m "feat(serving): analytics event queue and budget decrement"
```

---

## Task 9: GET /v1/ad route

**Files:** `apps/serving/src/routes/ad.ts`, `tests/ad-route.test.ts`

- [ ] **Step 1: Write failing test**

Write `/Users/thorarinnhjalmarsson/Documents/Antigravity/ada/apps/serving/tests/ad-route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SlotCacheEntry } from '../src/lib/cache';

const mockSlot: SlotCacheEntry = {
  slotId: 'slot_a',
  publisherId: 'pub_a',
  sizes: [{ width: 728, height: 90 }],
  pricing: { mode: 'cpm', cpmIsk: 1000 },
  activeCreatives: [
    {
      creativeId: 'cre_a',
      campaignId: 'cmp_a',
      imageUrl: 'https://example/a.png',
      clickUrl: 'https://example/x',
      width: 728,
      height: 90,
      weight: 1,
      frequencyCapPerDay: 3,
      budgetExhausted: false,
      validFrom: Date.now() - 1000,
      validTo: Date.now() + 60000,
      priority: 'cpm',
    },
  ],
  blockedCategories: [],
  refreshedAt: Date.now(),
};

vi.mock('../src/lib/cache', () => ({
  getSlotCache: vi.fn(async (id: string) => (id === 'slot_a' ? mockSlot : null)),
  pushSlotCache: vi.fn(),
  invalidateSlot: vi.fn(),
}));
vi.mock('../src/lib/visitor', () => ({
  getOrCreateVisitorToken: vi.fn(() => 'tok123'),
  setCookieHeader: vi.fn(() => '_adp_v=tok123; Path=/'),
  getVisitorImpressionsToday: vi.fn(async () => ({})),
  recordVisitorImpression: vi.fn(),
}));
vi.mock('../src/lib/analytics', () => ({
  logEvent: vi.fn(),
  decrementBudget: vi.fn(async () => 100),
}));

import app from '../src/index';

describe('GET /v1/ad', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns ad JSON for known slot', async () => {
    const res = await app.request('/v1/ad?slot=slot_a&consent=full', {
      headers: { 'CF-IPCountry': 'IS' },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.creativeId).toBe('cre_a');
    expect(body.impressionPixel).toContain('/v1/impression?');
  });

  it('returns empty for unknown slot', async () => {
    const res = await app.request('/v1/ad?slot=missing&consent=none');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.empty).toBe(true);
  });

  it('400 when slot param missing', async () => {
    const res = await app.request('/v1/ad?consent=full');
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Implement**

Write `/Users/thorarinnhjalmarsson/Documents/Antigravity/ada/apps/serving/src/routes/ad.ts`:

```ts
import { Hono } from 'hono';
import { getSlotCache } from '../lib/cache';
import { selectCreative } from '../lib/select';
import {
  getOrCreateVisitorToken,
  setCookieHeader,
  getVisitorImpressionsToday,
} from '../lib/visitor';
import { logEvent } from '../lib/analytics';

export const adRoute = new Hono();

adRoute.get('/', async (c) => {
  const slotId = c.req.query('slot');
  const consentParam = c.req.query('consent') === 'full' ? 'full' : 'none';

  if (!slotId) {
    return c.json({ error: 'missing_slot' }, 400);
  }

  const slot = await getSlotCache(slotId);
  if (!slot) {
    return c.json({ empty: true });
  }

  const country = c.req.header('CF-IPCountry') ?? 'XX';
  const token = getOrCreateVisitorToken(c.req.header('Cookie'));
  const visitorImpressionsToday =
    consentParam === 'full' ? await getVisitorImpressionsToday(token) : {};

  const creative = selectCreative(slot, {
    country,
    consent: consentParam,
    visitorImpressionsToday,
  });

  if (!creative) {
    return c.json({ empty: true });
  }

  // Build impression pixel URL (verifies on /v1/impression endpoint)
  const impressionPixel =
    `/v1/impression?c=${encodeURIComponent(creative.creativeId)}` +
    `&s=${encodeURIComponent(slotId)}&t=${encodeURIComponent(token)}`;

  // Fire-and-forget log (best-effort)
  void logEvent({
    type: 'impression',
    slotId,
    publisherId: slot.publisherId,
    creativeId: creative.creativeId,
    campaignId: creative.campaignId,
    advertiserId: '', // populated by aggregation worker from campaign lookup
    country,
    visitorToken: token,
    ts: Date.now(),
  });

  c.header('Set-Cookie', setCookieHeader(token));
  c.header('Cache-Control', 'private, no-store');
  return c.json({
    creativeId: creative.creativeId,
    imageUrl: creative.imageUrl,
    clickUrl: buildClickRedirect(creative.creativeId, slotId, token),
    width: creative.width,
    height: creative.height,
    impressionPixel,
    ttl: 30,
  });
});

function buildClickRedirect(creativeId: string, slotId: string, token: string): string {
  return `/v1/click?c=${encodeURIComponent(creativeId)}&s=${encodeURIComponent(slotId)}&t=${encodeURIComponent(token)}`;
}
```

- [ ] **Step 3: Run & commit**

```bash
pnpm --filter @ada/serving test
git add apps/serving/src/routes/ad.ts apps/serving/tests/ad-route.test.ts
git commit -m "feat(serving): GET /v1/ad with selection + analytics logging"
```

---

## Task 10: Click + impression endpoints

**Files:** `apps/serving/src/routes/click.ts`, `routes/impression.ts`

- [ ] **Step 1: Click route**

Write `/Users/thorarinnhjalmarsson/Documents/Antigravity/ada/apps/serving/src/routes/click.ts`:

```ts
import { Hono } from 'hono';
import { getSlotCache } from '../lib/cache';
import { logEvent } from '../lib/analytics';

export const clickRoute = new Hono();

clickRoute.get('/', async (c) => {
  const creativeId = c.req.query('c');
  const slotId = c.req.query('s');
  const token = c.req.query('t') ?? '';
  if (!creativeId || !slotId) {
    return c.text('Bad Request', 400);
  }
  const slot = await getSlotCache(slotId);
  const creative = slot?.activeCreatives.find((cc) => cc.creativeId === creativeId);
  if (!slot || !creative) {
    return c.text('Not Found', 404);
  }
  void logEvent({
    type: 'click',
    slotId,
    publisherId: slot.publisherId,
    creativeId,
    campaignId: creative.campaignId,
    advertiserId: '',
    country: c.req.header('CF-IPCountry') ?? 'XX',
    visitorToken: token,
    ts: Date.now(),
  });
  return c.redirect(creative.clickUrl, 302);
});
```

- [ ] **Step 2: Impression pixel**

Write `/Users/thorarinnhjalmarsson/Documents/Antigravity/ada/apps/serving/src/routes/impression.ts`:

```ts
import { Hono } from 'hono';
import { getSlotCache } from '../lib/cache';
import { recordVisitorImpression } from '../lib/visitor';
import { decrementBudget } from '../lib/analytics';

const PIXEL = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');

export const impressionRoute = new Hono();

impressionRoute.get('/', async (c) => {
  const creativeId = c.req.query('c');
  const slotId = c.req.query('s');
  const token = c.req.query('t') ?? '';
  if (!creativeId || !slotId) {
    return new Response(PIXEL, { status: 200, headers: { 'Content-Type': 'image/gif' } });
  }
  const slot = await getSlotCache(slotId);
  const creative = slot?.activeCreatives.find((cc) => cc.creativeId === creativeId);
  if (slot && creative) {
    if (token) void recordVisitorImpression(token, creativeId);
    if (slot.pricing.mode === 'cpm') {
      void decrementBudget(creative.campaignId, Math.round(slot.pricing.cpmIsk / 1000));
    }
  }
  return new Response(PIXEL, {
    status: 200,
    headers: {
      'Content-Type': 'image/gif',
      'Cache-Control': 'no-store',
    },
  });
});
```

- [ ] **Step 3: Run all tests & commit**

```bash
pnpm --filter @ada/serving test
git add apps/serving/src/routes/click.ts apps/serving/src/routes/impression.ts
git commit -m "feat(serving): click redirect and impression pixel endpoints"
```

---

## Task 11: API push-cache helper

**Files:** `apps/api/src/lib/push-cache.ts`, modify `apps/api/package.json`, modify `apps/api/src/services/slots.ts`

- [ ] **Step 1: Add Upstash dep to api**

```bash
cd /Users/thorarinnhjalmarsson/Documents/Antigravity/ada
pnpm --filter @ada/api add @upstash/redis
```

- [ ] **Step 2: push-cache helper**

Write `/Users/thorarinnhjalmarsson/Documents/Antigravity/ada/apps/api/src/lib/push-cache.ts`:

```ts
import { Redis } from '@upstash/redis';
import { CACHE_TTL_SECONDS, COLLECTIONS } from '@ada/shared';
import type { Slot } from '@ada/shared';
import { db } from './firebase';
import { slotConverter, publisherConverter } from '@ada/shared';

let _redis: Redis | null = null;
function redis(): Redis {
  if (_redis) return _redis;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) throw new Error('Missing Upstash env');
  _redis = new Redis({ url, token });
  return _redis;
}

/**
 * Rebuild and push the slot cache entry from Firestore state.
 * Called by any mutation that affects what a slot serves.
 * Implementation note: in Plan #4/#5 active creatives are derived from
 * campaigns; here we set an empty array because no campaigns exist yet.
 */
export async function pushSlotCache(slotId: string): Promise<void> {
  const slotSnap = await db
    .collection(COLLECTIONS.slots)
    .doc(slotId)
    .withConverter(slotConverter)
    .get();
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

  const entry = {
    slotId: slot.id,
    publisherId: slot.publisherId,
    sizes: slot.sizes,
    pricing: slot.pricing,
    activeCreatives: [] as unknown[],
    blockedCategories,
    refreshedAt: Date.now(),
  };

  await redis().set(`slot:${slot.id}`, entry, { ex: CACHE_TTL_SECONDS * 60 });
}

export async function invalidateSlotCache(slotId: string): Promise<void> {
  await redis().del(`slot:${slotId}`);
}
```

- [ ] **Step 3: Wire into slot service**

Modify `/Users/thorarinnhjalmarsson/Documents/Antigravity/ada/apps/api/src/services/slots.ts` — add import + call after each mutation:

```ts
import { pushSlotCache, invalidateSlotCache } from '../lib/push-cache';
```

After `await db.collection(...).set(slot)` in `createSlot`:

```ts
if (process.env.UPSTASH_REDIS_REST_URL) await pushSlotCache(slot.id);
```

Same after `set(next)` in `updateSlot`.

(Tests already mock `firebase`; in Plan #4/#5 the active creatives population is added here too.)

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/lib/push-cache.ts apps/api/src/services/slots.ts apps/api/package.json pnpm-lock.yaml
git commit -m "feat(api): push slot cache to Redis on mutations"
```

---

## Task 12: Cloudflare CDN deployment notes

**Files:** `packages/snippet/README.md`

- [ ] **Step 1: Document deployment**

Write `/Users/thorarinnhjalmarsson/Documents/Antigravity/ada/packages/snippet/README.md`:

```markdown
# @ada/snippet

Static JS bundle loaded on publisher websites.

## Build

\`\`\`bash
pnpm build
\`\`\`

Outputs `dist/snippet.js` (minified, ~3 KB).

## Deploy

V1 deployment is via Cloudflare R2 / CDN:

1. Upload `dist/snippet.js` to `r2://ada-cdn/v1/snippet.js`.
2. Configure a Cloudflare Worker route at `serving.birtingur.app/widget.js` that serves the file with:
   - `Cache-Control: public, max-age=300`
   - `Access-Control-Allow-Origin: *`
   - `Content-Type: application/javascript`

CI step (added in Plan #9) automates upload after build.

## Embed code shown to publishers

\`\`\`html

<div data-adplatform-slot="slot_xxxxx" style="min-height:90px"></div>
<script async src="https://serving.birtingur.app/widget.js"></script>
\`\`\`

## Failure modes (intentional)

- Snippet endpoint unreachable: slot hidden (`display:none`).
- Timeout > 2s: slot hidden.
- Malformed response: slot hidden.
- No CMP global: `consent=none` sent; no geo or frequency cap applied.

Never throws into publisher page console.
```

- [ ] **Step 2: Commit**

```bash
git add packages/snippet/README.md
git commit -m "docs(snippet): deployment instructions for Cloudflare CDN"
```

---

## Self-Review

- Snippet contract (spec §5.1, §5.2): implemented in `packages/snippet`. Fail-silent path verified by render.ts `display:none` on empty/error.
- Serving endpoint logic (spec §5.3): GET /v1/ad reads cache, filters via `selectCreative`, returns JSON, logs impression, sets cookie.
- Click flow (spec §5.4): `/v1/click` redirects via 302 after logging.
- Budget exhaustion (spec §5.5): `decrementBudget` triggered on impression pixel; sub-zero handling enforced by API's cache push (Plan #5).
- Frequency cap (spec §5.6): visitor token via cookie + Redis hash counters; only when consent=full.
- No IP storage (spec §4.4): only CF-IPCountry header read, never IP. Visitor token is random hex, not IP-derived.
- Cache shape (spec §4.2): matches `SlotCacheEntry` interface.
- Active creatives wiring: Plan #4/#5 will populate active creatives in `pushSlotCache` from campaign documents.
- No placeholders.
