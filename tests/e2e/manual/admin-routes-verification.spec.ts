import { test, expect } from '@playwright/test';

/**
 * Manual Admin Routes Verification Test
 * Tests all EHG admin routes after component migration
 *
 * Prerequisites:
 * - LEO Stack running (scripts/leo-stack.sh restart)
 * - EHG app on http://localhost:8080
 * - Test user: rickfelix2000@gmail.com / TestUser123!
 */

const TEST_EMAIL = 'rickfelix2000@gmail.com';
const TEST_PASSWORD = 'TestUser123!';
const BASE_URL = 'http://localhost:8080';

const ADMIN_ROUTES = [
  { path: '/admin', name: 'Admin Dashboard' },
  { path: '/admin/directives', name: 'SDManager' },
  { path: '/admin/backlog', name: 'BacklogManager' },
  { path: '/admin/pr-reviews', name: 'PRReviews' },
  { path: '/admin/uat', name: 'UATDashboard' },
  { path: '/admin/directive-lab', name: 'DirectiveLab' },
];

test.describe('EHG Admin Routes Verification', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to login page
    await page.goto(`${BASE_URL}/login`);

    // Fill in credentials
    await page.fill('input[type="email"]', TEST_EMAIL);
    await page.fill('input[type="password"]', TEST_PASSWORD);

    // Click sign in button
    await page.click('button[type="submit"]');

    // Wait for navigation to complete (should redirect to home or dashboard)
    await page.waitForURL(/^http:\/\/localhost:8080\/(?!login)/, { timeout: 10000 });
  });

  for (const route of ADMIN_ROUTES) {
    test(`should load ${route.name} at ${route.path}`, async ({ page }) => {
      // Navigate to admin route
      await page.goto(`${BASE_URL}${route.path}`);

      // Wait for page to load
      await page.waitForLoadState('networkidle', { timeout: 10000 });

      // Check for common error indicators
      const bodyText = await page.textContent('body');
      expect(bodyText).not.toContain('404');
      expect(bodyText).not.toContain('Page not found');
      expect(bodyText).not.toContain('Error:');

      // Check that page is not blank (has some content)
      const hasContent = await page.locator('body *').count();
      expect(hasContent).toBeGreaterThan(0);

      // Take screenshot for evidence
      await page.screenshot({
        path: `test-results/screenshots/admin-${route.path.replace(/\//g, '-')}.png`,
        fullPage: true
      });

      console.log(`✅ ${route.name} (${route.path}): Loaded successfully`);
    });
  }

  test('should capture console errors across all routes', async ({ page }) => {
    const consoleErrors: string[] = [];

    page.on('console', msg => {
      if (msg.type() === 'error') {
        consoleErrors.push(`[${msg.type()}] ${msg.text()}`);
      }
    });

    // Visit each route and collect errors
    for (const route of ADMIN_ROUTES) {
      await page.goto(`${BASE_URL}${route.path}`);
      await page.waitForLoadState('networkidle', { timeout: 10000 });
      await page.waitForTimeout(500); // Let any async errors surface
    }

    // Report console errors (but don't fail test - just informational)
    if (consoleErrors.length > 0) {
      console.log('\n⚠️  Console errors detected:');
      consoleErrors.forEach(err => console.log(`   ${err}`));
    } else {
      console.log('\n✅ No console errors detected across all routes');
    }
  });
});
