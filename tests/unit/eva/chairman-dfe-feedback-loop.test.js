import { describe, it, expect, vi } from 'vitest';
import {
  analyzeOverridePatterns,
  applyDecisionFeedback,
  getFeedbackSummary,
  enrichOverrideAudit,
  getRationaleCategories,
} from '../../../lib/eva/chairman-dfe-feedback-loop.js';

function mockSupabase(tableData = {}) {
  return {
    from: vi.fn((table) => {
      const data = tableData[table] || { data: [], error: null };
      const chain = {
        select: vi.fn(() => chain),
        eq: vi.fn(() => chain),
        gte: vi.fn(() => chain),
        order: vi.fn(() => chain),
        limit: vi.fn(() => chain),
        upsert: vi.fn(() => Promise.resolve(data.upsertResult || { error: null })),
        then: (resolve) => resolve(data),
      };
      return chain;
    }),
  };
}

const silentLogger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };

describe('chairman-dfe-feedback-loop', () => {
  describe('analyzeOverridePatterns', () => {
    it('returns empty when no supabase', async () => {
      const result = await analyzeOverridePatterns(null);
      expect(result.patterns).toEqual([]);
      expect(result.totalOverrides).toBe(0);
      expect(result.error).toBeDefined();
    });

    it('returns empty when no overrides', async () => {
      const supabase = mockSupabase({
        chairman_decisions: { data: [], error: null },
      });

      const result = await analyzeOverridePatterns(supabase, { logger: silentLogger });
      expect(result.patterns).toEqual([]);
      expect(result.totalOverrides).toBe(0);
    });

    it('detects patterns when threshold met', async () => {
      const decisions = Array.from({ length: 5 }, (_, i) => ({
        id: `d-${i}`,
        decision_type: 'override',
        status: 'approved',
        context: { trigger_type: 'cost_threshold' },
        created_at: new Date().toISOString(),
      }));

      const supabase = mockSupabase({
        chairman_decisions: { data: decisions, error: null },
      });

      const result = await analyzeOverridePatterns(supabase, { logger: silentLogger });
      expect(result.patterns).toHaveLength(1);
      expect(result.patterns[0].triggerType).toBe('cost_threshold');
      expect(result.patterns[0].overrideCount).toBe(5);
      expect(result.patterns[0].suggestion).toBeDefined();
      expect(result.patterns[0].confidence).toBeGreaterThan(0);
    });

    it('ignores patterns below threshold', async () => {
      const decisions = [
        { id: 'd1', decision_type: 'override', status: 'approved', context: { trigger_type: 'cost_threshold' }, created_at: new Date().toISOString() },
        { id: 'd2', decision_type: 'override', status: 'approved', context: { trigger_type: 'cost_threshold' }, created_at: new Date().toISOString() },
      ];

      const supabase = mockSupabase({
        chairman_decisions: { data: decisions, error: null },
      });

      const result = await analyzeOverridePatterns(supabase, { logger: silentLogger });
      expect(result.patterns).toEqual([]);
      expect(result.totalOverrides).toBe(2);
    });

    it('handles query failure', async () => {
      const supabase = mockSupabase({
        chairman_decisions: { data: null, error: { message: 'DB error' } },
      });

      const result = await analyzeOverridePatterns(supabase, { logger: silentLogger });
      expect(result.patterns).toEqual([]);
      expect(result.error).toBe('DB error');
    });

    it('respects custom pattern threshold', async () => {
      const decisions = Array.from({ length: 2 }, (_, i) => ({
        id: `d-${i}`,
        decision_type: 'override',
        status: 'approved',
        context: { trigger_type: 'low_score' },
        created_at: new Date().toISOString(),
      }));

      const supabase = mockSupabase({
        chairman_decisions: { data: decisions, error: null },
      });

      const result = await analyzeOverridePatterns(supabase, {
        logger: silentLogger,
        patternThreshold: 2, // Lower threshold
      });
      expect(result.patterns).toHaveLength(1);
      expect(result.patterns[0].triggerType).toBe('low_score');
    });
  });

  describe('applyDecisionFeedback', () => {
    it('returns empty when no supabase', async () => {
      const result = await applyDecisionFeedback(null, []);
      expect(result.adjustments).toEqual([]);
      expect(result.error).toBeDefined();
    });

    it('returns empty when no patterns', async () => {
      const supabase = mockSupabase();
      const result = await applyDecisionFeedback(supabase, [], { logger: silentLogger });
      expect(result.adjustments).toEqual([]);
    });

    it('applies feedback with dampening', async () => {
      const supabase = mockSupabase({
        chairman_preferences: { upsertResult: { error: null } },
      });

      const patterns = [{
        triggerType: 'cost_threshold',
        overrideCount: 5,
        confidence: 0.8,
        suggestion: {
          preferenceKey: 'filter.cost_max_usd',
          currentValue: 10000,
          suggestedValue: 13000, // 30% increase
        },
      }];

      const result = await applyDecisionFeedback(supabase, patterns, { logger: silentLogger });
      expect(result.adjustments).toHaveLength(1);
      expect(result.adjustments[0].applied).toBe(true);
      expect(result.adjustments[0].beforeValue).toBe(10000);
      // Dampened: 10000 + (13000-10000)*0.25 = 10750
      expect(result.adjustments[0].afterValue).toBe(10750);
    });

    it('skips patterns without preference mapping', async () => {
      const supabase = mockSupabase();
      const patterns = [{
        triggerType: 'unknown_type',
        overrideCount: 5,
        suggestion: { preferenceKey: null, note: 'No mapping' },
      }];

      const result = await applyDecisionFeedback(supabase, patterns, { logger: silentLogger });
      expect(result.adjustments).toEqual([]);
    });

    it('handles upsert failure', async () => {
      const supabase = {
        from: vi.fn(() => {
          const chain = {
            select: vi.fn(() => chain),
            eq: vi.fn(() => chain),
            order: vi.fn(() => chain),
            limit: vi.fn(() => chain),
            upsert: vi.fn(() => Promise.resolve({ error: { message: 'Write failed' } })),
            then: (resolve) => resolve({ data: [], error: null }),
          };
          return chain;
        }),
      };

      const patterns = [{
        triggerType: 'cost_threshold',
        overrideCount: 5,
        confidence: 0.8,
        suggestion: {
          preferenceKey: 'filter.cost_max_usd',
          currentValue: 10000,
          suggestedValue: 13000,
        },
      }];

      const result = await applyDecisionFeedback(supabase, patterns, { logger: silentLogger });
      expect(result.adjustments).toHaveLength(1);
      expect(result.adjustments[0].applied).toBe(false);
      expect(result.adjustments[0].error).toBe('Write failed');
    });

    it('clamps values within bounds', async () => {
      const supabase = mockSupabase({
        chairman_preferences: { upsertResult: { error: null } },
      });

      const patterns = [{
        triggerType: 'low_score',
        overrideCount: 10,
        confidence: 1.0,
        suggestion: {
          preferenceKey: 'filter.min_score',
          currentValue: 7,
          suggestedValue: -5, // Below minimum
        },
      }];

      const result = await applyDecisionFeedback(supabase, patterns, { logger: silentLogger });
      expect(result.adjustments).toHaveLength(1);
      // Dampened: 7 + (-5-7)*0.25 = 4, clamped to max(0, 4) = 4
      expect(result.adjustments[0].afterValue).toBeGreaterThanOrEqual(0);
    });
  });

  describe('getFeedbackSummary', () => {
    it('returns empty summary when no supabase', async () => {
      const { summary, error } = await getFeedbackSummary(null);
      expect(summary.totalAdjustments).toBe(0);
      expect(summary.recentAdjustments).toEqual([]);
      expect(error).toBeDefined();
    });

    it('returns empty summary when no preferences', async () => {
      const supabase = mockSupabase({
        chairman_preferences: { data: [], error: null },
      });

      const { summary } = await getFeedbackSummary(supabase, { logger: silentLogger });
      expect(summary.totalAdjustments).toBe(0);
      expect(summary.generatedAt).toBeDefined();
    });

    it('returns adjustment history', async () => {
      const prefs = [
        { key: 'filter.cost_max_usd', value: '10750', source: 'dfe_feedback_loop', updated_at: new Date().toISOString() },
        { key: 'filter.min_score', value: '5', source: 'dfe_feedback_loop', updated_at: new Date().toISOString() },
      ];

      const supabase = mockSupabase({
        chairman_preferences: { data: prefs, error: null },
      });

      const { summary } = await getFeedbackSummary(supabase, { logger: silentLogger });
      expect(summary.totalAdjustments).toBe(2);
      expect(summary.recentAdjustments[0].key).toBe('filter.cost_max_usd');
      expect(summary.recentAdjustments[0].currentValue).toBe(10750);
    });
  });

  describe('enrichOverrideAudit', () => {
    it('enriches with full context', () => {
      const { enriched } = enrichOverrideAudit({
        decision: { id: 'dec-1', decision_type: 'override' },
        beforeState: { score: 70 },
        afterState: { score: 85 },
        rationale: 'Business priority requires faster delivery',
        affectedSDs: ['SD-001', 'SD-002'],
      });

      expect(enriched.decisionId).toBe('dec-1');
      expect(enriched.beforeState).toEqual({ score: 70 });
      expect(enriched.afterState).toEqual({ score: 85 });
      expect(enriched.rationaleCategory).toBe('priority_override');
      expect(enriched.impactAssessment.affectedSDCount).toBe(2);
      expect(enriched.impactAssessment.estimatedScoreDelta).toBe(15);
      expect(enriched.enrichedAt).toBeDefined();
    });

    it('classifies risk acceptance rationale', () => {
      const { enriched } = enrichOverrideAudit({
        decision: { id: 'dec-2' },
        rationale: 'We accept the risk of deploying without full coverage',
      });
      expect(enriched.rationaleCategory).toBe('risk_accept');
    });

    it('classifies scope change rationale', () => {
      const { enriched } = enrichOverrideAudit({
        decision: { id: 'dec-3' },
        rationale: 'Scope changed — this trigger no longer applies',
      });
      expect(enriched.rationaleCategory).toBe('scope_change');
    });

    it('classifies false positive rationale', () => {
      const { enriched } = enrichOverrideAudit({
        decision: { id: 'dec-4' },
        rationale: 'This was a false positive — the score was calculated incorrectly',
      });
      expect(enriched.rationaleCategory).toBe('false_positive');
    });

    it('defaults to context_specific for ambiguous rationale', () => {
      const { enriched } = enrichOverrideAudit({
        decision: { id: 'dec-5' },
        rationale: 'One-time exception for this sprint',
      });
      expect(enriched.rationaleCategory).toBe('context_specific');
    });

    it('handles missing fields gracefully', () => {
      const { enriched } = enrichOverrideAudit({});
      expect(enriched.decisionId).toBeNull();
      expect(enriched.beforeState).toBeNull();
      expect(enriched.afterState).toBeNull();
      expect(enriched.rationaleCategory).toBe('context_specific');
      expect(enriched.impactAssessment.estimatedScoreDelta).toBe(0);
    });
  });

  describe('getRationaleCategories', () => {
    it('returns all categories', () => {
      const categories = getRationaleCategories();
      expect(categories).toContain('risk_accept');
      expect(categories).toContain('scope_change');
      expect(categories).toContain('priority_override');
      expect(categories).toContain('false_positive');
      expect(categories).toContain('context_specific');
      expect(categories).toHaveLength(5);
    });

    it('returns a copy (not the original)', () => {
      const a = getRationaleCategories();
      const b = getRationaleCategories();
      expect(a).not.toBe(b);
    });
  });
});
