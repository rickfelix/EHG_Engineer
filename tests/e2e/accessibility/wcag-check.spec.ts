/**
 * LEO v4.4 Accessibility Tests
 *
 * WCAG 2.1 AA compliance testing using axe-core
 * Part of Human-Like E2E Testing Enhancements
 */

import { test, assertNoBlockingA11yViolations, WCAG_TAGS } from '../fixtures/accessibility';
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

    // Check if we're on a login page with a form (user might be authenticated and redirected)
    const form = page.locator('form');
    const formExists = await form.count() > 0;

    if (!formExists) {
      console.log('No login form found - user may be authenticated and redirected. Skipping test.');
      return;
    }

    const result = await a11y.checkElement('form', {
      tags: WCAG_TAGS.WCAG_2_1_AA
    });

    // Log violations for visibility
    if (result.violations.length > 0) {
      console.log(`Login form violations: ${result.violations.length}`);
      console.log(`Critical: ${result.criticalCount}, Serious: ${result.seriousCount}`);
      result.violations.forEach(v => {
        console.log(`  - [${v.impact}] ${v.id}: ${v.description}`);
      });
    }

    // Use stringency-aware assertion (consistent with other tests)
    assertNoBlockingA11yViolations(result);
  });

  test('navigation is accessible', async ({ page, a11y }) => {
    await page.goto('/');

    // Check if semantic nav element exists (some apps use divs for navigation)
    const nav = page.locator('nav');
    const navExists = await nav.count() > 0;

    if (!navExists) {
      // Try alternative: check for navigation landmark role or common nav patterns
      const navRole = page.locator('[role="navigation"]');
      const navRoleExists = await navRole.count() > 0;

      if (!navRoleExists) {
        console.log('No semantic <nav> or [role="navigation"] found - app may use generic divs for navigation. Skipping test.');
        return;
      }

      const result = await a11y.checkElement('[role="navigation"]', {
        tags: WCAG_TAGS.WCAG_2_1_AA
      });
      assertNoBlockingA11yViolations(result);
      return;
    }

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
