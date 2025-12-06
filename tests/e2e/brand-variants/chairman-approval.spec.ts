/**
 * Brand Variants Chairman Approval E2E Tests
 * SD-STAGE-12-001: Adaptive Naming - Brand Variants
 *
 * Test Coverage:
 * - TS-006: Chairman approval - approve variant
 * - TS-007: Chairman approval - reject with feedback
 * - TS-008: Chairman approval - request revision
 *
 * User Stories:
 * - As a Chairman, I want to approve brand variants that meet quality standards
 * - As a Chairman, I want to reject variants with specific feedback
 * - As a Chairman, I want to request revisions to variants
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

test.describe('Brand Variants - Chairman Approval', () => {
  let testVentureId: string | null = null;
  let createdVariantIds: string[] = [];

  test.beforeAll(async () => {
    const { data: venture } = await supabase
      .from('ventures')
      .insert({
        name: `Chairman Approval Test ${timestamp}`,
        problem_statement: 'Test problem',
        solution: 'Test solution',
        target_market: 'Test market',
        stage: 12
      })
      .select()
      .single();

    testVentureId = venture?.id || null;
  });

  test.afterAll(async () => {
    if (createdVariantIds.length > 0) {
      await supabase.from('brand_variants').delete().in('id', createdVariantIds);
    }
    if (testVentureId) {
      await supabase.from('ventures').delete().eq('id', testVentureId);
    }
  });

  test.beforeEach(async () => {
    // Create test variant in AWAITING_APPROVAL status (actually market_testing per schema)
    if (!testVentureId) return;

    const { data: variant } = await supabase
      .from('brand_variants')
      .insert({
        venture_id: testVentureId,
        created_by: '00000000-0000-0000-0000-000000000000',
        variant_details: {
          name_text: `TestVariant-${Date.now()}`,
          generation_cycle: 1,
          adaptation_timestamp: new Date().toISOString(),
          adaptation_reason: 'CHAIRMAN_GUIDANCE',
          variant_type: 'STRATEGIC_REALIGNMENT',
          improvement_hypothesis: 'Brand positioning aligned with chairman vision'
        },
        status: 'market_testing' // Ready for chairman approval
      })
      .select()
      .single();

    if (variant) {
      createdVariantIds.push(variant.id);
    }
  });

  test('TS-006: should approve variant with optional feedback', async ({ page }) => {
    if (!testVentureId) {
      test.skip();
      return;
    }

    // Navigate to venture
    await page.goto(`/ventures/${testVentureId}`);
    await page.waitForLoadState('networkidle');

    // Find variant with market_testing status
    const variantRow = page.locator('[data-testid="variant-row"]')
      .filter({ has: page.locator('[data-testid="variant-status-cell"]:has-text("market_testing")') })
      .first();

    await expect(variantRow).toBeVisible();

    // Click on variant to open chairman approval card
    await variantRow.locator('[data-testid="variant-name-cell"]').click();

    // Wait for approval card to appear
    await page.waitForSelector('[data-testid="chairman-approval-card"]');

    // Verify approval card shows variant details
    await expect(page.locator('[data-testid="approval-card-variant-name"]')).toBeVisible();
    await expect(page.locator('[data-testid="approval-card-hypothesis"]')).toBeVisible();

    // Add optional feedback
    await page.locator('[data-testid="chairman-feedback-input"]').fill('Excellent brand positioning, approved for launch');

    // Click "Approve" button
    await page.locator('[data-testid="approve-variant-btn"]').click();

    // Verify confirmation dialog
    await expect(page.locator('[data-testid="approve-confirmation-dialog"]')).toBeVisible();
    await page.locator('[data-testid="confirm-approve-btn"]').click();

    // Wait for success message
    await expect(page.locator('[data-testid="success-message"]')).toBeVisible();
    await expect(page.locator('[data-testid="success-message"]')).toContainText('Variant approved');

    // Verify status changed to APPROVED
    const updatedRow = variantRow;
    await expect(updatedRow.locator('[data-testid="variant-status-cell"]')).toContainText('approved');

    // Verify approved_at timestamp shown
    await expect(updatedRow.locator('[data-testid="approved-at-display"]')).toBeVisible();

    // Verify in database
    const { data: variant } = await supabase
      .from('brand_variants')
      .select('*')
      .eq('venture_id', testVentureId)
      .eq('status', 'approved')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    expect(variant).toBeDefined();
    expect(variant.status).toBe('approved');
    expect(variant.approved_at).toBeDefined();
    expect(variant.approved_by).toBeDefined();
    expect(variant.chairman_feedback).toContain('Excellent brand positioning');
  });

  test('TS-007: should reject variant with feedback', async ({ page }) => {
    if (!testVentureId) {
      test.skip();
      return;
    }

    await page.goto(`/ventures/${testVentureId}`);
    await page.waitForLoadState('networkidle');

    const variantRow = page.locator('[data-testid="variant-row"]')
      .filter({ has: page.locator('[data-testid="variant-status-cell"]:has-text("market_testing")') })
      .first();

    await variantRow.locator('[data-testid="variant-name-cell"]').click();
    await page.waitForSelector('[data-testid="chairman-approval-card"]');

    // Enter rejection feedback (required)
    await page.locator('[data-testid="chairman-feedback-input"]').fill(
      'Does not align with brand strategy. Need stronger differentiation from competitors.'
    );

    // Click "Reject" button
    await page.locator('[data-testid="reject-variant-btn"]').click();

    // Verify confirmation dialog
    await expect(page.locator('[data-testid="reject-confirmation-dialog"]')).toBeVisible();
    await expect(page.locator('[data-testid="reject-confirmation-dialog"]')).toContainText('permanently rejected');

    await page.locator('[data-testid="confirm-reject-btn"]').click();

    // Wait for success message
    await expect(page.locator('[data-testid="success-message"]')).toBeVisible();
    await expect(page.locator('[data-testid="success-message"]')).toContainText('Variant rejected');

    // Verify status changed to REJECTED
    await expect(variantRow.locator('[data-testid="variant-status-cell"]')).toContainText('rejected');

    // Verify feedback displayed in variant row
    await expect(variantRow.locator('[data-testid="chairman-feedback-preview"]')).toContainText('Does not align');

    // Verify in database
    const { data: variant } = await supabase
      .from('brand_variants')
      .select('*')
      .eq('venture_id', testVentureId)
      .eq('status', 'rejected')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    expect(variant).toBeDefined();
    expect(variant.status).toBe('rejected');
    expect(variant.chairman_feedback).toContain('Does not align with brand strategy');
  });

  test('TS-007b: should require feedback when rejecting', async ({ page }) => {
    if (!testVentureId) {
      test.skip();
      return;
    }

    await page.goto(`/ventures/${testVentureId}`);
    await page.waitForLoadState('networkidle');

    const variantRow = page.locator('[data-testid="variant-row"]')
      .filter({ has: page.locator('[data-testid="variant-status-cell"]:has-text("market_testing")') })
      .first();

    await variantRow.locator('[data-testid="variant-name-cell"]').click();
    await page.waitForSelector('[data-testid="chairman-approval-card"]');

    // Try to reject without feedback
    await page.locator('[data-testid="reject-variant-btn"]').click();

    // Verify error message
    await expect(page.locator('[data-testid="feedback-error"]')).toBeVisible();
    await expect(page.locator('[data-testid="feedback-error"]')).toContainText('Feedback is required');

    // Verify confirmation dialog did not appear
    await expect(page.locator('[data-testid="reject-confirmation-dialog"]')).not.toBeVisible();
  });

  test('TS-008: should request revision and reset status to GENERATED', async ({ page }) => {
    if (!testVentureId) {
      test.skip();
      return;
    }

    await page.goto(`/ventures/${testVentureId}`);
    await page.waitForLoadState('networkidle');

    const variantRow = page.locator('[data-testid="variant-row"]')
      .filter({ has: page.locator('[data-testid="variant-status-cell"]:has-text("market_testing")') })
      .first();

    // Get variant name for verification
    const variantName = await variantRow.locator('[data-testid="variant-name-cell"]').textContent();

    await variantRow.locator('[data-testid="variant-name-cell"]').click();
    await page.waitForSelector('[data-testid="chairman-approval-card"]');

    // Enter revision feedback
    await page.locator('[data-testid="chairman-feedback-input"]').fill(
      'Please refine market positioning and strengthen value proposition'
    );

    // Click "Request Revision" button
    await page.locator('[data-testid="request-revision-btn"]').click();

    // Verify confirmation dialog
    await expect(page.locator('[data-testid="revision-confirmation-dialog"]')).toBeVisible();
    await page.locator('[data-testid="confirm-revision-btn"]').click();

    // Wait for success message
    await expect(page.locator('[data-testid="success-message"]')).toBeVisible();
    await expect(page.locator('[data-testid="success-message"]')).toContainText('Revision requested');

    // Verify status changed back to GENERATED
    await expect(variantRow.locator('[data-testid="variant-status-cell"]')).toContainText('generated');

    // Verify feedback displayed
    await expect(variantRow.locator('[data-testid="chairman-feedback-preview"]')).toContainText('Please refine');

    // Verify variant can be edited again
    await variantRow.locator('[data-testid="edit-variant-btn"]').click();
    await expect(page.locator('[data-testid="brand-variant-form"]')).toBeVisible();
    await expect(page.locator('[data-testid="variant-name-input"]')).toBeEnabled();

    // Verify in database
    const { data: variant } = await supabase
      .from('brand_variants')
      .select('*')
      .eq('venture_id', testVentureId)
      .eq('variant_details->>name_text', variantName)
      .single();

    expect(variant).toBeDefined();
    expect(variant.status).toBe('generated');
    expect(variant.chairman_feedback).toContain('Please refine');
  });

  test('TS-008b: should show revision history', async ({ page }) => {
    if (!testVentureId) {
      test.skip();
      return;
    }

    // Create variant with revision history
    const { data: variant } = await supabase
      .from('brand_variants')
      .insert({
        venture_id: testVentureId,
        created_by: '00000000-0000-0000-0000-000000000000',
        variant_details: {
          name_text: 'Revised Variant',
          generation_cycle: 2, // Second iteration
          adaptation_timestamp: new Date().toISOString(),
          adaptation_reason: 'CHAIRMAN_GUIDANCE',
          variant_type: 'STRATEGIC_REALIGNMENT',
          improvement_hypothesis: 'Revised based on chairman feedback'
        },
        status: 'market_testing',
        notes: 'Revision #1: Strengthened value proposition per chairman feedback'
      })
      .select()
      .single();

    if (variant) {
      createdVariantIds.push(variant.id);
    }

    await page.goto(`/ventures/${testVentureId}`);
    await page.waitForLoadState('networkidle');

    const variantRow = page.locator('[data-testid="variant-row"]')
      .filter({ hasText: 'Revised Variant' });

    await variantRow.locator('[data-testid="variant-name-cell"]').click();
    await page.waitForSelector('[data-testid="chairman-approval-card"]');

    // Verify generation cycle indicator
    await expect(page.locator('[data-testid="generation-cycle-badge"]')).toContainText('Cycle 2');

    // Verify revision notes displayed
    await expect(page.locator('[data-testid="variant-notes"]')).toContainText('Revision #1');
  });
});

/**
 * REQUIRED DATA-TESTID ATTRIBUTES FOR IMPLEMENTATION:
 *
 * Chairman Approval Card:
 * 1. chairman-approval-card - Container for chairman approval UI
 * 2. approval-card-variant-name - Display of variant name in approval card
 * 3. approval-card-hypothesis - Display of improvement hypothesis
 * 4. chairman-feedback-input - Textarea for chairman feedback
 * 5. feedback-error - Error message for missing feedback
 *
 * Action Buttons:
 * 6. approve-variant-btn - Button to approve variant
 * 7. reject-variant-btn - Button to reject variant
 * 8. request-revision-btn - Button to request revision
 *
 * Confirmation Dialogs:
 * 9. approve-confirmation-dialog - Confirmation dialog for approval
 * 10. reject-confirmation-dialog - Confirmation dialog for rejection
 * 11. revision-confirmation-dialog - Confirmation dialog for revision request
 * 12. confirm-approve-btn - Confirm button in approval dialog
 * 13. confirm-reject-btn - Confirm button in rejection dialog
 * 14. confirm-revision-btn - Confirm button in revision dialog
 *
 * Display Elements:
 * 15. approved-at-display - Timestamp when variant was approved
 * 16. chairman-feedback-preview - Preview of chairman feedback in variant row
 * 17. generation-cycle-badge - Badge showing generation cycle number
 * 18. variant-notes - Display of variant notes/history
 * 19. edit-variant-btn - Button to edit variant (enabled for generated status)
 */
