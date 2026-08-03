import { test, expect, request as pwRequest } from '@playwright/test';

// E2E onboarding against the Firebase AUTH EMULATOR (pnpm test:e2e starts
// firestore+auth; playwright.config.ts starts the dev server with
// VITE_AUTH_EMULATOR=1 so the client SDK talks to it). The old demo-login
// backdoor was removed in 0c0c70a, so each test provisions a real,
// email-verified account through the emulator's REST API and signs in
// through the actual UI.
//
// Product state these tests encode: advertiser self-signup is CLOSED
// (RoleSelect REGISTRATION_CLOSED) — a fresh user sees a disabled
// advertiser card and can only proceed as publisher.

const AUTH_EMULATOR = 'http://localhost:9099';
const PROJECT_ID = 'birtingur-8b5a4';
const PASSWORD = 'e2e-test-password-1';

async function createVerifiedUser(email: string): Promise<void> {
  const ctx = await pwRequest.newContext();
  try {
    const signUp = await ctx.post(
      `${AUTH_EMULATOR}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=emulator`,
      { data: { email, password: PASSWORD, returnSecureToken: true } },
    );
    if (!signUp.ok()) {
      throw new Error(`auth-emulator signUp failed (${signUp.status()}): ${await signUp.text()}`);
    }
    const { localId } = (await signUp.json()) as { localId: string };

    // 'Bearer owner' is the emulator's admin credential; ownership checks in
    // the app require a VERIFIED email, so flip the flag before signing in.
    const update = await ctx.post(
      `${AUTH_EMULATOR}/identitytoolkit.googleapis.com/v1/projects/${PROJECT_ID}/accounts:update`,
      {
        headers: { Authorization: 'Bearer owner' },
        data: { localId, emailVerified: true },
      },
    );
    if (!update.ok()) {
      throw new Error(
        `auth-emulator accounts:update failed (${update.status()}): ${await update.text()}`,
      );
    }
  } finally {
    await ctx.dispose();
  }
}

async function signIn(page: import('@playwright/test').Page, email: string): Promise<void> {
  await page.goto('/sign-in');
  await expect(page.locator('h1')).toContainText('Skráðu þig inn');
  await page.fill(
    'label:has-text("Netfang") input, input[type="text"], input[type="email"]',
    email,
  );
  await page.fill('label:has-text("Lykilorð") input, input[type="password"]', PASSWORD);
  await Promise.all([page.waitForURL(/\/role/), page.click('button[type="submit"]')]);
}

test.describe('Birtingur E2E Onboarding & Login Flow', () => {
  test('signs in with a verified emulator account and lands on role select', async ({ page }) => {
    const email = `e2e_signin_${Date.now()}@example.com`;
    await createVerifiedUser(email);

    await signIn(page, email);
    await expect(page.locator('h1')).toContainText('Veldu þitt hlutverk');
  });

  test('advertiser signup is closed for a fresh user', async ({ page }) => {
    const email = `e2e_adv_${Date.now()}@example.com`;
    await createVerifiedUser(email);
    await signIn(page, email);

    // The advertiser card renders in its disabled "registration closed"
    // variant — clicking it must NOT navigate to /advertiser.
    const advertiserCard = page.locator('#role_advertiser');
    await expect(advertiserCard).toBeVisible();
    await expect(advertiserCard).toContainText('Tímabundið lokuð');
    await advertiserCard.click();
    // Give any (buggy) navigation time to happen, then assert the chooser
    // is still mounted — a bare not.toHaveURL would pass instantly and
    // prove nothing.
    await page.waitForTimeout(500);
    await expect(page.locator('h1')).toContainText('Veldu þitt hlutverk');
    await expect(page).toHaveURL(/\/role/);
  });

  test('fresh user proceeds down the publisher path to onboarding', async ({ page }) => {
    const email = `e2e_pub_${Date.now()}@example.com`;
    await createVerifiedUser(email);
    await signIn(page, email);

    const publisherCard = page.locator('#role_publisher');
    await expect(publisherCard).toBeVisible();
    await publisherCard.click();

    // No publisher profile exists yet, so RoleSelect routes to onboarding.
    await page.waitForURL(/\/publisher\/onboarding/);
    await expect(page).toHaveURL(/\/publisher\/onboarding/);
  });
});
