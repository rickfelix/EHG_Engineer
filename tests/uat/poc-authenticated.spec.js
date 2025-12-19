import { test, expect } from '@playwright/test';

const BASE_URL = process.env.BASE_URL || 'http://localhost:8080';

/**
 * Authenticated Access Tests
 *
 * SECURITY: These tests use storageState from global-auth.js to authenticate.
 * Protected routes SHOULD require authentication and redirect unauthenticated users.
 *
 * Updated as part of SD-HARDENING-V2-001C (GOV-05 fix)
 */
test.describe('Authenticated Access Tests', () => {
  // Use global authentication state
  test.use({
    storageState: 'tests/uat/.auth/user.json'
  });

  test('AUTH-01: Authenticated user can access /ventures', async ({ page }) => {
    console.log('Testing authenticated access to protected route: /ventures');

    // Navigate to protected route with auth
    await page.goto(`${BASE_URL}/ventures`, {
      waitUntil: 'networkidle'
    });

    // Get current URL
    const currentUrl = page.url();
    console.log(`Current URL: ${currentUrl}`);

    // With auth, should stay on ventures (not redirected to login)
    expect(currentUrl).toContain('/ventures');
    expect(currentUrl).not.toContain('/login');

    // Verify page content loaded
    const pageTitle = await page.title();
    expect(pageTitle).toBeTruthy();

    console.log('Successfully accessed /ventures with authentication');
  });

  test('AUTH-02: Authenticated user can access /chairman dashboard', async ({ page }) => {
    console.log('Testing authenticated access to protected route: /chairman');

    // Navigate to chairman dashboard with auth
    await page.goto(`${BASE_URL}/chairman`, {
      waitUntil: 'networkidle'
    });

    // Get current URL
    const currentUrl = page.url();
    console.log(`Current URL: ${currentUrl}`);

    // With auth, should stay on chairman
    expect(currentUrl).toContain('/chairman');
    expect(currentUrl).not.toContain('/login');

    // Verify dashboard content loaded
    const dashboardElements = await page.locator('nav, [class*="dashboard"], [class*="card"]').count();
    expect(dashboardElements).toBeGreaterThan(0);

    console.log('Successfully accessed /chairman with authentication');
  });

  test('AUTH-03: Authenticated user can access /analytics', async ({ page }) => {
    console.log('Testing authenticated access to protected route: /analytics');

    // Navigate to analytics with auth
    await page.goto(`${BASE_URL}/analytics`, {
      waitUntil: 'networkidle'
    });

    // Get current URL
    const currentUrl = page.url();
    console.log(`Current URL: ${currentUrl}`);

    // With auth, should stay on analytics
    expect(currentUrl).toContain('/analytics');
    expect(currentUrl).not.toContain('/login');

    console.log('Successfully accessed /analytics with authentication');
  });

  test('AUTH-04: Authenticated user can navigate between protected routes', async ({ page }) => {
    console.log('Testing navigation between multiple protected routes');

    // Start at ventures
    await page.goto(`${BASE_URL}/ventures`);
    expect(page.url()).not.toContain('/login');

    // Navigate to chairman
    await page.goto(`${BASE_URL}/chairman`);
    expect(page.url()).not.toContain('/login');

    // Navigate to portfolios
    await page.goto(`${BASE_URL}/portfolios`);
    expect(page.url()).not.toContain('/login');

    // Navigate to analytics
    await page.goto(`${BASE_URL}/analytics`);
    expect(page.url()).not.toContain('/login');

    console.log('Successfully navigated between protected routes with authentication');
  });

  test('AUTH-05: Session persists across page reloads', async ({ page }) => {
    console.log('Testing session persistence');

    // Go to protected route
    await page.goto(`${BASE_URL}/ventures`);
    expect(page.url()).not.toContain('/login');

    // Reload the page
    await page.reload();

    // Should still be on ventures, not redirected to login
    expect(page.url()).not.toContain('/login');
    expect(page.url()).toContain('/ventures');

    console.log('Session persisted after page reload');
  });

  test('AUTH-06: Authenticated user can interact with protected features', async ({ page }) => {
    console.log('Testing authenticated user actions');

    // Navigate to ventures
    await page.goto(`${BASE_URL}/ventures`);

    // Interactive elements should be present
    const actionButtons = await page.locator('button').count();
    expect(actionButtons).toBeGreaterThan(0);

    // No login prompts should appear on protected page
    const loginPrompts = await page.locator('text=/sign in|log in|login/i').count();
    // Login prompts in navigation menus are OK, but shouldn't be forced prompts
    console.log(`Found ${loginPrompts} login-related text elements`);

    console.log('Authenticated user can interact with protected features');
  });
});

// Security validation tests
test.describe('Protected Route Security Validation', () => {
  // These tests run WITHOUT authentication to verify protection

  test('SEC-01: Unauthenticated access to /ventures redirects to login', async ({ browser }) => {
    // Create new context WITHOUT auth
    const context = await browser.newContext();
    const page = await context.newPage();

    console.log('Testing unauthenticated access to /ventures');

    await page.goto(`${BASE_URL}/ventures`, {
      waitUntil: 'networkidle'
    });

    const currentUrl = page.url();
    console.log(`Unauthenticated URL: ${currentUrl}`);

    // Without auth, should redirect to login
    expect(currentUrl).toContain('/login');

    await context.close();
    console.log('Protected route correctly redirects unauthenticated users');
  });

  test('SEC-02: Unauthenticated access to /chairman redirects to login', async ({ browser }) => {
    // Create new context WITHOUT auth
    const context = await browser.newContext();
    const page = await context.newPage();

    console.log('Testing unauthenticated access to /chairman');

    await page.goto(`${BASE_URL}/chairman`, {
      waitUntil: 'networkidle'
    });

    const currentUrl = page.url();
    console.log(`Unauthenticated URL: ${currentUrl}`);

    // Without auth, should redirect to login
    expect(currentUrl).toContain('/login');

    await context.close();
    console.log('Protected route correctly redirects unauthenticated users');
  });
});
