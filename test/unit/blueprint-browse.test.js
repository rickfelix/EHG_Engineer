/**
 * Blueprint Browse Path - Full Implementation Tests
 *
 * Tests the blueprint browsing, selection, and customization pipeline:
 * - Loading blueprints from database
 * - Category grouping and filtering
 * - Blueprint selection (by ID, category, or auto)
 * - Template customization
 * - Error handling
 *
 * Part of SD-LEO-ORCH-STAGE-INTELLIGENT-VENTURE-001-D
 */

import { describe, test, expect, vi } from 'vitest';
import {
  executeBlueprintBrowse,
  groupByCategory,
  applyCustomizations,
  listBlueprintCategories,
} from '../../lib/eva/stage-zero/paths/blueprint-browse.js';

// ── Mock Supabase ──────────────────────────────────────────

const DEFAULT_BLUEPRINTS = [
  {
    id: 'bp-saas-1', name: 'SaaS Starter', category: 'software',
    description: 'Standard SaaS venture template',
    template_data: { name: 'SaaS Venture', problem_statement: 'Manual processes waste time', solution: 'Automated SaaS platform', target_market: 'SMBs', pricing_model: 'subscription' },
    is_active: true,
  },
  {
    id: 'bp-market-1', name: 'Marketplace Template', category: 'marketplace',
    description: 'Two-sided marketplace template',
    template_data: { name: 'AI Marketplace', problem_statement: 'Fragmented supply and demand', solution: 'AI-powered matching marketplace', target_market: 'Enterprises' },
    is_active: true,
  },
  {
    id: 'bp-saas-2', name: 'API-First SaaS', category: 'software',
    description: 'API-first developer tools',
    template_data: { name: 'DevTools API', problem_statement: 'Developers lack automation', solution: 'API-first developer platform', target_market: 'Developers' },
    is_active: true,
  },
];

function createMockSupabase(blueprints = DEFAULT_BLUEPRINTS, dbError = null) {
  // Build a chainable mock that handles:
  // .from('venture_blueprints').select(...).eq('is_active', true).eq('category', X).order(...)
  // .from('venture_blueprints').select(...).eq('is_active', true).order(...)
  const buildChain = (data, error) => {
    const chain = {};
    chain.eq = vi.fn().mockImplementation((field, value) => {
      if (field === 'category') {
        const filtered = data.filter(b => b.category === value);
        return { ...chain, _data: filtered, order: vi.fn().mockResolvedValue({ data: filtered, error }) };
      }
      return chain;
    });
    chain.order = vi.fn().mockResolvedValue({ data, error });
    return chain;
  };

  return {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue(buildChain(blueprints, dbError)),
    }),
  };
}

const silentLogger = { log: vi.fn(), warn: vi.fn(), error: vi.fn() };

// ── Core Functionality Tests ──────────────────────────────

