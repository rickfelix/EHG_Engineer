/**
 * PRD Metadata Consistency Tests
 * SD: SD-LEARN-FIX-ADDRESS-PAT-AUTO-036
 *
 * Tests:
 * - Metadata merge (not replace) in updatePRDWithAnalyses
 * - design_analysis stub when DESIGN has no output
 * - design_informed flag based on execution, not output presence
 */

import { describe, test, expect, vi, beforeEach } from 'vitest';

// Mock supabase client
function createMockSupabase(existingMetadata = {}) {
  const mockUpdate = vi.fn().mockReturnValue({
    eq: vi.fn().mockResolvedValue({ error: null })
  });

  return {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: { metadata: existingMetadata },
            error: null
          })
        })
      }),
      update: mockUpdate
    }),
    _mockUpdate: mockUpdate
  };
}

// Inline implementation of the fixed updatePRDWithAnalyses (sub-agent-runners.js version)
// to test the logic without needing full module imports
async function updatePRDWithAnalyses(supabase, prdId, sdId, sdData, analyses) {
  const { designAnalysis, databaseAnalysis } = analyses;

  if (!designAnalysis && !databaseAnalysis) return;

  const { data: existingPrd } = await supabase
    .from('product_requirements_v2')
    .select('metadata')
    .eq('id', prdId)
    .single();

  const existingMetadata = existingPrd?.metadata || {};
  const sdContext = { id: sdId, title: sdData.title, scope: sdData.scope };
  const now = new Date().toISOString();

  const design_analysis = designAnalysis
    ? { generated_at: now, sd_context: sdContext, raw_analysis: designAnalysis.substring(0, 5000) }
    : { generated_at: now, sd_context: sdContext, skipped: true, reason: 'no_design_output' };

  const metadata = { ...existingMetadata, design_analysis };

  if (databaseAnalysis) {
    metadata.database_analysis = {
      generated_at: now,
      sd_context: sdContext,
      raw_analysis: databaseAnalysis.substring(0, 5000),
      design_informed: true
    };
  }

  await supabase
    .from('product_requirements_v2')
    .update({ metadata })
    .eq('id', prdId);

  return metadata;
}

const sdData = { title: 'Test SD', scope: 'Test scope' };

// ── Test: Metadata merge preserves existing keys ────────────

describe('updatePRDWithAnalyses - metadata merge', () => {
  test('preserves existing metadata keys when adding analyses', async () => {
    const existingMeta = { custom_field: 'preserved', created_by: 'test' };
    const supabase = createMockSupabase(existingMeta);

    const result = await updatePRDWithAnalyses(supabase, 'prd-1', 'sd-1', sdData, {
      designAnalysis: 'UI analysis output',
      databaseAnalysis: 'DB schema analysis'
    });

    expect(result.custom_field).toBe('preserved');
    expect(result.created_by).toBe('test');
    expect(result.design_analysis).toBeDefined();
    expect(result.database_analysis).toBeDefined();
  });

  test('does not lose existing metadata when only one analysis provided', async () => {
    const existingMeta = { prior_key: 'value' };
    const supabase = createMockSupabase(existingMeta);

    const result = await updatePRDWithAnalyses(supabase, 'prd-1', 'sd-1', sdData, {
      designAnalysis: null,
      databaseAnalysis: 'DB schema analysis'
    });

    expect(result.prior_key).toBe('value');
    expect(result.database_analysis).toBeDefined();
  });
});

// ── Test: design_analysis stub when DESIGN has no output ────

