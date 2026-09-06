import { chromium } from '@playwright/test';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import { resolveEnvTestPath } from '../../e2e/setup/resolve-env-test-path.js';

// SD-LEO-INFRA-REPAIR-DECAYED-EHG-001 (FR-1): both files are gitignored and live only at the
// main repo root -- a bare process.cwd()-relative path is invisible from a worktree checkout.
// Resolve via git's own --git-common-dir instead (see resolve-env-test-path.js).
const localEnvPath = resolveEnvTestPath('.env.test.local');
const defaultEnvPath = resolveEnvTestPath('.env.test');

if (fs.existsSync(localEnvPath)) {
  console.log('📋 Loading credentials from .env.test.local');
  dotenv.config({ path: localEnvPath });
} else {
  console.log('📋 Loading credentials from .env.test (using defaults)');
  dotenv.config({ path: defaultEnvPath });
}

async function globalSetup() {
  console.log('🔐 Starting global authentication setup...');

  const browser = await chromium.launch({
    headless: true,
    timeout: 60000
  });

  try {
    const context = await browser.newContext();
    const page = await context.newPage();

    // Set longer timeout for auth operations
    page.setDefaultTimeout(30000);

    const baseUrl = process.env.BASE_URL || 'http://localhost:8080';
    const email = process.env.TEST_USER_EMAIL || 'test@example.com';
    const password = process.env.TEST_USER_PASSWORD || 'Test123!';

    console.log(`📍 Navigating to ${baseUrl}/login`);

    // Go to login page
    await page.goto(`${baseUrl}/login`, {
      waitUntil: 'networkidle',
      timeout: 30000
    });

    // Wait for page to fully load
    await page.waitForLoadState('domcontentloaded');

    // Check if we're on login page
    const currentUrl = page.url();
    console.log(`📍 Current URL: ${currentUrl}`);

    // Try multiple selectors for better compatibility
    const emailSelectors = [
      '#signin-email',
      'input[type="email"]',
      'input[name="email"]',
      '[data-testid="email-input"]'
    ];

    const passwordSelectors = [
      '#signin-password',
      'input[type="password"]',
      'input[name="password"]',
      '[data-testid="password-input"]'
    ];

    // Find email field
    let emailField = null;
    for (const selector of emailSelectors) {
      const count = await page.locator(selector).count();
      if (count > 0) {
        emailField = page.locator(selector).first();
        console.log(`✅ Found email field with selector: ${selector}`);
        break;
      }
    }

    if (!emailField) {
      throw new Error('Could not find email input field');
    }

    // Find password field
    let passwordField = null;
    for (const selector of passwordSelectors) {
      const count = await page.locator(selector).count();
      if (count > 0) {
        passwordField = page.locator(selector).first();
        console.log(`✅ Found password field with selector: ${selector}`);
        break;
      }
    }

    if (!passwordField) {
      throw new Error('Could not find password input field');
    }

    // Fill in credentials
    console.log(`📝 Filling in credentials for ${email}`);
    await emailField.fill(email);
    await passwordField.fill(password);

    // Find and click sign in button
    // SD-LEO-INFRA-REPAIR-DECAYED-EHG-001 (FR-1, same root cause as tests/e2e/ehg-app/
    // auth.setup.spec.ts): 'button:has-text("Sign In")' is TAG-based and also matches a
    // Radix TabsTrigger tab labeled "Sign In" that precedes the real submit button in DOM
    // order -- .first() picked the no-op tab. Form/type-scoped selectors now come first.
    const signInSelectors = [
      'form button[type="submit"]',
      'button[type="submit"]',
      '[data-testid="signin-button"]',
      'button:has-text("Sign In")',
      'button:has-text("Log In")',
      'button:has-text("Login")'
    ];

    let signInButton = null;
    for (const selector of signInSelectors) {
      const count = await page.locator(selector).count();
      if (count > 0) {
        signInButton = page.locator(selector).first();
        console.log(`✅ Found sign in button with selector: ${selector}`);
        break;
      }
    }

    if (!signInButton) {
      throw new Error('Could not find sign in button');
    }

    // Click sign in and wait for navigation or any URL change
    console.log('🚀 Clicking sign in button...');

    // Take a screenshot before clicking
    await page.screenshot({ path: 'tests/uat/.auth/before-signin.png' });

    // Click and wait for either navigation or error
    await Promise.race([
      signInButton.click().then(async () => {
        // Wait for successful navigation away from login
        await page.waitForURL((url) => !url.toString().includes('/login'), {
          timeout: 15000,
          waitUntil: 'domcontentloaded'
        });
        console.log('✅ Navigation detected - left login page');
      }),
      // Also wait for possible error messages
      page.waitForSelector('[role="alert"], .destructive, [class*="toast"]', {
        timeout: 15000,
        state: 'visible'
      }).then(() => {
        console.log('⚠️ Error message appeared');
      })
    ]).catch((e) => {
      console.log('⚠️ Navigation timeout, continuing to check state...');
    });

    // Additional wait for any async operations
    await page.waitForTimeout(3000);

    // Take a screenshot after clicking
    await page.screenshot({ path: 'tests/uat/.auth/after-signin.png' });

    // Check for error messages
    const errorElement = await page.locator('[role="alert"], .destructive, [class*="error"]').first();
    const hasError = await errorElement.count() > 0;

    if (hasError) {
      const errorText = await errorElement.textContent();
      console.log(`❌ Authentication error detected: ${errorText}`);
      throw new Error(`Authentication failed with error: ${errorText}`);
    }

    // Verify we're logged in
    const loggedInUrl = page.url();
    console.log(`📍 Current URL after sign in: ${loggedInUrl}`);

    if (loggedInUrl.includes('login')) {
      // Check if there's a toast error message
      const toastError = await page.locator('[class*="toast"]').textContent().catch(() => null);
      if (toastError) {
        throw new Error(`Authentication failed: ${toastError}`);
      }
      throw new Error('Authentication failed - still on login page. Please verify credentials are correct.');
    }

    console.log(`✅ Successfully logged in! Redirected to: ${loggedInUrl}`);

    // Save authentication state
    const authPath = path.resolve(process.cwd(), 'tests/uat/.auth/user.json');
    await context.storageState({ path: authPath });
    console.log(`💾 Authentication state saved to: ${authPath}`);

    // Close browser
    await browser.close();
    console.log('✅ Global authentication setup completed successfully!');

  } catch (error) {
    console.error('❌ Authentication setup failed:', error.message);
    await browser.close();
    throw error;
  }
}

export default globalSetup;