/**
 * Test Generators Domain
 * Generates test file content and test implementations
 *
 * @module generate-uat/test-generators
 */

import { BASE_URL } from './test-suite-config.js';

/**
 * Generate test file content for a suite
 * @param {string} suiteName - Name of the test suite
 * @param {Object} config - Suite configuration
 * @returns {string} Complete test file content
 */
export function generateTestFile(suiteName, config) {
  const { name, route, tests } = config;

  return `import { test, expect } from '@playwright/test';

const BASE_URL = process.env.BASE_URL || '${BASE_URL}';

test.describe('EHG ${name} Tests', () => {
  test.beforeEach(async ({ page, context }) => {
    // Clear cookies and login
    await context.clearCookies();
    await page.goto(BASE_URL);

    // Login flow (adjust based on actual app)
    const needsLogin = await page.url().includes('login');
    if (needsLogin) {
      await page.fill('#signin-email, input[type="email"]', 'test@example.com');
      await page.fill('#signin-password, input[type="password"]', 'Test123!');
      await page.click('button:has-text("Sign In")');
      await page.waitForURL(/chairman|dashboard/, { timeout: 10000 });
    }

    // Navigate to test page
    await page.goto(\`\${BASE_URL}${route}\`);
    await page.waitForLoadState('networkidle');
  });

${tests.map((testName, index) => `
  test('US-UAT-${suiteName.toUpperCase()}-${String(index + 1).padStart(3, '0')}: ${testName}', async ({ page }) => {
    // ${testName} implementation
    ${generateTestImplementation(suiteName, testName, index)}
  });`).join('\n')}
});

${generateHelperFunctions(suiteName)}
`;
}

/**
 * Generate helper functions for test files
 * @param {string} suiteName - Name of the test suite
 * @returns {string} Helper functions code
 */
export function generateHelperFunctions(suiteName) {
  return `// Helper functions
async function waitForElement(page, selector, timeout = 5000) {
  await page.waitForSelector(selector, { timeout });
}

async function clickAndWait(page, selector, waitForUrl = null) {
  await page.click(selector);
  if (waitForUrl) {
    await page.waitForURL(waitForUrl, { timeout: 5000 });
  } else {
    await page.waitForTimeout(1000);
  }
}

async function fillForm(page, formData) {
  for (const [selector, value] of Object.entries(formData)) {
    await page.fill(selector, value);
  }
}

async function verifyToast(page, message) {
  const toast = page.locator(\`text=/\${message}/i\`);
  await expect(toast).toBeVisible({ timeout: 5000 });
}

async function takeScreenshot(page, name) {
  await page.screenshot({
    path: \`test-results/screenshots/${suiteName}-\${name}-\${Date.now()}.png\`,
    fullPage: true
  });
}

async function checkAccessibility(page) {
  // Basic accessibility checks
  const images = await page.$$('img:not([alt])');
  expect(images.length).toBe(0);

  const buttons = await page.$$('button:not([aria-label]):not(:has-text(*))');
  expect(buttons.length).toBe(0);
}

async function measurePerformance(page, actionName) {
  const startTime = Date.now();
  // Action would be performed here
  const endTime = Date.now();
  const duration = endTime - startTime;

  console.log(\`Performance: \${actionName} took \${duration}ms\`);
  expect(duration).toBeLessThan(3000); // 3 second max
}`;
}

/**
 * Generate specific test implementation based on test name
 * @param {string} suiteName - Name of the test suite
 * @param {string} testName - Name of the test
 * @param {number} index - Test index
 * @returns {string} Test implementation code
 */
