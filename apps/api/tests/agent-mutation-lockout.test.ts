import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { DecodedIdToken } from 'firebase-admin/auth';
import type * as firebaseModule from '../src/lib/firebase';

// Real Firestore emulator underneath (like agent-purchase.test.ts /
// wallet-reservation.test.ts) — only `auth.verifyIdToken` is mocked so both
// `ak_` key auth (real, via issueApiKey/verifyApiKey) and ID-token auth
// (mocked) can be exercised against the real `app` in the same file. This is
// the same partial-mock pattern used by tests/publisher-routes.test.ts.
vi.mock('../src/lib/firebase', async (importOriginal) => {
  const original = await importOriginal<typeof firebaseModule>();
  return {
    ...original,
    auth: {
      ...original.auth,
      verifyIdToken: vi.fn(),
    },
  };
});

import { app } from '../src/index';
import { auth } from '../src/lib/firebase';
import { clearFirestoreEmulator } from './helpers/emulator';
import { createAdvertiser } from '../src/services/advertisers';
import { createCreative } from '../src/services/creatives';
import { StubAutoScanner } from '../src/services/auto-scan/stub';
import { createCampaign } from '../src/services/campaigns';
import { topUp } from '../src/services/wallet';
import { issueApiKey } from '../src/services/api-keys';

