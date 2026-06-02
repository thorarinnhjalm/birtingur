# ADA Publisher Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use `- [ ]` syntax.

**Goal:** Build the REST API for publisher registration, slot CRUD, snippet code generation, and publisher stats.

**Architecture:** Vercel functions (TypeScript) under `apps/api`, Hono framework for routing, Firebase Admin SDK for Firestore + Auth. All resource shapes come from `@ada/shared`. Business logic in `services/`, HTTP handlers in `routes/`. Tests use Firebase emulator.

**Tech Stack:** Hono, Firebase Admin SDK, Zod (via @ada/shared), Vitest, Vercel.

**Depends on:** Plan #1 (Foundation).

**Companion spec sections:** 4.1 (Firestore collections), 8.2 (REST endpoints — Publishers), 3.1 (snippet contract).

---

## File Structure

```
apps/api/
├── package.json
├── tsconfig.json
├── vercel.json
├── vitest.config.ts
├── src/
│   ├── index.ts                         # Hono app entry
│   ├── lib/
│   │   ├── firebase.ts                  # Admin SDK init
│   │   ├── auth.ts                      # Bearer token middleware
│   │   ├── errors.ts                    # AppError, error handler
│   │   ├── id.ts                        # generateId() with prefix
│   │   └── snippet.ts                   # buildSnippetHtml()
│   ├── services/
│   │   ├── publishers.ts                # createPublisher, getPublisher, updatePublisher
│   │   ├── slots.ts                     # createSlot, listSlots, updateSlot, getSnippet
│   │   └── publisher-stats.ts           # getStats(publisherId, period)
│   ├── routes/
│   │   ├── publishers.ts                # Hono routes mounted at /v1/publishers
│   │   └── slots.ts                     # Sub-routes under publishers
│   └── types.ts                         # API request/response shapes (Zod)
├── api/
│   └── index.ts                         # Vercel handler entrypoint
└── tests/
    ├── helpers/
    │   ├── emulator.ts                  # Firestore emulator setup
    │   └── auth.ts                      # Mock bearer tokens
    ├── publishers.test.ts
    ├── slots.test.ts
    └── snippet.test.ts
```

---

## Task 1: Scaffold apps/api

**Files:** `apps/api/package.json`, `tsconfig.json`, `vercel.json`, `vitest.config.ts`, `src/index.ts`, `api/index.ts`.

- [ ] **Step 1: Create directory**

```bash
cd /Users/thorarinnhjalmarsson/Documents/Antigravity/ada
mkdir -p apps/api/src/{lib,services,routes} apps/api/api apps/api/tests/helpers
```

- [ ] **Step 2: Create package.json**

Write `/Users/thorarinnhjalmarsson/Documents/Antigravity/ada/apps/api/package.json`:

```json
{
  "name": "@ada/api",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "tsc",
    "dev": "vercel dev",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit",
    "lint": "eslint src tests"
  },
  "dependencies": {
    "@ada/shared": "workspace:*",
    "hono": "^4.4.0",
    "firebase-admin": "^12.1.0",
    "zod": "^3.23.0"
  },
  "devDependencies": {
    "@firebase/rules-unit-testing": "^4.0.1",
    "@types/node": "^20.12.0",
    "typescript": "^5.4.0",
    "vercel": "^34.0.0",
    "vitest": "^1.5.0"
  }
}
```

- [ ] **Step 3: tsconfig.json**

Write `/Users/thorarinnhjalmarsson/Documents/Antigravity/ada/apps/api/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": ".",
    "moduleResolution": "Node",
    "module": "ESNext"
  },
  "include": ["src/**/*", "api/**/*"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

- [ ] **Step 4: vercel.json**

Write `/Users/thorarinnhjalmarsson/Documents/Antigravity/ada/apps/api/vercel.json`:

```json
{
  "buildCommand": "pnpm build",
  "functions": {
    "api/index.ts": { "maxDuration": 30 }
  },
  "rewrites": [
    { "source": "/(.*)", "destination": "/api/index" }
  ]
}
```

- [ ] **Step 5: vitest.config.ts**

Write `/Users/thorarinnhjalmarsson/Documents/Antigravity/ada/apps/api/vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    testTimeout: 20000,
    include: ['tests/**/*.test.ts'],
  },
});
```

- [ ] **Step 6: Empty entry files**

Write `/Users/thorarinnhjalmarsson/Documents/Antigravity/ada/apps/api/src/index.ts`:

```ts
import { Hono } from 'hono';

export const app = new Hono();

app.get('/healthz', (c) => c.json({ ok: true }));

export default app;
```

Write `/Users/thorarinnhjalmarsson/Documents/Antigravity/ada/apps/api/api/index.ts`:

```ts
import { handle } from 'hono/vercel';
import app from '../src/index';

export const config = { runtime: 'nodejs' };

