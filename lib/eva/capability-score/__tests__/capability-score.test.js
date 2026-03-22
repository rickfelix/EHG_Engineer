/**
 * Unit Tests — Capability Contribution Score (CCS)
 * SD-LEO-ORCH-EVA-STAGE-PIPELINE-001-E
 *
 * Covers: stage-capability-weights, score-stage, cumulative-profile, compare-ventures
 */
import { describe, test, expect, vi, beforeEach } from 'vitest';

// ─── stage-capability-weights ───────────────────────────────────────

import {
  DIMENSIONS,
  STAGE_DIMENSION_WEIGHTS,
  DIMENSION_RUBRICS,
  DIMENSION_OVERALL_WEIGHTS,
} from '../stage-capability-weights.js';

describe('stage-capability-weights', () => {
  test('exports 5 dimensions', () => {
    expect(DIMENSIONS).toHaveLength(5);
    expect(DIMENSIONS).toContain('technical_depth');
    expect(DIMENSIONS).toContain('market_validation');
    expect(DIMENSIONS).toContain('financial_rigor');
    expect(DIMENSIONS).toContain('operational_readiness');
    expect(DIMENSIONS).toContain('strategic_alignment');
  });

  test('covers all 26 stages', () => {
    for (let s = 1; s <= 25; s++) {
      expect(STAGE_DIMENSION_WEIGHTS[s]).toBeDefined();
    }
  });

  test('each stage weight sums to 1.0', () => {
    for (let s = 1; s <= 25; s++) {
      const sum = Object.values(STAGE_DIMENSION_WEIGHTS[s]).reduce((a, b) => a + b, 0);
      expect(Math.abs(sum - 1.0)).toBeLessThan(0.001);
    }
  });

  test('each stage has all 5 dimensions', () => {
    for (let s = 1; s <= 25; s++) {
      for (const dim of DIMENSIONS) {
        expect(STAGE_DIMENSION_WEIGHTS[s][dim]).toBeDefined();
      }
    }
  });

  test('overall weights sum to 1.0', () => {
    const sum = Object.values(DIMENSION_OVERALL_WEIGHTS).reduce((a, b) => a + b, 0);
    expect(Math.abs(sum - 1.0)).toBeLessThan(0.001);
  });

  test('rubrics exist for all dimensions', () => {
    for (const dim of DIMENSIONS) {
      expect(DIMENSION_RUBRICS[dim]).toBeDefined();
      expect(typeof DIMENSION_RUBRICS[dim]).toBe('string');
      expect(DIMENSION_RUBRICS[dim].length).toBeGreaterThan(50);
    }
  });

  test('stage 1 emphasizes strategic_alignment and market_validation', () => {
    const s1 = STAGE_DIMENSION_WEIGHTS[1];
    expect(s1.strategic_alignment).toBeGreaterThanOrEqual(0.30);
    expect(s1.market_validation).toBeGreaterThanOrEqual(0.30);
  });

  test('stage 18 emphasizes technical_depth', () => {
    const s18 = STAGE_DIMENSION_WEIGHTS[18];
    expect(s18.technical_depth).toBeGreaterThanOrEqual(0.35);
  });
});

// ─── score-stage ────────────────────────────────────────────────────

import { computeCapabilityScore } from '../score-stage.js';

function mockLLMClient(response) {
  return {
    complete: vi.fn().mockResolvedValue(response),
  };
}

function mockSupabase(upsertResult = { error: null }) {
  return {
    from: vi.fn().mockReturnValue({
      upsert: vi.fn().mockResolvedValue(upsertResult),
    }),
  };
}

const MOCK_SCORES_RESPONSE = JSON.stringify({
  scores: {
    technical_depth: { score: 72, rationale: 'Good architecture choices' },
    market_validation: { score: 65, rationale: 'Reasonable market evidence' },
    financial_rigor: { score: 58, rationale: 'Basic financial model' },
    operational_readiness: { score: 45, rationale: 'Minimal ops planning' },
    strategic_alignment: { score: 80, rationale: 'Strong vision alignment' },
  },
});

