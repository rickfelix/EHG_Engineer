/**
 * Brand Variants Table Operations E2E Tests
 * SD-STAGE-12-001: Adaptive Naming - Brand Variants
 *
 * Test Coverage:
 * - TS-011: Variants table - filtering by status
 * - TS-012: Variants table - sorting by confidence_delta
 * - TS-013: Variants table - pagination
 *
 * User Stories:
 * - As a Chairman, I want to filter variants by status to focus on specific workflow stages
 * - As a Chairman, I want to sort variants by confidence to prioritize high-impact names
 * - As a Chairman, I want to paginate through many variants efficiently
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

test.describe('Brand Variants - Table Operations', () => {
  let testVentureId: string | null = null;
  let createdVariantIds: string[] = [];

  test.beforeAll(async () => {
    // Create test venture
    const { data: venture } = await supabase
      .from('ventures')
      .insert({
        name: `Table Ops Test ${timestamp}`,
        problem_statement: 'Test problem',
        solution: 'Test solution',
        target_market: 'Test market',
        stage: 12
      })
      .select()
      .single();

    testVentureId = venture?.id || null;

    // Create multiple test variants with different statuses
    if (testVentureId) {
      const variantsToCreate = [
        {
          name_text: 'VariantA',
          status: 'generated',
          confidence_delta: 0.8,
          variant_type: 'STRATEGIC_REALIGNMENT'
        },
        {
          name_text: 'VariantB',
          status: 'under_evaluation',
          confidence_delta: 0.5,
          variant_type: 'SEMANTIC_ENHANCEMENT'
        },
        {
          name_text: 'VariantC',
          status: 'market_testing',
          confidence_delta: 0.3,
          variant_type: 'PHONETIC_ADJUSTMENT'
        },
        {
          name_text: 'VariantD',
          status: 'approved',
          confidence_delta: 0.9,
          variant_type: 'STRATEGIC_REALIGNMENT'
        },
        {
          name_text: 'VariantE',
          status: 'rejected',
          confidence_delta: 0.1,
          variant_type: 'LENGTH_OPTIMIZATION'
        },
        {
          name_text: 'VariantF',
          status: 'generated',
          confidence_delta: 0.6,
          variant_type: 'CULTURAL_LOCALIZATION'
        },
        {
          name_text: 'VariantG',
          status: 'market_testing',
          confidence_delta: 0.7,
          variant_type: 'AVAILABILITY_ALTERNATIVE'
        }
      ];

      for (const v of variantsToCreate) {
        const { data } = await supabase
          .from('brand_variants')
          .insert({
            venture_id: testVentureId,
            created_by: '00000000-0000-0000-0000-000000000000',
            variant_details: {
              name_text: v.name_text,
              generation_cycle: 1,
              adaptation_timestamp: new Date().toISOString(),
              adaptation_reason: 'AVAILABILITY_OPPORTUNITY',
              variant_type: v.variant_type,
              improvement_hypothesis: `Hypothesis for ${v.name_text}`,
              confidence_delta: v.confidence_delta
            },
            status: v.status
          })
          .select()
          .single();

        if (data) createdVariantIds.push(data.id);
      }
    }
  });

  test.afterAll(async () => {
    if (createdVariantIds.length > 0) {
      await supabase.from('brand_variants').delete().in('id', createdVariantIds);
    }
    if (testVentureId) {
      await supabase.from('ventures').delete().eq('id', testVentureId);
    }
  });

  test('TS-011: should filter variants by status', async ({ page }) => {
    if (!testVentureId) {
      test.skip();
      return;
    }

    await page.goto(`/ventures/${testVentureId}`);
    await page.waitForLoadState('networkidle');

    // Wait for variants table to load
    await page.waitForSelector('[data-testid="variants-table"]');

    // Verify all variants initially shown
    const initialRows = page.locator('[data-testid="variant-row"]');
    const initialCount = await initialRows.count();
    expect(initialCount).toBe(7);

    // Apply filter: MARKET_TESTING status
    await page.locator('[data-testid="status-filter-dropdown"]').click();
    await page.locator('[data-testid="status-filter-option-market_testing"]').click();

    // Verify only market_testing variants shown
    await page.waitForTimeout(500); // Allow filter to apply
    const filteredRows = page.locator('[data-testid="variant-row"]');
    const filteredCount = await filteredRows.count();
    expect(filteredCount).toBe(2); // VariantC and VariantG

    // Verify both filtered variants have correct status
    for (let i = 0; i < filteredCount; i++) {
      const row = filteredRows.nth(i);
      await expect(row.locator('[data-testid="variant-status-cell"]')).toContainText('market_testing');
    }

    // Clear filter
    await page.locator('[data-testid="clear-status-filter-btn"]').click();

    // Verify all variants shown again
    await page.waitForTimeout(500);
    const clearedCount = await initialRows.count();
    expect(clearedCount).toBe(7);

    // Apply filter: APPROVED status
    await page.locator('[data-testid="status-filter-dropdown"]').click();
    await page.locator('[data-testid="status-filter-option-approved"]').click();

    await page.waitForTimeout(500);
    const approvedRows = page.locator('[data-testid="variant-row"]');
    const approvedCount = await approvedRows.count();
    expect(approvedCount).toBe(1); // Only VariantD

    await expect(approvedRows.first().locator('[data-testid="variant-name-cell"]')).toContainText('VariantD');
  });

  test('TS-011b: should filter variants by multiple statuses', async ({ page }) => {
    if (!testVentureId) {
      test.skip();
      return;
    }

    await page.goto(`/ventures/${testVentureId}`);
    await page.waitForLoadState('networkidle');

    // Apply multi-select filter: generated OR under_evaluation
    await page.locator('[data-testid="status-filter-dropdown"]').click();
    await page.locator('[data-testid="status-filter-option-generated"]').click();
    await page.locator('[data-testid="status-filter-option-under_evaluation"]').click();

    await page.waitForTimeout(500);
    const filteredRows = page.locator('[data-testid="variant-row"]');
    const filteredCount = await filteredRows.count();
    expect(filteredCount).toBe(3); // VariantA, VariantB, VariantF

    // Verify status badge shows active filters
    await expect(page.locator('[data-testid="active-filters-badge"]')).toContainText('2 filters');
  });

  test('TS-012: should sort variants by confidence_delta ascending', async ({ page }) => {
    if (!testVentureId) {
      test.skip();
      return;
    }

    await page.goto(`/ventures/${testVentureId}`);
    await page.waitForLoadState('networkidle');

    // Click confidence_delta column header
    await page.locator('[data-testid="sort-confidence-delta-header"]').click();

    // Wait for sort to apply
    await page.waitForTimeout(500);

    // Verify ascending order (0.1, 0.3, 0.5, 0.6, 0.7, 0.8, 0.9)
    const variantRows = page.locator('[data-testid="variant-row"]');
    const firstVariant = variantRows.first();
    const lastVariant = variantRows.last();

    // First should be VariantE (0.1)
    await expect(firstVariant.locator('[data-testid="variant-name-cell"]')).toContainText('VariantE');

    // Last should be VariantD (0.9)
    await expect(lastVariant.locator('[data-testid="variant-name-cell"]')).toContainText('VariantD');

    // Verify sort indicator shows ascending
    await expect(page.locator('[data-testid="sort-confidence-delta-indicator"]')).toHaveClass(/ascending/);
  });

  test('TS-012b: should sort variants by confidence_delta descending', async ({ page }) => {
    if (!testVentureId) {
      test.skip();
      return;
    }

    await page.goto(`/ventures/${testVentureId}`);
    await page.waitForLoadState('networkidle');

    // Click confidence_delta column header twice (ascending then descending)
    await page.locator('[data-testid="sort-confidence-delta-header"]').click();
    await page.waitForTimeout(300);
    await page.locator('[data-testid="sort-confidence-delta-header"]').click();

    await page.waitForTimeout(500);

    // Verify descending order (0.9, 0.8, 0.7, 0.6, 0.5, 0.3, 0.1)
    const variantRows = page.locator('[data-testid="variant-row"]');
    const firstVariant = variantRows.first();
    const lastVariant = variantRows.last();

    // First should be VariantD (0.9)
    await expect(firstVariant.locator('[data-testid="variant-name-cell"]')).toContainText('VariantD');

    // Last should be VariantE (0.1)
    await expect(lastVariant.locator('[data-testid="variant-name-cell"]')).toContainText('VariantE');

    // Verify sort indicator shows descending
    await expect(page.locator('[data-testid="sort-confidence-delta-indicator"]')).toHaveClass(/descending/);
  });

  test('TS-012c: should sort variants by created_at (newest first)', async ({ page }) => {
    if (!testVentureId) {
      test.skip();
      return;
    }

    await page.goto(`/ventures/${testVentureId}`);
    await page.waitForLoadState('networkidle');

    // Default sort should be created_at descending (newest first)
    await page.locator('[data-testid="sort-created-at-header"]').click();

    await page.waitForTimeout(500);

    // Verify newest variants at top (VariantG created last)
    const variantRows = page.locator('[data-testid="variant-row"]');
    const firstVariant = variantRows.first();

    await expect(firstVariant.locator('[data-testid="variant-name-cell"]')).toContainText('VariantG');
  });

  test('TS-013: should paginate through variants (25 per page)', async ({ page }) => {
    if (!testVentureId) {
      test.skip();
      return;
    }

    // Create 30 additional variants for pagination test
    const additionalVariants = [];
    for (let i = 1; i <= 30; i++) {
      const { data } = await supabase
        .from('brand_variants')
        .insert({
          venture_id: testVentureId,
          created_by: '00000000-0000-0000-0000-000000000000',
          variant_details: {
            name_text: `PaginationTest${i}`,
            generation_cycle: 1,
            adaptation_timestamp: new Date().toISOString(),
            adaptation_reason: 'AVAILABILITY_OPPORTUNITY',
            variant_type: 'SEMANTIC_ENHANCEMENT',
            improvement_hypothesis: `Pagination test variant ${i}`
          },
          status: 'generated'
        })
        .select()
        .single();

      if (data) additionalVariants.push(data.id);
    }

    // Now we have 37 total variants (7 original + 30 new)

    await page.goto(`/ventures/${testVentureId}`);
    await page.waitForLoadState('networkidle');

    // Select 25 per page
    await page.locator('[data-testid="page-size-dropdown"]').selectOption('25');

    await page.waitForTimeout(500);

    // Verify page 1 shows 25 variants
    const page1Rows = page.locator('[data-testid="variant-row"]');
    const page1Count = await page1Rows.count();
    expect(page1Count).toBe(25);

    // Verify pagination controls
    await expect(page.locator('[data-testid="pagination-info"]')).toContainText('1-25 of 37');
    await expect(page.locator('[data-testid="next-page-btn"]')).toBeEnabled();
    await expect(page.locator('[data-testid="prev-page-btn"]')).toBeDisabled();

    // Click "Next" to go to page 2
    await page.locator('[data-testid="next-page-btn"]').click();

    await page.waitForTimeout(500);

    // Verify page 2 shows remaining 12 variants
    const page2Rows = page.locator('[data-testid="variant-row"]');
    const page2Count = await page2Rows.count();
    expect(page2Count).toBe(12);

    // Verify pagination info updated
    await expect(page.locator('[data-testid="pagination-info"]')).toContainText('26-37 of 37');
    await expect(page.locator('[data-testid="next-page-btn"]')).toBeDisabled();
    await expect(page.locator('[data-testid="prev-page-btn"]')).toBeEnabled();

    // Click "Previous" to go back to page 1
    await page.locator('[data-testid="prev-page-btn"]').click();

    await page.waitForTimeout(500);

    // Verify back on page 1
    const backToPage1Count = await page1Rows.count();
    expect(backToPage1Count).toBe(25);

    // Cleanup additional variants
    await supabase.from('brand_variants').delete().in('id', additionalVariants);
  });

  test('TS-013b: should change page size dynamically', async ({ page }) => {
    if (!testVentureId) {
      test.skip();
      return;
    }

    await page.goto(`/ventures/${testVentureId}`);
    await page.waitForLoadState('networkidle');

    // Default: 10 per page
    await page.locator('[data-testid="page-size-dropdown"]').selectOption('10');
    await page.waitForTimeout(500);

    const rows10 = page.locator('[data-testid="variant-row"]');
    const count10 = await rows10.count();
    expect(count10).toBe(7); // Only 7 variants total

    // Change to 5 per page
    await page.locator('[data-testid="page-size-dropdown"]').selectOption('5');
    await page.waitForTimeout(500);

    const rows5 = page.locator('[data-testid="variant-row"]');
    const count5 = await rows5.count();
    expect(count5).toBe(5);

    // Verify pagination shows 2 pages
    await expect(page.locator('[data-testid="pagination-info"]')).toContainText('1-5 of 7');
    await expect(page.locator('[data-testid="next-page-btn"]')).toBeEnabled();
  });

  test('TS-013c: should persist filter and sort across pagination', async ({ page }) => {
    if (!testVentureId) {
      test.skip();
      return;
    }

    // Create additional variants with specific status for this test
    const testVariants = [];
    for (let i = 1; i <= 15; i++) {
      const { data } = await supabase
        .from('brand_variants')
        .insert({
          venture_id: testVentureId,
          created_by: '00000000-0000-0000-0000-000000000000',
          variant_details: {
            name_text: `FilteredPaginationTest${i}`,
            generation_cycle: 1,
            adaptation_timestamp: new Date().toISOString(),
            adaptation_reason: 'AVAILABILITY_OPPORTUNITY',
            variant_type: 'SEMANTIC_ENHANCEMENT',
            improvement_hypothesis: `Test variant ${i}`,
            confidence_delta: Math.random()
          },
          status: 'generated'
        })
        .select()
        .single();

      if (data) testVariants.push(data.id);
    }

    await page.goto(`/ventures/${testVentureId}`);
    await page.waitForLoadState('networkidle');

    // Apply filter: generated status
    await page.locator('[data-testid="status-filter-dropdown"]').click();
    await page.locator('[data-testid="status-filter-option-generated"]').click();
    await page.waitForTimeout(500);

    // Apply sort: confidence_delta descending
    await page.locator('[data-testid="sort-confidence-delta-header"]').click();
    await page.waitForTimeout(300);
    await page.locator('[data-testid="sort-confidence-delta-header"]').click();
    await page.waitForTimeout(500);

    // Set page size to 10
    await page.locator('[data-testid="page-size-dropdown"]').selectOption('10');
    await page.waitForTimeout(500);

    // Go to page 2
    await page.locator('[data-testid="next-page-btn"]').click();
    await page.waitForTimeout(500);

    // Verify filter and sort still applied on page 2
    const page2Rows = page.locator('[data-testid="variant-row"]');
    for (let i = 0; i < Math.min(await page2Rows.count(), 5); i++) {
      const row = page2Rows.nth(i);
      await expect(row.locator('[data-testid="variant-status-cell"]')).toContainText('generated');
    }

    // Verify sort indicator still shows descending
    await expect(page.locator('[data-testid="sort-confidence-delta-indicator"]')).toHaveClass(/descending/);

    // Cleanup
    await supabase.from('brand_variants').delete().in('id', testVariants);
  });
});

/**
 * REQUIRED DATA-TESTID ATTRIBUTES FOR IMPLEMENTATION:
 *
 * Table Controls:
 * 1. variants-table - Main table container
 * 2. status-filter-dropdown - Dropdown for status filtering
 * 3. status-filter-option-{status} - Individual filter options (generated, approved, etc.)
 * 4. clear-status-filter-btn - Button to clear status filter
 * 5. active-filters-badge - Badge showing number of active filters
 *
 * Sorting:
 * 6. sort-confidence-delta-header - Column header for confidence_delta sorting
 * 7. sort-created-at-header - Column header for created_at sorting
 * 8. sort-confidence-delta-indicator - Icon/indicator showing sort direction
 *
 * Pagination:
 * 9. page-size-dropdown - Dropdown to select page size (10, 25, 50, 100)
 * 10. pagination-info - Display of current page range (e.g., "1-25 of 37")
 * 11. next-page-btn - Button to go to next page
 * 12. prev-page-btn - Button to go to previous page
 *
 * IMPLEMENTATION NOTES:
 * - Default page size: 10 variants per page
 * - Default sort: created_at descending (newest first)
 * - Filter and sort state should persist across pagination
 * - Pagination controls should disable appropriately (first/last page)
 * - Page size options: 10, 25, 50, 100
 */
