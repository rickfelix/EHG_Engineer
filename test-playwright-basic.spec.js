import { test, expect } from '@playwright/test';

test('basic test - verify Playwright is working', async ({ page }) => {
  // Navigate to Playwright's example page
  await page.goto('https://playwright.dev/');
  
  // Check if the title contains "Playwright"
  await expect(page).toHaveTitle(/Playwright/);
  
  // Take a screenshot as proof
  await page.screenshot({ path: 'playwright-test-screenshot.png' });
  
  console.log('✅ Playwright is working correctly!');
});

test('browser info test', async ({ page, browserName }) => {
  console.log(`Running test in ${browserName} browser`);
  
  // Navigate to a simple page
  await page.goto('https://example.com');
  
  // Verify the page loaded
  await expect(page.locator('h1')).toContainText('Example Domain');
  
  console.log(`✅ ${browserName} browser is working!`);
});