describe('computeCapabilityScore', () => {
  const silentLogger = { log: vi.fn(), warn: vi.fn(), error: vi.fn() };

  test('returns null for null/undefined artifact', async () => {
    const result = await computeCapabilityScore(1, null, { logger: silentLogger });
    expect(result).toBeNull();
  });

  test('returns null for non-object artifact', async () => {
    const result = await computeCapabilityScore(1, 'string', { logger: silentLogger });
    expect(result).toBeNull();
  });

  test('returns null for unknown stage (no weight config)', async () => {
    const result = await computeCapabilityScore(99, { data: 'test' }, { logger: silentLogger });
    expect(result).toBeNull();
  });

  test('scores artifact with mock LLM and returns all 5 dimensions', async () => {
    const llmClient = mockLLMClient(MOCK_SCORES_RESPONSE);
    const result = await computeCapabilityScore(1, { description: 'Test venture idea' }, {
      ventureId: 'v-001',
      artifactId: 'a-001',
      llmClient,
      logger: silentLogger,
    });

    expect(result).not.toBeNull();
    expect(result.stageNumber).toBe(1);
    expect(result.ventureId).toBe('v-001');
    expect(result.scores.technical_depth.score).toBe(72);
    expect(result.scores.market_validation.score).toBe(65);
    expect(result.scores.financial_rigor.score).toBe(58);
    expect(result.scores.operational_readiness.score).toBe(45);
    expect(result.scores.strategic_alignment.score).toBe(80);
    expect(result.scoredAt).toBeDefined();
  });

  test('clamps scores to 0-100 range', async () => {
    const response = JSON.stringify({
      scores: {
        technical_depth: { score: 150, rationale: 'Over max' },
        market_validation: { score: -10, rationale: 'Under min' },
        financial_rigor: { score: 50, rationale: 'Normal' },
        operational_readiness: { score: 100, rationale: 'Max' },
        strategic_alignment: { score: 0, rationale: 'Min' },
      },
    });
    const result = await computeCapabilityScore(1, { data: 'test' }, {
      ventureId: 'v-001',
      llmClient: mockLLMClient(response),
      logger: silentLogger,
    });

    expect(result.scores.technical_depth.score).toBe(100);
    expect(result.scores.market_validation.score).toBe(0);
    expect(result.scores.financial_rigor.score).toBe(50);
  });

  test('handles missing dimension in LLM response gracefully', async () => {
    const response = JSON.stringify({
      scores: {
        technical_depth: { score: 70, rationale: 'ok' },
        // Missing other dimensions
      },
    });
    const result = await computeCapabilityScore(1, { data: 'test' }, {
      ventureId: 'v-001',
      llmClient: mockLLMClient(response),
      logger: silentLogger,
    });

    expect(result.scores.technical_depth.score).toBe(70);
    expect(result.scores.market_validation.score).toBeNull();
  });

  test('persists scores via UPSERT when supabase provided', async () => {
    const supabase = mockSupabase();
    const result = await computeCapabilityScore(1, { data: 'test' }, {
      ventureId: 'v-001',
      artifactId: 'a-001',
      supabase,
      llmClient: mockLLMClient(MOCK_SCORES_RESPONSE),
      logger: silentLogger,
    });

    expect(result).not.toBeNull();
    expect(supabase.from).toHaveBeenCalledWith('venture_capability_scores');
  });

  test('returns null when LLM throws (non-blocking)', async () => {
    const failingClient = {
      complete: vi.fn().mockRejectedValue(new Error('LLM unavailable')),
    };
    const result = await computeCapabilityScore(1, { data: 'test' }, {
      ventureId: 'v-001',
      llmClient: failingClient,
      logger: silentLogger,
    });

    expect(result).toBeNull();
    expect(silentLogger.warn).toHaveBeenCalled();
  });

  test('returns null when LLM response has no scores object', async () => {
    const result = await computeCapabilityScore(1, { data: 'test' }, {
      ventureId: 'v-001',
      llmClient: mockLLMClient(JSON.stringify({ invalid: true })),
      logger: silentLogger,
    });

    expect(result).toBeNull();
  });

  test('truncates rationale to 200 characters', async () => {
    const longRationale = 'A'.repeat(300);
    const response = JSON.stringify({
      scores: {
        technical_depth: { score: 70, rationale: longRationale },
        market_validation: { score: 60, rationale: 'ok' },
        financial_rigor: { score: 50, rationale: 'ok' },
        operational_readiness: { score: 40, rationale: 'ok' },
        strategic_alignment: { score: 80, rationale: 'ok' },
      },
    });
    const result = await computeCapabilityScore(1, { data: 'test' }, {
      ventureId: 'v-001',
      llmClient: mockLLMClient(response),
      logger: silentLogger,
    });

    expect(result.scores.technical_depth.rationale.length).toBeLessThanOrEqual(200);
  });
});

// ─── cumulative-profile ─────────────────────────────────────────────

import { getCumulativeProfile, getGateContext } from '../cumulative-profile.js';

function mockSupabaseQuery(data, error = null) {
  return {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          order: vi.fn().mockReturnValue({
            lte: vi.fn().mockResolvedValue({ data, error }),
            then: (fn) => fn({ data, error }),
          }),
          lte: vi.fn().mockReturnValue({
            then: (fn) => fn({ data, error }),
          }),
          then: (fn) => fn({ data, error }),
        }),
        lte: vi.fn().mockReturnValue({
          then: (fn) => fn({ data, error }),
        }),
        then: (fn) => fn({ data, error }),
      }),
    }),
  };
}

