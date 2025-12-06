/**
 * Brand Variants Lifecycle State Transitions E2E Tests
 * SD-STAGE-12-001: Adaptive Naming - Brand Variants
 *
 * Test Coverage:
 * - TS-009: Lifecycle state transitions - valid flow
 * - TS-010: Lifecycle state transitions - invalid prevention
 * - TS-014: Delete variant - editable status only
 *
 * User Stories:
 * - As a system, I want to enforce valid state transitions to maintain data integrity
 * - As a Chairman, I want to delete variants only when they are in draft/editable status
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

test.describe('Brand Variants - Lifecycle State Transitions', () => {
  let testVentureId: string | null = null;
  let createdVariantIds: string[] = [];

  test.beforeAll(async () => {
    const { data: venture } = await supabase
      .from('ventures')
      .insert({
        name: `Lifecycle Test ${timestamp}`,
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

  test('TS-009: should allow valid lifecycle flow (DRAFT → GENERATED → AWAITING_APPROVAL → APPROVED)', async ({ page }) => {
    if (!testVentureId) {
      test.skip();
      return;
    }

    // Navigate to venture
    await page.goto(`/ventures/${testVentureId}`);
    await page.waitForLoadState('networkidle');

    // Step 1: Create variant (starts in DRAFT/generated status)
    await page.locator('[data-testid="create-brand-variant-btn"]').click();
    await page.waitForSelector('[data-testid="brand-variant-form"]');

    await page.locator('[data-testid="variant-name-input"]').fill('LifecycleTestCo');
    await page.locator('[data-testid="variant-type-select"]').selectOption('strategic');
    await page.locator('[data-testid="improvement-hypothesis-input"]').fill(
      'Testing valid lifecycle state transitions through the approval workflow'
    );

    await page.locator('[data-testid="submit-variant-btn"]').click();
    await expect(page.locator('[data-testid="success-message"]')).toBeVisible();

    // Verify initial status: GENERATED
    const variantRow = page.locator('[data-testid="variant-row"]').filter({ hasText: 'LifecycleTestCo' });
    await expect(variantRow.locator('[data-testid="variant-status-cell"]')).toContainText('generated');

    // Store variant ID
    const { data: variant } = await supabase
      .from('brand_variants')
      .select('id')
      .eq('venture_id', testVentureId)
      .eq('variant_details->>name_text', 'LifecycleTestCo')
      .single();

    if (variant) createdVariantIds.push(variant.id);

    // Step 2: Domain check completes → GENERATED (stays same)
    // (In real flow, this might auto-transition, but we'll keep it generated)
    await expect(variantRow.locator('[data-testid="variant-status-cell"]')).toContainText('generated');

    // Step 3: Submit for approval → MARKET_TESTING (awaiting approval)
    await variantRow.locator('[data-testid="submit-for-approval-btn"]').click();
    await expect(page.locator('[data-testid="submit-confirmation-dialog"]')).toBeVisible();
    await page.locator('[data-testid="confirm-submit-btn"]').click();

    await expect(page.locator('[data-testid="success-message"]')).toContainText('Submitted for approval');
    await expect(variantRow.locator('[data-testid="variant-status-cell"]')).toContainText('market_testing');

    // Step 4: Chairman approves → APPROVED
    await variantRow.locator('[data-testid="variant-name-cell"]').click();
    await page.waitForSelector('[data-testid="chairman-approval-card"]');

    await page.locator('[data-testid="chairman-feedback-input"]').fill('Approved for lifecycle test');
    await page.locator('[data-testid="approve-variant-btn"]').click();
    await page.locator('[data-testid="confirm-approve-btn"]').click();

    await expect(page.locator('[data-testid="success-message"]')).toContainText('approved');
    await expect(variantRow.locator('[data-testid="variant-status-cell"]')).toContainText('approved');

    // Verify final state in database
    const { data: finalVariant } = await supabase
      .from('brand_variants')
      .select('*')
      .eq('venture_id', testVentureId)
      .eq('variant_details->>name_text', 'LifecycleTestCo')
      .single();

    expect(finalVariant?.status).toBe('approved');
    expect(finalVariant?.approved_at).toBeDefined();
  });

  test('TS-010: should prevent invalid transition (DRAFT → APPROVED)', async ({ page }) => {
    if (!testVentureId) {
      test.skip();
      return;
    }

    // Create variant in GENERATED status
    const { data: variant } = await supabase
      .from('brand_variants')
      .insert({
        venture_id: testVentureId,
        created_by: '00000000-0000-0000-0000-000000000000',
        variant_details: {
          name_text: 'InvalidTransitionTest',
          generation_cycle: 1,
          adaptation_timestamp: new Date().toISOString(),
          adaptation_reason: 'AVAILABILITY_OPPORTUNITY',
          variant_type: 'SEMANTIC_ENHANCEMENT',
          improvement_hypothesis: 'Testing invalid state transition prevention'
        },
        status: 'generated'
      })
      .select()
      .single();

    if (variant) createdVariantIds.push(variant.id);

    await page.goto(`/ventures/${testVentureId}`);
    await page.waitForLoadState('networkidle');

    const variantRow = page.locator('[data-testid="variant-row"]').filter({ hasText: 'InvalidTransitionTest' });

    // Try to approve directly from GENERATED status (should fail)
    await variantRow.locator('[data-testid="variant-name-cell"]').click();

    // Verify approval card does not appear or shows error
    const approvalCard = page.locator('[data-testid="chairman-approval-card"]');
    const isVisible = await approvalCard.isVisible().catch(() => false);

    if (isVisible) {
      // If card appears, approve button should be disabled or show error
      const approveBtn = page.locator('[data-testid="approve-variant-btn"]');
      await expect(approveBtn).toBeDisabled();
      await expect(page.locator('[data-testid="approval-error"]')).toContainText('market_testing');
    } else {
      // If card doesn't appear, verify message
      await expect(page.locator('[data-testid="status-transition-error"]')).toBeVisible();
      await expect(page.locator('[data-testid="status-transition-error"]')).toContainText('Cannot approve');
    }
  });

  test('TS-010b: should prevent transition from REJECTED to PROMOTED', async ({ page }) => {
    if (!testVentureId) {
      test.skip();
      return;
    }

    // Create variant in REJECTED status
    const { data: variant } = await supabase
      .from('brand_variants')
      .insert({
        venture_id: testVentureId,
        created_by: '00000000-0000-0000-0000-000000000000',
        variant_details: {
          name_text: 'RejectedVariant',
          generation_cycle: 1,
          adaptation_timestamp: new Date().toISOString(),
          adaptation_reason: 'AVAILABILITY_OPPORTUNITY',
          variant_type: 'SEMANTIC_ENHANCEMENT',
          improvement_hypothesis: 'Testing rejected variant immutability'
        },
        status: 'rejected',
        chairman_feedback: 'Rejected for testing purposes'
      })
      .select()
      .single();

    if (variant) createdVariantIds.push(variant.id);

    await page.goto(`/ventures/${testVentureId}`);
    await page.waitForLoadState('networkidle');

    const variantRow = page.locator('[data-testid="variant-row"]').filter({ hasText: 'RejectedVariant' });

    // Verify status is REJECTED
    await expect(variantRow.locator('[data-testid="variant-status-cell"]')).toContainText('rejected');

    // Verify no action buttons available (terminal state)
    await expect(variantRow.locator('[data-testid="submit-for-approval-btn"]')).not.toBeVisible();
    await expect(variantRow.locator('[data-testid="promote-variant-btn"]')).not.toBeVisible();
    await expect(variantRow.locator('[data-testid="edit-variant-btn"]')).not.toBeVisible();

    // Click variant to view details
    await variantRow.locator('[data-testid="variant-name-cell"]').click();

    // Verify terminal state message
    await expect(page.locator('[data-testid="terminal-state-notice"]')).toBeVisible();
    await expect(page.locator('[data-testid="terminal-state-notice"]')).toContainText('rejected');
  });

  test('TS-014: should delete variant in DRAFT/GENERATED status', async ({ page }) => {
    if (!testVentureId) {
      test.skip();
      return;
    }

    // Create variant in GENERATED status
    const { data: variant } = await supabase
      .from('brand_variants')
      .insert({
        venture_id: testVentureId,
        created_by: '00000000-0000-0000-0000-000000000000',
        variant_details: {
          name_text: 'DeletableVariant',
          generation_cycle: 1,
          adaptation_timestamp: new Date().toISOString(),
          adaptation_reason: 'AVAILABILITY_OPPORTUNITY',
          variant_type: 'SEMANTIC_ENHANCEMENT',
          improvement_hypothesis: 'This variant will be deleted in test'
        },
        status: 'generated'
      })
      .select()
      .single();

    const variantId = variant?.id;

    await page.goto(`/ventures/${testVentureId}`);
    await page.waitForLoadState('networkidle');

    const variantRow = page.locator('[data-testid="variant-row"]').filter({ hasText: 'DeletableVariant' });

    // Verify delete button is visible for generated status
    await expect(variantRow.locator('[data-testid="delete-variant-btn"]')).toBeVisible();
    await expect(variantRow.locator('[data-testid="delete-variant-btn"]')).toBeEnabled();

    // Click delete
    await variantRow.locator('[data-testid="delete-variant-btn"]').click();

    // Verify confirmation dialog
    await expect(page.locator('[data-testid="delete-confirmation-dialog"]')).toBeVisible();
    await expect(page.locator('[data-testid="delete-confirmation-dialog"]')).toContainText('DeletableVariant');
    await expect(page.locator('[data-testid="delete-confirmation-dialog"]')).toContainText('cannot be undone');

    await page.locator('[data-testid="confirm-delete-btn"]').click();

    // Verify success message
    await expect(page.locator('[data-testid="success-message"]')).toContainText('deleted');

    // Verify variant removed from table
    await expect(variantRow).not.toBeVisible();

    // Verify in database
    const { data: deletedVariant } = await supabase
      .from('brand_variants')
      .select('*')
      .eq('id', variantId!)
      .single();

    expect(deletedVariant).toBeNull();
  });

  test('TS-014b: should prevent deletion of APPROVED variant', async ({ page }) => {
    if (!testVentureId) {
      test.skip();
      return;
    }

    // Create variant in APPROVED status
    const { data: variant } = await supabase
      .from('brand_variants')
      .insert({
        venture_id: testVentureId,
        created_by: '00000000-0000-0000-0000-000000000000',
        variant_details: {
          name_text: 'ApprovedVariant',
          generation_cycle: 1,
          adaptation_timestamp: new Date().toISOString(),
          adaptation_reason: 'CHAIRMAN_GUIDANCE',
          variant_type: 'STRATEGIC_REALIGNMENT',
          improvement_hypothesis: 'Approved variant should not be deletable'
        },
        status: 'approved',
        approved_at: new Date().toISOString(),
        approved_by: '00000000-0000-0000-0000-000000000001'
      })
      .select()
      .single();

    if (variant) createdVariantIds.push(variant.id);

    await page.goto(`/ventures/${testVentureId}`);
    await page.waitForLoadState('networkidle');

    const variantRow = page.locator('[data-testid="variant-row"]').filter({ hasText: 'ApprovedVariant' });

    // Verify delete button is NOT visible or is disabled
    const deleteBtn = variantRow.locator('[data-testid="delete-variant-btn"]');
    const isVisible = await deleteBtn.isVisible().catch(() => false);

    if (isVisible) {
      await expect(deleteBtn).toBeDisabled();
    } else {
      await expect(deleteBtn).not.toBeVisible();
    }

    // If user tries to delete via API, verify error
    const { error } = await supabase
      .from('brand_variants')
      .delete()
      .eq('id', variant.id);

    // RLS should prevent deletion
    expect(error).toBeTruthy();
  });

  test('TS-014c: should prevent deletion of PROMOTED variant', async ({ page }) => {
    if (!testVentureId) {
      test.skip();
      return;
    }

    // Create variant in PROMOTED status
    const { data: variant } = await supabase
      .from('brand_variants')
      .insert({
        venture_id: testVentureId,
        created_by: '00000000-0000-0000-0000-000000000000',
        variant_details: {
          name_text: 'PromotedVariant',
          generation_cycle: 1,
          adaptation_timestamp: new Date().toISOString(),
          adaptation_reason: 'PERFORMANCE_OPTIMIZATION',
          variant_type: 'STRATEGIC_REALIGNMENT',
          improvement_hypothesis: 'Promoted variant is active brand name'
        },
        status: 'promoted',
        approved_at: new Date(Date.now() - 86400000).toISOString(), // Yesterday
        approved_by: '00000000-0000-0000-0000-000000000001'
      })
      .select()
      .single();

    if (variant) createdVariantIds.push(variant.id);

    await page.goto(`/ventures/${testVentureId}`);
    await page.waitForLoadState('networkidle');

    const variantRow = page.locator('[data-testid="variant-row"]').filter({ hasText: 'PromotedVariant' });

    // Verify PROMOTED badge displayed
    await expect(variantRow.locator('[data-testid="promoted-badge"]')).toBeVisible();

    // Verify delete button NOT visible
    await expect(variantRow.locator('[data-testid="delete-variant-btn"]')).not.toBeVisible();

    // Verify promoted variant is highlighted
    await expect(variantRow).toHaveClass(/promoted-variant/);
  });
});

/**
 * REQUIRED DATA-TESTID ATTRIBUTES FOR IMPLEMENTATION:
 *
 * Lifecycle Actions:
 * 1. submit-for-approval-btn - Button to submit variant for chairman approval
 * 2. submit-confirmation-dialog - Confirmation dialog for submission
 * 3. confirm-submit-btn - Confirm button in submission dialog
 * 4. promote-variant-btn - Button to promote approved variant
 *
 * Status Indicators:
 * 5. promoted-badge - Badge indicating promoted status
 * 6. terminal-state-notice - Notice for terminal states (rejected/retired)
 * 7. status-transition-error - Error message for invalid transition
 * 8. approval-error - Error message in approval card
 *
 * Delete Operations:
 * 9. delete-variant-btn - Button to delete variant
 * 10. delete-confirmation-dialog - Confirmation dialog for deletion
 * 11. confirm-delete-btn - Confirm button in deletion dialog
 *
 * STATE MACHINE (Valid Transitions):
 * generated → under_evaluation → market_testing → approved → promoted → retired
 *          ↓                    ↓               ↓
 *      rejected              rejected        rejected
 *
 * EDITABLE STATUSES (Deletable):
 * - generated
 * - under_evaluation
 *
 * TERMINAL STATUSES (No further transitions):
 * - rejected
 * - retired
 */
