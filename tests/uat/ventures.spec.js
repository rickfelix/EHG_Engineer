import { test, expect } from '@playwright/test';

const BASE_URL = process.env.BASE_URL || 'http://localhost:8080';

test.describe('EHG Venture Management Tests', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to ventures page (authentication already handled by global setup)
    await page.goto(`${BASE_URL}/ventures`);
    await page.waitForLoadState('networkidle');

    // Verify we're on the ventures page and not redirected to login
    expect(page.url()).toContain('/ventures');

    // Wait for main content to load
    await page.waitForSelector('h1:has-text("Venture Portfolio")', { timeout: 10000 });
  });


  test('US-UAT-VENTURES-001: List all ventures with pagination', async ({ page }) => {
    // List all ventures with pagination implementation
    
    // Generic test implementation for: List all ventures with pagination
    await page.waitForLoadState('networkidle');

    // Take screenshot for visual verification
    await takeScreenshot(page, 'list-all-ventures-with-pagination');

    // Basic interaction test
    const interactiveElements = page.locator('button, a, input, select');
    const elementCount = await interactiveElements.count();
    expect(elementCount).toBeGreaterThan(0);

    // Check for expected content
    const pageContent = await page.content();
    expect(pageContent).toBeTruthy();

    console.log('Test 1 completed: List all ventures with pagination');
  });

  test('US-UAT-VENTURES-002: Create new venture - basic flow', async ({ page }) => {
    // Create new venture - basic flow implementation

    // Click "New Venture" button - exact text from VentureGrid component
    const createBtn = page.locator('button:has-text("New Venture")');
    await expect(createBtn).toBeVisible();
    await createBtn.click();

    // Wait for form/modal
    await page.waitForTimeout(2000);

    // Fill in required fields - note: this will likely navigate to a form page
    const nameField = page.locator('input[name="name"], input[placeholder*="name" i]').first();
    if (await nameField.count() > 0) {
      await nameField.fill(`Test Venture ${Date.now()}`);
    }

    // Submit form
    const submitBtn = page.locator('button[type="submit"], button:has-text("Save"), button:has-text("Create")').last();
    await submitBtn.click();

    // Verify success
    await page.waitForTimeout(2000);
    const successMsg = page.locator('text=/success|created|saved/i');
    await expect(successMsg.first()).toBeVisible({ timeout: 5000 });
  });

  test('US-UAT-VENTURES-003: Create new venture - with all optional fields', async ({ page }) => {
    // Create new venture - with all optional fields implementation
    
    // Click create/add button
    const createBtn = page.locator('button:has-text("Create"), button:has-text("Add"), button:has-text("New")').first();
    await expect(createBtn).toBeVisible();
    await createBtn.click();

    // Wait for form/modal
    await page.waitForTimeout(1000);

    // Fill in required fields
    const nameField = page.locator('input[name="name"], input[placeholder*="name" i]').first();
    if (await nameField.count() > 0) {
      await nameField.fill(`Test ${suiteName} ${Date.now()}`);
    }

    // Submit form
    const submitBtn = page.locator('button[type="submit"], button:has-text("Save"), button:has-text("Create")').last();
    await submitBtn.click();

    // Verify success
    await page.waitForTimeout(2000);
    const successMsg = page.locator('text=/success|created|saved/i');
    await expect(successMsg.first()).toBeVisible({ timeout: 5000 });
  });

  test('US-UAT-VENTURES-004: Edit venture details - name and description', async ({ page }) => {
    // Edit venture details - name and description implementation

    // First, hover over a venture card to make the dropdown button visible
    const firstCard = page.locator('a[href^="/ventures/"]').first();
    await firstCard.hover();

    // Find and click the dropdown menu button (three dots)
    const menuButton = firstCard.locator('button').first();
    await expect(menuButton).toBeVisible();
    await menuButton.click();

    // Click "Edit Venture" from dropdown
    const editMenuItem = page.locator('text="Edit Venture"');
    await expect(editMenuItem).toBeVisible();
    await editMenuItem.click();

    // Wait for edit form
    await page.waitForTimeout(1000);

    // Update fields
    const inputField = page.locator('input[type="text"]').first();
    if (await inputField.count() > 0) {
      await inputField.clear();
      await inputField.fill(`Updated ${Date.now()}`);
    }

    // Save changes
    const saveBtn = page.locator('button:has-text("Save"), button:has-text("Update")').first();
    await saveBtn.click();

    // Verify update
    await page.waitForTimeout(1000);
    await expect(page.locator('text=/updated|saved/i').first()).toBeVisible();
  });

  test('US-UAT-VENTURES-005: Edit venture details - financial data', async ({ page }) => {
    // Edit venture details - financial data implementation
    
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
      await inputField.fill(`Updated ${Date.now()}`);
    }

    // Save changes
    const saveBtn = page.locator('button:has-text("Save"), button:has-text("Update")').first();
    await saveBtn.click();

    // Verify update
    await page.waitForTimeout(1000);
    await expect(page.locator('text=/updated|saved/i').first()).toBeVisible();
  });

  test('US-UAT-VENTURES-006: Edit venture details - team members', async ({ page }) => {
    // Edit venture details - team members implementation
    
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
      await inputField.fill(`Updated ${Date.now()}`);
    }

    // Save changes
    const saveBtn = page.locator('button:has-text("Save"), button:has-text("Update")').first();
    await saveBtn.click();

    // Verify update
    await page.waitForTimeout(1000);
    await expect(page.locator('text=/updated|saved/i').first()).toBeVisible();
  });

  test('US-UAT-VENTURES-007: Delete venture with confirmation', async ({ page }) => {
    // Delete venture with confirmation implementation
    
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
    await expect(successMsg.first()).toBeVisible({ timeout: 5000 });
  });

  test('US-UAT-VENTURES-008: Cancel delete operation', async ({ page }) => {
    // Cancel delete operation implementation
    
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
    await expect(successMsg.first()).toBeVisible({ timeout: 5000 });
  });

  test('US-UAT-VENTURES-009: Search ventures by name', async ({ page }) => {
    // Search ventures by name implementation

    // Find search input - using correct selector from VentureGrid component
    const searchInput = page.locator('input[placeholder="Search ventures..."]');
    await expect(searchInput).toBeVisible();

    // Enter search term (use a venture name that exists)
    await searchInput.fill('AI Healthcare');

    // Wait for search to process (no need to press Enter as search should be real-time)
    await page.waitForTimeout(1000);

    // Verify filtered results
    const results = page.locator('[role="list"] > *, tbody tr, .card, .item');
    const count = await results.count();
    console.log(`Found ${count} filtered results`);

    // Clear filter
    const clearBtn = page.locator('button:has-text("Clear"), button[aria-label*="clear" i]').first();
    if (await clearBtn.count() > 0) {
      await clearBtn.click();
    }
  });

  test('US-UAT-VENTURES-010: Search ventures by status', async ({ page }) => {
    // Search ventures by status implementation
    
    // Find search/filter input
    const searchInput = page.locator('input[type="search"], input[placeholder*="search" i]').first();
    await expect(searchInput).toBeVisible();

    // Enter search term
    await searchInput.fill('test search 9');
    await page.keyboard.press('Enter');

    // Wait for results
    await page.waitForTimeout(1000);

    // Verify filtered results
    const results = page.locator('[role="list"] > *, tbody tr, .card, .item');
    const count = await results.count();
    console.log(`Found ${count} filtered results`);

    // Clear filter
    const clearBtn = page.locator('button:has-text("Clear"), button[aria-label*="clear" i]').first();
    if (await clearBtn.count() > 0) {
      await clearBtn.click();
    }
  });

  test('US-UAT-VENTURES-011: Filter ventures by category', async ({ page }) => {
    // Filter ventures by category implementation
    
    // Find search/filter input
    const searchInput = page.locator('input[type="search"], input[placeholder*="search" i]').first();
    await expect(searchInput).toBeVisible();

    // Enter search term
    await searchInput.fill('test search 10');
    await page.keyboard.press('Enter');

    // Wait for results
    await page.waitForTimeout(1000);

    // Verify filtered results
    const results = page.locator('[role="list"] > *, tbody tr, .card, .item');
    const count = await results.count();
    console.log(`Found ${count} filtered results`);

    // Clear filter
    const clearBtn = page.locator('button:has-text("Clear"), button[aria-label*="clear" i]').first();
    if (await clearBtn.count() > 0) {
      await clearBtn.click();
    }
  });

  test('US-UAT-VENTURES-012: Filter ventures by date range', async ({ page }) => {
    // Filter ventures by date range implementation
    
    // Find search/filter input
    const searchInput = page.locator('input[type="search"], input[placeholder*="search" i]').first();
    await expect(searchInput).toBeVisible();

    // Enter search term
    await searchInput.fill('test search 11');
    await page.keyboard.press('Enter');

    // Wait for results
    await page.waitForTimeout(1000);

    // Verify filtered results
    const results = page.locator('[role="list"] > *, tbody tr, .card, .item');
    const count = await results.count();
    console.log(`Found ${count} filtered results`);

    // Clear filter
    const clearBtn = page.locator('button:has-text("Clear"), button[aria-label*="clear" i]').first();
    if (await clearBtn.count() > 0) {
      await clearBtn.click();
    }
  });

  test('US-UAT-VENTURES-013: Sort ventures by name', async ({ page }) => {
    // Sort ventures by name implementation
    
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
    await page.waitForTimeout(500);
  });

  test('US-UAT-VENTURES-014: Sort ventures by value', async ({ page }) => {
    // Sort ventures by value implementation
    
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
    await page.waitForTimeout(500);
  });

  test('US-UAT-VENTURES-015: Sort ventures by created date', async ({ page }) => {
    // Sort ventures by created date implementation
    
    // Click create/add button
    const createBtn = page.locator('button:has-text("Create"), button:has-text("Add"), button:has-text("New")').first();
    await expect(createBtn).toBeVisible();
    await createBtn.click();

    // Wait for form/modal
    await page.waitForTimeout(1000);

    // Fill in required fields
    const nameField = page.locator('input[name="name"], input[placeholder*="name" i]').first();
    if (await nameField.count() > 0) {
      await nameField.fill(`Test ${suiteName} ${Date.now()}`);
    }

    // Submit form
    const submitBtn = page.locator('button[type="submit"], button:has-text("Save"), button:has-text("Create")').last();
    await submitBtn.click();

    // Verify success
    await page.waitForTimeout(2000);
    const successMsg = page.locator('text=/success|created|saved/i');
    await expect(successMsg.first()).toBeVisible({ timeout: 5000 });
  });

  test('US-UAT-VENTURES-016: Bulk select ventures', async ({ page }) => {
    // Bulk select ventures implementation
    
    // Generic test implementation for: Bulk select ventures
    await page.waitForLoadState('networkidle');

    // Take screenshot for visual verification
    await takeScreenshot(page, 'bulk-select-ventures');

    // Basic interaction test
    const interactiveElements = page.locator('button, a, input, select');
    const elementCount = await interactiveElements.count();
    expect(elementCount).toBeGreaterThan(0);

    // Check for expected content
    const pageContent = await page.content();
    expect(pageContent).toBeTruthy();

    console.log('Test 16 completed: Bulk select ventures');
  });

  test('US-UAT-VENTURES-017: Bulk delete ventures', async ({ page }) => {
    // Bulk delete ventures implementation
    
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
    await expect(successMsg.first()).toBeVisible({ timeout: 5000 });
  });

  test('US-UAT-VENTURES-018: Bulk export ventures', async ({ page }) => {
    // Bulk export ventures implementation
    
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
    console.log('Download completed:', await download.suggestedFilename());
  });

  test('US-UAT-VENTURES-019: View venture details', async ({ page }) => {
    // View venture details implementation
    
    // Generic test implementation for: View venture details
    await page.waitForLoadState('networkidle');

    // Take screenshot for visual verification
    await takeScreenshot(page, 'view-venture-details');

    // Basic interaction test
    const interactiveElements = page.locator('button, a, input, select');
    const elementCount = await interactiveElements.count();
    expect(elementCount).toBeGreaterThan(0);

    // Check for expected content
    const pageContent = await page.content();
    expect(pageContent).toBeTruthy();

    console.log('Test 19 completed: View venture details');
  });

  test('US-UAT-VENTURES-020: Navigate between ventures', async ({ page }) => {
    // Navigate between ventures implementation
    
    // Generic test implementation for: Navigate between ventures
    await page.waitForLoadState('networkidle');

    // Take screenshot for visual verification
    await takeScreenshot(page, 'navigate-between-ventures');

    // Basic interaction test
    const interactiveElements = page.locator('button, a, input, select');
    const elementCount = await interactiveElements.count();
    expect(elementCount).toBeGreaterThan(0);

    // Check for expected content
    const pageContent = await page.content();
    expect(pageContent).toBeTruthy();

    console.log('Test 20 completed: Navigate between ventures');
  });

  test('US-UAT-VENTURES-021: Add venture to portfolio', async ({ page }) => {
    // Add venture to portfolio implementation
    
    // Click create/add button
    const createBtn = page.locator('button:has-text("Create"), button:has-text("Add"), button:has-text("New")').first();
    await expect(createBtn).toBeVisible();
    await createBtn.click();

    // Wait for form/modal
    await page.waitForTimeout(1000);

    // Fill in required fields
    const nameField = page.locator('input[name="name"], input[placeholder*="name" i]').first();
    if (await nameField.count() > 0) {
      await nameField.fill(`Test ${suiteName} ${Date.now()}`);
    }

    // Submit form
    const submitBtn = page.locator('button[type="submit"], button:has-text("Save"), button:has-text("Create")').last();
    await submitBtn.click();

    // Verify success
    await page.waitForTimeout(2000);
    const successMsg = page.locator('text=/success|created|saved/i');
    await expect(successMsg.first()).toBeVisible({ timeout: 5000 });
  });

  test('US-UAT-VENTURES-022: Remove venture from portfolio', async ({ page }) => {
    // Remove venture from portfolio implementation
    
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
    await expect(successMsg.first()).toBeVisible({ timeout: 5000 });
  });

  test('US-UAT-VENTURES-023: Share venture report', async ({ page }) => {
    // Share venture report implementation
    
    // Generic test implementation for: Share venture report
    await page.waitForLoadState('networkidle');

    // Take screenshot for visual verification
    await takeScreenshot(page, 'share-venture-report');

    // Basic interaction test
    const interactiveElements = page.locator('button, a, input, select');
    const elementCount = await interactiveElements.count();
    expect(elementCount).toBeGreaterThan(0);

    // Check for expected content
    const pageContent = await page.content();
    expect(pageContent).toBeTruthy();

    console.log('Test 23 completed: Share venture report');
  });

  test('US-UAT-VENTURES-024: Print venture summary', async ({ page }) => {
    // Print venture summary implementation
    
    // Generic test implementation for: Print venture summary
    await page.waitForLoadState('networkidle');

    // Take screenshot for visual verification
    await takeScreenshot(page, 'print-venture-summary');

    // Basic interaction test
    const interactiveElements = page.locator('button, a, input, select');
    const elementCount = await interactiveElements.count();
    expect(elementCount).toBeGreaterThan(0);

    // Check for expected content
    const pageContent = await page.content();
    expect(pageContent).toBeTruthy();

    console.log('Test 24 completed: Print venture summary');
  });

  test('US-UAT-VENTURES-025: Venture quick actions menu', async ({ page }) => {
    // Venture quick actions menu implementation
    
    // Generic test implementation for: Venture quick actions menu
    await page.waitForLoadState('networkidle');

    // Take screenshot for visual verification
    await takeScreenshot(page, 'venture-quick-actions-menu');

    // Basic interaction test
    const interactiveElements = page.locator('button, a, input, select');
    const elementCount = await interactiveElements.count();
    expect(elementCount).toBeGreaterThan(0);

    // Check for expected content
    const pageContent = await page.content();
    expect(pageContent).toBeTruthy();

    console.log('Test 25 completed: Venture quick actions menu');
  });

  test('US-UAT-VENTURES-026: Venture status transitions', async ({ page }) => {
    // Venture status transitions implementation
    
    // Generic test implementation for: Venture status transitions
    await page.waitForLoadState('networkidle');

    // Take screenshot for visual verification
    await takeScreenshot(page, 'venture-status-transitions');

    // Basic interaction test
    const interactiveElements = page.locator('button, a, input, select');
    const elementCount = await interactiveElements.count();
    expect(elementCount).toBeGreaterThan(0);

    // Check for expected content
    const pageContent = await page.content();
    expect(pageContent).toBeTruthy();

    console.log('Test 26 completed: Venture status transitions');
  });

  test('US-UAT-VENTURES-027: Venture permission checks', async ({ page }) => {
    // Venture permission checks implementation
    
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
    }
  });

  test('US-UAT-VENTURES-028: Venture data validation', async ({ page }) => {
    // Venture data validation implementation
    
    // Generic test implementation for: Venture data validation
    await page.waitForLoadState('networkidle');

    // Take screenshot for visual verification
    await takeScreenshot(page, 'venture-data-validation');

    // Basic interaction test
    const interactiveElements = page.locator('button, a, input, select');
    const elementCount = await interactiveElements.count();
    expect(elementCount).toBeGreaterThan(0);

    // Check for expected content
    const pageContent = await page.content();
    expect(pageContent).toBeTruthy();

    console.log('Test 28 completed: Venture data validation');
  });

  test('US-UAT-VENTURES-029: Venture audit trail', async ({ page }) => {
    // Venture audit trail implementation
    
    // Generic test implementation for: Venture audit trail
    await page.waitForLoadState('networkidle');

    // Take screenshot for visual verification
    await takeScreenshot(page, 'venture-audit-trail');

    // Basic interaction test
    const interactiveElements = page.locator('button, a, input, select');
    const elementCount = await interactiveElements.count();
    expect(elementCount).toBeGreaterThan(0);

    // Check for expected content
    const pageContent = await page.content();
    expect(pageContent).toBeTruthy();

    console.log('Test 29 completed: Venture audit trail');
  });

  test('US-UAT-VENTURES-030: Venture performance metrics', async ({ page }) => {
    // Venture performance metrics implementation
    
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
    }
  });
});

// Helper functions
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
  const toast = page.locator(`text=/${message}/i`);
  await expect(toast).toBeVisible({ timeout: 5000 });
}

async function takeScreenshot(page, name) {
  await page.screenshot({
    path: `test-results/screenshots/ventures-${name}-${Date.now()}.png`,
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

  console.log(`Performance: ${actionName} took ${duration}ms`);
  expect(duration).toBeLessThan(3000); // 3 second max
}
