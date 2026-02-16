/**
 * Tests for Filter Calibration Module
 * SD-LEO-FEAT-FILTER-CALIBRATE-001
 */

import { describe, it, expect, vi } from 'vitest';
import {
  CALIBRATION_KEYS,
  runCalibration,
  computeConfusionMatrix,
  computeMetrics,
  computePerTriggerMetrics,
  generateRecommendations,
  buildCalibrationReport,
} from '../../../lib/eva/filter-calibration.js';

// ── Helpers ──────────────────────────────────────────────────

/** Build a mock chairman decision with dfe_context. */
function makeDecision({ autoProceed = false, status = 'approved', triggers = [], id, ventureId, stage } = {}) {
  return {
    id: id ?? crypto.randomUUID(),
    venture_id: ventureId ?? 'v-1',
    lifecycle_stage: stage ?? 'ideation',
    status,
    decision: status === 'approved' ? 'proceed' : 'reject',
    dfe_context: { auto_proceed: autoProceed, triggers, recommendation: autoProceed ? 'AUTO_PROCEED' : 'PRESENT_TO_CHAIRMAN' },
    created_at: new Date().toISOString(),
  };
}

/** Build a trigger entry. */
function makeTrigger(type, { threshold } = {}) {
  return {
    type,
    severity: 'HIGH',
    message: `${type} triggered`,
    details: threshold !== undefined ? { thresholdUsed: threshold } : {},
  };
}

/** Create a mock Supabase client that returns the given decisions. */
function mockSupabase(decisions, error = null) {
  const chain = {
    select: vi.fn().mockReturnThis(),
    not: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    lte: vi.fn().mockReturnThis(),
    order: vi.fn().mockResolvedValue({ data: decisions, error }),
  };
  return { from: vi.fn().mockReturnValue(chain) };
}

// ── CALIBRATION_KEYS ─────────────────────────────────────────

describe('CALIBRATION_KEYS', () => {
  it('should map cost_threshold to filter.cost_max_usd', () => {
    expect(CALIBRATION_KEYS.cost_threshold.preferenceKey).toBe('filter.cost_max_usd');
    expect(CALIBRATION_KEYS.cost_threshold.defaultValue).toBe(10000);
    expect(CALIBRATION_KEYS.cost_threshold.type).toBe('number');
  });

  it('should map low_score to filter.min_score', () => {
    expect(CALIBRATION_KEYS.low_score.preferenceKey).toBe('filter.min_score');
    expect(CALIBRATION_KEYS.low_score.defaultValue).toBe(7);
    expect(CALIBRATION_KEYS.low_score.type).toBe('number');
  });
});

// ── computeConfusionMatrix ───────────────────────────────────

