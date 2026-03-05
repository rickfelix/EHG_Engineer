import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  DATA_ROOM_TEMPLATES,
  getDataRoomTemplate,
  generateDataRoomChecklist,
} from '../../../../lib/eva/exit/data-room-templates.js';

// ── Supabase mock helpers ───────────────────────────────────

function createMockSupabase({ profileResult, artifactsResult, assetsResult } = {}) {
  const single = vi.fn().mockResolvedValue(
    profileResult ?? { data: null, error: { message: 'no rows' } }
  );

  const eqChain = () => {
    const chain = {
      eq: vi.fn().mockReturnValue(chain),
      single: single,
    };
    // For queries that don't end with .single(), resolve directly
    chain.then = (resolve) =>
      resolve(artifactsResult ?? { data: [], error: null });
    return chain;
  };

  // Track which table is being queried to return appropriate data
  const from = vi.fn().mockImplementation((table) => {
    const selectFn = vi.fn().mockImplementation(() => {
      if (table === 'venture_exit_profiles') {
        const chain = {
          eq: vi.fn().mockImplementation(() => ({
            eq: vi.fn().mockImplementation(() => ({
              single: single,
            })),
          })),
        };
        return chain;
      }

      if (table === 'venture_data_room_artifacts') {
        const eqOuter = vi.fn().mockImplementation(() => {
          const eqInner = vi.fn().mockResolvedValue(
            artifactsResult ?? { data: [], error: null }
          );
          return { eq: eqInner };
        });
        return { eq: eqOuter };
      }

      if (table === 'venture_asset_registry') {
        const eq = vi.fn().mockResolvedValue(
          assetsResult ?? { data: [], error: null }
        );
        return { eq };
      }

      // Fallback
      return eqChain();
    });

    return { select: selectFn };
  });

  return { from };
}

// ── DATA_ROOM_TEMPLATES structure ───────────────────────────

describe('DATA_ROOM_TEMPLATES', () => {
  it('has exactly 6 exit models', () => {
    const models = Object.keys(DATA_ROOM_TEMPLATES);
    expect(models).toHaveLength(6);
    expect(models).toEqual(
      expect.arrayContaining([
        'full_acquisition',
        'licensing',
        'acqui_hire',
        'revenue_share',
        'merger',
        'wind_down',
      ])
    );
  });

  it('is frozen (immutable)', () => {
    expect(Object.isFrozen(DATA_ROOM_TEMPLATES)).toBe(true);
  });

  it('every template item has required fields', () => {
    for (const [model, items] of Object.entries(DATA_ROOM_TEMPLATES)) {
      for (const item of items) {
        expect(item).toHaveProperty('document_type');
        expect(item).toHaveProperty('title');
        expect(item).toHaveProperty('required', true);
        expect(item).toHaveProperty('source_table');
      }
    }
  });
});

// ── getDataRoomTemplate ─────────────────────────────────────

describe('getDataRoomTemplate', () => {
  it('full_acquisition returns 9 required documents', () => {
    const result = getDataRoomTemplate('full_acquisition');
    expect(result.length).toBeGreaterThanOrEqual(9);
    const types = result.map((d) => d.document_type);
    expect(types).toContain('financial_summary');
    expect(types).toContain('customer_list');
    expect(types).toContain('technical_architecture');
    expect(types).toContain('separation_plan');
    expect(types).toContain('asset_inventory');
    expect(types).toContain('legal_summary');
  });

  it('licensing returns ip_portfolio, license_terms, technical_documentation, revenue_projections', () => {
    const result = getDataRoomTemplate('licensing');
    const types = result.map((d) => d.document_type);
    expect(types).toContain('ip_portfolio');
    expect(types).toContain('license_terms');
    expect(types).toContain('technical_documentation');
    expect(types).toContain('revenue_projections');
    expect(result).toHaveLength(4);
  });

  it('acqui_hire returns team_roster, compensation_structure, ip_assignment, retention_plan', () => {
    const result = getDataRoomTemplate('acqui_hire');
    const types = result.map((d) => d.document_type);
    expect(types).toContain('team_roster');
    expect(types).toContain('compensation_structure');
    expect(types).toContain('ip_assignment');
    expect(types).toContain('retention_plan');
    expect(result).toHaveLength(4);
  });

  it('returns empty array for unknown exit model', () => {
    const result = getDataRoomTemplate('unknown_model');
    expect(result).toEqual([]);
  });

  it('returns empty array for null input', () => {
    const result = getDataRoomTemplate(null);
    expect(result).toEqual([]);
  });

  it('returns empty array for undefined input', () => {
    const result = getDataRoomTemplate(undefined);
    expect(result).toEqual([]);
  });

  it('returns copies, not references to the frozen template', () => {
    const result = getDataRoomTemplate('licensing');
    result[0].title = 'MUTATED';
    // Original template should be unaffected
    expect(DATA_ROOM_TEMPLATES.licensing[0].title).not.toBe('MUTATED');
  });
});

