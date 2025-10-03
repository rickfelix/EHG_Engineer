import { chromium } from '@playwright/test';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';

// Load test environment variables
const localEnvPath = path.resolve(process.cwd(), '.env.test.local');
if (fs.existsSync(localEnvPath)) {
  console.log('📋 Loading credentials from .env.test.local');
  dotenv.config({ path: localEnvPath });
}

async function testAuth() {
  const browser = await chromium.launch({
    headless: false,  // Run with UI to see what's happening
    slowMo: 500      // Slow down actions to observe
  });

  try {
    const context = await browser.newContext();
    const page = await context.newPage();

    const baseUrl = process.env.BASE_URL || 'http://localhost:8080';
    const email = process.env.TEST_USER_EMAIL;
    const password = process.env.TEST_USER_PASSWORD;

    console.log(`📍 Testing login for: ${email}`);
    console.log(`📍 URL: ${baseUrl}/login`);

    // Enable console logging from the page
    page.on('console', msg => console.log('Browser console:', msg.text()));
    page.on('pageerror', err => console.log('Browser error:', err.message));

    // Monitor network responses
    page.on('response', response => {
      if (response.url().includes('auth') || response.url().includes('login')) {
        console.log(`Network: ${response.status()} ${response.url()}`);
      }
    });

    // Navigate to login
    await page.goto(`${baseUrl}/login`);
    await page.waitForLoadState('domcontentloaded');

    // Fill email
    await page.fill('#signin-email', email);
    console.log('✅ Filled email');

    // Fill password
    await page.fill('#signin-password', password);
    console.log('✅ Filled password');

    // Take screenshot before clicking
    await page.screenshot({ path: 'tests/uat/.auth/manual-before.png' });

    // Click sign in
    await page.click('button:has-text("Sign In")');
    console.log('✅ Clicked Sign In button');

    // Wait for response
    await page.waitForTimeout(3000);

    // Check final URL
    const finalUrl = page.url();
    console.log(`📍 Final URL: ${finalUrl}`);

    // Take screenshot after
    await page.screenshot({ path: 'tests/uat/.auth/manual-after.png' });

    // Check for any visible errors
    const errors = await page.locator('[role="alert"], .destructive, [class*="error"], [class*="toast"]').allTextContents();
    if (errors.length > 0) {
      console.log('❌ Errors found:', errors);
    }

    if (finalUrl.includes('/chairman') || finalUrl.includes('/ventures') || finalUrl.includes('/dashboard')) {
      console.log('✅ SUCCESS! Logged in successfully');

      // Save the auth state
      await context.storageState({ path: 'tests/uat/.auth/user.json' });
      console.log('💾 Auth state saved');
    } else {
      console.log('❌ FAILED! Still on login page or unexpected page');
      console.log('Please check:');
      console.log('1. Are the credentials correct?');
      console.log('2. Is the EHG app running on port 8080?');
      console.log('3. Check the screenshots in tests/uat/.auth/');
    }

    // Keep browser open for 5 seconds to observe
    await page.waitForTimeout(5000);

  } catch (error) {
    console.error('Error during test:', error);
  } finally {
    await browser.close();
  }
}

testAuth();