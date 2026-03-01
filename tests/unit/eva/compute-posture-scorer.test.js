import { describe, it, expect, vi } from 'vitest';
import {
  scoreComputePosture,
  getPostureHealthSummary,
  getDimensionInfo,
} from '../../../lib/eva/compute-posture-scorer.js';

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

const fullPosture = {
  policy: 'awareness-not-enforcement',
  costThresholds: {
    LEAD: { warn: 50, escalate: 200 },
    PLAN: { warn: 100, escalate: 400 },
    EXEC: { warn: 200, escalate: 800 },
    REVIEW: { warn: 50, escalate: 200 },
    DEFAULT: { warn: 100, escalate: 500 },
  },
  blockOnExceed: false,
};

describe('compute-posture-scorer', () => {
  describe('scoreComputePosture', () => {
    it('returns error when no supabase', async () => {
      const result = await scoreComputePosture(null);
      expect(result.health.overallPercent).toBe(0);
      expect(result.error).toBeDefined();
    });

    it('scores complete posture config as 100% config', async () => {
      const supabase = mockSupabase({
        venture_token_ledger: { data: [{ venture_id: 'v1', created_at: new Date().toISOString() }], error: null },
      });

      const result = await scoreComputePosture(supabase, {
        logger: silentLogger,
        posture: fullPosture,
      });

      expect(result.health.configScore).toBe(100);
      expect(result.health.thresholdScore).toBe(100);
      expect(result.health.tokenScore).toBe(100);
      expect(result.health.overallPercent).toBe(100);
      expect(result.gaps).toHaveLength(0);
    });

    it('detects missing posture fields', async () => {
      const supabase = mockSupabase({
        venture_token_ledger: { data: [], error: null },
      });

      const result = await scoreComputePosture(supabase, {
        logger: silentLogger,
        posture: { policy: 'awareness-not-enforcement' }, // missing costThresholds, blockOnExceed
      });

      expect(result.health.configScore).toBe(33); // 1/3
      const configGaps = result.gaps.filter((g) => g.category === 'config');
      expect(configGaps).toHaveLength(2);
    });

    it('detects missing stage type thresholds', async () => {
      const supabase = mockSupabase({
        venture_token_ledger: { data: [], error: null },
      });

      const result = await scoreComputePosture(supabase, {
        logger: silentLogger,
        posture: {
          policy: 'awareness-not-enforcement',
          costThresholds: {
            LEAD: { warn: 50, escalate: 200 },
            // Missing PLAN, EXEC, REVIEW, DEFAULT
          },
          blockOnExceed: false,
        },
      });

      expect(result.health.thresholdScore).toBe(20); // 1/5
      const thresholdGaps = result.gaps.filter((g) => g.category === 'threshold');
      expect(thresholdGaps).toHaveLength(4); // 4 missing stage types
    });

    it('detects missing threshold keys (warn/escalate)', async () => {
      const supabase = mockSupabase({
        venture_token_ledger: { data: [], error: null },
      });

      const result = await scoreComputePosture(supabase, {
        logger: silentLogger,
        posture: {
          policy: 'awareness-not-enforcement',
          costThresholds: {
            LEAD: { warn: 50 }, // missing escalate
            PLAN: { warn: 100, escalate: 400 },
            EXEC: { warn: 200, escalate: 800 },
            REVIEW: { warn: 50, escalate: 200 },
            DEFAULT: { warn: 100, escalate: 500 },
          },
          blockOnExceed: false,
        },
      });

      // LEAD is incomplete (missing escalate), so 4/5 covered
      expect(result.health.thresholdScore).toBe(80);
      const thresholdGaps = result.gaps.filter((g) => g.category === 'threshold');
      expect(thresholdGaps.some((g) => g.item === 'LEAD.escalate')).toBe(true);
    });

    it('scores token tracking as 0% with no entries', async () => {
      const supabase = mockSupabase({
        venture_token_ledger: { data: [], error: null },
      });

      const result = await scoreComputePosture(supabase, {
        logger: silentLogger,
        posture: fullPosture,
      });

      expect(result.health.tokenScore).toBe(0);
      expect(result.tokenCoverage.totalEntries).toBe(0);
    });

    it('scores token tracking as 100% with entries present', async () => {
      const entries = [
        { venture_id: 'v1', created_at: new Date().toISOString() },
        { venture_id: 'v2', created_at: new Date().toISOString() },
      ];

      const supabase = mockSupabase({
        venture_token_ledger: { data: entries, error: null },
      });

      const result = await scoreComputePosture(supabase, {
        logger: silentLogger,
        posture: fullPosture,
      });

      expect(result.health.tokenScore).toBe(100);
      expect(result.tokenCoverage.totalEntries).toBe(2);
      expect(result.tokenCoverage.uniqueVentures).toBe(2);
    });

    it('handles token ledger query error gracefully', async () => {
      const supabase = mockSupabase({
        venture_token_ledger: { data: null, error: { message: 'Table not found' } },
      });

      const result = await scoreComputePosture(supabase, {
        logger: silentLogger,
        posture: fullPosture,
      });

      // Config and threshold should still score, token tracking fails
      expect(result.health.configScore).toBe(100);
      expect(result.health.tokenScore).toBe(0);
      const trackingGaps = result.gaps.filter((g) => g.category === 'tracking');
      expect(trackingGaps).toHaveLength(1);
    });

    it('reports policy in health output', async () => {
      const supabase = mockSupabase({
        venture_token_ledger: { data: [], error: null },
      });

      const result = await scoreComputePosture(supabase, {
        logger: silentLogger,
        posture: fullPosture,
      });

      expect(result.health.policy).toBe('awareness-not-enforcement');
    });
  });

  describe('getPostureHealthSummary', () => {
    it('returns error when no supabase', async () => {
      const { summary, error } = await getPostureHealthSummary(null);
      expect(summary.healthPercent).toBe(0);
      expect(error).toBeDefined();
    });

    it('returns health summary', async () => {
      const supabase = mockSupabase({
        venture_token_ledger: { data: [{ venture_id: 'v1', created_at: new Date().toISOString() }], error: null },
      });

      const { summary } = await getPostureHealthSummary(supabase, {
        logger: silentLogger,
        posture: fullPosture,
      });

      expect(summary.healthPercent).toBe(100);
      expect(summary.policy).toBe('awareness-not-enforcement');
      expect(summary.gapCount).toBe(0);
    });
  });

  describe('getDimensionInfo', () => {
    it('returns V07 info', () => {
      const info = getDimensionInfo();
      expect(info.dimension).toBe('V07');
      expect(info.name).toBe('Compute Posture');
      expect(info.expectedStageTypes).toHaveLength(5);
      expect(info.requiredThresholdKeys).toHaveLength(2);
    });
  });
});