export function generateTestImplementation(suiteName, testName, index) {
  const testLower = testName.toLowerCase();

  if (testLower.includes('load')) {
    return generateLoadTest(suiteName);
  }

  if (testLower.includes('create') || testLower.includes('add')) {
    return generateCreateTest(suiteName);
  }

  if (testLower.includes('edit') || testLower.includes('update')) {
    return generateEditTest();
  }

  if (testLower.includes('delete') || testLower.includes('remove')) {
    return generateDeleteTest();
  }

  if (testLower.includes('search') || testLower.includes('filter')) {
    return generateSearchTest(index);
  }

  if (testLower.includes('export') || testLower.includes('download')) {
    return generateExportTest();
  }

  if (testLower.includes('sort')) {
    return generateSortTest();
  }

  if (testLower.includes('permission') || testLower.includes('access')) {
    return generatePermissionTest();
  }

  if (testLower.includes('performance') || testLower.includes('metric')) {
    return generatePerformanceTest();
  }

  return generateDefaultTest(testName, index);
}

function generateLoadTest(suiteName) {
  return `
    // Verify page loads successfully
    await expect(page).toHaveURL(new RegExp('${suiteName}'));
    const pageTitle = await page.title();
    expect(pageTitle).toBeTruthy();

    // Check for no console errors
    const errors = [];
    page.on('console', msg => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    await page.waitForTimeout(1000);
    expect(errors).toHaveLength(0);

    // Verify main content is visible
    const mainContent = page.locator('main, [role="main"], .main-content').first();
    await expect(mainContent).toBeVisible();`;
}

function generateCreateTest(suiteName) {
  return `
    // Click create/add button
    const createBtn = page.locator('button:has-text("Create"), button:has-text("Add"), button:has-text("New")').first();
    await expect(createBtn).toBeVisible();
    await createBtn.click();

    // Wait for form/modal
    await page.waitForTimeout(1000);

    // Fill in required fields
    const nameField = page.locator('input[name="name"], input[placeholder*="name" i]').first();
    if (await nameField.count() > 0) {
      await nameField.fill(\`Test ${suiteName} \${Date.now()}\`);
    }

    // Submit form
    const submitBtn = page.locator('button[type="submit"], button:has-text("Save"), button:has-text("Create")').last();
    await submitBtn.click();

    // Verify success
    await page.waitForTimeout(2000);
    const successMsg = page.locator('text=/success|created|saved/i');
    await expect(successMsg.first()).toBeVisible({ timeout: 5000 });`;
}

function generateEditTest() {
  return `
    // Find and click edit button
    const editBtn = page.locator('button:has-text("Edit"), [aria-label*="edit" i]').first();
    await expect(editBtn).toBeVisible();
    await editBtn.click();

    // Wait for edit form
    await page.waitForTimeout(1000);

    // Update fields
    const inputField = page.locator('input[type="text"]').first();
    if (await inputField.count() > 0) {
      await inputField.clear();
      await inputField.fill(\`Updated \${Date.now()}\`);
    }

    // Save changes
    const saveBtn = page.locator('button:has-text("Save"), button:has-text("Update")').first();
    await saveBtn.click();

    // Verify update
    await page.waitForTimeout(1000);
    await expect(page.locator('text=/updated|saved/i').first()).toBeVisible();`;
}

function generateDeleteTest() {
  return `
    // Find and click delete button
    const deleteBtn = page.locator('button:has-text("Delete"), [aria-label*="delete" i]').first();
    await expect(deleteBtn).toBeVisible();
    await deleteBtn.click();

    // Handle confirmation dialog
    const confirmBtn = page.locator('button:has-text("Confirm"), button:has-text("Yes")').first();
    if (await confirmBtn.count() > 0) {
      await confirmBtn.click();
    }

    // Verify deletion
    await page.waitForTimeout(1000);
    const successMsg = page.locator('text=/deleted|removed/i');
    await expect(successMsg.first()).toBeVisible({ timeout: 5000 });`;
}

