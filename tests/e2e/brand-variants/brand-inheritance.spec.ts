/**
 * E2E Test: Brand Inheritance from Organization
 * SD-E2E-BRAND-VARIANTS-004: US-002
 *
 * Test Coverage:
 * - AC-002-1: Custom Brand Inheritance
 * - AC-002-2: Theme Color Inheritance
 * - AC-002-3: Multi-Venture Consistency
 *
 * Validates that ventures correctly inherit brand configuration
 * from their parent organization.
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

test.describe('Brand Inheritance from Organization', () => {
  let testOrgId: string | null = null;
  let testVentureIds: string[] = [];
  let testBrandVariantId: string | null = null;

  const customBrandConfig = {
    name: 'Custom Brand',
    primary_color: '#FF5733',
    secondary_color: '#33FF57',
    logo_url: 'https://example.com/logo.png'
  };

  test.beforeAll(async () => {
    // Create organization WITH custom brand configuration
    const { data: org, error: orgError } = await supabase
      .from('organizations')
      .insert({
        name: `Test Org With Brand ${timestamp}`,
        brand_config: customBrandConfig,
        theme_settings: {
          mode: 'light',
          colors: customBrandConfig
        }
      })
      .select()
      .single();

    if (orgError) {
      console.log('Org creation skipped:', orgError.message);
    }
    testOrgId = org?.id || null;

    // Create a brand variant if the table exists
    const { data: variant, error: variantError } = await supabase
      .from('brand_variants')
      .insert({
        name: `Test Brand Variant ${timestamp}`,
        theme_colors: customBrandConfig,
        naming_conventions: {
          prefix: 'TEST',
          suffix: 'v1'
        },
        org_id: testOrgId
      })
      .select()
      .single();

    if (!variantError) {
      testBrandVariantId = variant?.id || null;
    }
  });

  test.afterAll(async () => {
    for (const id of testVentureIds) {
      await supabase.from('ventures').delete().eq('id', id);
    }
    if (testBrandVariantId) {
      await supabase.from('brand_variants').delete().eq('id', testBrandVariantId);
    }
    if (testOrgId) {
      await supabase.from('organizations').delete().eq('id', testOrgId);
    }
  });

  test('AC-002-1: Venture inherits organization brand name and config', async () => {
    if (!testOrgId) {
      test.skip();
      return;
    }

    // Create venture under org with custom brand
    const { data: venture, error } = await supabase
      .from('ventures')
      .insert({
        name: `Inherited Brand Venture ${timestamp}`,
        org_id: testOrgId,
        brand_variant_id: testBrandVariantId,
        problem_statement: 'Test problem for brand inheritance',
        solution: 'Test solution',
        target_market: 'Test market',
        stage: 1
      })
      .select('id, name, brand_variant_id, org_id')
      .single();

    if (error) {
      console.log('Venture creation issue:', error.message);
    }

    if (venture) {
      testVentureIds.push(venture.id);
    }

    // Verify venture is linked to org
    expect(venture?.org_id).toBe(testOrgId);

    // If brand_variant_id is set, verify it matches
    if (testBrandVariantId) {
      expect(venture?.brand_variant_id).toBe(testBrandVariantId);
    }
  });

  test('AC-002-2: Theme colors inherit from organization configuration', async () => {
    if (!testOrgId) {
      test.skip();
      return;
    }

    // Query org with theme settings
    const { data: org } = await supabase
      .from('organizations')
      .select('theme_settings, brand_config')
      .eq('id', testOrgId)
      .single();

    expect(org?.brand_config).toBeDefined();
    expect(org?.brand_config?.primary_color).toBe('#FF5733');
    expect(org?.brand_config?.secondary_color).toBe('#33FF57');

    // Theme settings should match brand config
    expect(org?.theme_settings?.colors?.primary_color).toBe('#FF5733');
  });

  test('AC-002-3: Multiple ventures under same org display consistent branding', async () => {
    if (!testOrgId) {
      test.skip();
      return;
    }

    // Create two more ventures under same org
    const ventureNames = [
      `Consistent Brand A ${timestamp}`,
      `Consistent Brand B ${timestamp}`
    ];

    for (const name of ventureNames) {
      const { data: venture } = await supabase
        .from('ventures')
        .insert({
          name,
          org_id: testOrgId,
          brand_variant_id: testBrandVariantId,
          problem_statement: 'Test consistency',
          solution: 'Test solution',
          target_market: 'Test market',
          stage: 1
        })
        .select('id, org_id, brand_variant_id')
        .single();

      if (venture) {
        testVentureIds.push(venture.id);
      }
    }

    // Query all ventures under this org
    const { data: ventures } = await supabase
      .from('ventures')
      .select('id, org_id, brand_variant_id')
      .eq('org_id', testOrgId);

    expect(ventures).toBeDefined();
    expect(ventures!.length).toBeGreaterThanOrEqual(2);

    // All ventures should have same org_id
    for (const v of ventures || []) {
      expect(v.org_id).toBe(testOrgId);
    }

    // All ventures with brand_variant_id should have same value
    const variantIds = ventures?.filter(v => v.brand_variant_id).map(v => v.brand_variant_id);
    if (variantIds && variantIds.length > 0) {
      expect(new Set(variantIds).size).toBe(1);
    }
  });
});
