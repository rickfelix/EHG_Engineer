const { test, expect } = require('@playwright/test');

// Configure deterministic settings
test.beforeEach(async ({ page }) => {
  // Set viewport for consistency
  await page.setViewportSize({ width: 1280, height: 800 });

  // Freeze time for deterministic rendering
  await page.addInitScript(() => {
    const constantDate = new Date('2025-01-01T00:00:00.000Z');
    Date.now = () => constantDate.getTime();
    Date.prototype.getTime = () => constantDate.getTime();
  });

  // Disable animations and transitions
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
});

test.describe('Visual Regression Tests', () => {
  test('Dashboard page', async ({ page }) => {
    await page.goto('http://localhost:3001/');
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveScreenshot('dashboard.png', {
      maxDiffPixelRatio: 0.03,
      fullPage: true
    });
  });

  test('Strategic Directives page', async ({ page }) => {
    await page.goto('http://localhost:3001/strategic-directives');
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveScreenshot('strategic-directives.png', {
      maxDiffPixelRatio: 0.03,
      fullPage: true
    });
  });

  test('PRDs page', async ({ page }) => {
    await page.goto('http://localhost:3001/prds');
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveScreenshot('prds.png', {
      maxDiffPixelRatio: 0.03,
      fullPage: true
    });
  });

  test('Handoffs page', async ({ page }) => {
    await page.goto('http://localhost:3001/handoffs');
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveScreenshot('handoffs.png', {
      maxDiffPixelRatio: 0.03,
      fullPage: true
    });
  });
});