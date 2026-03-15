/**
 * Public pages browser test — EHG App
 * Verifies public-facing pages load without authentication.
 *
 * SD-LEO-TESTING-STRATEGY-REDESIGN-ORCH-001-C
 */
import { test, expect } from '@playwright/test';

test.describe('Public Pages', () => {
  test.beforeEach(async ({ page }) => {
    try {
      const response = await page.goto('/', { timeout: 10000 });
      if (!response || response.status() >= 500) {
        test.skip(true, 'EHG app not available');
      }
    } catch {
      test.skip(true, 'EHG app not reachable');
    }
  });

  test('home page loads and renders content', async ({ page }) => {
    await expect(page).toHaveURL(/\//);
    // Page should have some visible content
    await expect(page.locator('body')).toBeVisible();
    // Should have navigation
    const nav = page.locator('nav, header, [role="banner"]');
    await expect(nav.first()).toBeVisible({ timeout: 5000 });
  });

  test('about page loads', async ({ page }) => {
    await page.goto('/about');
    await expect(page).toHaveURL(/\/about/);
    await expect(page.locator('main, [role="main"], article')).toBeVisible({ timeout: 5000 });
  });

  test('ventures public page loads', async ({ page }) => {
    await page.goto('/ventures');
    // Might redirect to auth or show public venture list
    await expect(page.locator('body')).toBeVisible();
  });

  test('login page loads from navigation', async ({ page }) => {
    // Find and click login link
    const loginLink = page.getByRole('link', { name: /log.?in|sign.?in/i });
    if (await loginLink.count() > 0) {
      await loginLink.first().click();
      await page.waitForURL(/\/login/, { timeout: 5000 });
      await expect(page.getByLabel(/email/i)).toBeVisible();
    } else {
      // Navigate directly
      await page.goto('/login');
      await expect(page.getByLabel(/email/i)).toBeVisible();
    }
  });

  test('no console errors on home page', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    await page.goto('/');
    await page.waitForTimeout(2000);

    // Filter out known benign errors (e.g., favicon, third-party)
    const realErrors = consoleErrors.filter(
      (e) => !e.includes('favicon') && !e.includes('404') && !e.includes('net::ERR')
    );
    expect(realErrors).toHaveLength(0);
  });
});
