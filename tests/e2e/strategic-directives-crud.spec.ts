/**
 * Strategic Directives CRUD E2E Tests
 *
 * User Story: US-002 (5 pts, 6 hours)
 * Strategic Directive: SD-TESTING-COVERAGE-001
 *
 * Tests comprehensive CRUD operations for Strategic Directives:
 * - Create SD via LEAD agent workflow
 * - Edit SD (title, description, category, priority)
 * - Status transitions (DRAFT → ACTIVE → IN_PROGRESS → COMPLETED)
 * - Soft delete SD
 * - Validation rules (required fields: title, description, category, priority)
 * - Field constraints enforcement
 */

import { test, expect } from '@playwright/test';

const BASE_URL = process.env.BASE_URL || 'http://localhost:8080';
const timestamp = Date.now();

test.describe('Strategic Directives CRUD Operations', () => {
  let testSDId: string;

  test.beforeEach(async ({ page }) => {
    // Navigate to the dashboard
    await page.goto(BASE_URL);
    await page.waitForLoadState('networkidle');
  });

  test.describe('Create Strategic Directive', () => {
    test('should create new SD via LEAD workflow', async ({ page }) => {
      testSDId = `SD-TEST-CRUD-${timestamp}`;

      // Navigate to create SD page/modal
      await page.click('text=New Directive'); // Adjust selector as needed

      // Fill in SD details
      await page.fill('input[name="sd_id"]', testSDId);
      await page.fill('input[name="title"]', 'Test Strategic Directive');
      await page.fill('textarea[name="description"]', 'This is a test strategic directive for CRUD E2E testing');

      // Select category
      await page.selectOption('select[name="category"]', 'testing');

      // Select priority
      await page.selectOption('select[name="priority"]', 'MEDIUM');

      // Submit form
      await page.click('button[type="submit"]');

      // Wait for success message
      await expect(page.locator('text=Created successfully')).toBeVisible({ timeout: 5000 });

      // Verify SD appears in list
      await expect(page.locator(`text=${testSDId}`)).toBeVisible();
    });

    test('should enforce required fields', async ({ page }) => {
      // Navigate to create SD page/modal
      await page.click('text=New Directive');

      // Try to submit without required fields
      await page.click('button[type="submit"]');

      // Should show validation errors
      await expect(page.locator('text=Title is required')).toBeVisible();
      await expect(page.locator('text=Description is required')).toBeVisible();
    });

    test('should validate SD ID format', async ({ page }) => {
      // Navigate to create SD page/modal
      await page.click('text=New Directive');

      // Fill with invalid SD ID format
      await page.fill('input[name="sd_id"]', 'invalid-id-format');
      await page.fill('input[name="title"]', 'Test SD');
      await page.fill('textarea[name="description"]', 'Test description');

      // Submit form
      await page.click('button[type="submit"]');

      // Should show validation error for SD ID format
      await expect(page.locator('text=SD ID must start with "SD-"')).toBeVisible();
    });
  });

  test.describe('Read/View Strategic Directive', () => {
    test('should display SD details', async ({ page }) => {
      // Create a test SD first (using API or UI)
      // For now, assume SD exists from previous test

      // Navigate to SD detail view
      await page.click(`text=${testSDId || 'SD-TEST-CRUD'}`);

      // Verify SD details are displayed
      await expect(page.locator('h1')).toContainText('Test Strategic Directive');
      await expect(page.locator('text=This is a test strategic directive')).toBeVisible();
      await expect(page.locator('text=Status:')).toBeVisible();
      await expect(page.locator('text=Priority:')).toBeVisible();
    });

    test('should display SD list with filters', async ({ page }) => {
      // Apply status filter
      await page.selectOption('select[name="status_filter"]', 'ACTIVE');

      // Verify filtered results
      const activeSDCount = await page.locator('[data-testid="sd-card"]').count();
      expect(activeSDCount).toBeGreaterThan(0);

      // Clear filter
      await page.selectOption('select[name="status_filter"]', 'all');
    });
  });

  test.describe('Update Strategic Directive', () => {
    test('should edit SD title', async ({ page }) => {
      // Navigate to SD edit page
      await page.click(`text=${testSDId || 'SD-TEST-CRUD'}`);
      await page.click('button:has-text("Edit")');

      // Update title
      const newTitle = `Updated Test SD - ${timestamp}`;
      await page.fill('input[name="title"]', newTitle);

      // Save changes
      await page.click('button:has-text("Save")');

      // Verify update
      await expect(page.locator('text=Updated successfully')).toBeVisible({ timeout: 5000 });
      await expect(page.locator('h1')).toContainText(newTitle);
    });

    test('should edit SD description', async ({ page }) => {
      // Navigate to SD edit page
      await page.click(`text=${testSDId || 'SD-TEST-CRUD'}`);
      await page.click('button:has-text("Edit")');

      // Update description
      const newDescription = `Updated description at ${new Date().toISOString()}`;
      await page.fill('textarea[name="description"]', newDescription);

      // Save changes
      await page.click('button:has-text("Save")');

      // Verify update
      await expect(page.locator('text=Updated successfully')).toBeVisible({ timeout: 5000 });
      await expect(page.locator(`text=${newDescription}`)).toBeVisible();
    });

    test('should change SD category', async ({ page }) => {
      // Navigate to SD edit page
      await page.click(`text=${testSDId || 'SD-TEST-CRUD'}`);
      await page.click('button:has-text("Edit")');

      // Change category
      await page.selectOption('select[name="category"]', 'infrastructure');

      // Save changes
      await page.click('button:has-text("Save")');

      // Verify update
      await expect(page.locator('text=Updated successfully')).toBeVisible({ timeout: 5000 });
      await expect(page.locator('text=Category: infrastructure')).toBeVisible();
    });

    test('should change SD priority', async ({ page }) => {
      // Navigate to SD edit page
      await page.click(`text=${testSDId || 'SD-TEST-CRUD'}`);
      await page.click('button:has-text("Edit")');

      // Change priority
      await page.selectOption('select[name="priority"]', 'HIGH');

      // Save changes
      await page.click('button:has-text("Save")');

      // Verify update
      await expect(page.locator('text=Updated successfully')).toBeVisible({ timeout: 5000 });
      await expect(page.locator('text=Priority: HIGH')).toBeVisible();
    });
  });

  test.describe('Status Transitions', () => {
    test('should transition from DRAFT to ACTIVE', async ({ page }) => {
      // Navigate to SD detail page
      await page.click(`text=${testSDId || 'SD-TEST-CRUD'}`);

      // Change status to ACTIVE
      await page.click('button:has-text("Activate")');

      // Confirm action if there's a confirmation dialog
      await page.click('button:has-text("Confirm")').catch(() => {
        // No confirmation dialog
      });

      // Verify status changed
      await expect(page.locator('text=Status: ACTIVE')).toBeVisible({ timeout: 5000 });
    });

    test('should transition from ACTIVE to IN_PROGRESS', async ({ page }) => {
      // Navigate to SD detail page
      await page.click(`text=${testSDId || 'SD-TEST-CRUD'}`);

      // Change status to IN_PROGRESS
      await page.click('button:has-text("Start Progress")');

      // Verify status changed
      await expect(page.locator('text=Status: IN_PROGRESS')).toBeVisible({ timeout: 5000 });
    });

    test('should transition from IN_PROGRESS to COMPLETED', async ({ page }) => {
      // Navigate to SD detail page
      await page.click(`text=${testSDId || 'SD-TEST-CRUD'}`);

      // Change status to COMPLETED
      await page.click('button:has-text("Mark Complete")');

      // Verify status changed
      await expect(page.locator('text=Status: COMPLETED')).toBeVisible({ timeout: 5000 });
    });

    test('should prevent invalid status transitions', async ({ page }) => {
      // Create a new SD in DRAFT status
      const newSDId = `SD-TEST-TRANSITION-${timestamp}`;
      // ... create SD via UI or API ...

      // Try to transition directly to COMPLETED (invalid)
      await page.click(`text=${newSDId}`);

      // Complete button should not be available in DRAFT status
      await expect(page.locator('button:has-text("Mark Complete")')).not.toBeVisible();
    });
  });

  test.describe('Delete Strategic Directive', () => {
    test('should soft delete SD', async ({ page }) => {
      // Create a test SD to delete
      const deleteSDId = `SD-TEST-DELETE-${timestamp}`;
      // ... create SD via UI or API ...

      // Navigate to SD detail page
      await page.click(`text=${deleteSDId}`);

      // Delete SD
      await page.click('button:has-text("Delete")');

      // Confirm deletion
      await page.click('button:has-text("Confirm")');

      // Verify deletion success
      await expect(page.locator('text=Deleted successfully')).toBeVisible({ timeout: 5000 });

      // Verify SD no longer appears in active list
      await expect(page.locator(`text=${deleteSDId}`)).not.toBeVisible();
    });

    test('should show deleted SDs in archive view', async ({ page }) => {
      // Navigate to archive view
      await page.click('text=Show Archived');

      // Deleted SD should appear here
      // (Verify if your app has this feature)
      await expect(page.locator('[data-testid="archived-sd"]')).toBeVisible();
    });

    test('should prevent deletion of SD with active PRDs', async ({ page }) => {
      // Create SD with active PRD
      // ... setup test data ...

      // Try to delete SD
      await page.click('button:has-text("Delete")');

      // Should show error message
      await expect(page.locator('text=Cannot delete SD with active PRDs')).toBeVisible();
    });
  });

  test.describe('Validation Rules', () => {
    test('should enforce title length constraints', async ({ page }) => {
      await page.click('text=New Directive');

      // Try very short title
      await page.fill('input[name="title"]', 'AB');
      await page.click('button[type="submit"]');
      await expect(page.locator('text=Title must be at least 3 characters')).toBeVisible();

      // Try very long title
      const longTitle = 'A'.repeat(256);
      await page.fill('input[name="title"]', longTitle);
      await page.click('button[type="submit"]');
      await expect(page.locator('text=Title must be less than 255 characters')).toBeVisible();
    });

    test('should enforce description length constraints', async ({ page }) => {
      await page.click('text=New Directive');

      // Try very short description
      await page.fill('textarea[name="description"]', 'Short');
      await page.click('button[type="submit"]');
      await expect(page.locator('text=Description must be at least 10 characters')).toBeVisible();
    });

    test('should validate category values', async ({ page }) => {
      await page.click('text=New Directive');

      // Get all category options
      const categories = await page.locator('select[name="category"] option').allTextContents();

      // Verify valid categories
      const validCategories = ['feature', 'bugfix', 'infrastructure', 'testing', 'documentation'];
      validCategories.forEach(cat => {
        expect(categories).toContain(cat);
      });
    });

    test('should validate priority values', async ({ page }) => {
      await page.click('text=New Directive');

      // Get all priority options
      const priorities = await page.locator('select[name="priority"] option').allTextContents();

      // Verify valid priorities
      const validPriorities = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
      validPriorities.forEach(priority => {
        expect(priorities).toContain(priority);
      });
    });
  });

  test.describe('Search and Filter', () => {
    test('should filter SDs by status', async ({ page }) => {
      // Apply ACTIVE filter
      await page.selectOption('select[name="status_filter"]', 'ACTIVE');

      // Get all visible SDs
      const sds = await page.locator('[data-testid="sd-status"]').allTextContents();

      // All should be ACTIVE
      sds.forEach(status => {
        expect(status).toContain('ACTIVE');
      });
    });

    test('should filter SDs by priority', async ({ page }) => {
      // Apply HIGH priority filter
      await page.selectOption('select[name="priority_filter"]', 'HIGH');

      // Get all visible SDs
      const sds = await page.locator('[data-testid="sd-priority"]').allTextContents();

      // All should be HIGH
      sds.forEach(priority => {
        expect(priority).toContain('HIGH');
      });
    });

    test('should search SDs by title', async ({ page }) => {
      // Enter search term
      await page.fill('input[name="search"]', 'Test Strategic Directive');

      // Wait for search results
      await page.waitForTimeout(500);

      // Verify results contain search term
      const titles = await page.locator('[data-testid="sd-title"]').allTextContents();
      titles.forEach(title => {
        expect(title.toLowerCase()).toContain('test strategic directive'.toLowerCase());
      });
    });
  });

  test.afterAll(async ({ page }) => {
    // Cleanup: Delete test SDs
    // This would use API calls or database cleanup
  });
});
