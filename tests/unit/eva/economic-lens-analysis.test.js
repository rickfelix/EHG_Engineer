/**
 * Tests for Economic Lens Analysis Engine
 * SD: SD-LEO-FEAT-ECONOMIC-LENS-OPERATIONS-001
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createSupabaseChainMock } from '../../helpers/supabase-chain-mock.js';

// Must mock before importing
vi.mock('../../../lib/llm/index.js', () => ({
  getLLMClient: vi.fn(() => ({
    complete: vi.fn()
  }))
}));

import { SCORE_RUBRIC, AXIS_NAMES } from '../../../lib/eva/economic-lens-analysis.js';
import { getLLMClient } from '../../../lib/llm/index.js';

describe('EconomicLensAnalysis', () => {
  describe('SCORE_RUBRIC', () => {
    it('should have all 6 axes defined', () => {
      expect(AXIS_NAMES).toHaveLength(6);
      expect(AXIS_NAMES).toContain('market_structure');
      expect(AXIS_NAMES).toContain('network_effects');
      expect(AXIS_NAMES).toContain('unit_economics');
      expect(AXIS_NAMES).toContain('market_timing');
      expect(AXIS_NAMES).toContain('entry_barriers');
      expect(AXIS_NAMES).toContain('scale_economics');
    });

    it('should map market_structure classifications to scores', () => {
      const ms = SCORE_RUBRIC.market_structure;
      expect(ms.EMERGING).toBe(8);
      expect(ms.TIGHT_OLIGOPOLY).toBe(4);
      expect(ms.MONOPOLY).toBe(2);
    });

    it('should map network_effects classifications to scores', () => {
      const ne = SCORE_RUBRIC.network_effects;
      expect(ne.DIRECT_STRONG).toBe(10);
      expect(ne.NONE).toBe(1);
    });

    it('should map unit_economics classifications to scores', () => {
      const ue = SCORE_RUBRIC.unit_economics;
      expect(ue.STRONG).toBe(9);
      expect(ue.NEGATIVE).toBe(1);
    });

    it('should map market_timing classifications to scores', () => {
      const mt = SCORE_RUBRIC.market_timing;
      expect(mt.RIGHT_ON_TIME).toBe(10);
      expect(mt.TOO_LATE).toBe(1);
    });

    it('should map entry_barriers classifications inversely (low = favorable)', () => {
      const eb = SCORE_RUBRIC.entry_barriers;
      expect(eb.LOW).toBe(9);
      expect(eb.PROHIBITIVE).toBe(1);
    });

    it('should map scale_economics classifications to scores', () => {
      const se = SCORE_RUBRIC.scale_economics;
      expect(se.STRONG_ECONOMIES).toBe(9);
      expect(se.DISECONOMIES).toBe(1);
    });

    it('should produce scores between 1 and 10 for all classifications', () => {
      for (const axis of AXIS_NAMES) {
        const rubric = SCORE_RUBRIC[axis];
        for (const [classification, score] of Object.entries(rubric)) {
          expect(score).toBeGreaterThanOrEqual(1);
          expect(score).toBeLessThanOrEqual(10);
        }
      }
    });
  });

  describe('analyzeEconomicLens', () => {
    let mockSupabase;
    let mockLLMClient;

    const validLLMResponse = JSON.stringify({
      axes: {
        market_structure: { classification: 'EMERGING', confidence: 0.8, rationale: 'Test' },
        network_effects: { classification: 'INDIRECT_STRONG', confidence: 0.7, rationale: 'Test', cold_start_severity: 'HIGH', multi_homing_risk: 'MODERATE', winner_take_all: false },
        unit_economics: { classification: 'STRONG', confidence: 0.9, rationale: 'Test', cost_curve_type: 'DECREASING', breakeven_inflection: '1000 users' },
        market_timing: { classification: 'RIGHT_ON_TIME', confidence: 0.8, rationale: 'Test', window_status: 'OPEN', first_mover_value: 'HIGH' },
        entry_barriers: { classification: 'LOW', confidence: 0.7, rationale: 'Test', highest_risk_barrier: 'switching_costs' },
        scale_economics: { classification: 'STRONG_ECONOMIES', confidence: 0.8, rationale: 'Test', operating_leverage: 'HIGH' }
      },
      overall_risk_level: 'LOW',
      overall_assessment: 'Strong economic profile'
    });

    beforeEach(() => {
      mockLLMClient = { complete: vi.fn() };
      getLLMClient.mockReturnValue(mockLLMClient);

      // Cache-hit path mock (single .single() resolver is overridden per-test).
      mockSupabase = createSupabaseChainMock();
    });

    it('should return cached result when available and not forcing refresh', async () => {
      const { analyzeEconomicLens } = await import('../../../lib/eva/economic-lens-analysis.js');

      const cachedData = { axes: { market_structure: { classification: 'EMERGING' } } };
      mockSupabase.single.mockResolvedValueOnce({
        data: { id: 'cached-id', artifact_data: cachedData, created_at: '2026-01-01' },
        error: null
      });

      const result = await analyzeEconomicLens('venture-123', { supabase: mockSupabase });

      expect(result.cached).toBe(true);
      expect(result.artifact_id).toBe('cached-id');
      expect(result.analysis).toEqual(cachedData);
      expect(mockLLMClient.complete).not.toHaveBeenCalled();
    });

    it('should call LLM when forcing refresh', async () => {
      const { analyzeEconomicLens } = await import('../../../lib/eva/economic-lens-analysis.js');

      // forceRefresh path issues these terminal reads/writes in order:
      //   single():     (1) ventures lookup, (2) insert .select('id').single()
      //                 from writeArtifact, (3) created_at fetch
      //   maybeSingle(): writeArtifact dedup (no existing → null)
      //   order():      fetchUpstreamContext (awaited → empty array)
      // A single chainable+thenable mock composes the deep .eq()/.limit() chains;
      // we sequence only the terminal resolvers (the old bespoke mock lacked
      // maybeSingle → "dedupQuery.limit(...).maybeSingle is not a function").
      const sb = createSupabaseChainMock();
      sb.single
        .mockResolvedValueOnce({ data: { id: 'v1', name: 'Test Venture' }, error: null }) // ventures
        .mockResolvedValueOnce({ data: { id: 'new-id' }, error: null })                   // insert .select('id')
        .mockResolvedValueOnce({ data: { id: 'new-id', created_at: '2026-03-11' }, error: null }); // created_at fetch
      sb.maybeSingle.mockResolvedValue({ data: null, error: null }); // writeArtifact dedup: no existing
      // fetchUpstreamContext awaits the chain after .order(); resolve to no rows.
      sb.__setResult({ data: [], error: null });

      mockLLMClient.complete.mockResolvedValueOnce({
        content: validLLMResponse,
        model: 'claude-sonnet-4-20250514'
      });

      const result = await analyzeEconomicLens('venture-123', { supabase: sb, forceRefresh: true });

      expect(result.cached).toBe(false);
      expect(result.artifact_id).toBe('new-id');
      expect(mockLLMClient.complete).toHaveBeenCalled();
    });
  });
});
