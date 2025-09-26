import { test, expect } from '@playwright/test';

// Configure viewport and deterministic rendering
test.use({
  viewport: { width: 1280, height: 800 },
  // Disable JavaScript Date to ensure consistent timestamps
  locale: 'en-US',
  timezoneId: 'UTC'
});

test.beforeEach(async ({ page }) => {
  // Inject CSS to disable animations for consistent screenshots
  await page.addStyleTag({
    content: `
      *, *::before, *::after {
        animation-duration: 0s !important;
        animation-delay: 0s !important;
        transition-duration: 0s !important;
        transition-delay: 0s !important;
      }
    `
  });

  // Mock Date.now() for deterministic timestamps
  await page.addInitScript(() => {
    const fixedDate = new Date('2025-01-01T00:00:00Z').getTime();
    Date.now = () => fixedDate;
    Date.prototype.getTime = () => fixedDate;
  });
});

test.describe('Visual Regression', () => {
  test('Homepage snapshot', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveScreenshot('homepage.png', {
      maxDiffPixelRatio: 0.03,
      fullPage: false
    });
  });

  test('Strategic Directives snapshot', async ({ page }) => {
    await page.goto('/strategic-directives');
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveScreenshot('strategic-directives.png', {
      maxDiffPixelRatio: 0.03,
      fullPage: false
    });
  });

  test('PRDs snapshot', async ({ page }) => {
    await page.goto('/prds');
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveScreenshot('prds.png', {
      maxDiffPixelRatio: 0.03,
      fullPage: false
    });
  });

  test('Handoffs snapshot', async ({ page }) => {
    await page.goto('/handoffs');
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveScreenshot('handoffs.png', {
      maxDiffPixelRatio: 0.03,
      fullPage: false
    });
  });
});