export default handle(app);
```

- [ ] **Step 7: Install and commit**

```bash
cd /Users/thorarinnhjalmarsson/Documents/Antigravity/ada
pnpm install
pnpm --filter @ada/api build
git add apps/api package.json pnpm-lock.yaml
git commit -m "chore(api): scaffold api app with Hono and Vercel"
```

---

## Task 2: Firebase Admin init helper

**Files:** `apps/api/src/lib/firebase.ts`

- [ ] **Step 1: Write helper**

Write `/Users/thorarinnhjalmarsson/Documents/Antigravity/ada/apps/api/src/lib/firebase.ts`:

```ts
import { initializeApp, getApps, cert, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { getStorage } from 'firebase-admin/storage';

function init() {
  if (getApps().length > 0) return;

  const useEmulator = process.env.FIRESTORE_EMULATOR_HOST != null;

  if (useEmulator) {
    initializeApp({ projectId: process.env.GCLOUD_PROJECT ?? 'ada-test' });
    return;
  }

  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const projectId = process.env.FIREBASE_PROJECT_ID;

  if (privateKey && clientEmail && projectId) {
    initializeApp({
      credential: cert({ privateKey, clientEmail, projectId }),
      projectId,
      storageBucket: `${projectId}.appspot.com`,
    });
  } else {
    initializeApp({ credential: applicationDefault() });
  }
}

init();

export const db = getFirestore();
export const auth = getAuth();
export const storage = getStorage();
```

- [ ] **Step 2: Commit**

```bash
git add apps/api/src/lib/firebase.ts
git commit -m "feat(api): add Firebase Admin SDK initializer with emulator support"
```

---

## Task 3: Auth middleware

**Files:** `apps/api/src/lib/auth.ts`, `tests/helpers/auth.ts`, `tests/auth.test.ts`

- [ ] **Step 1: Write failing test**

Write `/Users/thorarinnhjalmarsson/Documents/Antigravity/ada/apps/api/tests/auth.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { requireAuth } from '../src/lib/auth';

vi.mock('../src/lib/firebase', () => ({
  auth: {
    verifyIdToken: vi.fn(async (token: string) => {
      if (token === 'valid-token') {
        return { uid: 'uid-a', email: 'jon@example.is', admin: false };
      }
      if (token === 'admin-token') {
        return { uid: 'uid-admin', email: 'admin@example.is', admin: true };
      }
      throw new Error('Invalid token');
    }),
  },
}));

describe('requireAuth', () => {
  let app: Hono;
  beforeEach(() => {
    app = new Hono();
    app.use('/protected/*', requireAuth());
    app.get('/protected/me', (c) => c.json({ user: c.get('user') }));
  });

  it('rejects requests with no Authorization header (401)', async () => {
    const res = await app.request('/protected/me');
    expect(res.status).toBe(401);
  });

  it('rejects malformed Authorization header (401)', async () => {
    const res = await app.request('/protected/me', {
      headers: { Authorization: 'NotBearer foo' },
    });
    expect(res.status).toBe(401);
  });

  it('rejects invalid token (401)', async () => {
    const res = await app.request('/protected/me', {
      headers: { Authorization: 'Bearer invalid' },
    });
    expect(res.status).toBe(401);
  });

  it('attaches user to context on valid token', async () => {
    const res = await app.request('/protected/me', {
      headers: { Authorization: 'Bearer valid-token' },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.user.email).toBe('jon@example.is');
    expect(body.user.admin).toBe(false);
  });

  it('admin token sets admin flag', async () => {
    const res = await app.request('/protected/me', {
      headers: { Authorization: 'Bearer admin-token' },
    });
    const body = await res.json();
    expect(body.user.admin).toBe(true);
  });
});
```

- [ ] **Step 2: Run test (expect fail)**

```bash
cd /Users/thorarinnhjalmarsson/Documents/Antigravity/ada/apps/api
pnpm test tests/auth.test.ts
```

Expected: FAIL (`Cannot find module '../src/lib/auth'`).

- [ ] **Step 3: Implement requireAuth**

Write `/Users/thorarinnhjalmarsson/Documents/Antigravity/ada/apps/api/src/lib/auth.ts`:

```ts
import type { MiddlewareHandler } from 'hono';
import { auth } from './firebase';

export interface AuthUser {
  uid: string;
  email: string;
  admin: boolean;
}

declare module 'hono' {
  interface ContextVariableMap {
    user: AuthUser;
  }
}

export function requireAuth(): MiddlewareHandler {
  return async (c, next) => {
    const header = c.req.header('Authorization');
    if (!header || !header.startsWith('Bearer ')) {
      return c.json({ error: 'missing_auth' }, 401);
    }
    const token = header.slice('Bearer '.length).trim();
    try {
      const decoded = await auth.verifyIdToken(token);
      if (!decoded.email) {
        return c.json({ error: 'no_email_claim' }, 401);
      }
      c.set('user', {
        uid: decoded.uid,
        email: decoded.email,
        admin: decoded.admin === true,
      });
      await next();
    } catch {
      return c.json({ error: 'invalid_token' }, 401);
    }
  };
}

export function requireAdmin(): MiddlewareHandler {
  return async (c, next) => {
    const user = c.get('user');
    if (!user?.admin) return c.json({ error: 'admin_required' }, 403);
    await next();
  };
}
```

- [ ] **Step 4: Run test (expect pass)**

```bash
pnpm test tests/auth.test.ts
```

Expected: All pass.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/lib/auth.ts apps/api/tests/auth.test.ts
git commit -m "feat(api): add Firebase ID token auth middleware"
```

---

## Task 4: Error handling and ID generation

**Files:** `apps/api/src/lib/errors.ts`, `apps/api/src/lib/id.ts`

- [ ] **Step 1: Write helpers**

Write `/Users/thorarinnhjalmarsson/Documents/Antigravity/ada/apps/api/src/lib/errors.ts`:

```ts
import type { Context } from 'hono';

export class AppError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export function notFound(code: string, message: string): AppError {
  return new AppError(404, code, message);
}

export function badRequest(code: string, message: string, details?: unknown): AppError {
  return new AppError(400, code, message, details);
}

export function forbidden(code = 'forbidden', message = 'Forbidden'): AppError {
  return new AppError(403, code, message);
}

export function conflict(code: string, message: string): AppError {
  return new AppError(409, code, message);
}

export function handleError(err: unknown, c: Context) {
  if (err instanceof AppError) {
    return c.json({ error: err.code, message: err.message, details: err.details }, err.status as 400);
  }
  console.error('Unhandled error:', err);
  return c.json({ error: 'internal_error' }, 500);
}
```

Write `/Users/thorarinnhjalmarsson/Documents/Antigravity/ada/apps/api/src/lib/id.ts`:

```ts
import { randomBytes } from 'crypto';

const ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';

function randomString(len: number): string {
  const bytes = randomBytes(len);
  let out = '';
  for (let i = 0; i < len; i++) {
    const byte = bytes[i] ?? 0;
    out += ALPHABET[byte % ALPHABET.length];
  }
  return out;
}

/** Generate prefixed ID, e.g. generateId("pub") -> "pub_a3f9k2x..." */
export function generateId(prefix: string, length = 16): string {
  return `${prefix}_${randomString(length)}`;
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/api/src/lib/errors.ts apps/api/src/lib/id.ts
git commit -m "feat(api): add error helpers and ID generator"
```

---

## Task 5: Emulator test helper

**Files:** `apps/api/tests/helpers/emulator.ts`

- [ ] **Step 1: Write helper**

Write `/Users/thorarinnhjalmarsson/Documents/Antigravity/ada/apps/api/tests/helpers/emulator.ts`:

```ts
import { beforeAll, beforeEach } from 'vitest';

export function setupEmulatorEnv() {
  process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
  process.env.GCLOUD_PROJECT = 'ada-test';
}

export async function clearFirestore() {
  const projectId = process.env.GCLOUD_PROJECT ?? 'ada-test';
  const host = process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080';
  const res = await fetch(
    `http://${host}/emulator/v1/projects/${projectId}/databases/(default)/documents`,
    { method: 'DELETE' },
  );
  if (!res.ok) throw new Error(`Failed to clear emulator: ${res.status}`);
}