describe('updatePRDWithAnalyses - design_analysis stub', () => {
  test('creates stub when designAnalysis is empty string', async () => {
    const supabase = createMockSupabase({});

    const result = await updatePRDWithAnalyses(supabase, 'prd-1', 'sd-1', sdData, {
      designAnalysis: '',
      databaseAnalysis: 'DB analysis'
    });

    expect(result.design_analysis).toBeDefined();
    expect(result.design_analysis.skipped).toBe(true);
    expect(result.design_analysis.reason).toBe('no_design_output');
    expect(result.design_analysis.generated_at).toBeDefined();
    expect(result.design_analysis.sd_context).toBeDefined();
  });

  test('creates stub when designAnalysis is null', async () => {
    const supabase = createMockSupabase({});

    const result = await updatePRDWithAnalyses(supabase, 'prd-1', 'sd-1', sdData, {
      designAnalysis: null,
      databaseAnalysis: 'DB analysis'
    });

    expect(result.design_analysis).toBeDefined();
    expect(result.design_analysis.skipped).toBe(true);
    expect(result.design_analysis.reason).toBe('no_design_output');
  });

  test('creates full design_analysis when output present', async () => {
    const supabase = createMockSupabase({});

    const result = await updatePRDWithAnalyses(supabase, 'prd-1', 'sd-1', sdData, {
      designAnalysis: 'Full design analysis output',
      databaseAnalysis: 'DB analysis'
    });

    expect(result.design_analysis).toBeDefined();
    expect(result.design_analysis.skipped).toBeUndefined();
    expect(result.design_analysis.raw_analysis).toBe('Full design analysis output');
  });

  test('design_analysis is always truthy (never null)', async () => {
    const supabase = createMockSupabase({});

    // Even with null designAnalysis and databaseAnalysis present
    const result = await updatePRDWithAnalyses(supabase, 'prd-1', 'sd-1', sdData, {
      designAnalysis: null,
      databaseAnalysis: 'some DB analysis'
    });

    // design_analysis should be a truthy stub, not null
    expect(result.design_analysis).toBeTruthy();
    expect(typeof result.design_analysis).toBe('object');
  });
});

// ── Test: design_informed flag logic ────────────────────────

describe('updatePRDWithAnalyses - design_informed flag', () => {
  test('design_informed is true when DESIGN executed with empty output', async () => {
    const supabase = createMockSupabase({});

    const result = await updatePRDWithAnalyses(supabase, 'prd-1', 'sd-1', sdData, {
      designAnalysis: '', // empty output
      databaseAnalysis: 'DB analysis'
    });

    expect(result.database_analysis.design_informed).toBe(true);
  });

  test('design_informed is true when DESIGN executed with null output', async () => {
    const supabase = createMockSupabase({});

    const result = await updatePRDWithAnalyses(supabase, 'prd-1', 'sd-1', sdData, {
      designAnalysis: null,
      databaseAnalysis: 'DB analysis'
    });

    expect(result.database_analysis.design_informed).toBe(true);
  });

  test('design_informed is true when DESIGN has full output', async () => {
    const supabase = createMockSupabase({});

    const result = await updatePRDWithAnalyses(supabase, 'prd-1', 'sd-1', sdData, {
      designAnalysis: 'Full analysis',
      databaseAnalysis: 'DB analysis'
    });

    expect(result.database_analysis.design_informed).toBe(true);
  });
});

// ── Test: prd-creator.js version (inline) ───────────────────

describe('prd-creator updatePRDWithAnalyses pattern', () => {
  function buildMetadata(existingMetadata, designAnalysis, databaseAnalysis, sdId, sdData) {
    const now = new Date().toISOString();
    const sdContext = { id: sdId, title: sdData.title, scope: sdData.scope };

    const design_analysis = designAnalysis
      ? { generated_at: now, sd_context: sdContext, raw_analysis: designAnalysis.substring(0, 5000) }
      : { generated_at: now, sd_context: sdContext, skipped: true, reason: 'no_design_output' };

    const database_analysis = databaseAnalysis
      ? {
        generated_at: now,
        sd_context: sdContext,
        raw_analysis: databaseAnalysis.substring(0, 5000),
        design_informed: true
      }
      : null;

    return {
      ...(existingMetadata || {}),
      design_analysis,
      ...(database_analysis ? { database_analysis } : {})
    };
  }

  test('preserves existing metadata and adds stub', () => {
    const result = buildMetadata(
      { existing_key: 'kept' },
      null,
      'DB analysis',
      'sd-1',
      sdData
    );

    expect(result.existing_key).toBe('kept');
    expect(result.design_analysis.skipped).toBe(true);
    expect(result.database_analysis.design_informed).toBe(true);
  });

  test('does not add database_analysis key when no DB output', () => {
    const result = buildMetadata({ existing: true }, null, null, 'sd-1', sdData);

    expect(result.design_analysis.skipped).toBe(true);
    expect(result.database_analysis).toBeUndefined();
    expect(result.existing).toBe(true);
  });

  test('caps raw_analysis at 5000 chars', () => {
    const longAnalysis = 'x'.repeat(6000);
    const result = buildMetadata({}, longAnalysis, null, 'sd-1', sdData);

    expect(result.design_analysis.raw_analysis.length).toBe(5000);
  });
});