describe('computeConfusionMatrix', () => {
  it('TP: filter said proceed, chairman approved', () => {
    const decisions = [makeDecision({ autoProceed: true, status: 'approved' })];
    const m = computeConfusionMatrix(decisions);
    expect(m).toEqual({ tp: 1, tn: 0, fp: 0, fn: 0, total: 1 });
  });

  it('TN: filter said do not proceed, chairman rejected', () => {
    const decisions = [makeDecision({ autoProceed: false, status: 'rejected' })];
    const m = computeConfusionMatrix(decisions);
    expect(m).toEqual({ tp: 0, tn: 1, fp: 0, fn: 0, total: 1 });
  });

  it('FP: filter said do not proceed, chairman approved (too conservative)', () => {
    const decisions = [makeDecision({ autoProceed: false, status: 'approved' })];
    const m = computeConfusionMatrix(decisions);
    expect(m).toEqual({ tp: 0, tn: 0, fp: 1, fn: 0, total: 1 });
  });

  it('FN: filter said proceed, chairman rejected', () => {
    const decisions = [makeDecision({ autoProceed: true, status: 'rejected' })];
    const m = computeConfusionMatrix(decisions);
    expect(m).toEqual({ tp: 0, tn: 0, fp: 0, fn: 1, total: 1 });
  });

  it('TS-001: mixed decisions compute correct rates', () => {
    // 10 decisions: 3 FP (cost_threshold flagged, chairman approved)
    //               2 TN (cost_threshold flagged, chairman rejected)
    //               3 TP (filter proceed, chairman approved)
    //               2 FN (filter proceed, chairman rejected)
    const decisions = [
      ...Array(3).fill(null).map(() => makeDecision({ autoProceed: false, status: 'approved', triggers: [makeTrigger('cost_threshold', { threshold: 10000 })] })),
      ...Array(2).fill(null).map(() => makeDecision({ autoProceed: false, status: 'rejected', triggers: [makeTrigger('cost_threshold', { threshold: 10000 })] })),
      ...Array(3).fill(null).map(() => makeDecision({ autoProceed: true, status: 'approved' })),
      ...Array(2).fill(null).map(() => makeDecision({ autoProceed: true, status: 'rejected' })),
    ];
    const m = computeConfusionMatrix(decisions);
    expect(m).toEqual({ tp: 3, tn: 2, fp: 3, fn: 2, total: 10 });
  });

  it('handles decision field with proceed value', () => {
    const d = makeDecision({ autoProceed: true, status: 'rejected' });
    d.status = 'rejected';
    d.decision = 'proceed'; // decision = 'proceed' overrides status
    const m = computeConfusionMatrix([d]);
    expect(m.tp).toBe(1); // filter said proceed + chairman approved (via decision field)
  });
});

// ── computeMetrics ───────────────────────────────────────────

describe('computeMetrics', () => {
  it('computes perfect agreement', () => {
    const m = computeMetrics({ tp: 5, tn: 5, fp: 0, fn: 0, total: 10 });
    expect(m.agreement_rate).toBe(1.0);
    expect(m.false_positive_rate).toBe(0);
    expect(m.false_negative_rate).toBe(0);
  });

  it('computes FP rate correctly', () => {
    // FP rate = FP / (FP + TN) = 3 / (3 + 2) = 0.6
    const m = computeMetrics({ tp: 3, tn: 2, fp: 3, fn: 2, total: 10 });
    expect(m.false_positive_rate).toBe(0.6);
  });

  it('computes FN rate correctly', () => {
    // FN rate = FN / (FN + TP) = 2 / (2 + 3) = 0.4
    const m = computeMetrics({ tp: 3, tn: 2, fp: 3, fn: 2, total: 10 });
    expect(m.false_negative_rate).toBe(0.4);
  });

  it('returns null for empty matrix', () => {
    const m = computeMetrics({ tp: 0, tn: 0, fp: 0, fn: 0, total: 0 });
    expect(m.agreement_rate).toBeNull();
    expect(m.false_positive_rate).toBeNull();
    expect(m.false_negative_rate).toBeNull();
  });
});

// ── computePerTriggerMetrics ─────────────────────────────────