describe('getCumulativeProfile', () => {
  const silentLogger = { log: vi.fn(), warn: vi.fn() };

  test('returns empty profile when no scores exist', async () => {
    // Build a properly chained mock for: .from().select().eq().order()
    const supabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({
              lte: vi.fn().mockResolvedValue({ data: [], error: null }),
              then: (fn) => Promise.resolve(fn({ data: [], error: null })),
            }),
          }),
        }),
      }),
    };

    const result = await getCumulativeProfile('v-001', { supabase });

    expect(result.ventureId).toBe('v-001');
    expect(result.overall).toBeNull();
    expect(result.stagesScored).toBe(0);
    expect(result.gaps).toEqual([]);
  });

  test('computes weighted cumulative from scored data', async () => {
    const data = [
      { stage_number: 1, dimension: 'technical_depth', score: 70, rationale: 'ok', scored_at: '2026-01-01' },
      { stage_number: 1, dimension: 'market_validation', score: 80, rationale: 'ok', scored_at: '2026-01-01' },
      { stage_number: 1, dimension: 'financial_rigor', score: 40, rationale: 'ok', scored_at: '2026-01-01' },
      { stage_number: 1, dimension: 'operational_readiness', score: 50, rationale: 'ok', scored_at: '2026-01-01' },
      { stage_number: 1, dimension: 'strategic_alignment', score: 90, rationale: 'ok', scored_at: '2026-01-01' },
    ];

    const orderMock = vi.fn().mockResolvedValue({ data, error: null });
    const supabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: orderMock,
          }),
        }),
      }),
    };

    const result = await getCumulativeProfile('v-001', { supabase });

    expect(result.ventureId).toBe('v-001');
    expect(result.stagesScored).toBe(1);
    expect(result.overall).not.toBeNull();
    expect(result.overall).toBeGreaterThan(0);
    // financial_rigor at 40 should be a gap (< 40 threshold)
    // Actually 40 is not < 40, it's equal, so no gap
    expect(result.dimensions.technical_depth.cumulative).toBe(70);
    expect(result.dimensions.market_validation.cumulative).toBe(80);
  });

  test('detects capability gaps below 40', async () => {
    const data = [
      { stage_number: 1, dimension: 'technical_depth', score: 30, rationale: 'weak', scored_at: '2026-01-01' },
      { stage_number: 1, dimension: 'market_validation', score: 80, rationale: 'ok', scored_at: '2026-01-01' },
      { stage_number: 1, dimension: 'financial_rigor', score: 20, rationale: 'missing', scored_at: '2026-01-01' },
      { stage_number: 1, dimension: 'operational_readiness', score: 60, rationale: 'ok', scored_at: '2026-01-01' },
      { stage_number: 1, dimension: 'strategic_alignment', score: 75, rationale: 'ok', scored_at: '2026-01-01' },
    ];

    const supabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({ data, error: null }),
          }),
        }),
      }),
    };

    const result = await getCumulativeProfile('v-001', { supabase });

    expect(result.gaps).toHaveLength(2);
    expect(result.gaps.map(g => g.dimension)).toContain('technical_depth');
    expect(result.gaps.map(g => g.dimension)).toContain('financial_rigor');
  });

  test('computes trend from 2+ scores in same dimension', async () => {
    const data = [
      { stage_number: 1, dimension: 'technical_depth', score: 50, rationale: 'ok', scored_at: '2026-01-01' },
      { stage_number: 2, dimension: 'technical_depth', score: 70, rationale: 'better', scored_at: '2026-01-02' },
    ];

    const supabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({ data, error: null }),
          }),
        }),
      }),
    };

    const result = await getCumulativeProfile('v-001', { supabase });

    expect(result.dimensions.technical_depth.trend).toBe('improving');
  });

  test('throws on query error', async () => {
    const supabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({ data: null, error: { message: 'DB error' } }),
          }),
        }),
      }),
    };

    await expect(getCumulativeProfile('v-001', { supabase }))
      .rejects.toThrow('Failed to fetch capability scores');
  });
});

// ─── compare-ventures ───────────────────────────────────────────────

import { compareVentures } from '../compare-ventures.js';

