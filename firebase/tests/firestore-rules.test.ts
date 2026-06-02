import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const PROJECT_ID = 'ada-test';

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      host: '127.0.0.1',
      port: 8080,
      rules: readFileSync(resolve(__dirname, '../firestore.rules'), 'utf8'),
    },
  });
});

afterAll(async () => {
  await testEnv.cleanup();
});

beforeEach(async () => {
  await testEnv.clearFirestore();
});

describe('Firestore rules — publishers', () => {
  it('owner can read own publisher doc', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().collection('publishers').doc('pub_a').set({
        ownerEmail: 'jon@example.is',
        domain: 'example.is',
        displayName: 'Example',
        status: 'active',
      });
    });

    const userCtx = testEnv.authenticatedContext('uid-jon', { email: 'jon@example.is' });
    await assertSucceeds(userCtx.firestore().collection('publishers').doc('pub_a').get());
  });

  it('non-owner cannot read publisher doc', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().collection('publishers').doc('pub_a').set({
        ownerEmail: 'jon@example.is',
        domain: 'example.is',
        displayName: 'Example',
        status: 'active',
      });
    });

    const otherCtx = testEnv.authenticatedContext('uid-other', { email: 'other@example.is' });
    await assertFails(otherCtx.firestore().collection('publishers').doc('pub_a').get());
  });

  it('admin can read any publisher doc', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().collection('publishers').doc('pub_a').set({
        ownerEmail: 'jon@example.is',
        domain: 'example.is',
        displayName: 'Example',
        status: 'active',
      });
    });

    const adminCtx = testEnv.authenticatedContext('uid-admin', {
      email: 'admin@example.is',
      admin: true,
    });
    await assertSucceeds(adminCtx.firestore().collection('publishers').doc('pub_a').get());
  });

  it('no client write to publishers allowed', async () => {
    const userCtx = testEnv.authenticatedContext('uid-jon', { email: 'jon@example.is' });
    await assertFails(
      userCtx.firestore().collection('publishers').doc('pub_new').set({
        ownerEmail: 'jon@example.is',
        domain: 'new.is',
        displayName: 'New',
        status: 'active',
      }),
    );
  });
});

describe('Firestore rules — ledger', () => {
  it('advertiser party can read own ledger entry', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().collection('advertisers').doc('adv_a').set({
        ownerEmail: 'anna@example.is',
        companyName: 'Anna ehf',
        status: 'active',
      });
      await ctx
        .firestore()
        .collection('ledger')
        .doc('led_1')
        .set({
          party: { type: 'advertiser', id: 'adv_a' },
          type: 'topup',
          amountIsk: 20000,
          relatedId: 'teya_x',
        });
    });

    const userCtx = testEnv.authenticatedContext('uid-anna', { email: 'anna@example.is' });
    await assertSucceeds(userCtx.firestore().collection('ledger').doc('led_1').get());
  });

  it('other user cannot read ledger entry for another advertiser', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().collection('advertisers').doc('adv_a').set({
        ownerEmail: 'anna@example.is',
        companyName: 'Anna ehf',
        status: 'active',
      });
      await ctx
        .firestore()
        .collection('ledger')
        .doc('led_1')
        .set({
          party: { type: 'advertiser', id: 'adv_a' },
          type: 'topup',
          amountIsk: 20000,
          relatedId: 'teya_x',
        });
    });

    const otherCtx = testEnv.authenticatedContext('uid-other', { email: 'other@example.is' });
    await assertFails(otherCtx.firestore().collection('ledger').doc('led_1').get());
  });

  it('no client write to ledger allowed', async () => {
    const userCtx = testEnv.authenticatedContext('uid-anna', { email: 'anna@example.is' });
    await assertFails(
      userCtx
        .firestore()
        .collection('ledger')
        .doc('led_new')
        .set({
          party: { type: 'advertiser', id: 'adv_a' },
          type: 'topup',
          amountIsk: 100,
          relatedId: 'x',
        }),
    );
  });
});

describe('Firestore rules — default deny', () => {
  it('unknown collection denies reads', async () => {
    const userCtx = testEnv.authenticatedContext('uid-x', { email: 'x@example.is' });
    await assertFails(userCtx.firestore().collection('secret').doc('a').get());
  });
});
