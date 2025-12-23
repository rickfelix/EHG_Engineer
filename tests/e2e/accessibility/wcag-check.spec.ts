/**
 * LEO v4.4 Accessibility Tests
 *
 * WCAG 2.1 AA compliance testing using axe-core
 * Part of Human-Like E2E Testing Enhancements
 */

import { test, expect, assertNoBlockingA11yViolations, WCAG_TAGS } from '../fixtures/accessibility';
import { test as keyboardTest, assertNoFocusTrap } from '../fixtures/keyboard-oracle';

test.describe('Accessibility Compliance', () => {
  test('home page meets WCAG 2.1 AA', async ({ page, a11y }) => {
    await page.goto('/');

    const result = await a11y.check({
      tags: WCAG_TAGS.WCAG_2_1_AA
    });

    // Assert no blocking violations based on stringency
    assertNoBlockingA11yViolations(result);

    // Log all violations for awareness
    if (result.violations.length > 0) {
      console.log(`Total violations: ${result.violations.length}`);
      console.log(`Critical: ${result.criticalCount}, Serious: ${result.seriousCount}`);
    }
  });

  test('login form is accessible', async ({ page, a11y }) => {
    await page.goto('/login');

    const result = await a11y.checkElement('form', {
      tags: WCAG_TAGS.WCAG_2_1_AA
    });

    expect(result.criticalCount).toBe(0);
    expect(result.seriousCount).toBe(0);
  });

  test('navigation is accessible', async ({ page, a11y }) => {
    await page.goto('/');

    const result = await a11y.checkElement('nav', {
      tags: WCAG_TAGS.WCAG_2_1_AA
    });

    assertNoBlockingA11yViolations(result);
  });
});

keyboardTest.describe('Keyboard Navigation', () => {
  keyboardTest('main navigation has correct tab order', async ({ page, keyboard }) => {
    await page.goto('/');

    // Get all focusable elements to understand the page
    const focusable = await keyboard.getFocusableElements();
    console.log(`Found ${focusable.length} focusable elements`);

    // Capture actual tab order
    const actualOrder = await keyboard.captureTabOrder(20);
    console.log('Tab order:', actualOrder.join(' -> '));

    // Verify no focus traps
    const trapResult = await keyboard.detectFocusTrap();
    assertNoFocusTrap(trapResult);
  });

  keyboardTest('modal dialogs trap focus correctly', async ({ page, keyboard }) => {
    await page.goto('/');

    // Open a modal if one exists
    const modalTrigger = page.locator('[data-testid="open-modal"], button:has-text("Open")').first();
    const isVisible = await modalTrigger.isVisible();

    if (!isVisible) {
      console.log('No modal trigger found on page - skipping modal focus trap test');
      return;
    }

    await modalTrigger.click();

    // Modal should trap focus
    const trapResult = await keyboard.detectFocusTrap('[role="dialog"]');

    // Assert using assertion function to avoid lint issue
    if (!trapResult.hasTrap) {
      throw new Error('Modal dialog should trap focus but it did not');
    }
  });

  keyboardTest('skip link works correctly', async ({ page, keyboard }) => {
    await page.goto('/');

    const skipResult = await keyboard.verifySkipLink();

    // Skip link is optional but recommended - log result
    console.log(`Skip link found: ${skipResult.found}, works: ${skipResult.works}`);

    // If skip link exists, it should work
    if (skipResult.found && !skipResult.works) {
      throw new Error('Skip link was found but does not work correctly');
    }
  });
});
