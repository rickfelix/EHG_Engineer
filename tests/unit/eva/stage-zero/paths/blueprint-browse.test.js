/**
 * Unit Tests: Blueprint Browse Path
 *
 * Test Coverage:
 * - Throws on missing supabase
 * - Returns null when no blueprints found
 * - Groups by category, selects by ID, filters by category
 * - Applies customizations, returns valid PathOutput
 */

import { describe, test, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../../../scripts/modules/sd-key-generator.js', () => ({
  generateSDKey: vi.fn().mockReturnValue('SD-TEST-001'),
  generateChildKey: vi.fn().mockReturnValue('SD-TEST-001-A'),
  normalizeVenturePrefix: vi.fn().mockReturnValue('TEST'),
}));

import {
  executeBlueprintBrowse,
  groupByCategory,
  applyCustomizations,
} from '../../../../../lib/eva/stage-zero/paths/blueprint-browse.js';

const silentLogger = { log: vi.fn(), warn: vi.fn() };

const sampleBlueprints = [
  { id: 'bp-1', name: 'SaaS Template', category: 'saas', description: 'SaaS venture', template_data: { name: 'SaaS MVP', problem_statement: 'SaaS problem', solution: 'SaaS solution', target_market: 'B2B' }, is_active: true },
  { id: 'bp-2', name: 'E-commerce Template', category: 'ecommerce', description: 'E-commerce venture', template_data: { name: 'Store', problem_statement: 'Commerce problem', solution: 'Store solution', target_market: 'Consumers' }, is_active: true },
  { id: 'bp-3', name: 'SaaS Pro', category: 'saas', description: 'Advanced SaaS', template_data: { name: 'SaaS Pro', problem_statement: 'Advanced problem', solution: 'Pro solution', target_market: 'Enterprise' }, is_active: true },
];

function createMockSupabase(blueprints = sampleBlueprints) {
  // Supabase query builder: every method returns 'this', await resolves { data, error }
  const result = { data: blueprints, error: null };
  const chain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    then: (resolve, reject) => Promise.resolve(result).then(resolve, reject),
  };
  return { from: vi.fn(() => chain), _chain: chain };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('executeBlueprintBrowse', () => {
  test('throws on missing supabase', async () => {
    await expect(executeBlueprintBrowse({}, {}))
      .rejects.toThrow('supabase client is required');
  });

  test('returns null when no blueprints found', async () => {
    const supabase = createMockSupabase([]);
    const result = await executeBlueprintBrowse({}, { supabase, logger: silentLogger });
    expect(result).toBeNull();
  });

  test('selects blueprint by ID', async () => {
    const supabase = createMockSupabase();
    const result = await executeBlueprintBrowse(
      { blueprintId: 'bp-2' },
      { supabase, logger: silentLogger }
    );
    expect(result).not.toBeNull();
    expect(result.blueprint_id).toBe('bp-2');
    expect(result.origin_type).toBe('blueprint');
    expect(result.suggested_name).toBe('Store');
  });

  test('throws when blueprintId not found', async () => {
    const supabase = createMockSupabase();
    await expect(executeBlueprintBrowse(
      { blueprintId: 'nonexistent' },
      { supabase, logger: silentLogger }
    )).rejects.toThrow('Blueprint not found: nonexistent');
  });

  test('filters by category and auto-selects first', async () => {
    const supabase = createMockSupabase();
    const result = await executeBlueprintBrowse(
      { category: 'saas' },
      { supabase, logger: silentLogger }
    );
    expect(result).not.toBeNull();
    expect(result.blueprint_id).toBe('bp-1');
    expect(result.metadata.blueprint_category).toBe('saas');
  });

  test('applies customizations to template', async () => {
    const supabase = createMockSupabase();
    const result = await executeBlueprintBrowse(
      { blueprintId: 'bp-1', customizations: { name: 'Custom Name', target_market: 'Startups' } },
      { supabase, logger: silentLogger }
    );
    expect(result.suggested_name).toBe('Custom Name');
    expect(result.target_market).toBe('Startups');
    expect(result.metadata.customizations_applied).toEqual(['name', 'target_market']);
  });

  test('returns valid PathOutput structure', async () => {
    const supabase = createMockSupabase();
    const result = await executeBlueprintBrowse({}, { supabase, logger: silentLogger });
    expect(result.origin_type).toBe('blueprint');
    expect(result.raw_material).toBeDefined();
    expect(result.raw_material.blueprint).toBeDefined();
    expect(result.raw_material.categories_available).toContain('saas');
    expect(result.raw_material.categories_available).toContain('ecommerce');
    expect(result.metadata.path).toBe('blueprint_browse');
    expect(result.metadata.total_blueprints).toBe(3);
  });
});

describe('groupByCategory', () => {
  test('groups blueprints by category', () => {
    const grouped = groupByCategory(sampleBlueprints);
    expect(Object.keys(grouped)).toHaveLength(2);
    expect(grouped.saas).toHaveLength(2);
    expect(grouped.ecommerce).toHaveLength(1);
  });
});

describe('applyCustomizations', () => {
  test('merges customizations over template', () => {
    const result = applyCustomizations({ a: 1, b: 2 }, { b: 3, c: 4 });
    expect(result).toEqual({ a: 1, b: 3, c: 4 });
  });
});
