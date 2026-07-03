import { test, expect } from '@playwright/test';

test.describe('Birtingur E2E Onboarding & Login Flow', () => {
  test('should sign in using Demo credentials and select role', async ({ page }) => {
    // 1. Open login page
    await page.goto('/sign-in');
    // Redesigned sign-in (auth.dc.html): the h1 is now "Skráðu þig inn";
    // "Birtingur" moved to the logo lockup above the card.
    await expect(page.locator('h1')).toContainText('Skráðu þig inn');

    // 2. Fill login details for Demo account
    await page.fill('label:has-text("Netfang") input, input[type="text"]', 'DemoA');
    await page.fill('label:has-text("Lykilorð") input, input[type="password"]', 'password');

    // 3. Click Sign In and wait for redirect to the role selector (bypass default dashboard auto-redirect)
    await Promise.all([page.waitForURL(/\/role/), page.click('button[type="submit"]')]);

    // Force show the chooser if it auto-redirects too fast
    await page.goto('/role?select=true');
    await expect(page.locator('h1')).toContainText('Veldu þitt hlutverk');

    // 4. Test selecting the advertiser role
    const advertiserCard = page.locator('#role_advertiser');
    await expect(advertiserCard).toBeVisible();
    await advertiserCard.click();

    // 5. Verify navigation to the advertiser dashboard
    await page.waitForURL(/\/advertiser/);
    await expect(page).toHaveURL(/.*\/advertiser.*/);
  });

  test('should allow switching roles', async ({ page }) => {
    // Sign in and go to role select screen directly
    await page.goto('/sign-in');
    await page.fill('label:has-text("Netfang") input, input[type="text"]', 'DemoA');
    await page.fill('label:has-text("Lykilorð") input, input[type="password"]', 'password');
    await Promise.all([page.waitForURL(/\/role/), page.click('button[type="submit"]')]);

    // Force show chooser
    await page.goto('/role?select=true');

    // Select publisher role
    const publisherCard = page.locator('#role_publisher');
    await expect(publisherCard).toBeVisible();
    await publisherCard.click();

    // Verify navigation to publisher dashboard
    await page.waitForURL(/\/publisher/);
    await expect(page).toHaveURL(/.*\/publisher.*/);
  });

  test('should complete advertiser onboarding flow from scratch for a new user', async ({
    page,
  }) => {
    // 1. Open login page
    await page.goto('/sign-in');

    // Use a unique name for the new user so we get a fresh onboarding experience
    const uniqueUser = `DemoNewUser_${Date.now()}`;
    await page.fill('label:has-text("Netfang") input, input[type="text"]', uniqueUser);
    await page.fill('label:has-text("Lykilorð") input, input[type="password"]', 'password');

    // Sign in and wait for redirect to /role
    await Promise.all([page.waitForURL(/\/role/), page.click('button[type="submit"]')]);

    // Choose advertiser role
    const advertiserCard = page.locator('#role_advertiser');
    await expect(advertiserCard).toBeVisible();
    await advertiserCard.click();

    // Verify redirect to onboarding step 1
    await page.waitForURL(/\/advertiser\/onboarding/);
    await expect(page.locator('h1')).toContainText('Greindu vefsíðuna þína');

    // Fill domain and click analyze
    await page.fill('label:has-text("Vefslóð fyrirtækis") input', 'datera.is');
    await page.click('button:has-text("Greina vefsíðu")');

    // Wait for step 2 form
    await expect(page.locator('h2')).toContainText('Stofna auglýsendaaðgang');

    // Verify company name is auto-filled
    const companyNameInput = page.locator('label:has-text("Nafn fyrirtækis") input');
    await expect(companyNameInput).not.toHaveValue('');

    // Fill in required info
    await page.fill('label:has-text("Kennitala fyrirtækis") input', '550621-1230');
    await page.fill('label:has-text("VSK-númer") input', '123456');
    await page.fill('label:has-text("Netfang fyrir reikninga") input', 'billing@datera.is');

    // Click finish registration and wait for dashboard redirect
    await Promise.all([
      page.waitForURL(/\/advertiser$/),
      page.click('button:has-text("Ljúka skráningu")'),
    ]);

    // Verify we are on the advertiser dashboard
    await expect(page).toHaveURL(/.*\/advertiser$/);
  });
});
