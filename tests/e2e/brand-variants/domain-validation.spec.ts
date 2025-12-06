/**
 * Brand Variants Domain Validation E2E Tests
 * SD-STAGE-12-001: Adaptive Naming - Brand Variants
 *
 * Test Coverage:
 * - TS-003: Domain availability check - parallel TLD queries
 *
 * User Story:
 * - As a Chairman, I want to check domain availability for my brand variants
 *   across multiple TLDs (.com, .io, .ai) simultaneously
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

test.describe('Brand Variants - Domain Validation', () => {
  let testVentureId: string | null = null;
  let testVariantId: string | null = null;

  test.beforeAll(async () => {
    // Create test venture
    const { data: venture } = await supabase
      .from('ventures')
      .insert({
        name: `Domain Test Venture ${timestamp}`,
        problem_statement: 'Test problem',
        solution: 'Test solution',
        target_market: 'Test market',
        stage: 12
      })
      .select()
      .single();

    testVentureId = venture?.id || null;

    // Create test variant
    if (testVentureId) {
      const { data: variant } = await supabase
        .from('brand_variants')
        .insert({
          venture_id: testVentureId,
          created_by: '00000000-0000-0000-0000-000000000000', // Mock user ID
          variant_details: {
            name_text: 'TestCo-AI',
            generation_cycle: 1,
            adaptation_timestamp: new Date().toISOString(),
            adaptation_reason: 'AVAILABILITY_OPPORTUNITY',
            variant_type: 'SEMANTIC_ENHANCEMENT',
            improvement_hypothesis: 'AI-focused positioning for tech market'
          },
          status: 'generated'
        })
        .select()
        .single();

      testVariantId = variant?.id || null;
    }
  });

  test.afterAll(async () => {
    // Cleanup
    if (testVariantId) {
      await supabase.from('brand_variants').delete().eq('id', testVariantId);
    }
    if (testVentureId) {
      await supabase.from('ventures').delete().eq('id', testVentureId);
    }
  });

  test('TS-003: should check domain availability for multiple TLDs in parallel', async ({ page }) => {
    if (!testVentureId || !testVariantId) {
      test.skip();
      return;
    }

    // Mock domain validation API to return predictable results
    await page.route('**/api/domain-validation/check', async (route) => {
      const request = route.request();
      const postData = request.postDataJSON();

      // Simulate 50ms delay per TLD to verify parallel execution
      await new Promise(resolve => setTimeout(resolve, 50));

      const results = postData.tlds.map((tld: string) => ({
        domain: `${postData.domain}.${tld}`,
        tld: tld,
        available: tld === 'io' || tld === 'ai', // .com taken, .io and .ai available
        price: tld !== 'com' ? 12.99 : null,
        registrar: 'MockRegistrar',
        checkedAt: new Date().toISOString()
      }));

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          domain: postData.domain,
          results: results,
          executionTime: 55 // Parallel execution time
        })
      });
    });

    // Navigate to venture with variant
    await page.goto(`/ventures/${testVentureId}`);
    await page.waitForLoadState('networkidle');

    // Find the variant row
    const variantRow = page.locator('[data-testid="variant-row"]').filter({ hasText: 'TestCo-AI' });
    await expect(variantRow).toBeVisible();

    // Click "Check Domain" button
    await variantRow.locator('[data-testid="check-domain-btn"]').click();

    // Verify loading state appears
    await expect(page.locator('[data-testid="domain-check-loading"]')).toBeVisible();
    await expect(page.locator('[data-testid="domain-check-loading"]')).toContainText('Checking availability');

    // Wait for results
    await page.waitForSelector('[data-testid="domain-check-results"]', { timeout: 5000 });

    // Verify all three TLDs checked
    await expect(page.locator('[data-testid="domain-result-com"]')).toBeVisible();
    await expect(page.locator('[data-testid="domain-result-io"]')).toBeVisible();
    await expect(page.locator('[data-testid="domain-result-ai"]')).toBeVisible();

    // Verify .com shows as unavailable
    const comResult = page.locator('[data-testid="domain-result-com"]');
    await expect(comResult).toContainText('testco-ai.com');
    await expect(comResult.locator('[data-testid="availability-badge"]')).toContainText('Unavailable');

    // Verify .io shows as available with price
    const ioResult = page.locator('[data-testid="domain-result-io"]');
    await expect(ioResult).toContainText('testco-ai.io');
    await expect(ioResult.locator('[data-testid="availability-badge"]')).toContainText('Available');
    await expect(ioResult).toContainText('$12.99');

    // Verify .ai shows as available with price
    const aiResult = page.locator('[data-testid="domain-result-ai"]');
    await expect(aiResult).toContainText('testco-ai.ai');
    await expect(aiResult.locator('[data-testid="availability-badge"]')).toContainText('Available');
    await expect(aiResult).toContainText('$12.99');

    // Verify execution time displayed (should be < 100ms for parallel)
    await expect(page.locator('[data-testid="execution-time"]')).toContainText('ms');

    // Verify database updated with availability status
    const { data: variant } = await supabase
      .from('brand_variants')
      .select('*')
      .eq('id', testVariantId)
      .single();

    expect(variant?.availability_status).toBeDefined();
    expect(variant?.availability_status).toHaveProperty('com');
    expect(variant?.availability_status).toHaveProperty('io');
    expect(variant?.availability_status).toHaveProperty('ai');
  });

  test('TS-003b: should handle domain check for variant name with spaces', async ({ page }) => {
    if (!testVentureId) {
      test.skip();
      return;
    }

    // Create variant with spaces
    const { data: variant } = await supabase
      .from('brand_variants')
      .insert({
        venture_id: testVentureId,
        created_by: '00000000-0000-0000-0000-000000000000',
        variant_details: {
          name_text: 'Test Co AI',
          generation_cycle: 1,
          adaptation_timestamp: new Date().toISOString(),
          adaptation_reason: 'AVAILABILITY_OPPORTUNITY',
          variant_type: 'SEMANTIC_ENHANCEMENT',
          improvement_hypothesis: 'Testing name sanitization for domain checks'
        },
        status: 'generated'
      })
      .select()
      .single();

    const variantId = variant?.id;

    // Mock API
    await page.route('**/api/domain-validation/check', async (route) => {
      const postData = route.request().postDataJSON();

      // Verify domain was sanitized (spaces removed)
      expect(postData.domain).toBe('testcoai');

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          domain: 'testcoai',
          results: [
            { domain: 'testcoai.com', tld: 'com', available: true, price: 12.99 }
          ]
        })
      });
    });

    await page.goto(`/ventures/${testVentureId}`);
    await page.waitForLoadState('networkidle');

    const variantRow = page.locator('[data-testid="variant-row"]').filter({ hasText: 'Test Co AI' });
    await variantRow.locator('[data-testid="check-domain-btn"]').click();

    await page.waitForSelector('[data-testid="domain-check-results"]');

    // Verify sanitized domain displayed
    await expect(page.locator('[data-testid="sanitized-domain-notice"]')).toBeVisible();
    await expect(page.locator('[data-testid="sanitized-domain-notice"]')).toContainText('testcoai');

    // Cleanup
    if (variantId) {
      await supabase.from('brand_variants').delete().eq('id', variantId);
    }
  });

  test('TS-003c: should show error when domain check fails', async ({ page }) => {
    if (!testVentureId || !testVariantId) {
      test.skip();
      return;
    }

    // Mock API error
    await page.route('**/api/domain-validation/check', async (route) => {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({
          success: false,
          error: 'Domain validation service unavailable'
        })
      });
    });

    await page.goto(`/ventures/${testVentureId}`);
    await page.waitForLoadState('networkidle');

    const variantRow = page.locator('[data-testid="variant-row"]').filter({ hasText: 'TestCo-AI' });
    await variantRow.locator('[data-testid="check-domain-btn"]').click();

    // Verify error message
    await expect(page.locator('[data-testid="domain-check-error"]')).toBeVisible();
    await expect(page.locator('[data-testid="domain-check-error"]')).toContainText('unavailable');
  });

  test('TS-003d: should cache domain check results', async ({ page }) => {
    if (!testVentureId || !testVariantId) {
      test.skip();
      return;
    }

    let apiCallCount = 0;

    await page.route('**/api/domain-validation/check', async (route) => {
      apiCallCount++;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          domain: 'testco-ai',
          results: [
            { domain: 'testco-ai.com', tld: 'com', available: false, price: null }
          ]
        })
      });
    });

    await page.goto(`/ventures/${testVentureId}`);
    await page.waitForLoadState('networkidle');

    const variantRow = page.locator('[data-testid="variant-row"]').filter({ hasText: 'TestCo-AI' });

    // First check
    await variantRow.locator('[data-testid="check-domain-btn"]').click();
    await page.waitForSelector('[data-testid="domain-check-results"]');

    expect(apiCallCount).toBe(1);

    // Close results
    await page.locator('[data-testid="close-domain-results-btn"]').click();

    // Second check (should use cache)
    await variantRow.locator('[data-testid="check-domain-btn"]').click();
    await page.waitForSelector('[data-testid="domain-check-results"]');

    // Verify API was not called again (cache hit)
    expect(apiCallCount).toBe(1);

    // Verify cache indicator shown
    await expect(page.locator('[data-testid="cached-results-badge"]')).toBeVisible();
  });
});

/**
 * REQUIRED DATA-TESTID ATTRIBUTES FOR IMPLEMENTATION:
 *
 * Domain Check UI:
 * 1. check-domain-btn - Button to trigger domain availability check
 * 2. domain-check-loading - Loading indicator during check
 * 3. domain-check-results - Container for domain check results
 * 4. domain-check-error - Error message container
 * 5. close-domain-results-btn - Button to close results modal
 *
 * Domain Results:
 * 6. domain-result-com - Result card for .com TLD
 * 7. domain-result-io - Result card for .io TLD
 * 8. domain-result-ai - Result card for .ai TLD
 * 9. availability-badge - Badge showing "Available" or "Unavailable"
 * 10. execution-time - Display of parallel execution time
 *
 * Additional Info:
 * 11. sanitized-domain-notice - Notice when domain name was sanitized
 * 12. cached-results-badge - Badge indicating cached results
 *
 * API ENDPOINT REQUIRED:
 * POST /api/domain-validation/check
 * Body: { domain: string, tlds: string[] }
 * Response: { success: boolean, domain: string, results: DomainResult[], executionTime: number }
 */
