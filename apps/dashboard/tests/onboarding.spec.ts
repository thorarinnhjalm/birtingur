import { test, expect } from '@playwright/test';

test.describe('Birtingur E2E Onboarding & Login Flow', () => {
  test('should sign in using Demo credentials and select role', async ({ page }) => {
    // 1. Open login page
    await page.goto('/sign-in');
    await expect(page.locator('h1')).toContainText('Birtingur');

    // 2. Fill login details for Demo account
    await page.fill('input[label="Netfang eða notendanafn"], input[type="text"]', 'DemoA');
    await page.fill('input[label="Lykilorð"], input[type="password"]', 'password');

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
    await page.fill('input[type="text"]', 'DemoA');
    await page.fill('input[type="password"]', 'password');
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
});
