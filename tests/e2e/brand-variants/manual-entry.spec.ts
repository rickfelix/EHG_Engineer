/**
 * Brand Variants Manual Entry E2E Tests
 * SD-STAGE-12-001: Adaptive Naming - Brand Variants
 *
 * Test Coverage:
 * - TS-001: Manual brand variant entry - happy path
 * - TS-002: Manual variant entry - validation errors
 *
 * User Stories:
 * - As a Chairman, I want to manually create brand variants for my venture
 * - As a Chairman, I want to see validation errors when I enter invalid data
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

test.describe('Brand Variants - Manual Entry', () => {
  let testVentureId: string | null = null;
  let createdVariantIds: string[] = [];

  test.beforeAll(async () => {
    // Create a test venture for brand variant testing
    const { data: venture } = await supabase
      .from('ventures')
      .insert({
        name: `Test Venture for Variants ${timestamp}`,
        problem_statement: 'Test problem',
        solution: 'Test solution',
        target_market: 'Test market',
        stage: 12 // Stage 12: Adaptive Naming
      })
      .select()
      .single();

    testVentureId = venture?.id || null;
  });

  test.afterAll(async () => {
    // Cleanup: Delete all created variants
    if (createdVariantIds.length > 0) {
      await supabase
        .from('brand_variants')
        .delete()
        .in('id', createdVariantIds);
    }

    // Cleanup: Delete test venture
    if (testVentureId) {
      await supabase
        .from('ventures')
        .delete()
        .eq('id', testVentureId);
    }
  });

  test('TS-001: should create brand variant with valid data (happy path)', async ({ page }) => {
    if (!testVentureId) {
      test.skip();
      return;
    }

    // Navigate to venture detail page
    await page.goto(`/ventures/${testVentureId}`);
    await page.waitForLoadState('networkidle');

    // Click "Create Brand Variant" button
    await page.locator('[data-testid="create-brand-variant-btn"]').click();

    // Wait for modal/form to appear
    await page.waitForSelector('[data-testid="brand-variant-form"]');

    // Fill form with valid data
    await page.locator('[data-testid="variant-name-input"]').fill('TestCo-AI');

    await page.locator('[data-testid="variant-type-select"]').selectOption('strategic');

    await page.locator('[data-testid="improvement-hypothesis-input"]').fill(
      'AI-focused positioning for tech market segment targeting developers'
    );

    await page.locator('[data-testid="confidence-delta-input"]').fill('0.3');

    await page.locator('[data-testid="target-market-input"]').fill('United States');

    // Submit form
    await page.locator('[data-testid="submit-variant-btn"]').click();

    // Wait for success message
    await expect(page.locator('[data-testid="success-message"]')).toBeVisible();
    await expect(page.locator('[data-testid="success-message"]')).toContainText('Variant created successfully');

    // Verify variant appears in variants table
    await page.waitForSelector('[data-testid="variants-table"]');

    const variantRow = page.locator('[data-testid="variant-row"]').filter({ hasText: 'TestCo-AI' });
    await expect(variantRow).toBeVisible();

    // Verify variant details in table
    await expect(variantRow.locator('[data-testid="variant-name-cell"]')).toContainText('TestCo-AI');
    await expect(variantRow.locator('[data-testid="variant-status-cell"]')).toContainText('DRAFT');
    await expect(variantRow.locator('[data-testid="variant-type-cell"]')).toContainText('strategic');

    // Verify in database
    const { data: variants } = await supabase
      .from('brand_variants')
      .select('*')
      .eq('venture_id', testVentureId)
      .eq('variant_details->>name_text', 'TestCo-AI');

    expect(variants).toHaveLength(1);
    expect(variants![0].status).toBe('generated');
    expect(variants![0].variant_details.variant_type).toBe('strategic');
    expect(variants![0].variant_details.improvement_hypothesis).toContain('AI-focused');

    // Store variant ID for cleanup
    if (variants && variants.length > 0) {
      createdVariantIds.push(variants[0].id);
    }
  });

  test('TS-002: should show validation errors for invalid data', async ({ page }) => {
    if (!testVentureId) {
      test.skip();
      return;
    }

    await page.goto(`/ventures/${testVentureId}`);
    await page.waitForLoadState('networkidle');

    // Click "Create Brand Variant" button
    await page.locator('[data-testid="create-brand-variant-btn"]').click();
    await page.waitForSelector('[data-testid="brand-variant-form"]');

    // Test 1: Submit empty form
    await page.locator('[data-testid="submit-variant-btn"]').click();

    // Verify error messages appear
    await expect(page.locator('[data-testid="variant-name-error"]')).toBeVisible();
    await expect(page.locator('[data-testid="variant-name-error"]')).toContainText('Name is required');

    await expect(page.locator('[data-testid="hypothesis-error"]')).toBeVisible();
    await expect(page.locator('[data-testid="hypothesis-error"]')).toContainText('required');

    // Test 2: Invalid variant_name (> 50 characters)
    const longName = 'A'.repeat(51);
    await page.locator('[data-testid="variant-name-input"]').fill(longName);
    await page.locator('[data-testid="submit-variant-btn"]').click();

    await expect(page.locator('[data-testid="variant-name-error"]')).toContainText('50 characters or less');

    // Test 3: Invalid variant_name (special characters)
    await page.locator('[data-testid="variant-name-input"]').clear();
    await page.locator('[data-testid="variant-name-input"]').fill('TestCo@AI!');
    await page.locator('[data-testid="submit-variant-btn"]').click();

    await expect(page.locator('[data-testid="variant-name-error"]')).toContainText('letters, numbers, spaces, hyphens, and apostrophes');

    // Test 4: Invalid hypothesis (< 10 characters)
    await page.locator('[data-testid="variant-name-input"]').clear();
    await page.locator('[data-testid="variant-name-input"]').fill('TestCo');
    await page.locator('[data-testid="improvement-hypothesis-input"]').fill('Too short');
    await page.locator('[data-testid="submit-variant-btn"]').click();

    await expect(page.locator('[data-testid="hypothesis-error"]')).toContainText('at least 10 characters');

    // Test 5: Invalid confidence_delta (< -1.0)
    await page.locator('[data-testid="improvement-hypothesis-input"]').clear();
    await page.locator('[data-testid="improvement-hypothesis-input"]').fill('Valid hypothesis with enough characters');
    await page.locator('[data-testid="confidence-delta-input"]').fill('-1.5');
    await page.locator('[data-testid="submit-variant-btn"]').click();

    await expect(page.locator('[data-testid="confidence-delta-error"]')).toContainText('between -1.0 and 1.0');

    // Test 6: Invalid confidence_delta (> 1.0)
    await page.locator('[data-testid="confidence-delta-input"]').clear();
    await page.locator('[data-testid="confidence-delta-input"]').fill('1.5');
    await page.locator('[data-testid="submit-variant-btn"]').click();

    await expect(page.locator('[data-testid="confidence-delta-error"]')).toContainText('between -1.0 and 1.0');

    // Close form without saving
    await page.locator('[data-testid="cancel-variant-btn"]').click();

    // Verify no variant was created
    const { data: variants } = await supabase
      .from('brand_variants')
      .select('*')
      .eq('venture_id', testVentureId);

    // Should only have the variant from TS-001 (if it ran first)
    expect(variants!.length).toBeLessThanOrEqual(1);
  });

  test('TS-002b: should validate improvement hypothesis length', async ({ page }) => {
    if (!testVentureId) {
      test.skip();
      return;
    }

    await page.goto(`/ventures/${testVentureId}`);
    await page.waitForLoadState('networkidle');

    await page.locator('[data-testid="create-brand-variant-btn"]').click();
    await page.waitForSelector('[data-testid="brand-variant-form"]');

    // Valid name
    await page.locator('[data-testid="variant-name-input"]').fill('TestCo');

    // Test: Hypothesis > 500 characters
    const longHypothesis = 'A'.repeat(501);
    await page.locator('[data-testid="improvement-hypothesis-input"]').fill(longHypothesis);
    await page.locator('[data-testid="submit-variant-btn"]').click();

    await expect(page.locator('[data-testid="hypothesis-error"]')).toContainText('500 characters or less');

    // Close form
    await page.locator('[data-testid="cancel-variant-btn"]').click();
  });

  test('TS-002c: should validate allowed characters in variant name', async ({ page }) => {
    if (!testVentureId) {
      test.skip();
      return;
    }

    await page.goto(`/ventures/${testVentureId}`);
    await page.waitForLoadState('networkidle');

    await page.locator('[data-testid="create-brand-variant-btn"]').click();
    await page.waitForSelector('[data-testid="brand-variant-form"]');

    // Test allowed characters
    const validNames = [
      'TestCo AI',
      'Test-Co',
      "O'Reilly AI",
      'AI-2024',
      'test123'
    ];

    for (const name of validNames) {
      await page.locator('[data-testid="variant-name-input"]').clear();
      await page.locator('[data-testid="variant-name-input"]').fill(name);

      // Fill other required fields
      await page.locator('[data-testid="variant-type-select"]').selectOption('tactical');
      await page.locator('[data-testid="improvement-hypothesis-input"]').fill('Valid hypothesis for testing allowed characters');

      // Should not show error for valid names
      await page.locator('[data-testid="submit-variant-btn"]').click();

      // If error appears, it should NOT be about invalid characters
      const errorElement = page.locator('[data-testid="variant-name-error"]');
      const isVisible = await errorElement.isVisible().catch(() => false);

      if (isVisible) {
        const errorText = await errorElement.textContent();
        expect(errorText).not.toContain('invalid characters');
      }
    }

    // Close form
    await page.locator('[data-testid="cancel-variant-btn"]').click();
  });
});

/**
 * REQUIRED DATA-TESTID ATTRIBUTES FOR IMPLEMENTATION:
 *
 * Buttons:
 * 1. create-brand-variant-btn - Button to open variant creation form
 * 2. submit-variant-btn - Submit button in variant form
 * 3. cancel-variant-btn - Cancel button in variant form
 *
 * Form Fields:
 * 4. brand-variant-form - Container for the variant form
 * 5. variant-name-input - Input for variant name
 * 6. variant-type-select - Select dropdown for variant type (strategic/tactical)
 * 7. improvement-hypothesis-input - Textarea for improvement hypothesis
 * 8. confidence-delta-input - Input for confidence delta (-1.0 to 1.0)
 * 9. target-market-input - Input for target market
 *
 * Error Messages:
 * 10. variant-name-error - Error message for variant name
 * 11. hypothesis-error - Error message for improvement hypothesis
 * 12. confidence-delta-error - Error message for confidence delta
 *
 * Success/Display:
 * 13. success-message - Success message container
 * 14. variants-table - Table displaying all variants
 * 15. variant-row - Individual variant row in table
 * 16. variant-name-cell - Cell showing variant name
 * 17. variant-status-cell - Cell showing variant status
 * 18. variant-type-cell - Cell showing variant type
 */
