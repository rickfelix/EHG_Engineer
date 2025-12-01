/**
 * Manual Entry Path E2E Tests
 *
 * User Story: SD-STAGE1-ENTRY-UX-001:US-002 (5 SP)
 * Title: Manual Entry Path
 * Strategic Directive: SD-STAGE1-ENTRY-UX-001
 *
 * As a Chairman, I want to select Manual Idea Entry so that I can describe
 * my venture idea in my own words with full creative freedom.
 *
 * Test Coverage:
 * - AC-1: Navigate from Path Selection to Manual Entry form
 * - AC-2: Form displays all required fields
 * - AC-3: Input is preserved with character count
 * - AC-4: Submit creates venture in Stage 1
 * - AC-5: Validation errors for missing required fields
 * - AC-6: Cancel returns to Path Selection
 */

import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const timestamp = Date.now();

test.describe('US-002: Manual Entry Path', () => {
  let createdVentureIds: string[] = [];

  test.afterAll(async () => {
    // Cleanup created test ventures
    for (const id of createdVentureIds) {
      await supabase.from('ventures').delete().eq('id', id);
    }
  });

  test.beforeEach(async ({ page }) => {
    // Navigate to Manual Entry form via Path Selection
    await page.goto('/ventures');
    await page.waitForLoadState('networkidle');
    await page.locator('[data-testid="create-venture-btn"]').click();
    await page.locator('[data-testid="path-card-manual-entry"]').click();
    await page.locator('[data-testid="path-selector-proceed-btn"]').click();
  });

  test('AC-1: should navigate to Manual Entry form when path selected', async ({ page }) => {
    // Verify we're on the Manual Entry form
    const formContainer = page.locator('[data-testid="manual-entry-form"]');
    await expect(formContainer).toBeVisible();

    // Verify URL indicates manual entry path
    await expect(page).toHaveURL(/\/ventures\/manual-entry|\/ventures\/new\?path=manual/);
  });

  test('AC-2: should display all required form fields', async ({ page }) => {
    // Verify Venture Name field
    const nameInput = page.locator('[data-testid="manual-entry-name-input"]');
    await expect(nameInput).toBeVisible();
    await expect(page.locator('label[for="venture-name"]')).toContainText(/name/i);

    // Verify Problem Statement field
    const problemInput = page.locator('[data-testid="manual-entry-problem-input"]');
    await expect(problemInput).toBeVisible();
    await expect(page.locator('label[for="problem-statement"]')).toContainText(/problem/i);

    // Verify Solution Description field
    const solutionInput = page.locator('[data-testid="manual-entry-solution-input"]');
    await expect(solutionInput).toBeVisible();
    await expect(page.locator('label[for="solution-description"]')).toContainText(/solution/i);

    // Verify Target Market field
    const marketInput = page.locator('[data-testid="manual-entry-market-input"]');
    await expect(marketInput).toBeVisible();
    await expect(page.locator('label[for="target-market"]')).toContainText(/market/i);
  });

  test('AC-3: should preserve input and show character count', async ({ page }) => {
    const testText = 'Test venture idea with detailed problem statement';

    // Type in problem statement
    const problemInput = page.locator('[data-testid="manual-entry-problem-input"]');
    await problemInput.fill(testText);

    // Verify input preserved
    await expect(problemInput).toHaveValue(testText);

    // Verify character count displayed
    const charCount = page.locator('[data-testid="problem-char-count"]');
    await expect(charCount).toContainText(testText.length.toString());
  });

  test('AC-4: should create venture in Stage 1 on valid submission', async ({ page }) => {
    const ventureName = `E2E Test Venture ${timestamp}`;

    // Fill all required fields
    await page.locator('[data-testid="manual-entry-name-input"]').fill(ventureName);
    await page.locator('[data-testid="manual-entry-problem-input"]').fill('Test problem statement for E2E testing');
    await page.locator('[data-testid="manual-entry-solution-input"]').fill('Test solution description for E2E testing');
    await page.locator('[data-testid="manual-entry-market-input"]').fill('E2E Test Market');

    // Submit form
    const submitButton = page.locator('[data-testid="manual-entry-submit-btn"]');
    await submitButton.click();

    // Wait for submission to complete
    await page.waitForURL(/\/ventures\/[a-zA-Z0-9-]+|\/ventures.*success/);

    // Verify success message or redirect to venture page
    const successIndicator = page.locator('[data-testid="venture-created-success"]');
    await expect(successIndicator).toBeVisible({ timeout: 10000 });

    // Verify venture created in database with Stage 1
    const { data: venture } = await supabase
      .from('ventures')
      .select('*')
      .eq('name', ventureName)
      .single();

    expect(venture).toBeTruthy();
    expect(venture.stage).toBe(1);
    expect(venture.origin_type).toBe('manual');

    // Track for cleanup
    if (venture) createdVentureIds.push(venture.id);
  });

  test('AC-5: should show validation errors for missing required fields', async ({ page }) => {
    // Attempt to submit with empty form
    const submitButton = page.locator('[data-testid="manual-entry-submit-btn"]');
    await submitButton.click();

    // Verify validation errors displayed
    const nameError = page.locator('[data-testid="error-venture-name"]');
    await expect(nameError).toBeVisible();
    await expect(nameError).toContainText(/required|empty|enter/i);

    const problemError = page.locator('[data-testid="error-problem-statement"]');
    await expect(problemError).toBeVisible();

    const solutionError = page.locator('[data-testid="error-solution-description"]');
    await expect(solutionError).toBeVisible();

    const marketError = page.locator('[data-testid="error-target-market"]');
    await expect(marketError).toBeVisible();

    // Verify URL hasn't changed (form not submitted)
    await expect(page).toHaveURL(/\/ventures\/manual-entry|\/ventures\/new\?path=manual/);
  });

  test('AC-6: should return to Path Selection on Cancel (empty form)', async ({ page }) => {
    // Click cancel without entering data
    const cancelButton = page.locator('[data-testid="manual-entry-cancel-btn"]');
    await cancelButton.click();

    // Verify returned to Path Selection
    const pathSelector = page.locator('[data-testid="path-selector-screen"]');
    await expect(pathSelector).toBeVisible();
  });

  test('should show confirmation before leaving with unsaved data', async ({ page }) => {
    // Enter some data
    await page.locator('[data-testid="manual-entry-name-input"]').fill('Unsaved venture');

    // Click cancel
    const cancelButton = page.locator('[data-testid="manual-entry-cancel-btn"]');
    await cancelButton.click();

    // Verify confirmation dialog appears
    const confirmDialog = page.locator('[data-testid="unsaved-changes-dialog"]');
    await expect(confirmDialog).toBeVisible();

    // Confirm leaving
    await page.locator('[data-testid="confirm-leave-btn"]').click();

    // Verify returned to Path Selection
    const pathSelector = page.locator('[data-testid="path-selector-screen"]');
    await expect(pathSelector).toBeVisible();
  });

  test('should show loading state during form submission', async ({ page }) => {
    // Fill required fields
    await page.locator('[data-testid="manual-entry-name-input"]').fill(`Loading Test ${timestamp}`);
    await page.locator('[data-testid="manual-entry-problem-input"]').fill('Test problem');
    await page.locator('[data-testid="manual-entry-solution-input"]').fill('Test solution');
    await page.locator('[data-testid="manual-entry-market-input"]').fill('Test market');

    // Submit and immediately check for loading state
    const submitButton = page.locator('[data-testid="manual-entry-submit-btn"]');
    await submitButton.click();

    // Verify loading indicator visible
    const loadingIndicator = page.locator('[data-testid="manual-entry-loading"]');
    await expect(loadingIndicator).toBeVisible();

    // Verify submit button disabled during submission
    await expect(submitButton).toBeDisabled();
  });

  test('should handle submission error gracefully', async ({ page }) => {
    // Mock network error by intercepting request
    await page.route('**/api/ventures', (route) => {
      route.abort('failed');
    });

    // Fill required fields
    await page.locator('[data-testid="manual-entry-name-input"]').fill(`Error Test ${timestamp}`);
    await page.locator('[data-testid="manual-entry-problem-input"]').fill('Test problem');
    await page.locator('[data-testid="manual-entry-solution-input"]').fill('Test solution');
    await page.locator('[data-testid="manual-entry-market-input"]').fill('Test market');

    // Submit form
    await page.locator('[data-testid="manual-entry-submit-btn"]').click();

    // Verify error message displayed
    const errorMessage = page.locator('[data-testid="submission-error-message"]');
    await expect(errorMessage).toBeVisible();
    await expect(errorMessage).toContainText(/error|failed|try again/i);
  });
});

/**
 * Required data-testid Attributes for Component Implementation:
 *
 * Form Container:
 * 1. manual-entry-form - Main form container
 *
 * Input Fields:
 * 2. manual-entry-name-input - Venture name input field
 * 3. manual-entry-problem-input - Problem statement textarea
 * 4. manual-entry-solution-input - Solution description textarea
 * 5. manual-entry-market-input - Target market input field
 *
 * Character Counts:
 * 6. problem-char-count - Character count for problem field
 * 7. solution-char-count - Character count for solution field
 *
 * Buttons:
 * 8. manual-entry-submit-btn - Form submit button
 * 9. manual-entry-cancel-btn - Cancel/back button
 *
 * Error States:
 * 10. error-venture-name - Name field validation error
 * 11. error-problem-statement - Problem field validation error
 * 12. error-solution-description - Solution field validation error
 * 13. error-target-market - Market field validation error
 * 14. submission-error-message - API/submission error message
 *
 * Loading/Success States:
 * 15. manual-entry-loading - Loading spinner during submission
 * 16. venture-created-success - Success message/indicator
 *
 * Confirmation Dialog:
 * 17. unsaved-changes-dialog - Dialog for unsaved changes warning
 * 18. confirm-leave-btn - Confirm leaving without saving
 */