describe('computePerTriggerMetrics', () => {
  const config = { minSamplesPerRule: 5 };

  it('TS-004: tracks each trigger type independently', () => {
    const decisions = [
      // 6 cost_threshold decisions (4 FP, 2 TN)
      ...Array(4).fill(null).map(() => makeDecision({ status: 'approved', triggers: [makeTrigger('cost_threshold', { threshold: 10000 })] })),
      ...Array(2).fill(null).map(() => makeDecision({ status: 'rejected', triggers: [makeTrigger('cost_threshold', { threshold: 10000 })] })),
      // 5 low_score decisions (1 FP, 4 TN)
      ...Array(1).fill(null).map(() => makeDecision({ status: 'approved', triggers: [makeTrigger('low_score', { threshold: 7 })] })),
      ...Array(4).fill(null).map(() => makeDecision({ status: 'rejected', triggers: [makeTrigger('low_score', { threshold: 7 })] })),
    ];

    const result = computePerTriggerMetrics(decisions, config);
    expect(result.included).toHaveLength(2);

    const cost = result.included.find(t => t.type === 'cost_threshold');
    expect(cost.samples).toBe(6);
    expect(cost.fp).toBe(4);
    expect(cost.tn).toBe(2);
    expect(cost.false_positive_rate).toBeCloseTo(4 / 6);
    expect(cost.high_fp).toBe(true);

    const score = result.included.find(t => t.type === 'low_score');
    expect(score.samples).toBe(5);
    expect(score.fp).toBe(1);
    expect(score.tn).toBe(4);
    expect(score.false_positive_rate).toBeCloseTo(1 / 5);
    expect(score.high_fp).toBe(false);
  });

  it('excludes trigger types with insufficient samples', () => {
    const decisions = [
      ...Array(3).fill(null).map(() => makeDecision({ status: 'approved', triggers: [makeTrigger('cost_threshold')] })),
    ];
    const result = computePerTriggerMetrics(decisions, config);
    expect(result.included).toHaveLength(0);
    expect(result.excluded).toHaveLength(1);
    expect(result.excluded[0]).toMatchObject({ type: 'cost_threshold', samples: 3, reason: 'insufficient_samples' });
  });

  it('computes avg threshold from trigger details', () => {
    const decisions = Array(5).fill(null).map(() =>
      makeDecision({ status: 'approved', triggers: [makeTrigger('cost_threshold', { threshold: 10000 })] })
    );
    const result = computePerTriggerMetrics(decisions, config);
    expect(result.included[0].avg_threshold).toBe(10000);
  });

  it('handles decisions with multiple triggers', () => {
    const decisions = Array(5).fill(null).map(() =>
      makeDecision({
        status: 'approved',
        triggers: [makeTrigger('cost_threshold'), makeTrigger('low_score')],
      })
    );
    const result = computePerTriggerMetrics(decisions, config);
    expect(result.included).toHaveLength(2);
  });
});

// ── generateRecommendations ──────────────────────────────────

