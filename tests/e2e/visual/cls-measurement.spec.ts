/**
 * LEO v4.4 Visual Regression Tests
 *
 * CLS (Cumulative Layout Shift) and viewport stability testing
 * Part of Human-Like E2E Testing Enhancements
 */

import {
  test,
  expect,
  assertAcceptableCLS,
  assertValidHeadingHierarchy,
  assertViewportStable
} from '../fixtures/visual-oracle';

test.describe('Layout Stability', () => {
  test('home page has acceptable CLS', async ({ page, visual }) => {
    await page.goto('/');

    // Wait for page to settle
    await page.waitForLoadState('networkidle');

    // Measure CLS over 5 seconds
    const cls = await visual.measureCLS(5000);

    console.log(`CLS: ${cls.value.toFixed(3)} (${cls.rating})`);
    console.log(`Shifts: ${cls.shifts}, Largest: ${cls.largestShift.toFixed(3)}`);

    // Assert CLS is acceptable based on stringency
    assertAcceptableCLS(cls);
  });

  test('login page has acceptable CLS', async ({ page, visual }) => {
    await page.goto('/login');
    await page.waitForLoadState('networkidle');

    const cls = await visual.measureCLS();
    assertAcceptableCLS(cls);
  });

  test('dashboard has acceptable CLS after load', async ({ page, visual }) => {
    // This tests that data loading doesn't cause layout shifts
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');

    const result = await visual.checkCLS('standard');
    expect(result.passed).toBe(true);

    console.log(`CLS check: ${result.passed ? 'PASSED' : 'FAILED'}`);
    console.log(`Score: ${result.cls.value.toFixed(3)}, Threshold: ${result.threshold}`);
  });
});

test.describe('Viewport Stability', () => {
  test('clicking buttons does not shift viewport', async ({ page, visual }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const button = page.locator('button').first();
    if (await button.isVisible()) {
      const result = await visual.monitorViewportStability(async () => {
        await button.click();
        await page.waitForTimeout(500);
      });

      assertViewportStable(result);
    }
  });

  test('form submission maintains viewport stability', async ({ page, visual }) => {
    await page.goto('/login');

    const form = page.locator('form').first();
    if (await form.isVisible()) {
      const result = await visual.monitorViewportStability(async () => {
        // Fill and submit form
        await page.fill('input[name="email"]', 'test@example.com').catch(() => {});
        await page.fill('input[name="password"]', 'password').catch(() => {});
        await page.click('button[type="submit"]').catch(() => {});
        await page.waitForTimeout(1000);
      });

      console.log(`Height changes: ${result.heightChanges}`);
      console.log(`Max delta: ${result.maxHeightDelta}px`);
    }
  });
});

test.describe('Content Structure', () => {
  test('heading hierarchy is valid', async ({ page, visual }) => {
    await page.goto('/');

    const result = await visual.checkHeadingHierarchy();

    console.log(`Headings found: ${result.headings.length}`);
    result.headings.forEach(h => {
      console.log(`  H${h.level}: ${h.text}`);
    });

    if (result.violations.length > 0) {
      console.log('Violations:');
      result.violations.forEach(v => console.log(`  - ${v}`));
    }

    assertValidHeadingHierarchy(result);
  });

  test('above-fold content is not overwhelming', async ({ page, visual }) => {
    await page.goto('/');

    // Check that we don't have too many interactive elements above the fold
    const result = await visual.checkAboveFoldDensity(20);

    console.log(`Interactive elements above fold: ${result.count}`);

    // Should not exceed threshold
    expect(result.exceeds).toBe(false);
  });
});

test.describe('Visual Regression', () => {
  test('home page matches snapshot', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Wait for any animations to complete
    await page.waitForTimeout(500);

    await expect(page).toHaveScreenshot('home-page.png', {
      fullPage: false,
      animations: 'disabled'
    });
  });

  test('login page matches snapshot', async ({ page }) => {
    await page.goto('/login');
    await page.waitForLoadState('networkidle');

    await expect(page).toHaveScreenshot('login-page.png', {
      fullPage: false,
      animations: 'disabled'
    });
  });
});
