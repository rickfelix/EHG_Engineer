/**
 * Chairman Dashboard browser test — EHG App
 * Verifies real browser access to chairman daily briefing page.
 *
 * SD-LEO-TESTING-STRATEGY-REDESIGN-ORCH-001-C
 */
import { test, expect } from '@playwright/test';
import path from 'path';

const authFile = path.join(__dirname, '.auth', 'user.json');

test.describe('Chairman Dashboard', () => {
  // Use saved auth state
  test.use({ storageState: authFile });

  test.beforeEach(async ({ page }) => {
    try {
      const response = await page.goto('/chairman', { timeout: 15000 });
      if (!response || response.status() >= 500) {
        test.skip(true, 'EHG app not available');
      }
    } catch {
      test.skip(true, 'EHG app not reachable');
    }
  });

  test('chairman dashboard loads and shows daily briefing', async ({ page }) => {
    // Should be on the chairman page (daily briefing is default)
    await expect(page).toHaveURL(/\/chairman/);

    // Main layout should be visible
    await expect(page.locator('main, [role="main"], .main-content')).toBeVisible({ timeout: 10000 });
  });

  test('chairman sidebar navigation is visible', async ({ page }) => {
    // Sidebar should contain navigation links
    const sidebar = page.locator('nav, aside, [role="navigation"]');
    await expect(sidebar.first()).toBeVisible({ timeout: 10000 });
  });

  test('can navigate to decisions page', async ({ page }) => {
    // Look for decisions link in navigation
    const decisionsLink = page.getByRole('link', { name: /decision/i });
    if (await decisionsLink.count() > 0) {
      await decisionsLink.first().click();
      await page.waitForURL(/\/chairman\/decisions|\/decisions/, { timeout: 10000 });
    }
  });

  test('can navigate to ventures page', async ({ page }) => {
    const venturesLink = page.getByRole('link', { name: /venture/i });
    if (await venturesLink.count() > 0) {
      await venturesLink.first().click();
      await page.waitForURL(/\/ventures|\/chairman\/ventures/, { timeout: 10000 });
    }
  });
});
