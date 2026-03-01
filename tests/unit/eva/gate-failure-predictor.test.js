import { describe, it, expect, vi } from 'vitest';
import {
  predictGateFailures,
  getGatePerformanceSummary,
  getConfidenceLevels,
} from '../../../lib/eva/gate-failure-predictor.js';

function mockSupabase(tableData = {}) {
  return {
    from: vi.fn((table) => {
      const data = tableData[table] || { data: [], error: null };
      const chain = {
        select: vi.fn(() => chain),
        eq: vi.fn(() => chain),
        in: vi.fn(() => chain),
        gte: vi.fn(() => chain),
        order: vi.fn(() => chain),
        limit: vi.fn(() => chain),
        insert: vi.fn(() => ({ data: null, error: null })),
        then: (resolve) => resolve(data),
      };
      return chain;
    }),
  };
}

const silentLogger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };

describe('gate-failure-predictor', () => {
  describe('predictGateFailures', () => {
    it('returns error when missing params', async () => {
      const result = await predictGateFailures(null, {});
      expect(result.predictions).toEqual([]);
      expect(result.error).toBe('Missing required params');
    });

    it('returns error when no sdType', async () => {
      const supabase = mockSupabase();
      const result = await predictGateFailures(supabase, { sdId: 'sd-1' });
      expect(result.predictions).toEqual([]);
      expect(result.error).toBe('Missing required params');
    });

    it('returns neutral predictions with insufficient data', async () => {
      const handoffs = Array.from({ length: 5 }, (_, i) => ({
        id: `h-${i}`,
        handoff_type: 'LEAD-TO-PLAN',
        status: 'accepted',
        validation_score: 90,
        sd_id: `sd-${i}`,
        created_at: new Date().toISOString(),
      }));

      const sds = handoffs.map((h) => ({
        id: h.sd_id,
        sd_type: 'infrastructure',
      }));

      const supabase = mockSupabase({
        sd_phase_handoffs: { data: handoffs, error: null },
        strategic_directives_v2: { data: sds, error: null },
      });

      const result = await predictGateFailures(supabase, {
        sdId: 'sd-new',
        sdType: 'infrastructure',
      }, { logger: silentLogger });

      expect(result.confidence).toBe('low');
      expect(result.sampleSize).toBe(5);
      expect(result.note).toBeDefined();
      // Neutral predictions returned
      for (const p of result.predictions) {
        expect(p.failureProbability).toBe(0.5);
        expect(p.riskLevel).toBe('unknown');
      }
    });

    it('calculates failure rates with sufficient data', async () => {
      // Create 15 handoffs: 5 failed LEAD-TO-PLAN, 10 passed
      const handoffs = [];
      for (let i = 0; i < 15; i++) {
        handoffs.push({
          id: `h-${i}`,
          handoff_type: 'LEAD-TO-PLAN',
          status: i < 5 ? 'rejected' : 'accepted',
          validation_score: i < 5 ? 60 : 95,
          sd_id: `sd-${i}`,
          created_at: new Date().toISOString(),
        });
      }

      const sds = handoffs.map((h) => ({
        id: h.sd_id,
        sd_type: 'feature',
      }));

      const supabase = mockSupabase({
        sd_phase_handoffs: { data: handoffs, error: null },
        strategic_directives_v2: { data: sds, error: null },
      });

      const result = await predictGateFailures(supabase, {
        sdId: 'sd-new',
        sdType: 'feature',
      }, { logger: silentLogger });

      expect(result.confidence).toBe('medium');
      expect(result.predictions).toHaveLength(1);
      expect(result.predictions[0].gate).toBe('LEAD-TO-PLAN');
      expect(result.predictions[0].failureProbability).toBeCloseTo(0.33, 1);
      expect(result.predictions[0].riskLevel).toBe('medium');
      expect(result.predictions[0].failedCount).toBe(5);
      expect(result.predictions[0].avgScore).toBeDefined();
    });

    it('filters by handoff type when specified', async () => {
      const handoffs = [];
      for (let i = 0; i < 20; i++) {
        handoffs.push({
          id: `h-${i}`,
          handoff_type: i < 10 ? 'LEAD-TO-PLAN' : 'PLAN-TO-EXEC',
          status: i < 3 ? 'rejected' : 'accepted',
          validation_score: 90,
          sd_id: `sd-${i}`,
          created_at: new Date().toISOString(),
        });
      }

      const sds = handoffs.map((h) => ({
        id: h.sd_id,
        sd_type: 'infrastructure',
      }));

      const supabase = mockSupabase({
        sd_phase_handoffs: { data: handoffs, error: null },
        strategic_directives_v2: { data: sds, error: null },
      });

      const result = await predictGateFailures(supabase, {
        sdId: 'sd-new',
        sdType: 'infrastructure',
        handoffType: 'LEAD-TO-PLAN',
      }, { logger: silentLogger });

      expect(result.predictions).toHaveLength(1);
      expect(result.predictions[0].gate).toBe('LEAD-TO-PLAN');
    });

    it('assigns high confidence with 30+ samples', async () => {
      const handoffs = Array.from({ length: 35 }, (_, i) => ({
        id: `h-${i}`,
        handoff_type: 'LEAD-TO-PLAN',
        status: 'accepted',
        validation_score: 95,
        sd_id: `sd-${i}`,
        created_at: new Date().toISOString(),
      }));

      const sds = handoffs.map((h) => ({
        id: h.sd_id,
        sd_type: 'infrastructure',
      }));

      const supabase = mockSupabase({
        sd_phase_handoffs: { data: handoffs, error: null },
        strategic_directives_v2: { data: sds, error: null },
      });

      const result = await predictGateFailures(supabase, {
        sdId: 'sd-new',
        sdType: 'infrastructure',
      }, { logger: silentLogger });

      expect(result.confidence).toBe('high');
    });

    it('sorts predictions by failure probability descending', async () => {
      const handoffs = [];
      // LEAD-TO-PLAN: 2/12 failed (17%)
      for (let i = 0; i < 12; i++) {
        handoffs.push({
          id: `ltp-${i}`,
          handoff_type: 'LEAD-TO-PLAN',
          status: i < 2 ? 'rejected' : 'accepted',
          validation_score: 90,
          sd_id: `sd-a-${i}`,
          created_at: new Date().toISOString(),
        });
      }
      // PLAN-TO-EXEC: 6/12 failed (50%)
      for (let i = 0; i < 12; i++) {
        handoffs.push({
          id: `pte-${i}`,
          handoff_type: 'PLAN-TO-EXEC',
          status: i < 6 ? 'failed' : 'accepted',
          validation_score: 80,
          sd_id: `sd-b-${i}`,
          created_at: new Date().toISOString(),
        });
      }

      const sds = handoffs.map((h) => ({
        id: h.sd_id,
        sd_type: 'feature',
      }));

      const supabase = mockSupabase({
        sd_phase_handoffs: { data: handoffs, error: null },
        strategic_directives_v2: { data: sds, error: null },
      });

      const result = await predictGateFailures(supabase, {
        sdId: 'sd-new',
        sdType: 'feature',
      }, { logger: silentLogger });

      expect(result.predictions).toHaveLength(2);
      // PLAN-TO-EXEC should be first (higher failure rate)
      expect(result.predictions[0].gate).toBe('PLAN-TO-EXEC');
      expect(result.predictions[0].failureProbability).toBe(0.5);
      expect(result.predictions[1].gate).toBe('LEAD-TO-PLAN');
    });

    it('handles query error gracefully', async () => {
      const supabase = mockSupabase({
        sd_phase_handoffs: { data: null, error: { message: 'DB error' } },
      });

      const result = await predictGateFailures(supabase, {
        sdId: 'sd-1',
        sdType: 'feature',
      }, { logger: silentLogger });

      expect(result.predictions).toEqual([]);
      expect(result.error).toBe('DB error');
    });

    it('provides recommendations based on risk level', async () => {
      const handoffs = Array.from({ length: 20 }, (_, i) => ({
        id: `h-${i}`,
        handoff_type: 'PLAN-TO-EXEC',
        status: i < 12 ? 'rejected' : 'accepted', // 60% failure
        validation_score: 50,
        sd_id: `sd-${i}`,
        created_at: new Date().toISOString(),
      }));

      const sds = handoffs.map((h) => ({
        id: h.sd_id,
        sd_type: 'feature',
      }));

      const supabase = mockSupabase({
        sd_phase_handoffs: { data: handoffs, error: null },
        strategic_directives_v2: { data: sds, error: null },
      });

      const result = await predictGateFailures(supabase, {
        sdId: 'sd-new',
        sdType: 'feature',
      }, { logger: silentLogger });

      expect(result.predictions[0].riskLevel).toBe('high');
      expect(result.predictions[0].recommendation).toContain('High failure rate');
    });
  });

  describe('getGatePerformanceSummary', () => {
    it('returns error when no supabase', async () => {
      const { summary, error } = await getGatePerformanceSummary(null);
      expect(summary.totalHandoffs).toBe(0);
      expect(error).toBeDefined();
    });

    it('returns performance metrics', async () => {
      const handoffs = [
        { id: 'h1', handoff_type: 'LEAD-TO-PLAN', status: 'accepted', validation_score: 95, created_at: new Date().toISOString() },
        { id: 'h2', handoff_type: 'PLAN-TO-EXEC', status: 'accepted', validation_score: 88, created_at: new Date().toISOString() },
        { id: 'h3', handoff_type: 'LEAD-TO-PLAN', status: 'rejected', validation_score: 60, created_at: new Date().toISOString() },
      ];

      const supabase = mockSupabase({
        sd_phase_handoffs: { data: handoffs, error: null },
      });

      const { summary } = await getGatePerformanceSummary(supabase, { logger: silentLogger });
      expect(summary.totalHandoffs).toBe(3);
      expect(summary.totalPassed).toBe(2);
      expect(summary.totalFailed).toBe(1);
      expect(summary.passRate).toBe(67); // 2/3
      expect(summary.avgScore).toBe(81); // (95+88+60)/3
    });

    it('handles empty data', async () => {
      const supabase = mockSupabase({
        sd_phase_handoffs: { data: [], error: null },
      });

      const { summary } = await getGatePerformanceSummary(supabase, { logger: silentLogger });
      expect(summary.totalHandoffs).toBe(0);
      expect(summary.passRate).toBe(0);
      expect(summary.avgScore).toBe(0);
    });
  });

  describe('getConfidenceLevels', () => {
    it('returns all levels', () => {
      const levels = getConfidenceLevels();
      expect(levels.HIGH).toBe('high');
      expect(levels.MEDIUM).toBe('medium');
      expect(levels.LOW).toBe('low');
    });

    it('returns a copy', () => {
      const levels = getConfidenceLevels();
      levels.HIGH = 'modified';
      expect(getConfidenceLevels().HIGH).toBe('high');
    });
  });
});
