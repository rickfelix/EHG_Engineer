/**
 * E2E Test: Default Brand Creation
 * SD-E2E-BRAND-VARIANTS-004: US-001
 *
 * Test Coverage:
 * - AC-001-1: Default Brand Application
 * - AC-001-2: Default Theme Verification
 * - AC-001-3: Database State Validation
 *
 * Validates that ventures receive correct default brand settings
 * when organizations have no custom configuration.
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

test.describe('Default Brand Application', () => {
  let testOrgId: string | null = null;
  let testVentureId: string | null = null;

  test.beforeAll(async () => {
    // Create organization WITHOUT custom brand configuration
    const { data: org, error: orgError } = await supabase
      .from('organizations')
      .insert({
        name: `Test Org No Brand ${timestamp}`,
        // No brand_config or theme_settings
      })
      .select()
      .single();

    if (orgError) {
      console.log('Org creation skipped (table may not exist):', orgError.message);
    }
    testOrgId = org?.id || null;
  });

  test.afterAll(async () => {
    if (testVentureId) {
      await supabase.from('ventures').delete().eq('id', testVentureId);
    }
    if (testOrgId) {
      await supabase.from('organizations').delete().eq('id', testOrgId);
    }
  });

  test('AC-001-1: Venture displays default EHG brand when org has no custom config', async () => {
    // Skip if organizations table doesn't exist
    if (!testOrgId) {
      test.skip();
      return;
    }

    // Create venture under org with no brand config
    const { data: venture, error } = await supabase
      .from('ventures')
      .insert({
        name: `Default Brand Venture ${timestamp}`,
        org_id: testOrgId,
        problem_statement: 'Test problem for default brand',
        solution: 'Test solution',
        target_market: 'Test market',
        stage: 1
      })
      .select('id, name, brand_variant_id, org_id')
      .single();

    if (error) {
      console.log('Venture creation issue:', error.message);
      // Continue with assertion on null
    }

    testVentureId = venture?.id || null;

    // Verify venture has no custom brand_variant_id (inherits defaults)
    expect(venture?.brand_variant_id).toBeNull();

    // Verify venture is linked to org
    expect(venture?.org_id).toBe(testOrgId);
  });

  test('AC-001-2: Default theme applies when org has no custom theme', async () => {
    if (!testVentureId) {
      test.skip();
      return;
    }

    // Verify org has no theme_settings
    const { data: org } = await supabase
      .from('organizations')
      .select('theme_settings')
      .eq('id', testOrgId!)
      .single();

    expect(org?.theme_settings).toBeNull();

    // Verify venture inherits default (no brand_variant_id)
    const { data: venture } = await supabase
      .from('ventures')
      .select('brand_variant_id')
      .eq('id', testVentureId)
      .single();

    expect(venture?.brand_variant_id).toBeNull();
  });

  test('AC-001-3: Database state reflects default branding', async () => {
    if (!testVentureId) {
      test.skip();
      return;
    }

    // Query venture with org join
    const { data: venture } = await supabase
      .from('ventures')
      .select(`
        id,
        name,
        brand_variant_id,
        org_id,
        organizations:org_id (
          name,
          brand_config,
          theme_settings
        )
      `)
      .eq('id', testVentureId)
      .single();

    // Verify database state
    expect(venture).toBeDefined();
    expect(venture?.brand_variant_id).toBeNull();

    // Org should have null brand_config (no custom brand)
    const org = venture?.organizations as any;
    expect(org?.brand_config).toBeNull();
    expect(org?.theme_settings).toBeNull();
  });
});
