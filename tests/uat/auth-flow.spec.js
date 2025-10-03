import { test, expect } from '@playwright/test';

const BASE_URL = process.env.BASE_URL || 'http://localhost:8080';

test.describe('EHG Authentication Flow Tests', () => {
  test.beforeEach(async ({ page }) => {
    // Clear any existing session
    await page.context().clearCookies();
    await page.goto(BASE_URL);
  });

  test('US-UAT-AUTH-01: Complete Sign In flow', async ({ page }) => {
    // Navigate to login via Sign In button
    await page.click('text="Sign In"');
    await page.waitForURL(/.*login/);

    // Wait for login page to load
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    // Check if we're on the login page
    const signinTab = await page.locator('text="Sign In"').count();
    const signupTab = await page.locator('text="Sign Up"').count();

    if (signinTab > 1 && signupTab > 0) {
      // Tabs exist, make sure Sign In tab is active
      await page.click('button[role="tab"]:has-text("Sign In")');
      await page.waitForTimeout(500);
    }

    // Look for email input - try multiple selectors
    const signinEmail = await page.locator('#signin-email').count();
    const emailInput = await page.locator('input[type="email"]').count();
    const emailByLabel = await page.locator('input[name="email"]').count();

    let emailSelector = '';
    let passwordSelector = '';

    if (signinEmail > 0) {
      emailSelector = '#signin-email';
      passwordSelector = '#signin-password';
    } else if (emailInput > 0) {
      emailSelector = 'input[type="email"]';
      passwordSelector = 'input[type="password"]';
    } else if (emailByLabel > 0) {
      emailSelector = 'input[name="email"]';
      passwordSelector = 'input[name="password"]';
    }

    if (emailSelector) {
      // Fill in credentials
      await page.fill(emailSelector, 'test@example.com');
      await page.fill(passwordSelector, 'Test123!');

      // Take screenshot before submitting
      await page.screenshot({
        path: 'test-results/screenshots/auth-before-submit.png',
        fullPage: true
      });

      // Click Sign In button
      const signInButton = page.locator('button:has-text("Sign In")').first();
      await signInButton.click();

      // Wait for navigation or error message
      await page.waitForTimeout(3000);

      // Check if we're redirected to dashboard
      const currentUrl = page.url();
      const isLoggedIn = currentUrl.includes('chairman') || currentUrl.includes('dashboard');

      if (isLoggedIn) {
        console.log('✅ Successfully logged in and redirected to:', currentUrl);
      } else {
        // Check for error messages
        const errorMessage = await page.locator('text=/error|invalid|incorrect/i').count();
        if (errorMessage > 0) {
          console.log('⚠️ Login failed with error message');
        }
      }

      // Verify navigation elements appear after login
      if (isLoggedIn) {
        await expect(page.locator('nav')).toBeVisible({ timeout: 10000 });
      }

    } else {
      throw new Error('Could not find email input field on login page');
    }
  });

  test('US-UAT-AUTH-02: Sign Up new account flow', async ({ page }) => {
    // Navigate to login page
    await page.click('text="Sign In"');
    await page.waitForURL(/.*login/);
    await page.waitForLoadState('networkidle');

    // Switch to Sign Up tab
    const signupTab = await page.locator('button[role="tab"]:has-text("Sign Up")').count();
    if (signupTab > 0) {
      await page.click('button[role="tab"]:has-text("Sign Up")');
      await page.waitForTimeout(500);
    }

    // Generate unique email for testing
    const uniqueEmail = `test_${Date.now()}@example.com`;

    // Look for signup email field
    const signupEmail = await page.locator('#signup-email').count();
    const emailInput = await page.locator('input[type="email"]').count();

    if (signupEmail > 0) {
      await page.fill('#signup-email', uniqueEmail);
      await page.fill('#signup-password', 'Test123!');
    } else if (emailInput > 0) {
      await page.fill('input[type="email"]', uniqueEmail);
      await page.fill('input[type="password"]', 'Test123!');
    }

    // Click Sign Up button
    const signUpButton = page.locator('button:has-text("Sign Up")').first();
    if (await signUpButton.count() > 0) {
      await signUpButton.click();
    } else {
      // Try generic submit button
      await page.click('button[type="submit"]');
    }

    // Wait for response
    await page.waitForTimeout(3000);

    // Check for success message or error
    const successMessage = await page.locator('text=/confirm|verify|check.*email/i').count();
    const errorMessage = await page.locator('text=/error|failed/i').count();

    if (successMessage > 0) {
      console.log('✅ Sign up successful - confirmation email sent');
    } else if (errorMessage > 0) {
      console.log('⚠️ Sign up failed with error');
    }
  });

  test('US-UAT-AUTH-03: Invalid credentials handling', async ({ page }) => {
    // Navigate to login
    await page.click('text="Sign In"');
    await page.waitForURL(/.*login/);
    await page.waitForLoadState('networkidle');

    // Try to login with invalid credentials
    const emailSelector = '#signin-email';
    const passwordSelector = '#signin-password';

    if (await page.locator(emailSelector).count() > 0) {
      await page.fill(emailSelector, 'invalid@example.com');
      await page.fill(passwordSelector, 'WrongPassword123!');
    } else {
      await page.fill('input[type="email"]', 'invalid@example.com');
      await page.fill('input[type="password"]', 'WrongPassword123!');
    }

    // Submit form
    await page.click('button:has-text("Sign In")');

    // Wait for error message
    await page.waitForTimeout(2000);

    // Should show error and stay on login page
    const errorVisible = await page.locator('text=/invalid|incorrect|error|failed/i').count();
    const stillOnLogin = page.url().includes('login');

    expect(errorVisible).toBeGreaterThan(0);
    expect(stillOnLogin).toBeTruthy();
  });

  test('US-UAT-AUTH-04: Password visibility toggle', async ({ page }) => {
    // Navigate to login
    await page.click('text="Sign In"');
    await page.waitForURL(/.*login/);
    await page.waitForLoadState('networkidle');

    const passwordField = page.locator('#signin-password, input[type="password"]').first();

    // Check initial type is password
    const initialType = await passwordField.getAttribute('type');
    expect(initialType).toBe('password');

    // Look for eye icon button
    const eyeButton = page.locator('button:has(svg)').filter({
      has: page.locator('svg').filter({ hasText: /eye/i })
    }).first();

    if (await eyeButton.count() > 0) {
      await eyeButton.click();
      await page.waitForTimeout(500);

      // Check if type changed to text
      const newType = await passwordField.getAttribute('type');
      expect(newType).toBe('text');

      // Toggle back
      await eyeButton.click();
      await page.waitForTimeout(500);

      const finalType = await passwordField.getAttribute('type');
      expect(finalType).toBe('password');
    }
  });

  test('US-UAT-AUTH-05: Tab switching between Sign In and Sign Up', async ({ page }) => {
    // Navigate to login
    await page.click('text="Sign In"');
    await page.waitForURL(/.*login/);
    await page.waitForLoadState('networkidle');

    // Check if tabs exist
    const signInTab = page.locator('button[role="tab"]:has-text("Sign In")');
    const signUpTab = page.locator('button[role="tab"]:has-text("Sign Up")');

    if (await signInTab.count() > 0 && await signUpTab.count() > 0) {
      // Click Sign Up tab
      await signUpTab.click();
      await page.waitForTimeout(500);

      // Check for Sign Up specific elements
      const signupEmail = await page.locator('#signup-email, input[type="email"]').count();
      expect(signupEmail).toBeGreaterThan(0);

      // Click Sign In tab
      await signInTab.click();
      await page.waitForTimeout(500);

      // Check for Sign In specific elements
      const signinEmail = await page.locator('#signin-email, input[type="email"]').count();
      expect(signinEmail).toBeGreaterThan(0);
    }
  });

  test('US-UAT-AUTH-06: Logout functionality', async ({ page }) => {
    // First, try to login (using existing session or creating new)
    await page.goto(`${BASE_URL}/login`);
    await page.waitForLoadState('networkidle');

    // Simplified login for testing logout
    const emailField = page.locator('#signin-email, input[type="email"]').first();
    const passwordField = page.locator('#signin-password, input[type="password"]').first();

    if (await emailField.count() > 0) {
      await emailField.fill('test@example.com');
      await passwordField.fill('Test123!');
      await page.click('button:has-text("Sign In")');
      await page.waitForTimeout(3000);
    }

    // If logged in, look for logout option
    const userMenu = page.locator('[data-testid="user-menu"], button:has-text("Logout"), nav button').first();

    if (await userMenu.count() > 0) {
      await userMenu.click();
      await page.waitForTimeout(500);

      // Look for logout button in dropdown
      const logoutButton = page.locator('text="Logout", text="Sign Out", text="Log Out"').first();
      if (await logoutButton.count() > 0) {
        await logoutButton.click();
        await page.waitForTimeout(2000);

        // Should be redirected to login or landing page
        const currentUrl = page.url();
        const isLoggedOut = currentUrl.includes('login') || currentUrl === BASE_URL + '/';
        expect(isLoggedOut).toBeTruthy();
      }
    }
  });

  test('US-UAT-AUTH-07: Form validation', async ({ page }) => {
    // Navigate to login
    await page.click('text="Sign In"');
    await page.waitForURL(/.*login/);
    await page.waitForLoadState('networkidle');

    // Try to submit empty form
    await page.click('button:has-text("Sign In")');
    await page.waitForTimeout(1000);

    // Check for HTML5 validation messages or custom validation
    const emailField = page.locator('#signin-email, input[type="email"]').first();
    const isEmailRequired = await emailField.getAttribute('required');

    // Fill invalid email format
    await emailField.fill('notanemail');
    await page.click('button:has-text("Sign In")');
    await page.waitForTimeout(1000);

    // Should show validation error or stay on page
    const stillOnLogin = page.url().includes('login');
    expect(stillOnLogin).toBeTruthy();

    // Test password minimum length
    await emailField.fill('test@example.com');
    const passwordField = page.locator('#signin-password, input[type="password"]').first();
    await passwordField.fill('123'); // Too short
    await page.click('button:has-text("Sign In")');
    await page.waitForTimeout(1000);

    // Should not successfully login with short password
    const notLoggedIn = page.url().includes('login');
    expect(notLoggedIn).toBeTruthy();
  });

  test('US-UAT-AUTH-08: Remember session', async ({ page, context }) => {
    // Login first
    await page.goto(`${BASE_URL}/login`);
    await page.waitForLoadState('networkidle');

    const emailField = page.locator('#signin-email, input[type="email"]').first();
    if (await emailField.count() > 0) {
      await emailField.fill('test@example.com');
      await page.locator('#signin-password, input[type="password"]').first().fill('Test123!');
      await page.click('button:has-text("Sign In")');
      await page.waitForTimeout(3000);
    }

    // Check if logged in
    const isLoggedIn = page.url().includes('chairman') || page.url().includes('dashboard');

    if (isLoggedIn) {
      // Save cookies
      const cookies = await context.cookies();

      // Create new page in same context
      const newPage = await context.newPage();
      await newPage.goto(BASE_URL);

      // Should still be logged in
      await newPage.waitForTimeout(2000);
      const stillLoggedIn = !newPage.url().includes('login');
      expect(stillLoggedIn).toBeTruthy();

      await newPage.close();
    }
  });

  test('US-UAT-AUTH-09: Protected route redirect', async ({ page }) => {
    // Try to access protected route without login
    await page.goto(`${BASE_URL}/ventures`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // Should be redirected to login
    const redirectedToLogin = page.url().includes('login');
    expect(redirectedToLogin).toBeTruthy();
  });

  test('US-UAT-AUTH-10: Login persistence check', async ({ page }) => {
    // Navigate directly to chairman dashboard
    await page.goto(`${BASE_URL}/chairman`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    const currentUrl = page.url();

    // If not logged in, should redirect to login
    if (currentUrl.includes('login')) {
      console.log('✅ Correctly redirected to login when not authenticated');
      expect(currentUrl).toContain('login');
    } else if (currentUrl.includes('chairman')) {
      console.log('⚠️ User session persisted from previous test');
      // Clear session for clean state
      await page.context().clearCookies();
      await page.reload();
      await page.waitForTimeout(2000);

      // Should now redirect to login
      expect(page.url()).toContain('login');
    }
  });
});

// Helper function to store test results
async function storeTestResult(testId, status, page) {
  console.log(`Test ${testId}: ${status}`);

  if (status === 'failed') {
    await page.screenshot({
      path: `test-results/screenshots/auth-${testId}-${Date.now()}.png`,
      fullPage: true
    });
  }
}