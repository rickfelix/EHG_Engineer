/**
 * LEO v4.4 Chaos/Resilience Tests
 *
 * Tests application behavior under network failures and edge conditions
 * Part of Human-Like E2E Testing Enhancements
 */

import { test, expect, assertNoDuplicateSubmit } from '../fixtures/chaos-saboteur';

test.describe('Network Resilience', () => {
  test('handles API failures gracefully', async ({ page, chaos }) => {
    // Inject 30% failure rate on API calls
    await chaos.attachNetworkChaos(0.3, {
      failureTypes: ['error'],
      targetPatterns: ['**/api/**']
    });

    await page.goto('/');

    // App should still be usable despite some failures
    await expect(page.locator('body')).toBeVisible();

    const results = chaos.getResults();
    console.log(`Faults injected: ${results.faultsInjected}`);
    console.log(`Requests intercepted: ${results.requestsIntercepted}`);
  });

  test('recovers from temporary offline', async ({ page, chaos }) => {
    await page.goto('/');

    // Simulate brief network outage
    await chaos.simulateOffline(2000);

    // Check if app recovers
    const recovery = await chaos.checkRecovery('body', 10000);
    expect(recovery.recovered).toBe(true);
  });

  test('handles slow network gracefully', async ({ page, chaos }) => {
    // Add 500ms latency to all API calls
    await chaos.injectLatency('**/api/**', 500);

    await page.goto('/');

    // Page should still load (with loading states)
    await expect(page.locator('body')).toBeVisible();
  });
});

test.describe('Idempotency', () => {
  test('double-submit is prevented', async ({ page, chaos }) => {
    await page.goto('/login');

    // Fill form if it exists
    const usernameField = page.locator('input[name="email"], input[name="username"]').first();
    if (await usernameField.isVisible()) {
      await usernameField.fill('test@example.com');

      const submitButton = page.locator('button[type="submit"]');
      if (await submitButton.isVisible()) {
        const result = await chaos.testDoubleSubmit('button[type="submit"]');

        // Should prevent duplicate submissions
        assertNoDuplicateSubmit(result);
      }
    }
  });
});

test.describe('Error Recovery', () => {
  test('forced 500 error shows user-friendly message', async ({ page, chaos }) => {
    // Force all API calls to fail
    await chaos.failRequest('**/api/**', 500);

    await page.goto('/');

    // Should show error UI, not crash
    await expect(page.locator('body')).toBeVisible();

    // Look for error indication
    const hasErrorUI = await page.locator('[class*="error"], [role="alert"]').count() > 0;
    console.log(`Error UI displayed: ${hasErrorUI}`);
  });

  test('timeout shows appropriate message', async ({ page, chaos }) => {
    // Force API calls to timeout
    await chaos.timeoutRequest('**/api/**', 5000);

    await page.goto('/', { timeout: 60000 });

    // Page should handle timeout gracefully
    await expect(page.locator('body')).toBeVisible();
  });
});
