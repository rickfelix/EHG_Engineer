/**
 * Unit tests for Strategy Recommender module
 * SD-S17-STRATEGYFIRST-DESIGN-DIRECTION-ORCH-001-A
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock dependencies before importing
vi.mock('../../../lib/eva/artifact-persistence-service.js', () => ({
  writeArtifact: vi.fn().mockResolvedValue('mock-artifact-id'),
}));

vi.mock('../../../lib/eva/stage-17/strategy-stats.js', () => ({
  getStrategyReorderHints: vi.fn().mockResolvedValue(null),
}));

const { recommendStrategies } = await import('../../../lib/eva/stage-17/strategy-recommender.js');

function createMockSupabase(artifactRows = []) {
  const chain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    then: vi.fn(),
  };

  // Make chain thenable (returns artifact data)
  chain.then = vi.fn((onFulfill) => {
    return Promise.resolve(onFulfill({ data: artifactRows, error: null }));
  });

  // Also make it awaitable directly
  const fromFn = vi.fn().mockReturnValue(chain);
  return { from: fromFn, _chain: chain };
}

describe('strategy-recommender', () => {
  describe('recommendStrategies', () => {
    it('returns 4 strategies with equal scores when no upstream data', async () => {
      const supabase = createMockSupabase([]);
      const result = await recommendStrategies('test-venture-id', supabase);

      expect(result.ranked_strategies).toHaveLength(4);
      expect(result.fallback_used).toBe(true);
      expect(result.recommended_top_2).toHaveLength(2);

      // All scores should be equal (50) in fallback mode
      const scores = result.ranked_strategies.map(r => r.fit_score);
      expect(new Set(scores).size).toBe(1);
      expect(scores[0]).toBe(50);
    });

    it('returns differentiated scores when upstream data exists', async () => {
      const supabase = createMockSupabase([
        {
          artifact_type: 'identity_persona_brand',
          artifact_data: { audience: 'B2B enterprise', tone: 'professional' },
        },
        {
          artifact_type: 'truth_financial_model',
          artifact_data: { model: 'SaaS subscription revenue' },
        },
      ]);
      const result = await recommendStrategies('test-venture-id', supabase);

      expect(result.ranked_strategies).toHaveLength(4);
      expect(result.fallback_used).toBe(false);
      expect(result.upstream_artifacts_found).toContain('identity_persona_brand');
      expect(result.upstream_artifacts_found).toContain('truth_financial_model');

      // Scores should be differentiated
      const scores = result.ranked_strategies.map(r => r.fit_score);
      expect(new Set(scores).size).toBeGreaterThan(1);
    });

    it('is deterministic — same inputs produce same output', async () => {
      const artifacts = [
        { artifact_type: 'identity_persona_brand', artifact_data: { audience: 'B2C consumer', brand: 'creative' } },
      ];

      const result1 = await recommendStrategies('v1', createMockSupabase(artifacts));
      const result2 = await recommendStrategies('v1', createMockSupabase(artifacts));

      expect(result1.ranked_strategies.map(r => r.strategy))
        .toEqual(result2.ranked_strategies.map(r => r.strategy));
      expect(result1.ranked_strategies.map(r => r.fit_score))
        .toEqual(result2.ranked_strategies.map(r => r.fit_score));
    });

    it('includes rationale text for each strategy', async () => {
      const supabase = createMockSupabase([
        { artifact_type: 'identity_persona_brand', artifact_data: { desc: 'professional B2B SaaS' } },
      ]);
      const result = await recommendStrategies('test-venture-id', supabase);

      for (const r of result.ranked_strategies) {
        expect(r.rationale).toBeTruthy();
        expect(typeof r.rationale).toBe('string');
      }
    });

    it('reports missing upstream artifacts', async () => {
      const supabase = createMockSupabase([
        { artifact_type: 'identity_persona_brand', artifact_data: { desc: 'B2B' } },
      ]);
      const result = await recommendStrategies('test-venture-id', supabase);

      expect(result.upstream_artifacts_missing.length).toBeGreaterThan(0);
      expect(result.upstream_artifacts_missing).toContain('truth_financial_model');
    });

    it('recommended_top_2 contains first 2 ranked strategies', async () => {
      const supabase = createMockSupabase([
        { artifact_type: 'identity_persona_brand', artifact_data: { brand: 'bold creative agency' } },
      ]);
      const result = await recommendStrategies('test-venture-id', supabase);

      expect(result.recommended_top_2).toHaveLength(2);
      expect(result.recommended_top_2[0]).toBe(result.ranked_strategies[0].strategy);
      expect(result.recommended_top_2[1]).toBe(result.ranked_strategies[1].strategy);
    });

    it('ranks are sequential 1-4', async () => {
      const supabase = createMockSupabase([]);
      const result = await recommendStrategies('test-venture-id', supabase);

      const ranks = result.ranked_strategies.map(r => r.rank);
      expect(ranks).toEqual([1, 2, 3, 4]);
    });
  });
});