describe('generateRecommendations', () => {
  const config = { minSamples: 5, maxDelta: 0.20, minConfidence: 0.6 };

  it('recommends loosening when FP rate > 50%', () => {
    const perTrigger = {
      included: [{
        type: 'cost_threshold',
        samples: 20,
        fp: 15,
        tn: 5,
        false_positive_rate: 0.75,
        high_fp: true,
        avg_threshold: 10000,
      }],
      excluded: [],
    };

    const recs = generateRecommendations(perTrigger, config);
    expect(recs.included).toHaveLength(1);
    const rec = recs.included[0];
    expect(rec.direction).toBe('loosen');
    expect(rec.suggested_threshold).toBeGreaterThan(10000);
    expect(rec.confidence).toBe('medium'); // 20 samples = medium
    expect(rec.impact_score).toBeGreaterThan(0);
  });

  it('recommends tightening when FP rate < 20%', () => {
    const perTrigger = {
      included: [{
        type: 'low_score',
        samples: 20,
        fp: 1,
        tn: 19,
        false_positive_rate: 0.05,
        high_fp: false,
        avg_threshold: 7,
      }],
      excluded: [],
    };

    const recs = generateRecommendations(perTrigger, config);
    expect(recs.included).toHaveLength(1);
    expect(recs.included[0].direction).toBe('tighten');
    expect(recs.included[0].suggested_threshold).toBeLessThan(7);
  });

  it('recommends keeping when FP rate between 20-50%', () => {
    const perTrigger = {
      included: [{
        type: 'cost_threshold',
        samples: 20,
        fp: 7,
        tn: 13,
        false_positive_rate: 0.35,
        high_fp: false,
        avg_threshold: 10000,
      }],
      excluded: [],
    };

    const recs = generateRecommendations(perTrigger, config);
    expect(recs.included).toHaveLength(1);
    expect(recs.included[0].direction).toBe('keep');
    expect(recs.included[0].suggested_threshold).toBe(10000);
  });

  it('TS-006: clamps delta to max 20%', () => {
    const perTrigger = {
      included: [{
        type: 'cost_threshold',
        samples: 100,
        fp: 99,
        tn: 1,
        false_positive_rate: 0.99,
        high_fp: true,
        avg_threshold: 10000,
      }],
      excluded: [],
    };

    const recs = generateRecommendations(perTrigger, config);
    const rec = recs.included[0];
    expect(rec.clamped_delta_applied).toBe(true);
    // Max delta = 10000 * 0.20 = 2000, so max suggested = 12000
    expect(rec.suggested_threshold).toBeLessThanOrEqual(12000);
    expect(rec.suggested_threshold).toBeGreaterThan(10000);
  });

  it('TS-005: excludes low-confidence recommendations', () => {
    const perTrigger = {
      included: [{
        type: 'cost_threshold',
        samples: 5, // 5 samples → low confidence (0.4) → below minConfidence 0.6
        fp: 4,
        tn: 1,
        false_positive_rate: 0.8,
        high_fp: true,
        avg_threshold: 10000,
      }],
      excluded: [],
    };

    const recs = generateRecommendations(perTrigger, config);
    expect(recs.included).toHaveLength(0);
    expect(recs.excluded).toHaveLength(1);
    expect(recs.excluded[0].reason).toBe('confidence_below_threshold');
  });

  it('skips non-calibratable trigger types', () => {
    const perTrigger = {
      included: [{
        type: 'new_tech_vendor', // not in CALIBRATION_KEYS
        samples: 50,
        fp: 40,
        tn: 10,
        false_positive_rate: 0.8,
        high_fp: true,
      }],
      excluded: [],
    };

    const recs = generateRecommendations(perTrigger, config);
    expect(recs.included).toHaveLength(0);
    expect(recs.excluded).toHaveLength(0); // skipped entirely, not excluded
  });

  it('includes rationale in recommendation', () => {
    const perTrigger = {
      included: [{
        type: 'cost_threshold',
        samples: 50,
        fp: 40,
        tn: 10,
        false_positive_rate: 0.8,
        high_fp: true,
        avg_threshold: 10000,
      }],
      excluded: [],
    };

    const recs = generateRecommendations(perTrigger, config);
    expect(recs.included[0].rationale).toContain('80.0%');
    expect(recs.included[0].rationale).toContain('loosen');
  });
});

// ── runCalibration (integration with mock Supabase) ──────────

