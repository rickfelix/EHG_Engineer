// SD-LEO-FEAT-MEDIA-PRODUCTION-CAPABILITY-001-C (FR-3, FR-4, FR-5, TS-1, TS-2, TS-3, TS-6)
import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

vi.mock('../../lib/creative/asset-view-gate.js', () => ({
  checkAssetViewAuthorized: vi.fn(),
}));

import { checkAssetViewAuthorized } from '../../lib/creative/asset-view-gate.js';
import { selectAssetVariant } from '../../lib/creative/variant-scoring-bridge.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Minimal thenable query-builder mock matching the real Supabase JS client's chaining shape.
// Keyed by table name so a single mock supabase instance can serve both queries the bridge issues.
function makeMockSupabase(tableResults) {
  return {
    from(table) {
      const result = tableResults[table] || { data: [], error: null };
      const builder = {
        select: () => builder,
        eq: () => builder,
        in: () => builder,
        limit: () => builder,
        then: (resolve) => Promise.resolve(result).then(resolve),
      };
      return builder;
    },
  };
}

describe('selectAssetVariant (FR-3/FR-4)', () => {
  beforeEach(() => {
    checkAssetViewAuthorized.mockReset();
  });

  it('TS-2/G4: excludes the entire venture (venture-uniform), returning the gate code verbatim', async () => {
    checkAssetViewAuthorized.mockResolvedValue({ allowed: false, reason: 'product_review_not_approved' });
    const supabase = makeMockSupabase({});
    const result = await selectAssetVariant({ supabase, ventureId: 'v1' });
    expect(result).toEqual({ status: 'gate_excluded', reason: 'product_review_not_approved' });
    // never queries the bridge/outcome tables once gate-excluded
  });

  it('TS-2 S24 leg: lifecycle_stage_gate_blocked is also rendered verbatim', async () => {
    checkAssetViewAuthorized.mockResolvedValue({ allowed: false, reason: 'lifecycle_stage_gate_blocked' });
    const supabase = makeMockSupabase({});
    const result = await selectAssetVariant({ supabase, ventureId: 'v1' });
    expect(result).toEqual({ status: 'gate_excluded', reason: 'lifecycle_stage_gate_blocked' });
  });

  it('missing_venture_id is rendered verbatim (3rd gate code)', async () => {
    checkAssetViewAuthorized.mockResolvedValue({ allowed: false, reason: 'missing_venture_id' });
    const supabase = makeMockSupabase({});
    const result = await selectAssetVariant({ supabase, ventureId: null });
    expect(result).toEqual({ status: 'gate_excluded', reason: 'missing_venture_id' });
  });

  it('TS-3: zero bridged rows for an approved venture returns a typed no_bridged_rows result', async () => {
    checkAssetViewAuthorized.mockResolvedValue({ allowed: true, reason: null });
    const supabase = makeMockSupabase({
      creative_asset_variant_scores: { data: [], error: null },
    });
    const result = await selectAssetVariant({ supabase, ventureId: 'v1' });
    expect(result).toEqual({ status: 'no_bridged_rows' });
  });

  it('bridged rows exist but zero outcome data (empty daily_rollups, FR-6) returns no_outcome_data, not a throw', async () => {
    checkAssetViewAuthorized.mockResolvedValue({ allowed: true, reason: null });
    const supabase = makeMockSupabase({
      creative_asset_variant_scores: {
        data: [{ creative_asset_id: 'ca1', variant_id: 'var1' }],
        error: null,
      },
      daily_rollups: { data: [], error: null },
    });
    const result = await selectAssetVariant({ supabase, ventureId: 'v1' });
    expect(result).toEqual({ status: 'no_outcome_data', candidateCount: 1 });
  });

  it('TS-1: happy path selects an invariant-consistent variant, resolvable back to the originating creative_asset', async () => {
    checkAssetViewAuthorized.mockResolvedValue({ allowed: true, reason: null });
    const supabase = makeMockSupabase({
      creative_asset_variant_scores: {
        data: [
          { creative_asset_id: 'ca1', variant_id: 'var1' },
          { creative_asset_id: 'ca2', variant_id: 'var2' },
        ],
        error: null,
      },
      daily_rollups: {
        data: [
          { variant_id: 'var1', impressions: 200, conversions: 40 },
          { variant_id: 'var2', impressions: 200, conversions: 10 },
        ],
        error: null,
      },
    });
    const result = await selectAssetVariant({ supabase, ventureId: 'v1' });
    expect(result.status).toBe('selected');
    // invariant checks (G1), never equality against a second live call
    expect(['var1', 'var2']).toContain(result.selection.variantId);
    expect(['single_variant', 'exploration_floor', 'thompson_sampling']).toContain(result.selection.selectionReason);
    // successes=conversions, failures=impressions-conversions, so alpha+beta=impressions+2=202 for both
    const expectedByVariant = { var1: 41 / 202, var2: 11 / 202 };
    expect(result.selection.posteriorMean).toBeCloseTo(expectedByVariant[result.selection.variantId], 10);
    expect(result.selection.creativeAssetId).toBe(result.selection.variantId === 'var1' ? 'ca1' : 'ca2');
    expect(result.candidateCount).toBe(2);
  });

  it('query_error status when a read fails (e.g. RLS denial, network)', async () => {
    checkAssetViewAuthorized.mockResolvedValue({ allowed: true, reason: null });
    const supabase = {
      from: () => ({
        select: () => ({ eq: () => ({ limit: () => ({ then: (resolve) => Promise.resolve({ data: null, error: { message: 'boom' } }).then(resolve) }) }) }),
      }),
    };
    const result = await selectAssetVariant({ supabase, ventureId: 'v1' });
    expect(result.status).toBe('query_error');
    expect(result.error).toMatch(/boom/);
  });

  it('TS-6/TR-4: zero IMPORTS of the unrelated experiment-assignment.js sampler (FR-5\'s canonical-sampler comment is allowed to NAME it in prose -- only import statements are checked)', () => {
    const importLines = (source) =>
      source.split('\n').filter((line) => /^\s*import\b/.test(line));
    const bridgeSource = fs.readFileSync(path.resolve(__dirname, '../../lib/creative/variant-scoring-bridge.js'), 'utf8');
    const derivationSource = fs.readFileSync(path.resolve(__dirname, '../../lib/marketing/ai/variant-outcome-derivation.js'), 'utf8');
    for (const line of [...importLines(bridgeSource), ...importLines(derivationSource)]) {
      expect(line).not.toMatch(/experiment-assignment/);
    }
  });
});
