/**
 * LEO E2E Global Authentication Setup
 *
 * Authenticates a test user and saves the storage state for E2E tests.
 * Similar to UAT setup but for E2E test suites.
 *
 * @module global-auth
 */

import { chromium } from '@playwright/test';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';

// Load test environment variables
const localEnvPath = path.resolve(process.cwd(), '.env.test.local');
const defaultEnvPath = path.resolve(process.cwd(), '.env.test');

if (fs.existsSync(localEnvPath)) {
  console.log('[E2E Auth] Loading credentials from .env.test.local');
  dotenv.config({ path: localEnvPath });
} else {
  console.log('[E2E Auth] Loading credentials from .env.test');
  dotenv.config({ path: defaultEnvPath });
}

async function globalSetup() {
  console.log('[E2E Auth] Starting global authentication setup...');

  // Create auth directory if it doesn't exist
  const authDir = path.resolve(process.cwd(), 'tests/e2e/.auth');
  if (!fs.existsSync(authDir)) {
    fs.mkdirSync(authDir, { recursive: true });
  }

  const browser = await chromium.launch({
    headless: true,
    timeout: 60000
  });

  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    page.setDefaultTimeout(30000);

    const baseUrl = process.env.BASE_URL || 'http://localhost:8080';
    const email = process.env.TEST_USER_EMAIL || 'test@example.com';
    const password = process.env.TEST_USER_PASSWORD || 'Test123!';

    console.log(`[E2E Auth] Navigating to ${baseUrl}/login`);

    await page.goto(`${baseUrl}/login`, {
      waitUntil: 'networkidle',
      timeout: 30000
    });

    await page.waitForLoadState('domcontentloaded');
    console.log(`[E2E Auth] Current URL: ${page.url()}`);

    // Find email field
    const emailField = page.locator('input[type="email"], input[name="email"], #signin-email').first();
    await emailField.waitFor({ state: 'visible', timeout: 10000 });

    // Find password field
    const passwordField = page.locator('input[type="password"], input[name="password"], #signin-password').first();
    await passwordField.waitFor({ state: 'visible', timeout: 10000 });

    // Fill credentials
    console.log(`[E2E Auth] Filling in credentials for ${email}`);
    await emailField.fill(email);
    await passwordField.fill(password);

    // Find and click sign in button
    const signInButton = page.locator('button:has-text("Sign In"), button[type="submit"]').first();
    console.log('[E2E Auth] Clicking sign in button...');

    await Promise.race([
      signInButton.click().then(async () => {
        await page.waitForURL((url) => !url.toString().includes('/login'), {
          timeout: 15000,
          waitUntil: 'domcontentloaded'
        });
        console.log('[E2E Auth] Navigation detected - left login page');
      }),
      page.waitForSelector('[role="alert"], .destructive', {
        timeout: 15000,
        state: 'visible'
      }).then(() => {
        console.log('[E2E Auth] Error message appeared');
      })
    ]).catch(() => {
      console.log('[E2E Auth] Navigation timeout, checking state...');
    });

    await page.waitForTimeout(2000);

    // Check for errors
    const errorElement = page.locator('[role="alert"], .destructive').first();
    if (await errorElement.count() > 0) {
      const errorText = await errorElement.textContent();
      console.log(`[E2E Auth] Authentication error: ${errorText}`);
      throw new Error(`Authentication failed: ${errorText}`);
    }

    const loggedInUrl = page.url();
    console.log(`[E2E Auth] Current URL after sign in: ${loggedInUrl}`);

    if (loggedInUrl.includes('login')) {
      throw new Error('Authentication failed - still on login page');
    }

    console.log(`[E2E Auth] Successfully logged in! Redirected to: ${loggedInUrl}`);

    // Save authentication state
    const authPath = path.resolve(authDir, 'user.json');
    await context.storageState({ path: authPath });
    console.log(`[E2E Auth] Authentication state saved to: ${authPath}`);

    await browser.close();
    console.log('[E2E Auth] Global authentication setup completed!');

  } catch (error) {
    console.error('[E2E Auth] Authentication setup failed:', error.message);
    await browser.close();
    throw error;
  }
}

export default globalSetup;