describe('compareVentures', () => {
  test('returns empty when no data', async () => {
    const supabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          then: (fn) => Promise.resolve(fn({ data: [], error: null })),
        }),
      }),
    };

    const result = await compareVentures({ supabase });

    expect(result.ventures).toEqual([]);
    expect(result.sortBy).toBe('overall');
  });

  test('ranks ventures by overall score descending', async () => {
    const data = [
      { venture_id: 'v-1', stage_number: 1, dimension: 'technical_depth', score: 90 },
      { venture_id: 'v-1', stage_number: 1, dimension: 'market_validation', score: 85 },
      { venture_id: 'v-1', stage_number: 1, dimension: 'financial_rigor', score: 80 },
      { venture_id: 'v-1', stage_number: 1, dimension: 'operational_readiness', score: 75 },
      { venture_id: 'v-1', stage_number: 1, dimension: 'strategic_alignment', score: 70 },
      { venture_id: 'v-2', stage_number: 1, dimension: 'technical_depth', score: 40 },
      { venture_id: 'v-2', stage_number: 1, dimension: 'market_validation', score: 35 },
      { venture_id: 'v-2', stage_number: 1, dimension: 'financial_rigor', score: 30 },
      { venture_id: 'v-2', stage_number: 1, dimension: 'operational_readiness', score: 25 },
      { venture_id: 'v-2', stage_number: 1, dimension: 'strategic_alignment', score: 20 },
    ];

    const supabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockResolvedValue({ data, error: null }),
      }),
    };

    const result = await compareVentures({ supabase });

    expect(result.ventures).toHaveLength(2);
    expect(result.ventures[0].ventureId).toBe('v-1');
    expect(result.ventures[1].ventureId).toBe('v-2');
    expect(result.ventures[0].rank).toBe(1);
    expect(result.ventures[1].rank).toBe(2);
    expect(result.ventures[0].overall).toBeGreaterThan(result.ventures[1].overall);
  });

  test('sorts by specific dimension', async () => {
    const data = [
      { venture_id: 'v-1', stage_number: 1, dimension: 'technical_depth', score: 40 },
      { venture_id: 'v-1', stage_number: 1, dimension: 'market_validation', score: 90 },
      { venture_id: 'v-2', stage_number: 1, dimension: 'technical_depth', score: 80 },
      { venture_id: 'v-2', stage_number: 1, dimension: 'market_validation', score: 50 },
    ];

    const supabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockResolvedValue({ data, error: null }),
      }),
    };

    const result = await compareVentures({ supabase, sortBy: 'technical_depth' });

    expect(result.ventures[0].ventureId).toBe('v-2'); // TD=80 > TD=40
    expect(result.sortBy).toBe('technical_depth');
  });

  test('rejects invalid sortBy dimension', async () => {
    const supabase = { from: vi.fn() };
    await expect(compareVentures({ supabase, sortBy: 'invalid_dim' }))
      .rejects.toThrow('Invalid sortBy');
  });

  test('applies limit', async () => {
    const data = [];
    for (let i = 0; i < 10; i++) {
      for (const dim of DIMENSIONS) {
        data.push({ venture_id: `v-${i}`, stage_number: 1, dimension: dim, score: 50 + i });
      }
    }

    const supabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockResolvedValue({ data, error: null }),
      }),
    };

    const result = await compareVentures({ supabase, limit: 3 });

    expect(result.ventures).toHaveLength(3);
    expect(result.totalVentures).toBe(10);
  });

  test('applies stage range filters', async () => {
    const data = [
      { venture_id: 'v-1', stage_number: 3, dimension: 'technical_depth', score: 70 },
    ];

    const gteMock = vi.fn().mockReturnThis();
    const lteMock = vi.fn().mockResolvedValue({ data, error: null });

    const supabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          gte: gteMock,
          lte: lteMock,
        }),
      }),
    };

    // When stageMin is provided, gte is called
    const selectReturnValue = {
      gte: vi.fn().mockReturnValue({
        lte: vi.fn().mockResolvedValue({ data, error: null }),
      }),
    };
    const supabase2 = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue(selectReturnValue),
      }),
    };

    const result = await compareVentures({ supabase: supabase2, stageMin: 2, stageMax: 5 });

    expect(selectReturnValue.gte).toHaveBeenCalledWith('stage_number', 2);
  });
});

// ─── barrel export ──────────────────────────────────────────────────

describe('index barrel export', () => {
  test('re-exports all public APIs', async () => {
    const barrel = await import('../index.js');

    expect(barrel.computeCapabilityScore).toBeDefined();
    expect(barrel.getCumulativeProfile).toBeDefined();
    expect(barrel.getGateContext).toBeDefined();
    expect(barrel.compareVentures).toBeDefined();
    expect(barrel.DIMENSIONS).toBeDefined();
    expect(barrel.STAGE_DIMENSION_WEIGHTS).toBeDefined();
    expect(barrel.DIMENSION_RUBRICS).toBeDefined();
    expect(barrel.DIMENSION_OVERALL_WEIGHTS).toBeDefined();
  });
});
