import { test, expect } from '@playwright/test';
import { EHG_CONFIG } from './config';

test.describe('EHG Authentication Tests', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(EHG_CONFIG.baseURL);
  });

  test('US-UAT-001: Login with valid credentials', async ({ page }) => {
    // Navigate to login page
    await page.goto(EHG_CONFIG.routes.login, { waitUntil: 'networkidle' });

    // Wait for page to fully load
    await page.waitForTimeout(2000);

    // Check if we're redirected (user might be already logged in)
    const currentURL = page.url();
    if (currentURL.includes('chairman')) {
      console.log('Already logged in, logging out first');
      // Try to logout if already logged in
      await page.goto('/');
      await page.context().clearCookies();
      await page.goto(EHG_CONFIG.routes.login);
      await page.waitForTimeout(1000);
    }

    // Check login form is visible - try both possible selectors
    const signinEmail = await page.locator('#signin-email').count();
    const emailInput = await page.locator('input[type="email"]').count();

    if (signinEmail > 0) {
      // Use actual EHG selectors
      await page.fill('#signin-email', process.env.TEST_EMAIL || 'test@example.com');
      await page.fill('#signin-password', process.env.TEST_PASSWORD || 'Test123!');
      await page.click('button:has-text("Sign In")');
    } else if (emailInput > 0) {
      // Fallback to generic selectors
      await page.fill('input[type="email"]', process.env.TEST_EMAIL || 'test@example.com');
      await page.fill('input[type="password"]', process.env.TEST_PASSWORD || 'Test123!');
      await page.click('button[type="submit"]');
    } else {
      throw new Error('No login form found on the page');
    }

    // Wait for navigation
    await page.waitForTimeout(3000);

    // Verify successful login - should redirect to chairman dashboard
    await expect(page).toHaveURL(/.*chairman|dashboard/);

    // Store test result
    await storeTestResult('US-UAT-001', 'passed', page);
  });

  test('US-UAT-002: Login with invalid credentials', async ({ page }) => {
    await page.goto(EHG_CONFIG.routes.login);

    // Enter invalid credentials
    await page.fill('#signin-email', 'invalid@example.com');
    await page.fill('#signin-password', 'WrongPassword');

    // Submit form
    await page.click('button:has-text("Sign In")');

    // Should show error message
    await expect(page.locator('text=/invalid|incorrect|error/i')).toBeVisible();

    // Should remain on login page
    await expect(page).toHaveURL(/.*login/);

    await storeTestResult('US-UAT-002', 'passed', page);
  });

  test('US-UAT-003: Password reset flow', async ({ page }) => {
    await page.goto(EHG_CONFIG.routes.login);

    // Click forgot password link
    await page.click('text=/forgot.*password/i');

    // Enter email for reset
    await page.fill('input[type="email"]', 'test@example.com');
    await page.click('button:has-text("Reset")');

    // Verify confirmation message
    await expect(page.locator('text=/email.*sent|check.*email/i')).toBeVisible();

    await storeTestResult('US-UAT-003', 'passed', page);
  });

  test('US-UAT-004: Session timeout', async ({ page, context }) => {
    // Login first
    await page.goto(EHG_CONFIG.routes.login);
    await page.fill('#signin-email', process.env.TEST_EMAIL || 'test@example.com');
    await page.fill('#signin-password', process.env.TEST_PASSWORD || 'Test123!');
    await page.click('button:has-text("Sign In")');

    // Wait for chairman dashboard
    await page.waitForURL(/.*chairman|dashboard/);

    // Simulate session timeout by clearing cookies
    await context.clearCookies();

    // Try to navigate to protected route
    await page.goto(EHG_CONFIG.routes.ventures);

    // Should redirect to login
    await expect(page).toHaveURL(/.*login/);

    await storeTestResult('US-UAT-004', 'passed', page);
  });

  test('US-UAT-007: CSRF protection', async ({ page }) => {
    await page.goto(EHG_CONFIG.routes.login);

    // Check for CSRF token in forms
    const csrfToken = await page.locator('input[name="csrf_token"], meta[name="csrf-token"]').first();
    await expect(csrfToken).toHaveCount({ minimum: 1 });

    await storeTestResult('US-UAT-007', 'passed', page);
  });

  test('US-UAT-008: XSS prevention', async ({ page }) => {
    await page.goto(EHG_CONFIG.routes.login);

    // Try to inject script in email field
    const maliciousInput = '<script>alert("XSS")</script>';
    await page.fill('#signin-email', maliciousInput);

    // Check that script is not executed
    const alerts = [];
    page.on('dialog', dialog => alerts.push(dialog));

    await page.click('button:has-text("Sign In")');

    // No alerts should have been triggered
    expect(alerts).toHaveLength(0);

    await storeTestResult('US-UAT-008', 'passed', page);
  });
});

// Helper function to store test results
async function storeTestResult(testId, status, page) {
  // This would connect to Supabase and store results
  console.log(`Test ${testId}: ${status}`);
}
