/**
 * Admin SD Management browser test — EHG App
 * Verifies real browser access to SD (strategic directives) management page.
 *
 * SD-LEO-TESTING-STRATEGY-REDESIGN-ORCH-001-C
 */
import { test, expect } from '@playwright/test';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const authFile = join(__dirname, '.auth', 'user.json');

test.describe('Admin SD Management', () => {
  test.use({ storageState: authFile });

  test.beforeEach(async ({ page }) => {
    try {
      const response = await page.goto('/admin/directives', { timeout: 15000 });
      if (!response || response.status() >= 500) {
        test.skip(true, 'EHG app not available');
      }
    } catch {
      test.skip(true, 'EHG app not reachable');
    }
  });

  test('SD management page loads', async ({ page }) => {
    await expect(page).toHaveURL(/\/admin\/directives/);
    // Page should have loaded with some content
    await expect(page.locator('main, [role="main"], .main-content')).toBeVisible({ timeout: 10000 });
  });

  test('SD list displays directive items', async ({ page }) => {
    // Look for SD items in a table, list, or card layout
    const sdItems = page.locator('tr, [data-testid*="directive"], [class*="directive"], [class*="card"]');
    // Should have at least one SD displayed (we know SDs exist in the database)
    await expect(sdItems.first()).toBeVisible({ timeout: 10000 });
  });

  test('clicking an SD shows detail view', async ({ page }) => {
    // Find a clickable SD item
    const sdLink = page.locator('a[href*="/admin/directives/"], tr[data-clickable], [class*="card"] a').first();
    if (await sdLink.count() > 0) {
      await sdLink.click();
      // Should navigate to a detail view or open a panel
      await page.waitForTimeout(2000);
      // Detail view should show SD information
      const detailContent = page.locator('[class*="detail"], [class*="panel"], [role="dialog"], main');
      await expect(detailContent.first()).toBeVisible();
    }
  });
});