// Fix 1 & Fix 3 (adversarial review): `ak_` keys must be locked out of
// mutation routes that have no corresponding MCP/API-key tool in v1 — closes
// an agent self-activating its own pending campaign via status PATCH, a
// monthly-cap bypass via budget PATCH, self-approval via creative re-scan,
// unmetered Gemini spend via /generate, and key self-issuance/revocation.
// Firebase ID-token (dashboard) callers must be entirely unaffected.
describe('Agent mutation lockout (ak_ keys blocked from dashboard-only routes)', () => {
  const OWNER_EMAIL = 'owner@mutation-lockout.test.is';

  beforeEach(async () => {
    await clearFirestoreEmulator();
    vi.mocked(auth.verifyIdToken).mockResolvedValue({
      uid: 'user-lockout',
      email: OWNER_EMAIL,
      email_verified: true,
    } as unknown as DecodedIdToken);
  });

  async function seed() {
    const adv = await createAdvertiser({
      ownerEmail: OWNER_EMAIL,
      companyName: 'Lockout Test ehf.',
      kennitala: '1234567890',
      vatNumber: '1',
    });
    await topUp(adv.id, 500_000, `topup_${adv.id}`);
    const creative = await createCreative(
      adv.id,
      {
        imageUrl: 'https://example.com/lockout.png',
        width: 728,
        height: 90,
        clickUrl: 'https://blomabud.is/lockout',
      },
      new StubAutoScanner(),
    );
    const cmp = await createCampaign(adv.id, {
      creativeIds: [creative.id],
      categories: ['matur'],
      schedule: {
        startsAt: new Date(Date.now() + 1000),
        endsAt: new Date(Date.now() + 86_400_000),
      },
      budget: { mode: 'cpm_capped', totalIsk: 20_000 },
    });
    const { key: advKey } = await issueApiKey(OWNER_EMAIL, 'advertiser');
    const { key: bothKey } = await issueApiKey(OWNER_EMAIL, 'both');
    const { key: pubKey } = await issueApiKey(OWNER_EMAIL, 'publisher');
    return { adv, creative, cmp, advKey, bothKey, pubKey };
  }

  describe('PATCH /v1/campaigns/:id', () => {
    it('rejects a both-scoped ak_ key with 403 AGENT_MUTATION_NOT_ALLOWED', async () => {
      const { cmp, bothKey } = await seed();
      const res = await app.request(`/v1/campaigns/${cmp.id}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${bothKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'paused' }),
      });
      expect(res.status).toBe(403);
      const body = (await res.json()) as { error: string };
      expect(body.error).toBe('AGENT_MUTATION_NOT_ALLOWED');
    });

    it('rejects an advertiser-scoped ak_ key with 403 AGENT_MUTATION_NOT_ALLOWED', async () => {
      const { cmp, advKey } = await seed();
      const res = await app.request(`/v1/campaigns/${cmp.id}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${advKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'paused' }),
      });
      expect(res.status).toBe(403);
      const body = (await res.json()) as { error: string };
      expect(body.error).toBe('AGENT_MUTATION_NOT_ALLOWED');
    });

    it('rejects a publisher-scoped ak_ key with 403 (scope gate fires first, still blocked)', async () => {
      const { cmp, pubKey } = await seed();
      const res = await app.request(`/v1/campaigns/${cmp.id}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${pubKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'paused' }),
      });
      expect(res.status).toBe(403);
    });

    it('leaves ID-token (dashboard) callers unaffected', async () => {
      const { cmp } = await seed();
      const res = await app.request(`/v1/campaigns/${cmp.id}`, {
        method: 'PATCH',
        headers: { Authorization: 'Bearer valid-token', 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'paused' }),
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { status: string };
      expect(body.status).toBe('paused');
    });
  });

  describe('POST /v1/creatives (Fix 4: unmetered Gemini spend via auto-scan)', () => {
    it('rejects a both-scoped ak_ key with 403 AGENT_MUTATION_NOT_ALLOWED', async () => {
      const { bothKey } = await seed();
      const res = await app.request('/v1/creatives', {
        method: 'POST',
        headers: { Authorization: `Bearer ${bothKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageUrl: 'https://example.com/agent-created.png',
          width: 728,
          height: 90,
          clickUrl: 'https://blomabud.is/agent-created',
        }),
      });
      expect(res.status).toBe(403);
      const body = (await res.json()) as { error: string };
      expect(body.error).toBe('AGENT_MUTATION_NOT_ALLOWED');
    });

    it('rejects an advertiser-scoped ak_ key with 403 AGENT_MUTATION_NOT_ALLOWED', async () => {
      const { advKey } = await seed();
      const res = await app.request('/v1/creatives', {
        method: 'POST',
        headers: { Authorization: `Bearer ${advKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageUrl: 'https://example.com/agent-created-2.png',
          width: 728,
          height: 90,
          clickUrl: 'https://blomabud.is/agent-created-2',
        }),
      });
      expect(res.status).toBe(403);
      const body = (await res.json()) as { error: string };
      expect(body.error).toBe('AGENT_MUTATION_NOT_ALLOWED');
    });

    it('leaves ID-token (dashboard) callers unaffected', async () => {
      await seed();
      const res = await app.request('/v1/creatives', {
        method: 'POST',
        headers: { Authorization: 'Bearer valid-token', 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageUrl: 'https://example.com/dashboard-created.png',
          width: 728,
          height: 90,
          clickUrl: 'https://blomabud.is/dashboard-created',
        }),
      });
      expect(res.status).toBe(201);
      const body = (await res.json()) as { clickUrl: string };
      expect(body.clickUrl).toBe('https://blomabud.is/dashboard-created');
    });
  });

  describe('PATCH /v1/creatives/:id', () => {
    it('rejects a both-scoped ak_ key with 403 AGENT_MUTATION_NOT_ALLOWED', async () => {
      const { creative, bothKey } = await seed();
      const res = await app.request(`/v1/creatives/${creative.id}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${bothKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ clickUrl: 'https://blomabud.is/new' }),
      });
      expect(res.status).toBe(403);
      const body = (await res.json()) as { error: string };
      expect(body.error).toBe('AGENT_MUTATION_NOT_ALLOWED');
    });

    it('rejects an advertiser-scoped ak_ key with 403 AGENT_MUTATION_NOT_ALLOWED', async () => {
      const { creative, advKey } = await seed();
      const res = await app.request(`/v1/creatives/${creative.id}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${advKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ clickUrl: 'https://blomabud.is/new' }),
      });
      expect(res.status).toBe(403);
      const body = (await res.json()) as { error: string };
      expect(body.error).toBe('AGENT_MUTATION_NOT_ALLOWED');
    });

    it('leaves ID-token (dashboard) callers unaffected', async () => {
      const { creative } = await seed();
      const res = await app.request(`/v1/creatives/${creative.id}`, {
        method: 'PATCH',
        headers: { Authorization: 'Bearer valid-token', 'Content-Type': 'application/json' },
        body: JSON.stringify({ clickUrl: 'https://blomabud.is/new' }),
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { clickUrl: string };
      expect(body.clickUrl).toBe('https://blomabud.is/new');
    });
  });

  describe('DELETE /v1/creatives/:id', () => {
    it('rejects a both-scoped ak_ key with 403 AGENT_MUTATION_NOT_ALLOWED', async () => {
      const { creative, bothKey } = await seed();
      const res = await app.request(`/v1/creatives/${creative.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${bothKey}` },
      });
      expect(res.status).toBe(403);
      const body = (await res.json()) as { error: string };
      expect(body.error).toBe('AGENT_MUTATION_NOT_ALLOWED');
    });

    it('rejects an advertiser-scoped ak_ key with 403 AGENT_MUTATION_NOT_ALLOWED', async () => {
      const { creative, advKey } = await seed();
      const res = await app.request(`/v1/creatives/${creative.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${advKey}` },
      });
      expect(res.status).toBe(403);
      const body = (await res.json()) as { error: string };
      expect(body.error).toBe('AGENT_MUTATION_NOT_ALLOWED');
    });

    it('leaves ID-token (dashboard) callers unaffected', async () => {
      const { adv } = await seed();
      // Fresh creative not attached to any campaign, so deleteCreative's
      // in-use guard doesn't get in the way of proving the lockout is what's
      // being tested here (an in-use creative would 400 for an unrelated
      // reason).
      const unused = await createCreative(
        adv.id,
        {
          imageUrl: 'https://example.com/unused.png',
          width: 300,
          height: 250,
          clickUrl: 'https://blomabud.is/unused',
        },
        new StubAutoScanner(),
      );
      const res = await app.request(`/v1/creatives/${unused.id}`, {
        method: 'DELETE',
        headers: { Authorization: 'Bearer valid-token' },
      });
      expect(res.status).toBe(200);
    });
  });

  describe('POST /v1/creatives/generate', () => {
    it('rejects a both-scoped ak_ key with 403 AGENT_MUTATION_NOT_ALLOWED', async () => {
      const { bothKey } = await seed();
      const res = await app.request('/v1/creatives/generate', {
        method: 'POST',
        headers: { Authorization: `Bearer ${bothKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ landingUrl: 'https://example.com/' }),
      });
      expect(res.status).toBe(403);
      const body = (await res.json()) as { error: string };
      expect(body.error).toBe('AGENT_MUTATION_NOT_ALLOWED');
    });

    it('rejects an advertiser-scoped ak_ key with 403 AGENT_MUTATION_NOT_ALLOWED', async () => {
      const { advKey } = await seed();
      const res = await app.request('/v1/creatives/generate', {
        method: 'POST',
        headers: { Authorization: `Bearer ${advKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ landingUrl: 'https://example.com/' }),
      });
      expect(res.status).toBe(403);
      const body = (await res.json()) as { error: string };
      expect(body.error).toBe('AGENT_MUTATION_NOT_ALLOWED');
    });
  });

  describe('POST /v1/creatives/generate/confirm', () => {
    it('rejects a both-scoped ak_ key with 403 AGENT_MUTATION_NOT_ALLOWED', async () => {
      const { bothKey } = await seed();
      const res = await app.request('/v1/creatives/generate/confirm', {
        method: 'POST',
        headers: { Authorization: `Bearer ${bothKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ variantId: 'gen_x', landingUrl: 'https://example.com/' }),
      });
      expect(res.status).toBe(403);
      const body = (await res.json()) as { error: string };
      expect(body.error).toBe('AGENT_MUTATION_NOT_ALLOWED');
    });

    it('rejects an advertiser-scoped ak_ key with 403 AGENT_MUTATION_NOT_ALLOWED', async () => {
      const { advKey } = await seed();
      const res = await app.request('/v1/creatives/generate/confirm', {
        method: 'POST',
        headers: { Authorization: `Bearer ${advKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ variantId: 'gen_x', landingUrl: 'https://example.com/' }),
      });
      expect(res.status).toBe(403);
      const body = (await res.json()) as { error: string };
      expect(body.error).toBe('AGENT_MUTATION_NOT_ALLOWED');
    });
  });

  describe('POST /v1/api-keys (Fix 3: keys cannot mint keys)', () => {
    it('rejects a both-scoped ak_ key with 403 AGENT_MUTATION_NOT_ALLOWED', async () => {
      const { bothKey } = await seed();
      const res = await app.request('/v1/api-keys', {
        method: 'POST',
        headers: { Authorization: `Bearer ${bothKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ scope: 'both' }),
      });
      expect(res.status).toBe(403);
      const body = (await res.json()) as { error: string };
      expect(body.error).toBe('AGENT_MUTATION_NOT_ALLOWED');
    });

    it('leaves ID-token (dashboard) callers unaffected', async () => {
      await seed();
      const res = await app.request('/v1/api-keys', {
        method: 'POST',
        headers: { Authorization: 'Bearer valid-token', 'Content-Type': 'application/json' },
        body: JSON.stringify({ scope: 'advertiser' }),
      });
      expect(res.status).toBe(201);
      const body = (await res.json()) as { apiKey: string };
      expect(body.apiKey.startsWith('ak_')).toBe(true);
    });
  });

  describe('DELETE /v1/api-keys/:id (Fix 3: keys cannot revoke keys, ownership enforced)', () => {
    it('rejects a both-scoped ak_ key with 403 AGENT_MUTATION_NOT_ALLOWED, even revoking itself', async () => {
      const { bothKey } = await seed();
      const keyId = bothKey.match(/^ak_[a-f0-9]{16}/)?.[0];
      const res = await app.request(`/v1/api-keys/${keyId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${bothKey}` },
      });
      expect(res.status).toBe(403);
      const body = (await res.json()) as { error: string };
      expect(body.error).toBe('AGENT_MUTATION_NOT_ALLOWED');
    });

    it('lets the owning ID-token caller revoke their own key', async () => {
      const { advKey } = await seed();
      const keyId = advKey.match(/^ak_[a-f0-9]{16}/)?.[0];
      const res = await app.request(`/v1/api-keys/${keyId}`, {
        method: 'DELETE',
        headers: { Authorization: 'Bearer valid-token' },
      });
      expect(res.status).toBe(200);
    });

    it("403s an ID-token caller trying to revoke someone else's key", async () => {
      const { advKey } = await seed();
      const keyId = advKey.match(/^ak_[a-f0-9]{16}/)?.[0];
      vi.mocked(auth.verifyIdToken).mockResolvedValue({
        uid: 'user-other',
        email: 'someone-else@mutation-lockout.test.is',
        email_verified: true,
      } as unknown as DecodedIdToken);
      const res = await app.request(`/v1/api-keys/${keyId}`, {
        method: 'DELETE',
        headers: { Authorization: 'Bearer valid-token' },
      });
      expect(res.status).toBe(403);
    });

    it('404s on an unknown key id', async () => {
      await seed();
      const res = await app.request('/v1/api-keys/ak_0000000000000000', {
        method: 'DELETE',
        headers: { Authorization: 'Bearer valid-token' },
      });
      expect(res.status).toBe(404);
    });
  });
});
