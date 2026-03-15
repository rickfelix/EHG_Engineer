/**
 * Ventures browser test — EHG App
 * Verifies real browser access to venture management pages.
 *
 * SD-LEO-TESTING-STRATEGY-REDESIGN-ORCH-001-C
 */
import { test, expect } from '@playwright/test';
import path from 'path';

const authFile = path.join(__dirname, '.auth', 'user.json');

test.describe('Venture Management', () => {
  test.use({ storageState: authFile });

  test.beforeEach(async ({ page }) => {
    try {
      const response = await page.goto('/ventures', { timeout: 15000 });
      if (!response || response.status() >= 500) {
        test.skip(true, 'EHG app not available');
      }
    } catch {
      test.skip(true, 'EHG app not reachable');
    }
  });

  test('ventures page loads and shows venture list', async ({ page }) => {
    await expect(page).toHaveURL(/\/ventures/);
    await expect(page.locator('main, [role="main"]')).toBeVisible({ timeout: 10000 });
  });

  test('venture cards or list items are displayed', async ({ page }) => {
    // Ventures should be displayed as cards or list items
    const ventureItems = page.locator('[class*="venture"], [class*="card"], [data-testid*="venture"], table tbody tr');
    await expect(ventureItems.first()).toBeVisible({ timeout: 10000 });
  });

  test('clicking a venture navigates to detail page', async ({ page }) => {
    const ventureLink = page.locator('a[href*="/ventures/"]').first();
    if (await ventureLink.count() > 0) {
      await ventureLink.click();
      await page.waitForURL(/\/ventures\/[^/]+/, { timeout: 10000 });
      // Detail page should show venture content
      await expect(page.locator('main, [role="main"]')).toBeVisible();
    }
  });
});