export function useEmulator() {
  beforeAll(() => {
    setupEmulatorEnv();
  });
  beforeEach(async () => {
    await clearFirestore();
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/api/tests/helpers/emulator.ts
git commit -m "test(api): add Firestore emulator helper"
```

---

## Task 6: Publisher service (TDD)

**Files:** `apps/api/src/services/publishers.ts`, `apps/api/tests/publishers.test.ts`

- [ ] **Step 1: Write failing tests**

Write `/Users/thorarinnhjalmarsson/Documents/Antigravity/ada/apps/api/tests/publishers.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { useEmulator } from './helpers/emulator';
import {
  createPublisher,
  getPublisherByOwnerEmail,
  updatePublisher,
} from '../src/services/publishers';

useEmulator();

const validInput = {
  ownerEmail: 'jon@example.is',
  domain: 'kjarninn.is',
  displayName: 'Kjarninn',
  payoutMethod: {
    type: 'bank' as const,
    iban: 'IS140159260076545510730339',
    kennitala: '1234567890',
    accountName: 'Kjarninn ehf',
  },
};

describe('createPublisher', () => {
  it('creates and returns a publisher with generated id', async () => {
    const p = await createPublisher(validInput);
    expect(p.id).toMatch(/^pub_/);
    expect(p.ownerEmail).toBe('jon@example.is');
    expect(p.status).toBe('active');
    expect(p.contentPolicy.requireManualApproval).toBe(false);
  });

  it('rejects when ownerEmail already has a publisher', async () => {
    await createPublisher(validInput);
    await expect(createPublisher(validInput)).rejects.toThrow(/already/);
  });

  it('rejects invalid domain', async () => {
    await expect(
      createPublisher({ ...validInput, domain: 'not a domain' }),
    ).rejects.toThrow();
  });
});

describe('getPublisherByOwnerEmail', () => {
  it('returns null when not found', async () => {
    expect(await getPublisherByOwnerEmail('none@example.is')).toBe(null);
  });

  it('returns the publisher when present', async () => {
    const created = await createPublisher(validInput);
    const fetched = await getPublisherByOwnerEmail('jon@example.is');
    expect(fetched?.id).toBe(created.id);
  });
});

describe('updatePublisher', () => {
  it('updates content policy', async () => {
    const created = await createPublisher(validInput);
    const updated = await updatePublisher(created.id, {
      contentPolicy: {
        blockedCategories: ['gambling'],
        requireManualApproval: true,
      },
    });
    expect(updated.contentPolicy.blockedCategories).toEqual(['gambling']);
    expect(updated.contentPolicy.requireManualApproval).toBe(true);
  });
});
```

- [ ] **Step 2: Run (expect fail)**

```bash
cd /Users/thorarinnhjalmarsson/Documents/Antigravity/ada
pnpm --filter @ada/api test tests/publishers.test.ts
```

Expected: Module not found.

- [ ] **Step 3: Implement service**

Write `/Users/thorarinnhjalmarsson/Documents/Antigravity/ada/apps/api/src/services/publishers.ts`:

```ts
import { z } from 'zod';
import {
  COLLECTIONS,
  publisherConverter,
  PublisherSchema,
  ContentPolicySchema,
  PayoutMethodSchema,
} from '@ada/shared';
import type { Publisher, ContentPolicy, PayoutMethod } from '@ada/shared';
import { db } from '../lib/firebase';
import { generateId } from '../lib/id';
import { conflict, notFound } from '../lib/errors';

const CreatePublisherInputSchema = z.object({
  ownerEmail: z.string().email(),
  domain: z.string(),
  displayName: z.string().min(1).max(100),
  payoutMethod: PayoutMethodSchema,
  contentPolicy: ContentPolicySchema.optional(),
});
export type CreatePublisherInput = z.infer<typeof CreatePublisherInputSchema>;

export async function createPublisher(input: CreatePublisherInput): Promise<Publisher> {
  const parsed = CreatePublisherInputSchema.parse(input);

  const existing = await getPublisherByOwnerEmail(parsed.ownerEmail);
  if (existing) {
    throw conflict('publisher_exists', `Publisher already exists for ${parsed.ownerEmail}`);
  }

  const publisher: Publisher = PublisherSchema.parse({
    id: generateId('pub'),
    ownerEmail: parsed.ownerEmail,
    domain: parsed.domain,
    displayName: parsed.displayName,
    payoutMethod: parsed.payoutMethod,
    contentPolicy: parsed.contentPolicy ?? {
      blockedCategories: [],
      requireManualApproval: false,
    },
    status: 'active',
    createdAt: new Date(),
  });

  await db
    .collection(COLLECTIONS.publishers)
    .doc(publisher.id)
    .withConverter(publisherConverter)
    .set(publisher);

  return publisher;
}

export async function getPublisherById(id: string): Promise<Publisher | null> {
  const snap = await db
    .collection(COLLECTIONS.publishers)
    .doc(id)
    .withConverter(publisherConverter)
    .get();
  return snap.exists ? (snap.data() as Publisher) : null;
}

export async function getPublisherByOwnerEmail(email: string): Promise<Publisher | null> {
  const snap = await db
    .collection(COLLECTIONS.publishers)
    .where('ownerEmail', '==', email)
    .limit(1)
    .withConverter(publisherConverter)
    .get();
  return snap.empty ? null : (snap.docs[0]!.data() as Publisher);
}

const UpdatePublisherSchema = z.object({
  displayName: z.string().min(1).max(100).optional(),
  payoutMethod: PayoutMethodSchema.optional(),
  contentPolicy: ContentPolicySchema.optional(),
});
export type UpdatePublisherInput = z.infer<typeof UpdatePublisherSchema>;

export async function updatePublisher(
  id: string,
  patch: UpdatePublisherInput,
): Promise<Publisher> {
  const parsed = UpdatePublisherSchema.parse(patch);

  const existing = await getPublisherById(id);
  if (!existing) throw notFound('publisher_not_found', `Publisher ${id} not found`);

  const next: Publisher = PublisherSchema.parse({
    ...existing,
    ...parsed,
  });

  await db
    .collection(COLLECTIONS.publishers)
    .doc(id)
    .withConverter(publisherConverter)
    .set(next);

  return next;
}
```

- [ ] **Step 4: Run tests with emulator**

```bash
cd /Users/thorarinnhjalmarsson/Documents/Antigravity/ada
firebase --config firebase/firebase.json emulators:exec --only firestore 'pnpm --filter @ada/api test tests/publishers.test.ts'
```

Expected: All pass.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/services/publishers.ts apps/api/tests/publishers.test.ts
git commit -m "feat(api): publisher service with create/get/update"
```

---

## Task 7: Snippet builder (TDD)

**Files:** `apps/api/src/lib/snippet.ts`, `apps/api/tests/snippet.test.ts`

- [ ] **Step 1: Write failing test**

Write `/Users/thorarinnhjalmarsson/Documents/Antigravity/ada/apps/api/tests/snippet.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildSnippetHtml } from '../src/lib/snippet';

describe('buildSnippetHtml', () => {
  it('builds snippet for slot with first size dimensions', () => {
    const html = buildSnippetHtml({
      slotId: 'slot_abc123',
      sizes: [{ width: 728, height: 90 }],
      cdnBase: 'https://cdn.adplatform.is',
    });
    expect(html).toContain('data-adplatform-slot="slot_abc123"');
    expect(html).toContain('min-height:90px');
    expect(html).toContain('https://cdn.adplatform.is/v1/snippet.js');
  });

  it('escapes slot id (defensive)', () => {
    const html = buildSnippetHtml({
      slotId: 'slot_"><script>alert(1)</script>',
      sizes: [{ width: 728, height: 90 }],
      cdnBase: 'https://cdn.adplatform.is',
    });
    expect(html).not.toContain('<script>alert');
  });

  it('uses largest min-height across sizes for graceful fallback', () => {
    const html = buildSnippetHtml({
      slotId: 'slot_x',
      sizes: [{ width: 728, height: 90 }, { width: 300, height: 600 }],
      cdnBase: 'https://cdn.adplatform.is',
    });
    expect(html).toContain('min-height:600px');
  });
});
```

- [ ] **Step 2: Run (expect fail)**

```bash
pnpm --filter @ada/api test tests/snippet.test.ts
```

- [ ] **Step 3: Implement**

Write `/Users/thorarinnhjalmarsson/Documents/Antigravity/ada/apps/api/src/lib/snippet.ts`:

```ts
import type { Size } from '@ada/shared';

interface BuildOpts {
  slotId: string;
  sizes: Size[];
  cdnBase: string;
}

function escapeHtmlAttr(s: string): string {
  return s.replace(/[&<>"']/g, (ch) => {
    switch (ch) {
      case '&': return '&amp;';
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '"': return '&quot;';
      case "'": return '&#39;';
      default: return ch;
    }
  });
}

export function buildSnippetHtml({ slotId, sizes, cdnBase }: BuildOpts): string {
  const maxHeight = Math.max(...sizes.map((s) => s.height));
  const safeId = escapeHtmlAttr(slotId);
  const safeCdn = escapeHtmlAttr(cdnBase);
  return `<div data-adplatform-slot="${safeId}" style="min-height:${maxHeight}px"></div>
<script async src="${safeCdn}/v1/snippet.js"></script>`;
}
```

- [ ] **Step 4: Run (expect pass)**

```bash
pnpm --filter @ada/api test tests/snippet.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/lib/snippet.ts apps/api/tests/snippet.test.ts
git commit -m "feat(api): snippet HTML builder with XSS-safe escaping"
```

---

## Task 8: Slot service (TDD)

**Files:** `apps/api/src/services/slots.ts`, `apps/api/tests/slots.test.ts`

- [ ] **Step 1: Write failing tests**

Write `/Users/thorarinnhjalmarsson/Documents/Antigravity/ada/apps/api/tests/slots.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { useEmulator } from './helpers/emulator';
import { createPublisher } from '../src/services/publishers';
import {
  createSlot,
  listSlotsForPublisher,
  getSlot,
  updateSlot,
  getSnippetForSlot,
} from '../src/services/slots';

useEmulator();

async function pub() {
  return createPublisher({
    ownerEmail: 'jon@example.is',
    domain: 'kjarninn.is',
    displayName: 'Kjarninn',
    payoutMethod: {
      type: 'bank',
      iban: 'IS140159260076545510730339',
      kennitala: '1234567890',
      accountName: 'Kjarninn ehf',
    },
  });
}

describe('createSlot', () => {
  it('creates a CPM slot', async () => {
    const p = await pub();
    const slot = await createSlot(p.id, {
      name: 'Forsíða leaderboard',
      sizes: [{ width: 728, height: 90 }],
      pricing: { mode: 'cpm', cpmIsk: 1500 },
      placement: { pageMatcher: '/', position: 'above_fold' },
    });
    expect(slot.id).toMatch(/^slot_/);
    expect(slot.publisherId).toBe(p.id);
    expect(slot.status).toBe('active');
  });
});

describe('listSlotsForPublisher', () => {
  it('returns slots in creation order', async () => {
    const p = await pub();
    const s1 = await createSlot(p.id, {
      name: 'A',
      sizes: [{ width: 728, height: 90 }],
      pricing: { mode: 'cpm', cpmIsk: 1000 },
      placement: { pageMatcher: '/', position: 'above_fold' },
    });
    const s2 = await createSlot(p.id, {
      name: 'B',
      sizes: [{ width: 300, height: 250 }],
      pricing: { mode: 'slot', slotPriceIsk: 25000, slotPeriodDays: 7 },
      placement: { pageMatcher: '/articles/*', position: 'in_content' },
    });
    const list = await listSlotsForPublisher(p.id);
    expect(list.map((s) => s.id).sort()).toEqual([s1.id, s2.id].sort());
  });
});

describe('updateSlot', () => {
  it('updates pricing', async () => {
    const p = await pub();
    const slot = await createSlot(p.id, {
      name: 'A',
      sizes: [{ width: 728, height: 90 }],
      pricing: { mode: 'cpm', cpmIsk: 1000 },
      placement: { pageMatcher: '/', position: 'above_fold' },
    });
    const updated = await updateSlot(slot.id, {
      pricing: { mode: 'cpm', cpmIsk: 2000 },
    });
    expect(updated.pricing).toEqual({ mode: 'cpm', cpmIsk: 2000 });
  });
});

describe('getSnippetForSlot', () => {
  it('returns HTML snippet', async () => {
    const p = await pub();
    const slot = await createSlot(p.id, {
      name: 'A',
      sizes: [{ width: 728, height: 90 }],
      pricing: { mode: 'cpm', cpmIsk: 1000 },
      placement: { pageMatcher: '/', position: 'above_fold' },
    });
    const html = await getSnippetForSlot(slot.id);
    expect(html).toContain(`data-adplatform-slot="${slot.id}"`);
  });
});
```

- [ ] **Step 2: Implement**

Write `/Users/thorarinnhjalmarsson/Documents/Antigravity/ada/apps/api/src/services/slots.ts`:

```ts
import { z } from 'zod';
import {
  COLLECTIONS,
  slotConverter,
  SlotSchema,
  SizeSchema,
  PricingSchema,
  PlacementSchema,
} from '@ada/shared';
import type { Slot } from '@ada/shared';
import { db } from '../lib/firebase';
import { generateId } from '../lib/id';
import { notFound } from '../lib/errors';
import { buildSnippetHtml } from '../lib/snippet';

const CreateSlotInputSchema = z.object({
  name: z.string().min(1).max(100),
  sizes: z.array(SizeSchema).min(1),
  pricing: PricingSchema,
  placement: PlacementSchema,
});
export type CreateSlotInput = z.infer<typeof CreateSlotInputSchema>;

export async function createSlot(publisherId: string, input: CreateSlotInput): Promise<Slot> {
  const parsed = CreateSlotInputSchema.parse(input);
  const slot: Slot = SlotSchema.parse({
    id: generateId('slot'),
    publisherId,
    name: parsed.name,
    sizes: parsed.sizes,
    pricing: parsed.pricing,
    placement: parsed.placement,
    status: 'active',
  });

  await db
    .collection(COLLECTIONS.slots)
    .doc(slot.id)
    .withConverter(slotConverter)
    .set(slot);
  return slot;
}

export async function getSlot(id: string): Promise<Slot | null> {
  const snap = await db
    .collection(COLLECTIONS.slots)
    .doc(id)
    .withConverter(slotConverter)
    .get();
  return snap.exists ? (snap.data() as Slot) : null;
}

export async function listSlotsForPublisher(publisherId: string): Promise<Slot[]> {
  const snap = await db
    .collection(COLLECTIONS.slots)
    .where('publisherId', '==', publisherId)
    .withConverter(slotConverter)
    .get();
  return snap.docs.map((d) => d.data() as Slot);
}

const UpdateSlotInputSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  sizes: z.array(SizeSchema).min(1).optional(),
  pricing: PricingSchema.optional(),
  placement: PlacementSchema.optional(),
  status: z.enum(['active', 'paused']).optional(),
});
export type UpdateSlotInput = z.infer<typeof UpdateSlotInputSchema>;

export async function updateSlot(id: string, patch: UpdateSlotInput): Promise<Slot> {
  const parsed = UpdateSlotInputSchema.parse(patch);
  const existing = await getSlot(id);
  if (!existing) throw notFound('slot_not_found', `Slot ${id} not found`);

  const next: Slot = SlotSchema.parse({ ...existing, ...parsed });
  await db
    .collection(COLLECTIONS.slots)
    .doc(id)
    .withConverter(slotConverter)
    .set(next);
  return next;
}

export async function getSnippetForSlot(slotId: string): Promise<string> {
  const slot = await getSlot(slotId);
  if (!slot) throw notFound('slot_not_found', `Slot ${slotId} not found`);
  const cdnBase = process.env.AD_CDN_BASE ?? 'https://cdn.adplatform.is';
  return buildSnippetHtml({ slotId, sizes: slot.sizes, cdnBase });
}
```

- [ ] **Step 3: Run tests**

```bash
firebase --config firebase/firebase.json emulators:exec --only firestore 'pnpm --filter @ada/api test tests/slots.test.ts'
```

Expected: All pass.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/services/slots.ts apps/api/tests/slots.test.ts
git commit -m "feat(api): slot service with snippet generation"
```

---

## Task 9: Publisher routes

**Files:** `apps/api/src/routes/publishers.ts`, modify `apps/api/src/index.ts`, `tests/publisher-routes.test.ts`

- [ ] **Step 1: Write failing test**

Write `/Users/thorarinnhjalmarsson/Documents/Antigravity/ada/apps/api/tests/publisher-routes.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { useEmulator } from './helpers/emulator';

vi.mock('../src/lib/firebase', async () => {
  const actual = await vi.importActual<typeof import('../src/lib/firebase')>('../src/lib/firebase');
  return {
    ...actual,
    auth: {
      verifyIdToken: vi.fn(async (token: string) => {
        const known: Record<string, { uid: string; email: string; admin?: boolean }> = {
          'token-jon': { uid: 'u1', email: 'jon@example.is' },
          'token-anna': { uid: 'u2', email: 'anna@example.is' },
          'token-admin': { uid: 'u3', email: 'admin@example.is', admin: true },
        };
        const u = known[token];
        if (!u) throw new Error('bad');
        return u;
      }),
    },
  };
});

import app from '../src/index';

useEmulator();

const validBody = {
  domain: 'kjarninn.is',
  displayName: 'Kjarninn',
  payoutMethod: {
    type: 'bank',
    iban: 'IS140159260076545510730339',
    kennitala: '1234567890',
    accountName: 'Kjarninn ehf',
  },
};

describe('POST /v1/publishers', () => {
  it('creates publisher for authed user', async () => {
    const res = await app.request('/v1/publishers', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer token-jon',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(validBody),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.publisher.ownerEmail).toBe('jon@example.is');
  });

  it('401 without auth', async () => {
    const res = await app.request('/v1/publishers', { method: 'POST' });
    expect(res.status).toBe(401);
  });
});

describe('GET /v1/publishers/me', () => {
  it('returns 404 when no publisher for user', async () => {
    const res = await app.request('/v1/publishers/me', {
      headers: { Authorization: 'Bearer token-jon' },
    });
    expect(res.status).toBe(404);
  });

  it('returns the publisher when present', async () => {
    await app.request('/v1/publishers', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer token-jon',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(validBody),
    });
    const res = await app.request('/v1/publishers/me', {
      headers: { Authorization: 'Bearer token-jon' },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.publisher.domain).toBe('kjarninn.is');
  });
});

describe('PATCH /v1/publishers/me', () => {
  it('updates content policy', async () => {
    await app.request('/v1/publishers', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer token-jon',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(validBody),
    });
    const res = await app.request('/v1/publishers/me', {
      method: 'PATCH',
      headers: {
        Authorization: 'Bearer token-jon',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contentPolicy: { blockedCategories: ['gambling'], requireManualApproval: true },
      }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.publisher.contentPolicy.requireManualApproval).toBe(true);
  });
});
```

- [ ] **Step 2: Implement routes**

Write `/Users/thorarinnhjalmarsson/Documents/Antigravity/ada/apps/api/src/routes/publishers.ts`:

```ts
import { Hono } from 'hono';
import { requireAuth } from '../lib/auth';
import { handleError, notFound } from '../lib/errors';
import {
  createPublisher,
  getPublisherByOwnerEmail,
  updatePublisher,
} from '../services/publishers';

export const publishersRoutes = new Hono();

publishersRoutes.use('/*', requireAuth());

publishersRoutes.post('/', async (c) => {
  try {
    const user = c.get('user');
    const body = await c.req.json();
    const publisher = await createPublisher({
      ownerEmail: user.email,
      ...body,
    });
    return c.json({ publisher }, 201);
  } catch (err) {
    return handleError(err, c);
  }
});

publishersRoutes.get('/me', async (c) => {
  try {
    const user = c.get('user');
    const publisher = await getPublisherByOwnerEmail(user.email);
    if (!publisher) throw notFound('publisher_not_found', 'No publisher for this user');
    return c.json({ publisher });
  } catch (err) {
    return handleError(err, c);
  }
});

publishersRoutes.patch('/me', async (c) => {
  try {
    const user = c.get('user');
    const existing = await getPublisherByOwnerEmail(user.email);
    if (!existing) throw notFound('publisher_not_found', 'No publisher for this user');
    const body = await c.req.json();
    const updated = await updatePublisher(existing.id, body);
    return c.json({ publisher: updated });
  } catch (err) {
    return handleError(err, c);
  }
});
```

- [ ] **Step 3: Mount in index.ts**

Replace `/Users/thorarinnhjalmarsson/Documents/Antigravity/ada/apps/api/src/index.ts`:

```ts
import { Hono } from 'hono';
import { publishersRoutes } from './routes/publishers';
import { slotsRoutes } from './routes/slots';

export const app = new Hono();

app.get('/healthz', (c) => c.json({ ok: true }));
app.route('/v1/publishers', publishersRoutes);
app.route('/v1/publishers/me/slots', slotsRoutes);

export default app;
```

- [ ] **Step 4: Run tests**

```bash
firebase --config firebase/firebase.json emulators:exec --only firestore 'pnpm --filter @ada/api test'
```

Expected: All pass (slots routes test fails until next task — skip-mark or proceed to next task).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/publishers.ts apps/api/src/index.ts apps/api/tests/publisher-routes.test.ts
git commit -m "feat(api): publisher REST routes (create/get/patch /v1/publishers/me)"
```

---

## Task 10: Slot routes

**Files:** `apps/api/src/routes/slots.ts`, `apps/api/tests/slot-routes.test.ts`

- [ ] **Step 1: Write failing test**

Write `/Users/thorarinnhjalmarsson/Documents/Antigravity/ada/apps/api/tests/slot-routes.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { useEmulator } from './helpers/emulator';

vi.mock('../src/lib/firebase', async () => {
  const actual = await vi.importActual<typeof import('../src/lib/firebase')>('../src/lib/firebase');
  return {
    ...actual,
    auth: {
      verifyIdToken: vi.fn(async (token: string) => {
        const known: Record<string, { uid: string; email: string }> = {
          'token-jon': { uid: 'u1', email: 'jon@example.is' },
          'token-other': { uid: 'u2', email: 'other@example.is' },
        };
        const u = known[token];
        if (!u) throw new Error('bad');
        return u;
      }),
    },
  };
});

import app from '../src/index';

useEmulator();

async function makePublisher(token: string, domain: string) {
  return app.request('/v1/publishers', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      domain,
      displayName: 'Test',
      payoutMethod: {
        type: 'bank',
        iban: 'IS140159260076545510730339',
        kennitala: '1234567890',
        accountName: 'T',
      },
    }),
  });
}

describe('POST /v1/publishers/me/slots', () => {
  it('creates a slot', async () => {
    await makePublisher('token-jon', 'kjarninn.is');
    const res = await app.request('/v1/publishers/me/slots', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer token-jon',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: 'Forsíða',
        sizes: [{ width: 728, height: 90 }],
        pricing: { mode: 'cpm', cpmIsk: 1500 },
        placement: { pageMatcher: '/', position: 'above_fold' },
      }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.slot.name).toBe('Forsíða');
  });

  it('404 if user has no publisher', async () => {
    const res = await app.request('/v1/publishers/me/slots', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer token-jon',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: 'X',
        sizes: [{ width: 728, height: 90 }],
        pricing: { mode: 'cpm', cpmIsk: 1500 },
        placement: { pageMatcher: '/', position: 'above_fold' },
      }),
    });
    expect(res.status).toBe(404);
  });
});

describe('GET /v1/publishers/me/slots', () => {
  it('lists own slots only', async () => {
    await makePublisher('token-jon', 'kjarninn.is');
    await makePublisher('token-other', 'other.is');
    await app.request('/v1/publishers/me/slots', {
      method: 'POST',
      headers: { Authorization: 'Bearer token-jon', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'A',
        sizes: [{ width: 728, height: 90 }],
        pricing: { mode: 'cpm', cpmIsk: 1500 },
        placement: { pageMatcher: '/', position: 'above_fold' },
      }),
    });
    const res = await app.request('/v1/publishers/me/slots', {
      headers: { Authorization: 'Bearer token-jon' },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.slots).toHaveLength(1);
  });
});

describe('GET /v1/publishers/me/slots/:id/snippet', () => {
  it('returns snippet HTML', async () => {
    await makePublisher('token-jon', 'kjarninn.is');
    const create = await app.request('/v1/publishers/me/slots', {
      method: 'POST',
      headers: { Authorization: 'Bearer token-jon', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'A',
        sizes: [{ width: 728, height: 90 }],
        pricing: { mode: 'cpm', cpmIsk: 1500 },
        placement: { pageMatcher: '/', position: 'above_fold' },
      }),
    });
    const { slot } = await create.json();
    const res = await app.request(`/v1/publishers/me/slots/${slot.id}/snippet`, {
      headers: { Authorization: 'Bearer token-jon' },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.html).toContain(`data-adplatform-slot="${slot.id}"`);
  });

  it('403 if user does not own slot', async () => {
    await makePublisher('token-jon', 'kjarninn.is');
    await makePublisher('token-other', 'other.is');
    const create = await app.request('/v1/publishers/me/slots', {
      method: 'POST',
      headers: { Authorization: 'Bearer token-jon', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'A',
        sizes: [{ width: 728, height: 90 }],
        pricing: { mode: 'cpm', cpmIsk: 1500 },
        placement: { pageMatcher: '/', position: 'above_fold' },
      }),
    });
    const { slot } = await create.json();
    const res = await app.request(`/v1/publishers/me/slots/${slot.id}/snippet`, {
      headers: { Authorization: 'Bearer token-other' },
    });
    expect(res.status).toBe(403);
  });
});
```

- [ ] **Step 2: Implement**

Write `/Users/thorarinnhjalmarsson/Documents/Antigravity/ada/apps/api/src/routes/slots.ts`:

```ts
import { Hono } from 'hono';
import { requireAuth } from '../lib/auth';
import { forbidden, handleError, notFound } from '../lib/errors';
import { getPublisherByOwnerEmail } from '../services/publishers';
import {
  createSlot,
  getSlot,
  getSnippetForSlot,
  listSlotsForPublisher,
  updateSlot,
} from '../services/slots';

export const slotsRoutes = new Hono();

slotsRoutes.use('/*', requireAuth());

slotsRoutes.post('/', async (c) => {
  try {
    const user = c.get('user');
    const publisher = await getPublisherByOwnerEmail(user.email);
    if (!publisher) throw notFound('publisher_not_found', 'No publisher for this user');
    const body = await c.req.json();
    const slot = await createSlot(publisher.id, body);
    return c.json({ slot }, 201);
  } catch (err) {
    return handleError(err, c);
  }
});

slotsRoutes.get('/', async (c) => {
  try {
    const user = c.get('user');
    const publisher = await getPublisherByOwnerEmail(user.email);
    if (!publisher) throw notFound('publisher_not_found', 'No publisher for this user');
    const slots = await listSlotsForPublisher(publisher.id);
    return c.json({ slots });
  } catch (err) {
    return handleError(err, c);
  }
});

slotsRoutes.patch('/:id', async (c) => {
  try {
    const user = c.get('user');
    const publisher = await getPublisherByOwnerEmail(user.email);
    if (!publisher) throw notFound('publisher_not_found', 'No publisher for this user');
    const id = c.req.param('id');
    const existing = await getSlot(id);
    if (!existing) throw notFound('slot_not_found', `Slot ${id} not found`);
    if (existing.publisherId !== publisher.id) throw forbidden();
    const body = await c.req.json();
    const updated = await updateSlot(id, body);
    return c.json({ slot: updated });
  } catch (err) {
    return handleError(err, c);
  }
});

slotsRoutes.get('/:id/snippet', async (c) => {
  try {
    const user = c.get('user');
    const publisher = await getPublisherByOwnerEmail(user.email);
    if (!publisher) throw notFound('publisher_not_found', 'No publisher for this user');
    const id = c.req.param('id');
    const slot = await getSlot(id);
    if (!slot) throw notFound('slot_not_found', `Slot ${id} not found`);
    if (slot.publisherId !== publisher.id) throw forbidden();
    const html = await getSnippetForSlot(id);
    return c.json({ html });
  } catch (err) {
    return handleError(err, c);
  }
});
```

- [ ] **Step 3: Run all tests**

```bash
firebase --config firebase/firebase.json emulators:exec --only firestore 'pnpm --filter @ada/api test'
```

Expected: All pass.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/routes/slots.ts apps/api/tests/slot-routes.test.ts
git commit -m "feat(api): slot REST routes (create/list/patch/snippet)"
```

---

## Task 11: Publisher stats stub

**Files:** `apps/api/src/services/publisher-stats.ts`, add route to `routes/publishers.ts`, `tests/publisher-stats.test.ts`

- [ ] **Step 1: Implement stub service**

Write `/Users/thorarinnhjalmarsson/Documents/Antigravity/ada/apps/api/src/services/publisher-stats.ts`:

```ts
import { COLLECTIONS } from '@ada/shared';
import { db } from '../lib/firebase';

export interface PublisherStatsResponse {
  impressions: number;
  clicks: number;
  earningsIsk: number;
  bySlot: Record<string, { impressions: number; clicks: number; earningsIsk: number }>;
  period: string;
}

/**
 * Read aggregated stats from `stats/publishers/{publisherId}/daily/{YYYYMMDD}`.
 * Full population of these aggregates happens in Plan #3 (serving) and Plan #9 (reconciliation).
 * Until then, returns zeros for periods with no aggregates yet.
 */
export async function getPublisherStats(
  publisherId: string,
  period: '7d' | '30d' = '30d',
): Promise<PublisherStatsResponse> {
  const days = period === '7d' ? 7 : 30;
  const now = new Date();
  let impressions = 0;
  let clicks = 0;
  let earningsIsk = 0;
  const bySlot: Record<string, { impressions: number; clicks: number; earningsIsk: number }> = {};

  for (let i = 0; i < days; i++) {
    const d = new Date(now.getTime() - i * 86400000);
    const ymd =
      d.getUTCFullYear().toString() +
      String(d.getUTCMonth() + 1).padStart(2, '0') +
      String(d.getUTCDate()).padStart(2, '0');
    const snap = await db
      .collection(COLLECTIONS.stats)
      .doc('publishers')
      .collection(publisherId)
      .doc(ymd)
      .get();
    if (!snap.exists) continue;
    const data = snap.data();
    if (!data) continue;
    impressions += (data.impressions as number) ?? 0;
    clicks += (data.clicks as number) ?? 0;
    earningsIsk += (data.earningsIsk as number) ?? 0;
    const slots = (data.bySlot as Record<string, { impressions: number; clicks: number; earningsIsk: number }>) ?? {};
    for (const [slotId, s] of Object.entries(slots)) {
      const existing = bySlot[slotId] ?? { impressions: 0, clicks: 0, earningsIsk: 0 };
      bySlot[slotId] = {
        impressions: existing.impressions + s.impressions,
        clicks: existing.clicks + s.clicks,
        earningsIsk: existing.earningsIsk + s.earningsIsk,
      };
    }
  }
  return { impressions, clicks, earningsIsk, bySlot, period };
}
```

- [ ] **Step 2: Add route in publishers.ts**

Modify `/Users/thorarinnhjalmarsson/Documents/Antigravity/ada/apps/api/src/routes/publishers.ts` — add at bottom (before `export`):

```ts
import { getPublisherStats } from '../services/publisher-stats';

publishersRoutes.get('/me/stats', async (c) => {
  try {
    const user = c.get('user');
    const publisher = await getPublisherByOwnerEmail(user.email);
    if (!publisher) throw notFound('publisher_not_found', 'No publisher for this user');
    const periodParam = c.req.query('period');
    const period = periodParam === '7d' ? '7d' : '30d';
    const stats = await getPublisherStats(publisher.id, period);
    return c.json({ stats });
  } catch (err) {
    return handleError(err, c);
  }
});
```

- [ ] **Step 3: Write test**

Write `/Users/thorarinnhjalmarsson/Documents/Antigravity/ada/apps/api/tests/publisher-stats.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { useEmulator } from './helpers/emulator';

vi.mock('../src/lib/firebase', async () => {
  const actual = await vi.importActual<typeof import('../src/lib/firebase')>('../src/lib/firebase');
  return {
    ...actual,
    auth: {
      verifyIdToken: vi.fn(async () => ({ uid: 'u', email: 'jon@example.is' })),
    },
  };
});

import app from '../src/index';

useEmulator();

describe('GET /v1/publishers/me/stats', () => {
  it('returns zeros when no data', async () => {
    await app.request('/v1/publishers', {
      method: 'POST',
      headers: { Authorization: 'Bearer t', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        domain: 'kjarninn.is',
        displayName: 'K',
        payoutMethod: {
          type: 'bank',
          iban: 'IS140159260076545510730339',
          kennitala: '1234567890',
          accountName: 'K',
        },
      }),
    });
    const res = await app.request('/v1/publishers/me/stats?period=30d', {
      headers: { Authorization: 'Bearer t' },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.stats.impressions).toBe(0);
    expect(body.stats.period).toBe('30d');
  });
});
```

- [ ] **Step 4: Run and commit**

```bash
firebase --config firebase/firebase.json emulators:exec --only firestore 'pnpm --filter @ada/api test'
git add apps/api/src/services/publisher-stats.ts apps/api/src/routes/publishers.ts apps/api/tests/publisher-stats.test.ts
git commit -m "feat(api): publisher stats endpoint reading from aggregated daily docs"
```

---

## Task 12: Final verification

- [ ] **Step 1: Full test run**

```bash
cd /Users/thorarinnhjalmarsson/Documents/Antigravity/ada
firebase --config firebase/firebase.json emulators:exec --only firestore 'pnpm --filter @ada/api test'
pnpm --filter @ada/api typecheck
pnpm --filter @ada/api build
```

Expected: All green.

- [ ] **Step 2: Commit**

```bash
git status   # should be clean
```

---

## Self-Review

- Endpoints covered (spec §8.2 Publishers): POST `/v1/publishers`, GET/PATCH `/v1/publishers/me`, GET/POST `/v1/publishers/me/slots`, PATCH `/v1/publishers/me/slots/:id`, GET `/v1/publishers/me/slots/:id/snippet`, GET `/v1/publishers/me/stats` — all present.
- Snippet contract (spec §5.1) implemented in `buildSnippetHtml` with XSS escaping.
- Stats endpoint reads from aggregated docs populated by Plan #3 + #9; until those run, returns zeros (graceful degradation).
- Pending approvals (`GET /v1/publishers/me/pending-approvals`, POST approval action) deferred to Plan #6 (approval workflow) where the data shape is defined.
- Payouts (`GET /v1/publishers/me/payouts`) deferred to Plan #9.
- Type consistency: Publisher/Slot schemas imported from `@ada/shared`. `ContentPolicySchema` defaults match service code.
- No placeholders.
