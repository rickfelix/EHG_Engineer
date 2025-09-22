/**
 * Example Playwright test with Story annotations
 * Shows how to link tests to user stories for verification tracking
 */

import { test, expect } from '@playwright/test';

// Method 1: Using annotations (recommended)
test('Submit directive via 7-step flow', async ({ page }, testInfo) => {
  // Link this test to a specific story
  testInfo.annotations.push({
    type: 'story',
    description: 'SD-2025-09-EMB:US-a3b4c5d6'
  });

  await page.goto('/directive-lab');

  // Step 1: Enter directive
  await page.fill('[data-testid="directive-input"]', 'Test directive content');
  await page.click('[data-testid="next-button"]');

  // Step 2: Set priority
  await page.selectOption('[data-testid="priority-select"]', 'high');
  await page.click('[data-testid="next-button"]');

  // Continue through steps...

  // Verify submission
  await expect(page.locator('[data-testid="success-message"]')).toBeVisible();
  await expect(page.locator('[data-testid="success-message"]')).toContainText('Directive created');
});

// Method 2: Including story key in title
test('[STORY SD-2025-09-EMB:US-b4c5d6e7] View directive history', async ({ page }) => {
  await page.goto('/directives');

  // Check history table is visible
  await expect(page.locator('table[data-testid="directive-history"]')).toBeVisible();

  // Verify at least one directive exists
  const rows = page.locator('table[data-testid="directive-history"] tbody tr');
  await expect(rows).toHaveCount(await rows.count());
  expect(await rows.count()).toBeGreaterThan(0);
});

// Method 3: Multiple stories per test (if testing integration)
test('Complete directive workflow', async ({ page }, testInfo) => {
  // This test covers multiple stories
  testInfo.annotations.push(
    { type: 'story', description: 'SD-2025-09-EMB:US-c5d6e7f8' }, // Create story
    { type: 'story', description: 'SD-2025-09-EMB:US-d6e7f8g9' }  // Export story
  );

  // Create directive
  await page.goto('/directive-lab');
  await page.fill('[data-testid="directive-input"]', 'Integration test directive');
  // ... complete creation

  // Export as PDF
  await page.click('[data-testid="export-button"]');
  await page.selectOption('[data-testid="export-format"]', 'pdf');
  await page.click('[data-testid="download-button"]');

  // Verify download started
  const download = await page.waitForEvent('download');
  expect(download.suggestedFilename()).toContain('.pdf');
});

// Test without story annotation (won't be tracked)
test('Navigation smoke test', async ({ page }) => {
  // This test has no story annotation, so it won't affect story verification
  await page.goto('/');
  await expect(page).toHaveTitle(/EHG/);

  // Check main navigation elements
  await expect(page.locator('nav')).toBeVisible();
  await expect(page.locator('[data-testid="dashboard-link"]')).toBeVisible();
});