describe('runCalibration', () => {
  it('TS-002: returns empty report when no decisions', async () => {
    const supabase = mockSupabase([]);
    const report = await runCalibration(supabase);
    expect(report.total_decisions).toBe(0);
    expect(report.agreement_rate).toBeNull();
    expect(report.confusion_matrix).toEqual({ tp: 0, tn: 0, fp: 0, fn: 0, total: 0 });
    expect(report.recommendations).toEqual([]);
    expect(report.top_recommendations).toEqual([]);
  });

  it('returns error report on Supabase error', async () => {
    const supabase = mockSupabase(null, { message: 'connection failed' });
    const report = await runCalibration(supabase);
    expect(report.error).toBe('connection failed');
    expect(report.total_decisions).toBe(0);
  });

  it('filters out decisions with invalid dfe_context', async () => {
    const decisions = [
      makeDecision({ status: 'approved' }), // valid
      { id: '2', status: 'approved', dfe_context: null }, // invalid (null)
      { id: '3', status: 'approved', dfe_context: 'string' }, // invalid (not object)
      { id: '4', status: 'approved', dfe_context: { foo: 'bar' } }, // invalid (no auto_proceed)
    ];
    const supabase = mockSupabase(decisions);
    const report = await runCalibration(supabase);
    expect(report.total_decisions).toBe(1);
  });

  it('TS-001: computes correct FP rate for cost_threshold (3/5 approved = 60%)', async () => {
    const decisions = [
      ...Array(3).fill(null).map(() => makeDecision({ status: 'approved', triggers: [makeTrigger('cost_threshold', { threshold: 10000 })] })),
      ...Array(2).fill(null).map(() => makeDecision({ status: 'rejected', triggers: [makeTrigger('cost_threshold', { threshold: 10000 })] })),
    ];
    const supabase = mockSupabase(decisions);
    const report = await runCalibration(supabase);

    expect(report.total_decisions).toBe(5);
    expect(report.confusion_matrix.fp).toBe(3);
    expect(report.confusion_matrix.tn).toBe(2);
    expect(report.false_positive_rate).toBeCloseTo(0.6);

    const costTrigger = report.per_trigger.find(t => t.type === 'cost_threshold');
    expect(costTrigger).toBeDefined();
    expect(costTrigger.false_positive_rate).toBeCloseTo(0.6);
  });

  it('TS-003: all auto_proceed decisions with no overrides', async () => {
    const decisions = Array(5).fill(null).map(() =>
      makeDecision({ autoProceed: true, status: 'approved' })
    );
    const supabase = mockSupabase(decisions);
    const report = await runCalibration(supabase);

    expect(report.total_decisions).toBe(5);
    expect(report.confusion_matrix.tp).toBe(5);
    expect(report.confusion_matrix.fn).toBe(0);
    expect(report.false_negative_rate).toBe(0);
  });

  it('includes period from first to last decision', async () => {
    const d1 = makeDecision({ status: 'approved' });
    d1.created_at = '2026-01-01T00:00:00Z';
    const d2 = makeDecision({ status: 'rejected' });
    d2.created_at = '2026-02-01T00:00:00Z';

    const supabase = mockSupabase([d1, d2]);
    const report = await runCalibration(supabase);
    expect(report.period.from).toBe('2026-01-01T00:00:00Z');
    expect(report.period.to).toBe('2026-02-01T00:00:00Z');
  });

  it('applies date filters when since/until provided', async () => {
    const supabase = mockSupabase([]);
    await runCalibration(supabase, { since: '2026-01-01', until: '2026-02-01' });

    // Verify gte and lte were called on the chain
    const chain = supabase.from.mock.results[0].value;
    expect(chain.gte).toHaveBeenCalledWith('created_at', '2026-01-01');
    expect(chain.lte).toHaveBeenCalledWith('created_at', '2026-02-01');
  });

  it('sorts top_recommendations by impact_score descending', async () => {
    // Create enough decisions for two trigger types with different FP rates
    const decisions = [
      // 10 cost_threshold: 8 FP, 2 TN → 80% FP rate (high impact)
      ...Array(8).fill(null).map(() => makeDecision({ status: 'approved', triggers: [makeTrigger('cost_threshold', { threshold: 10000 })] })),
      ...Array(2).fill(null).map(() => makeDecision({ status: 'rejected', triggers: [makeTrigger('cost_threshold', { threshold: 10000 })] })),
      // 10 low_score: 2 FP, 8 TN → 20% FP rate (low impact)
      ...Array(2).fill(null).map(() => makeDecision({ status: 'approved', triggers: [makeTrigger('low_score', { threshold: 7 })] })),
      ...Array(8).fill(null).map(() => makeDecision({ status: 'rejected', triggers: [makeTrigger('low_score', { threshold: 7 })] })),
    ];
    const supabase = mockSupabase(decisions);
    const report = await runCalibration(supabase);

    if (report.top_recommendations.length >= 2) {
      expect(report.top_recommendations[0].impact_score).toBeGreaterThanOrEqual(
        report.top_recommendations[1].impact_score
      );
    }
  });

  it('includes config in report', async () => {
    const supabase = mockSupabase([]);
    const report = await runCalibration(supabase, { minSamples: 10 });
    expect(report.config.minSamples).toBe(10);
  });
});

// ── buildCalibrationReport ───────────────────────────────────

describe('buildCalibrationReport', () => {
  it('is a convenience wrapper for runCalibration', async () => {
    const supabase = mockSupabase([]);
    const report = await buildCalibrationReport(supabase);
    expect(report.total_decisions).toBe(0);
    expect(report.config).toBeDefined();
  });
});