// ── generateDataRoomChecklist ───────────────────────────────

describe('generateDataRoomChecklist', () => {
  const VENTURE_ID = 'test-venture-uuid';

  it('returns error object when ventureId is missing', async () => {
    const supabase = createMockSupabase();
    const result = await generateDataRoomChecklist(null, supabase);
    expect(result).toMatchObject({
      error: 'Missing ventureId or supabase client',
      exit_model: null,
      total_required: 0,
      completed: 0,
      completion_pct: 0,
      items: [],
    });
    expect(result.warnings).toContain('Missing required parameters');
  });

  it('returns error object when supabase is missing', async () => {
    const result = await generateDataRoomChecklist(VENTURE_ID, null);
    expect(result).toMatchObject({
      error: 'Missing ventureId or supabase client',
      exit_model: null,
      total_required: 0,
      completed: 0,
      completion_pct: 0,
      items: [],
    });
  });

  it('returns expected shape: exit_model, total_required, completed, completion_pct, items', async () => {
    const supabase = createMockSupabase({
      profileResult: {
        data: { exit_model: 'wind_down' },
        error: null,
      },
      artifactsResult: { data: [], error: null },
      assetsResult: { data: [], error: null },
    });

    const result = await generateDataRoomChecklist(VENTURE_ID, supabase);
    expect(result).toHaveProperty('exit_model', 'wind_down');
    expect(result).toHaveProperty('total_required');
    expect(result).toHaveProperty('completed');
    expect(result).toHaveProperty('completion_pct');
    expect(result).toHaveProperty('items');
    expect(Array.isArray(result.items)).toBe(true);
  });

  it('0% completion when no artifacts exist', async () => {
    const supabase = createMockSupabase({
      profileResult: {
        data: { exit_model: 'acqui_hire' },
        error: null,
      },
      artifactsResult: { data: [], error: null },
      assetsResult: { data: [], error: null },
    });

    const result = await generateDataRoomChecklist(VENTURE_ID, supabase);
    expect(result.exit_model).toBe('acqui_hire');
    expect(result.completion_pct).toBe(0);
    expect(result.completed).toBe(0);
    expect(result.total_required).toBe(4);
    // Every item should be 'missing'
    for (const item of result.items) {
      expect(item.status).toBe('missing');
    }
  });

  it('partial completion calculated correctly', async () => {
    // acqui_hire has 4 docs: team_roster, compensation_structure, ip_assignment, retention_plan
    // Provide 2 artifacts matching 2 of the 4
    const supabase = createMockSupabase({
      profileResult: {
        data: { exit_model: 'acqui_hire' },
        error: null,
      },
      artifactsResult: {
        data: [
          { artifact_type: 'team_roster', is_current: true, updated_at: new Date().toISOString() },
          { artifact_type: 'compensation_structure', is_current: true, updated_at: new Date().toISOString() },
        ],
        error: null,
      },
      assetsResult: { data: [], error: null },
    });

    const result = await generateDataRoomChecklist(VENTURE_ID, supabase);
    expect(result.exit_model).toBe('acqui_hire');
    expect(result.total_required).toBe(4);
    expect(result.completed).toBe(2);
    expect(result.completion_pct).toBe(50);

    const teamRoster = result.items.find((i) => i.document_type === 'team_roster');
    expect(teamRoster.status).toBe('complete');

    const ipAssignment = result.items.find((i) => i.document_type === 'ip_assignment');
    expect(ipAssignment.status).toBe('missing');
  });

  it('returns warning and error when no current exit profile exists', async () => {
    const supabase = createMockSupabase({
      profileResult: {
        data: null,
        error: { message: 'no rows returned' },
      },
      artifactsResult: { data: [], error: null },
      assetsResult: { data: [], error: null },
    });

    const result = await generateDataRoomChecklist(VENTURE_ID, supabase);
    expect(result.error).toBe('No current exit profile found');
    expect(result.exit_model).toBeNull();
    expect(result.total_required).toBe(0);
    expect(result.items).toEqual([]);
    expect(result.warnings).toBeDefined();
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it('asset_inventory items check venture_asset_registry', async () => {
    // full_acquisition has asset_inventory sourced from venture_asset_registry
    const supabase = createMockSupabase({
      profileResult: {
        data: { exit_model: 'full_acquisition' },
        error: null,
      },
      artifactsResult: {
        data: [
          { artifact_type: 'financial_summary', is_current: true, updated_at: new Date().toISOString() },
          { artifact_type: 'customer_list', is_current: true, updated_at: new Date().toISOString() },
          { artifact_type: 'technical_architecture', is_current: true, updated_at: new Date().toISOString() },
          { artifact_type: 'dependency_map', is_current: true, updated_at: new Date().toISOString() },
          { artifact_type: 'integration_inventory', is_current: true, updated_at: new Date().toISOString() },
          { artifact_type: 'separation_plan', is_current: true, updated_at: new Date().toISOString() },
          { artifact_type: 'revenue_history', is_current: true, updated_at: new Date().toISOString() },
          { artifact_type: 'legal_summary', is_current: true, updated_at: new Date().toISOString() },
        ],
        error: null,
      },
      assetsResult: {
        data: [{ id: 'asset-1', asset_type: 'software' }],
        error: null,
      },
    });

    const result = await generateDataRoomChecklist(VENTURE_ID, supabase);
    expect(result.exit_model).toBe('full_acquisition');

    const assetItem = result.items.find((i) => i.document_type === 'asset_inventory');
    expect(assetItem.status).toBe('complete');
    expect(assetItem.source_table).toBe('venture_asset_registry');

    // All 9 items should be complete
    expect(result.completed).toBe(9);
    expect(result.completion_pct).toBe(100);
  });

  it('licensing ip_portfolio uses asset_type filter on venture_asset_registry', async () => {
    // Provide assets that do NOT match the ip_portfolio filter
    const supabase = createMockSupabase({
      profileResult: {
        data: { exit_model: 'licensing' },
        error: null,
      },
      artifactsResult: {
        data: [
          { artifact_type: 'license_terms', is_current: true, updated_at: new Date().toISOString() },
          { artifact_type: 'technical_documentation', is_current: true, updated_at: new Date().toISOString() },
          { artifact_type: 'revenue_projections', is_current: true, updated_at: new Date().toISOString() },
        ],
        error: null,
      },
      assetsResult: {
        // Only a 'software' asset -- does NOT match ip_portfolio filter (needs intellectual_property, patent, trademark)
        data: [{ id: 'asset-1', asset_type: 'software' }],
        error: null,
      },
    });

    const result = await generateDataRoomChecklist(VENTURE_ID, supabase);
    const ipPortfolio = result.items.find((i) => i.document_type === 'ip_portfolio');
    expect(ipPortfolio.status).toBe('missing');
    // 3 of 4 complete (all except ip_portfolio)
    expect(result.completed).toBe(3);
    expect(result.completion_pct).toBe(75);
  });

  it('licensing ip_portfolio is complete when matching asset types exist', async () => {
    const supabase = createMockSupabase({
      profileResult: {
        data: { exit_model: 'licensing' },
        error: null,
      },
      artifactsResult: {
        data: [
          { artifact_type: 'license_terms', is_current: true, updated_at: new Date().toISOString() },
          { artifact_type: 'technical_documentation', is_current: true, updated_at: new Date().toISOString() },
          { artifact_type: 'revenue_projections', is_current: true, updated_at: new Date().toISOString() },
        ],
        error: null,
      },
      assetsResult: {
        data: [{ id: 'asset-1', asset_type: 'patent' }],
        error: null,
      },
    });

    const result = await generateDataRoomChecklist(VENTURE_ID, supabase);
    const ipPortfolio = result.items.find((i) => i.document_type === 'ip_portfolio');
    expect(ipPortfolio.status).toBe('complete');
    expect(result.completed).toBe(4);
    expect(result.completion_pct).toBe(100);
  });

  it('marks stale artifacts when updated_at is older than 90 days', async () => {
    const staleDate = new Date(Date.now() - 100 * 24 * 60 * 60 * 1000).toISOString();

    const supabase = createMockSupabase({
      profileResult: {
        data: { exit_model: 'acqui_hire' },
        error: null,
      },
      artifactsResult: {
        data: [
          { artifact_type: 'team_roster', is_current: true, updated_at: staleDate },
        ],
        error: null,
      },
      assetsResult: { data: [], error: null },
    });

    const result = await generateDataRoomChecklist(VENTURE_ID, supabase);
    const teamRoster = result.items.find((i) => i.document_type === 'team_roster');
    expect(teamRoster.status).toBe('stale');
    // Stale items do NOT count as completed
    expect(result.completed).toBe(0);
  });

  it('does not include warnings key when there are no warnings', async () => {
    const supabase = createMockSupabase({
      profileResult: {
        data: { exit_model: 'wind_down' },
        error: null,
      },
      artifactsResult: { data: [], error: null },
      assetsResult: { data: [], error: null },
    });

    const result = await generateDataRoomChecklist(VENTURE_ID, supabase);
    // When no warnings, the key should not be present (spread conditional)
    expect(result).not.toHaveProperty('warnings');
  });
});