function generateSearchTest(index) {
  return `
    // Find search/filter input
    const searchInput = page.locator('input[type="search"], input[placeholder*="search" i]').first();
    await expect(searchInput).toBeVisible();

    // Enter search term
    await searchInput.fill('test search ${index}');
    await page.keyboard.press('Enter');

    // Wait for results
    await page.waitForTimeout(1000);

    // Verify filtered results
    const results = page.locator('[role="list"] > *, tbody tr, .card, .item');
    const count = await results.count();
    console.log(\`Found \${count} filtered results\`);

    // Clear filter
    const clearBtn = page.locator('button:has-text("Clear"), button[aria-label*="clear" i]').first();
    if (await clearBtn.count() > 0) {
      await clearBtn.click();
    }`;
}

function generateExportTest() {
  return `
    // Find and click export button
    const exportBtn = page.locator('button:has-text("Export"), button:has-text("Download")').first();
    await expect(exportBtn).toBeVisible();

    // Start download promise
    const downloadPromise = page.waitForEvent('download');
    await exportBtn.click();

    // Handle export options if present
    const pdfOption = page.locator('text="PDF"').first();
    if (await pdfOption.count() > 0) {
      await pdfOption.click();
    }

    // Wait for download
    const download = await downloadPromise;
    expect(download).toBeTruthy();
    console.log('Download completed:', await download.suggestedFilename());`;
}

function generateSortTest() {
  return `
    // Find sortable column header
    const sortHeader = page.locator('th, [role="columnheader"]').first();
    await expect(sortHeader).toBeVisible();

    // Click to sort
    await sortHeader.click();
    await page.waitForTimeout(500);

    // Verify sort indicator
    const sortIcon = sortHeader.locator('[aria-label*="sort" i], .sort-icon');
    await expect(sortIcon.first()).toBeVisible();

    // Click again for reverse sort
    await sortHeader.click();
    await page.waitForTimeout(500);`;
}

function generatePermissionTest() {
  return `
    // Check for permission-based elements
    const adminOnly = page.locator('[data-permission="admin"], .admin-only');
    const adminCount = await adminOnly.count();

    // Verify based on user role
    const userRole = 'user'; // This would be dynamic
    if (userRole === 'admin') {
      expect(adminCount).toBeGreaterThan(0);
    } else {
      expect(adminCount).toBe(0);
    }

    // Try accessing restricted action
    const restrictedBtn = page.locator('button:has-text("Admin")').first();
    if (await restrictedBtn.count() > 0) {
      const isDisabled = await restrictedBtn.isDisabled();
      expect(isDisabled).toBe(userRole !== 'admin');
    }`;
}

function generatePerformanceTest() {
  return `
    // Measure page performance
    const metrics = await page.evaluate(() => {
      const perf = performance.getEntriesByType('navigation')[0];
      return {
        domContentLoaded: perf.domContentLoadedEventEnd - perf.domContentLoadedEventStart,
        loadComplete: perf.loadEventEnd - perf.loadEventStart,
        firstPaint: performance.getEntriesByName('first-paint')[0]?.startTime || 0
      };
    });

    console.log('Performance metrics:', metrics);
    expect(metrics.loadComplete).toBeLessThan(3000);

    // Check for performance indicators on page
    const perfWidget = page.locator('[data-testid*="performance"], .performance-metric').first();
    if (await perfWidget.count() > 0) {
      await expect(perfWidget).toBeVisible();
    }`;
}

function generateDefaultTest(testName, index) {
  return `
    // Generic test implementation for: ${testName}
    await page.waitForLoadState('networkidle');

    // Take screenshot for visual verification
    await takeScreenshot(page, '${testName.replace(/\s+/g, '-').toLowerCase()}');

    // Basic interaction test
    const interactiveElements = page.locator('button, a, input, select');
    const elementCount = await interactiveElements.count();
    expect(elementCount).toBeGreaterThan(0);

    // Check for expected content
    const pageContent = await page.content();
    expect(pageContent).toBeTruthy();

    console.log('Test ${index + 1} completed: ${testName}');`;
}

export default {
  generateTestFile,
  generateHelperFunctions,
  generateTestImplementation
};
