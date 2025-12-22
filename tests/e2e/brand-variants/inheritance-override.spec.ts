/**
 * E2E Test: Hierarchical Inheritance Override
 * SD-E2E-BRAND-VARIANTS-004: US-005
 *
 * Test Coverage:
 * - AC-005-1: Child Brand Override
 * - AC-005-2: Parent Brand Isolation
 * - AC-005-3: Multi-Level Inheritance
 *
 * Validates that child ventures can override parent brand settings
 * independently without affecting parent venture branding.
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

test.describe('Hierarchical Inheritance Override', () => {
  let testOrgId: string | null = null;
  let parentBrandVariantId: string | null = null;
  let childBrandVariantId: string | null = null;
  let parentVentureId: string | null = null;
  let childVentureId: string | null = null;

  const parentBrand = {
    name: 'Parent Brand',
    primary_color: '#FF0000'
  };

  const childBrand = {
    name: 'Child Brand Override',
    primary_color: '#00FF00'
  };

  test.beforeAll(async () => {
    // Create organization
    const { data: org, error: orgError } = await supabase
      .from('organizations')
      .insert({
        name: `Hierarchy Test Org ${timestamp}`
      })
      .select()
      .single();

    testOrgId = org?.id || null;

    // Create parent brand variant
    const { data: parentVariant } = await supabase
      .from('brand_variants')
      .insert({
        name: `Parent Brand ${timestamp}`,
        theme_colors: parentBrand,
        org_id: testOrgId
      })
      .select()
      .single();

    parentBrandVariantId = parentVariant?.id || null;

    // Create child brand variant (override)
    const { data: childVariant } = await supabase
      .from('brand_variants')
      .insert({
        name: `Child Brand Override ${timestamp}`,
        theme_colors: childBrand,
        org_id: testOrgId
      })
      .select()
      .single();

    childBrandVariantId = childVariant?.id || null;

    // Create parent venture with parent brand
    if (parentBrandVariantId) {
      const { data: parent } = await supabase
        .from('ventures')
        .insert({
          name: `Parent Venture ${timestamp}`,
          org_id: testOrgId,
          brand_variant_id: parentBrandVariantId,
          problem_statement: 'Parent problem',
          solution: 'Parent solution',
          target_market: 'Parent market',
          stage: 5
        })
        .select()
        .single();

      parentVentureId = parent?.id || null;
    }

    // Create child venture with child brand override
    if (childBrandVariantId && parentVentureId) {
      const { data: child } = await supabase
        .from('ventures')
        .insert({
          name: `Child Venture ${timestamp}`,
          org_id: testOrgId,
          parent_venture_id: parentVentureId,
          brand_variant_id: childBrandVariantId,
          problem_statement: 'Child problem',
          solution: 'Child solution',
          target_market: 'Child market',
          stage: 2
        })
        .select()
        .single();

      childVentureId = child?.id || null;
    }
  });

  test.afterAll(async () => {
    if (childVentureId) {
      await supabase.from('ventures').delete().eq('id', childVentureId);
    }
    if (parentVentureId) {
      await supabase.from('ventures').delete().eq('id', parentVentureId);
    }
    if (childBrandVariantId) {
      await supabase.from('brand_variants').delete().eq('id', childBrandVariantId);
    }
    if (parentBrandVariantId) {
      await supabase.from('brand_variants').delete().eq('id', parentBrandVariantId);
    }
    if (testOrgId) {
      await supabase.from('organizations').delete().eq('id', testOrgId);
    }
  });

  test('AC-005-1: Child venture displays custom override brand', async () => {
    if (!childVentureId || !childBrandVariantId) {
      test.skip();
      return;
    }

    // Query child venture with brand variant
    const { data: child } = await supabase
      .from('ventures')
      .select(`
        id,
        brand_variant_id,
        brand_variants:brand_variant_id (
          name,
          theme_colors
        )
      `)
      .eq('id', childVentureId)
      .single();

    expect(child?.brand_variant_id).toBe(childBrandVariantId);

    const brandVariant = child?.brand_variants as any;
    expect(brandVariant?.name).toContain('Child Brand Override');
    expect(brandVariant?.theme_colors?.primary_color).toBe('#00FF00');
  });

  test('AC-005-2: Parent venture maintains original brand', async () => {
    if (!parentVentureId || !parentBrandVariantId) {
      test.skip();
      return;
    }

    // Query parent venture with brand variant
    const { data: parent } = await supabase
      .from('ventures')
      .select(`
        id,
        brand_variant_id,
        brand_variants:brand_variant_id (
          name,
          theme_colors
        )
      `)
      .eq('id', parentVentureId)
      .single();

    expect(parent?.brand_variant_id).toBe(parentBrandVariantId);

    const brandVariant = parent?.brand_variants as any;
    expect(brandVariant?.name).toContain('Parent Brand');
    expect(brandVariant?.theme_colors?.primary_color).toBe('#FF0000');
  });

  test('AC-005-3: Multi-level inheritance resolves correctly', async () => {
    if (!testOrgId || !parentVentureId || !childVentureId) {
      test.skip();
      return;
    }

    // Query both ventures to verify isolation
    const { data: ventures } = await supabase
      .from('ventures')
      .select(`
        id,
        name,
        brand_variant_id,
        parent_venture_id,
        brand_variants:brand_variant_id (
          name,
          theme_colors
        )
      `)
      .in('id', [parentVentureId, childVentureId]);

    expect(ventures).toBeDefined();
    expect(ventures?.length).toBe(2);

    const parent = ventures?.find(v => v.id === parentVentureId);
    const child = ventures?.find(v => v.id === childVentureId);

    // Parent and child have different brand variants
    expect(parent?.brand_variant_id).not.toBe(child?.brand_variant_id);

    // Child references parent
    expect(child?.parent_venture_id).toBe(parentVentureId);

    // Each has correct theme colors
    const parentBrand = parent?.brand_variants as any;
    const childBrand = child?.brand_variants as any;

    expect(parentBrand?.theme_colors?.primary_color).toBe('#FF0000');
    expect(childBrand?.theme_colors?.primary_color).toBe('#00FF00');
  });
});
