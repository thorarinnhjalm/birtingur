import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { ref, uploadBytes, getBytes } from 'firebase/storage';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const PROJECT_ID = 'ada-test';

// A 1x1 PNG — small enough for the size rule, right content type.
const PNG = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
  0x89, 0x00, 0x00, 0x00, 0x0a, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
  0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae,
  0x42, 0x60, 0x82,
]);

const meta = { contentType: 'image/png' };

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    storage: {
      host: '127.0.0.1',
      port: 9199,
      rules: readFileSync(resolve(__dirname, '../storage.rules'), 'utf8'),
    },
  });
});

afterAll(async () => {
  await testEnv.cleanup();
});

beforeEach(async () => {
  await testEnv.clearStorage();
});

describe('Storage rules — creatives', () => {
  it('anyone may read a creative (they are served on publisher sites)', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await uploadBytes(ref(ctx.storage(), 'creatives/adv_a/banner.png'), PNG, meta);
    });

    const anon = testEnv.unauthenticatedContext();
    await assertSucceeds(getBytes(ref(anon.storage(), 'creatives/adv_a/banner.png')));
  });

  it('an unauthenticated visitor cannot upload a creative', async () => {
    const anon = testEnv.unauthenticatedContext();
    await assertFails(uploadBytes(ref(anon.storage(), 'creatives/adv_a/banner.png'), PNG, meta));
  });

  // The dashboard uploads creatives straight to Storage from the browser
  // (pages/advertiser/CreativeLibrary.tsx, CampaignCreate.tsx), and the files
  // are served publicly on publisher sites. Overwriting an existing object
  // therefore swaps the image that real visitors see, with no Firestore write
  // and no trip through auto-scan or the approval queue.
  it('a signed-in stranger cannot overwrite another advertiser’s existing creative', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await uploadBytes(ref(ctx.storage(), 'creatives/adv_a/banner.png'), PNG, meta);
    });

    const stranger = testEnv.authenticatedContext('uid-stranger', {
      email: 'stranger@example.com',
      email_verified: true,
    });

    await assertFails(
      uploadBytes(ref(stranger.storage(), 'creatives/adv_a/banner.png'), PNG, meta),
    );
  });

  it('a signed-in advertiser can still upload a new creative', async () => {
    const user = testEnv.authenticatedContext('uid-jon', {
      email: 'jon@example.is',
      email_verified: true,
    });

    await assertSucceeds(uploadBytes(ref(user.storage(), 'creatives/adv_a/fresh.png'), PNG, meta));
  });

  // Sign-in supports email/password as well as Google (pages/SignIn.tsx), and
  // existing password accounts are not necessarily verified, so the rules
  // deliberately do not gate on email_verified. Pinned as a test so the gate is
  // not added back without weighing that.
  it('an advertiser with an unverified email can still upload', async () => {
    const user = testEnv.authenticatedContext('uid-new', {
      email: 'new@example.is',
      email_verified: false,
    });

    await assertSucceeds(uploadBytes(ref(user.storage(), 'creatives/adv_a/x.png'), PNG, meta));
  });

  it('writes outside the creatives prefix are denied', async () => {
    const user = testEnv.authenticatedContext('uid-jon', {
      email: 'jon@example.is',
      email_verified: true,
    });

    await assertFails(uploadBytes(ref(user.storage(), 'secrets/x.png'), PNG, meta));
  });
});