describe('Blueprint Browse - executeBlueprintBrowse', () => {
  test('requires supabase client', async () => {
    await expect(
      executeBlueprintBrowse({}, { logger: silentLogger })
    ).rejects.toThrow('supabase client is required');
  });

  test('returns null when no blueprints available', async () => {
    const supabase = createMockSupabase([]);
    const result = await executeBlueprintBrowse({}, { supabase, logger: silentLogger });
    expect(result).toBeNull();
  });

  test('auto-selects first blueprint when no ID or category given', async () => {
    const supabase = createMockSupabase();
    const result = await executeBlueprintBrowse({}, { supabase, logger: silentLogger });

    expect(result.origin_type).toBe('blueprint');
    expect(result.blueprint_id).toBe('bp-saas-1');
    expect(result.suggested_name).toBe('SaaS Venture');
    expect(result.suggested_problem).toBe('Manual processes waste time');
  });

  test('selects specific blueprint by ID', async () => {
    const supabase = createMockSupabase();
    const result = await executeBlueprintBrowse(
      { blueprintId: 'bp-market-1' },
      { supabase, logger: silentLogger }
    );

    expect(result.blueprint_id).toBe('bp-market-1');
    expect(result.suggested_name).toBe('AI Marketplace');
    expect(result.metadata.blueprint_category).toBe('marketplace');
  });

  test('throws when blueprint ID not found', async () => {
    const supabase = createMockSupabase();
    await expect(
      executeBlueprintBrowse({ blueprintId: 'nonexistent' }, { supabase, logger: silentLogger })
    ).rejects.toThrow('Blueprint not found: nonexistent');
  });

  test('applies customizations to template', async () => {
    const supabase = createMockSupabase();
    const result = await executeBlueprintBrowse(
      { blueprintId: 'bp-saas-1', customizations: { name: 'My Custom SaaS', target_market: 'Enterprises' } },
      { supabase, logger: silentLogger }
    );

    expect(result.suggested_name).toBe('My Custom SaaS');
    expect(result.target_market).toBe('Enterprises');
    expect(result.raw_material.customizations).toEqual({ name: 'My Custom SaaS', target_market: 'Enterprises' });
  });

  test('includes category metadata in output', async () => {
    const supabase = createMockSupabase();
    const result = await executeBlueprintBrowse({}, { supabase, logger: silentLogger });

    expect(result.metadata.total_blueprints).toBe(3);
    expect(result.metadata.categories_browsed).toContain('software');
    expect(result.metadata.categories_browsed).toContain('marketplace');
  });

  test('includes available categories in raw_material', async () => {
    const supabase = createMockSupabase();
    const result = await executeBlueprintBrowse({}, { supabase, logger: silentLogger });

    expect(result.raw_material.categories_available).toContain('software');
    expect(result.raw_material.categories_available).toContain('marketplace');
  });

  test('handles blueprint with missing template_data', async () => {
    const supabase = createMockSupabase([
      { id: 'bp-empty', name: 'Empty Template', category: 'other', description: 'No data', template_data: null, is_active: true },
    ]);

    const result = await executeBlueprintBrowse({}, { supabase, logger: silentLogger });
    expect(result.suggested_name).toBe('Empty Template');
    expect(result.suggested_problem).toBe('');
  });

  test('handles database error', async () => {
    const supabase = createMockSupabase(null, { message: 'Connection failed' });
    await expect(
      executeBlueprintBrowse({}, { supabase, logger: silentLogger })
    ).rejects.toThrow('Failed to load blueprints: Connection failed');
  });

  test('logs category summary', async () => {
    const supabase = createMockSupabase();
    const logger = { log: vi.fn(), warn: vi.fn(), error: vi.fn() };

    await executeBlueprintBrowse({}, { supabase, logger });

    expect(logger.log).toHaveBeenCalledWith(expect.stringContaining('3 blueprint'));
    expect(logger.log).toHaveBeenCalledWith(expect.stringContaining('[software]'));
  });
});

// ── Utility Function Tests ──────────────────────────────

describe('Blueprint Browse - groupByCategory', () => {
  test('groups blueprints by category', () => {
    const grouped = groupByCategory([
      { id: '1', category: 'software' },
      { id: '2', category: 'marketplace' },
      { id: '3', category: 'software' },
    ]);
    expect(Object.keys(grouped)).toHaveLength(2);
    expect(grouped.software).toHaveLength(2);
    expect(grouped.marketplace).toHaveLength(1);
  });

  test('handles missing category as uncategorized', () => {
    const grouped = groupByCategory([{ id: '1' }, { id: '2', category: null }]);
    expect(grouped.uncategorized).toHaveLength(2);
  });

  test('handles empty array', () => {
    expect(Object.keys(groupByCategory([]))).toHaveLength(0);
  });
});

describe('Blueprint Browse - applyCustomizations', () => {
  test('merges customizations over template', () => {
    const result = applyCustomizations({ name: 'Original', market: 'SMBs' }, { name: 'Custom', pricing: 'freemium' });
    expect(result.name).toBe('Custom');
    expect(result.market).toBe('SMBs');
    expect(result.pricing).toBe('freemium');
  });

  test('returns template when no customizations', () => {
    expect(applyCustomizations({ name: 'Original' }).name).toBe('Original');
  });

  test('handles empty template', () => {
    expect(applyCustomizations({}, { name: 'New' }).name).toBe('New');
  });
});

describe('Blueprint Browse - listBlueprintCategories', () => {
  test('lists categories with counts', async () => {
    const supabase = createMockSupabase();
    const categories = await listBlueprintCategories({ supabase });

    expect(categories.length).toBeGreaterThanOrEqual(2);
    const software = categories.find(c => c.category === 'software');
    expect(software.count).toBe(2);
    expect(software.blueprints).toHaveLength(2);
  });

  test('requires supabase', async () => {
    await expect(listBlueprintCategories()).rejects.toThrow('supabase client is required');
  });
});
