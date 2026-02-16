/**
 * Unit tests for assumption-reality-tracker.js
 * SD-MAN-ORCH-EVA-INTELLIGENCE-LAYER-001-D
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  collectRealityMeasurements,
  buildCalibrationReport,
  updateAssumptionSetStatus,
  runRealityTracking,
  _internal,
} from '../../../lib/eva/utils/assumption-reality-tracker.js';

const {
  computeFieldError,
  deriveStatus,
  flattenObject,
  computeCategoryAccuracy,
  mergeAssumptionCategory,
  extractRealityFromArtifacts,
  REALITY_STAGE_THRESHOLD,
  STATUS_THRESHOLDS,
  ASSUMPTION_CATEGORIES,
} = _internal;

const silentLogger = { log: () => {}, warn: () => {}, error: () => {} };

// ── Supabase mock builder ──

function createMockSupabase(resolvedValue = { data: null, error: null }) {
  const chain = {
    from: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    order: vi.fn().mockResolvedValue(resolvedValue),
    update: vi.fn().mockReturnThis(),
    then: vi.fn(),
    catch: vi.fn(),
  };

  return chain;
}

/**
 * Build a supabase mock that can handle multiple sequential queries.
 * Each call to .from() returns a fresh chain with its own resolution.
 */
function createMultiQuerySupabase(responses) {
  let callIndex = 0;
  const mock = {
    from: vi.fn(() => {
      const resp = responses[callIndex] || { data: null, error: null };
      callIndex++;
      const chain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        in: vi.fn().mockResolvedValue(resp),
        gte: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue(resp),
        update: vi.fn().mockReturnThis(),
        then: vi.fn((cb) => {
          cb(resp);
          return { catch: vi.fn() };
        }),
        catch: vi.fn(),
      };
      return chain;
    }),
  };
  return mock;
}

// ── Constants ──

describe('Constants', () => {
  it('REALITY_STAGE_THRESHOLD is 17', () => {
    expect(REALITY_STAGE_THRESHOLD).toBe(17);
  });

  it('STATUS_THRESHOLDS has correct values', () => {
    expect(STATUS_THRESHOLDS.VALIDATED).toBe(0.7);
    expect(STATUS_THRESHOLDS.INVALIDATED).toBe(0.3);
  });

  it('ASSUMPTION_CATEGORIES has four categories', () => {
    expect(ASSUMPTION_CATEGORIES).toEqual([
      'market_assumptions',
      'competitor_assumptions',
      'product_assumptions',
      'timing_assumptions',
    ]);
  });
});

// ── computeFieldError ──

describe('computeFieldError', () => {
  describe('numeric comparisons', () => {
    it('returns 0 for identical numbers', () => {
      expect(computeFieldError(100, 100)).toBe(0);
    });

    it('returns 0 when both are zero', () => {
      expect(computeFieldError(0, 0)).toBe(0);
    });

    it('computes relative error for different numbers', () => {
      // assumed=100, actual=80 => |100-80|/max(100,80,1)=20/100=0.2
      expect(computeFieldError(100, 80)).toBeCloseTo(0.2, 5);
    });

    it('returns high error for large divergence without exceeding 1', () => {
      // assumed=1, actual=1000 => |1-1000|/max(1,1000,1)=999/1000=0.999
      expect(computeFieldError(1, 1000)).toBeLessThanOrEqual(1);
      expect(computeFieldError(1, 1000)).toBeCloseTo(0.999, 5);
    });

    it('caps error at 1 when relative error exceeds 1', () => {
      // assumed=-100, actual=100 => |(-100)-100|/max(100,100,1)=200/100=2 => min(2,1)=1
      expect(computeFieldError(-100, 100)).toBe(1);
    });

    it('handles negative numbers', () => {
      // assumed=-10, actual=10 => |(-10)-10|/max(10,10,1)=20/10=2 => capped at 1
      expect(computeFieldError(-10, 10)).toBe(1);
    });

    it('handles small numbers correctly', () => {
      // assumed=0, actual=0.5 => |0-0.5|/max(0,0.5,1)=0.5/1=0.5
      expect(computeFieldError(0, 0.5)).toBeCloseTo(0.5, 5);
    });
  });

  describe('string comparisons (case-insensitive)', () => {
    it('returns 0 for exact match', () => {
      expect(computeFieldError('hello', 'hello')).toBe(0);
    });

    it('returns 0 for case-insensitive match', () => {
      expect(computeFieldError('Hello', 'HELLO')).toBe(0);
    });

    it('returns 1 for mismatch', () => {
      expect(computeFieldError('foo', 'bar')).toBe(1);
    });
  });

  describe('boolean comparisons', () => {
    it('returns 0 for matching booleans', () => {
      expect(computeFieldError(true, true)).toBe(0);
      expect(computeFieldError(false, false)).toBe(0);
    });

    it('returns 1 for mismatched booleans', () => {
      expect(computeFieldError(true, false)).toBe(1);
      expect(computeFieldError(false, true)).toBe(1);
    });
  });

  describe('type mismatches', () => {
    it('returns 1 for number vs string', () => {
      expect(computeFieldError(42, 'forty-two')).toBe(1);
    });

    it('returns 1 for boolean vs number', () => {
      expect(computeFieldError(true, 1)).toBe(1);
    });

    it('returns 1 for string vs boolean', () => {
      expect(computeFieldError('true', true)).toBe(1);
    });
  });
});

// ── deriveStatus ──

describe('deriveStatus', () => {
  it('returns validated for accuracy >= 0.7', () => {
    expect(deriveStatus(0.7)).toBe('validated');
    expect(deriveStatus(0.85)).toBe('validated');
    expect(deriveStatus(1.0)).toBe('validated');
  });

  it('returns invalidated for accuracy < 0.3', () => {
    expect(deriveStatus(0.0)).toBe('invalidated');
    expect(deriveStatus(0.1)).toBe('invalidated');
    expect(deriveStatus(0.29)).toBe('invalidated');
  });

  it('returns partially_validated for accuracy between 0.3 and 0.7', () => {
    expect(deriveStatus(0.3)).toBe('partially_validated');
    expect(deriveStatus(0.5)).toBe('partially_validated');
    expect(deriveStatus(0.69)).toBe('partially_validated');
  });
});

// ── flattenObject ──

describe('flattenObject', () => {
  it('returns empty object for null', () => {
    expect(flattenObject(null)).toEqual({});
  });

  it('returns empty object for undefined', () => {
    expect(flattenObject(undefined)).toEqual({});
  });

  it('returns empty object for non-object', () => {
    expect(flattenObject('string')).toEqual({});
    expect(flattenObject(42)).toEqual({});
  });

  it('flattens a flat object as-is', () => {
    expect(flattenObject({ a: 1, b: 'x' })).toEqual({ a: 1, b: 'x' });
  });

  it('flattens nested objects with dot notation', () => {
    expect(flattenObject({ a: { b: { c: 1 } } })).toEqual({ 'a.b.c': 1 });
  });

  it('leaves arrays as-is', () => {
    const result = flattenObject({ items: [1, 2, 3] });
    expect(result).toEqual({ items: [1, 2, 3] });
  });

  it('handles null values in nested objects', () => {
    expect(flattenObject({ a: null, b: 1 })).toEqual({ a: null, b: 1 });
  });

  it('uses prefix when provided', () => {
    expect(flattenObject({ x: 1 }, 'root')).toEqual({ 'root.x': 1 });
  });

  it('handles mixed nesting', () => {
    const input = { a: 1, b: { c: 2, d: { e: 3 } }, f: [4, 5] };
    expect(flattenObject(input)).toEqual({
      a: 1,
      'b.c': 2,
      'b.d.e': 3,
      f: [4, 5],
    });
  });
});

// ── computeCategoryAccuracy ──

describe('computeCategoryAccuracy', () => {
  it('returns zero accuracy for empty assumptions', () => {
    const result = computeCategoryAccuracy({}, { x: 1 });
    expect(result).toEqual({ accuracy: 0, matchedFields: 0, totalFields: 0, errorMagnitude: 1 });
  });

  it('returns zero accuracy when no matching fields', () => {
    const result = computeCategoryAccuracy({ a: 1, b: 2 }, { x: 10, y: 20 });
    expect(result.accuracy).toBe(0);
    expect(result.matchedFields).toBe(0);
    expect(result.totalFields).toBe(2);
    expect(result.errorMagnitude).toBe(1);
  });

  it('returns full accuracy when all fields match exactly', () => {
    const result = computeCategoryAccuracy({ a: 100, b: 'yes' }, { a: 100, b: 'yes' });
    expect(result.accuracy).toBe(1);
    expect(result.matchedFields).toBe(2);
    expect(result.totalFields).toBe(2);
    expect(result.errorMagnitude).toBe(0);
  });

  it('computes partial accuracy for partial matches', () => {
    // a: 100 vs 80 => error = 20/100 = 0.2
    // b: only in assumptions, not matched
    const result = computeCategoryAccuracy({ a: 100, b: 50 }, { a: 80 });
    expect(result.matchedFields).toBe(1);
    expect(result.totalFields).toBe(2);
    // accuracy = 1 - 0.2 = 0.8
    expect(result.accuracy).toBe(0.8);
    expect(result.errorMagnitude).toBe(0.2);
  });

  it('averages errors across matched fields', () => {
    // a: 100 vs 100 => error = 0
    // b: 100 vs 50 => error = 50/100 = 0.5
    // avg error = 0.25
    const result = computeCategoryAccuracy({ a: 100, b: 100 }, { a: 100, b: 50 });
    expect(result.accuracy).toBe(0.75);
    expect(result.matchedFields).toBe(2);
    expect(result.errorMagnitude).toBe(0.25);
  });
});

// ── mergeAssumptionCategory ──

describe('mergeAssumptionCategory', () => {
  it('returns empty object when no assumption sets have data for category', () => {
    const sets = [{ market_assumptions: null }, { market_assumptions: undefined }];
    expect(mergeAssumptionCategory(sets, 'market_assumptions')).toEqual({});
  });

  it('merges from a single set', () => {
    const sets = [{ market_assumptions: { tam: 1000000, growth: 0.15 } }];
    expect(mergeAssumptionCategory(sets, 'market_assumptions')).toEqual({
      tam: 1000000,
      growth: 0.15,
    });
  });

  it('merges from multiple sets, later overriding earlier', () => {
    const sets = [
      { market_assumptions: { tam: 1000000 } },
      { market_assumptions: { tam: 2000000, growth: 0.2 } },
    ];
    const result = mergeAssumptionCategory(sets, 'market_assumptions');
    expect(result.tam).toBe(2000000);
    expect(result.growth).toBe(0.2);
  });

  it('flattens nested assumption data', () => {
    const sets = [{ product_assumptions: { metrics: { nps: 50, retention: 0.8 } } }];
    const result = mergeAssumptionCategory(sets, 'product_assumptions');
    expect(result['metrics.nps']).toBe(50);
    expect(result['metrics.retention']).toBe(0.8);
  });

  it('skips non-object category data', () => {
    const sets = [
      { market_assumptions: 'invalid' },
      { market_assumptions: { tam: 500 } },
    ];
    const result = mergeAssumptionCategory(sets, 'market_assumptions');
    expect(result).toEqual({ tam: 500 });
  });
});

// ── extractRealityFromArtifacts ──

describe('extractRealityFromArtifacts', () => {
  it('returns empty categories for empty array', () => {
    const result = extractRealityFromArtifacts([]);
    expect(result).toEqual({
      market_assumptions: {},
      competitor_assumptions: {},
      product_assumptions: {},
      timing_assumptions: {},
    });
  });

  it('extracts market_validation into market_assumptions', () => {
    const artifacts = [
      { artifact_data: { market_validation: { tam: 5000000, growth: 0.12 } } },
    ];
    const result = extractRealityFromArtifacts(artifacts);
    expect(result.market_assumptions).toEqual({ tam: 5000000, growth: 0.12 });
  });

  it('extracts market_metrics into market_assumptions', () => {
    const artifacts = [
      { artifact_data: { market_metrics: { users: 10000 } } },
    ];
    const result = extractRealityFromArtifacts(artifacts);
    expect(result.market_assumptions.users).toBe(10000);
  });

  it('extracts competitive_analysis into competitor_assumptions', () => {
    const artifacts = [
      { artifact_data: { competitive_analysis: { competitors: 5 } } },
    ];
    const result = extractRealityFromArtifacts(artifacts);
    expect(result.competitor_assumptions.competitors).toBe(5);
  });

  it('extracts product_metrics into product_assumptions', () => {
    const artifacts = [
      { artifact_data: { product_metrics: { nps: 72 } } },
    ];
    const result = extractRealityFromArtifacts(artifacts);
    expect(result.product_assumptions.nps).toBe(72);
  });

  it('extracts user_feedback into product_assumptions', () => {
    const artifacts = [
      { artifact_data: { user_feedback: { satisfaction: 0.9 } } },
    ];
    const result = extractRealityFromArtifacts(artifacts);
    expect(result.product_assumptions.satisfaction).toBe(0.9);
  });

  it('extracts timeline_actual into timing_assumptions', () => {
    const artifacts = [
      { artifact_data: { timeline_actual: { weeks: 12 } } },
    ];
    const result = extractRealityFromArtifacts(artifacts);
    expect(result.timing_assumptions.weeks).toBe(12);
  });

  it('extracts milestone_tracking into timing_assumptions', () => {
    const artifacts = [
      { artifact_data: { milestone_tracking: { completed: 8 } } },
    ];
    const result = extractRealityFromArtifacts(artifacts);
    expect(result.timing_assumptions.completed).toBe(8);
  });

  it('skips artifacts with null/non-object data', () => {
    const artifacts = [
      { artifact_data: null },
      { artifact_data: 'string' },
      { artifact_data: { market_validation: { tam: 1 } } },
    ];
    const result = extractRealityFromArtifacts(artifacts);
    expect(result.market_assumptions).toEqual({ tam: 1 });
  });

  it('merges multiple artifacts into same category', () => {
    const artifacts = [
      { artifact_data: { market_validation: { tam: 100 } } },
      { artifact_data: { market_metrics: { users: 500 } } },
    ];
    const result = extractRealityFromArtifacts(artifacts);
    expect(result.market_assumptions).toEqual({ tam: 100, users: 500 });
  });
});

// ── collectRealityMeasurements ──

describe('collectRealityMeasurements', () => {
  it('returns null for stage below threshold', async () => {
    const result = await collectRealityMeasurements({}, 'v1', 16, silentLogger);
    expect(result).toBeNull();
  });

  it('returns null for stage exactly at threshold - 1', async () => {
    const result = await collectRealityMeasurements({}, 'v1', 10, silentLogger);
    expect(result).toBeNull();
  });

  it('queries supabase for stage at threshold', async () => {
    const sb = createMockSupabase({ data: [], error: null });
    const result = await collectRealityMeasurements(sb, 'v1', 17, silentLogger);
    // Empty array => null
    expect(result).toBeNull();
    expect(sb.from).toHaveBeenCalledWith('venture_artifacts');
    expect(sb.eq).toHaveBeenCalledWith('venture_id', 'v1');
  });

  it('returns null on supabase error', async () => {
    const sb = createMockSupabase({ data: null, error: { message: 'db fail' } });
    const result = await collectRealityMeasurements(sb, 'v1', 20, silentLogger);
    expect(result).toBeNull();
  });

  it('returns null when no artifacts found', async () => {
    const sb = createMockSupabase({ data: [], error: null });
    const result = await collectRealityMeasurements(sb, 'v1', 20, silentLogger);
    expect(result).toBeNull();
  });

  it('returns null when data is null', async () => {
    const sb = createMockSupabase({ data: null, error: null });
    const result = await collectRealityMeasurements(sb, 'v1', 20, silentLogger);
    expect(result).toBeNull();
  });

  it('extracts measurements from artifacts', async () => {
    const artifacts = [
      {
        lifecycle_stage: 18,
        artifact_type: 'market_report',
        artifact_data: {
          market_validation: { tam: 5000000 },
          competitive_analysis: { count: 3 },
        },
      },
      {
        lifecycle_stage: 19,
        artifact_type: 'product_report',
        artifact_data: {
          product_metrics: { nps: 80 },
          timeline_actual: { weeks: 10 },
        },
      },
    ];
    const sb = createMockSupabase({ data: artifacts, error: null });
    const result = await collectRealityMeasurements(sb, 'v1', 20, silentLogger);

    expect(result).not.toBeNull();
    expect(result.market_assumptions).toHaveLength(1);
    expect(result.market_assumptions[0].data).toEqual({ tam: 5000000 });
    expect(result.competitor_assumptions).toHaveLength(1);
    expect(result.product_assumptions).toHaveLength(1);
    expect(result.timing_assumptions).toHaveLength(1);
  });

  it('skips artifacts with non-object data', async () => {
    const artifacts = [
      { lifecycle_stage: 18, artifact_type: 'x', artifact_data: null },
      { lifecycle_stage: 18, artifact_type: 'y', artifact_data: 'bad' },
    ];
    const sb = createMockSupabase({ data: artifacts, error: null });
    const result = await collectRealityMeasurements(sb, 'v1', 20, silentLogger);

    expect(result).not.toBeNull();
    expect(result.market_assumptions).toHaveLength(0);
    expect(result.competitor_assumptions).toHaveLength(0);
  });

  it('returns null on exception', async () => {
    const sb = {
      from: vi.fn(() => { throw new Error('kaboom'); }),
    };
    const result = await collectRealityMeasurements(sb, 'v1', 20, silentLogger);
    expect(result).toBeNull();
  });
});

// ── buildCalibrationReport ──

describe('buildCalibrationReport', () => {
  it('returns null when assumption_sets query fails', async () => {
    const sb = createMultiQuerySupabase([
      { data: null, error: { message: 'fail' } },
    ]);
    const result = await buildCalibrationReport(sb, 'v1', silentLogger);
    expect(result).toBeNull();
  });

  it('returns null when no assumption sets found', async () => {
    const sb = createMultiQuerySupabase([
      { data: [], error: null },
    ]);
    const result = await buildCalibrationReport(sb, 'v1', silentLogger);
    expect(result).toBeNull();
  });

  it('returns null when artifacts query fails', async () => {
    const sb = createMultiQuerySupabase([
      { data: [{ id: '1', market_assumptions: { tam: 100 }, status: 'active' }], error: null },
      { data: null, error: { message: 'art fail' } },
    ]);
    const result = await buildCalibrationReport(sb, 'v1', silentLogger);
    expect(result).toBeNull();
  });

  it('builds report with matching assumptions and reality', async () => {
    const assumptionSets = [
      {
        id: 'as1',
        market_assumptions: { tam: 1000000, growth: 0.15 },
        competitor_assumptions: null,
        product_assumptions: null,
        timing_assumptions: null,
        confidence_scores: {},
        status: 'active',
      },
    ];
    const artifacts = [
      {
        artifact_type: 'market_report',
        artifact_data: { market_validation: { tam: 900000, growth: 0.12 } },
        lifecycle_stage: 18,
      },
    ];

    const sb = createMultiQuerySupabase([
      { data: assumptionSets, error: null },
      { data: artifacts, error: null },
    ]);

    const result = await buildCalibrationReport(sb, 'v1', silentLogger);
    expect(result).not.toBeNull();
    expect(result.venture_id).toBe('v1');
    expect(result.aggregate_accuracy).toBeGreaterThan(0);
    expect(result.assumption_set_count).toBe(1);
    expect(result.reality_artifact_count).toBe(1);
    expect(result.calibrator_version).toBe('1.0.0');
    expect(result.calibrated_at).toBeDefined();
    expect(result.category_scores).toBeDefined();
    expect(result.category_scores.market_assumptions).toBeDefined();
  });

  it('handles empty artifacts gracefully', async () => {
    const assumptionSets = [
      {
        id: 'as1',
        market_assumptions: { tam: 1000000 },
        competitor_assumptions: null,
        product_assumptions: null,
        timing_assumptions: null,
        confidence_scores: {},
        status: 'active',
      },
    ];

    const sb = createMultiQuerySupabase([
      { data: assumptionSets, error: null },
      { data: [], error: null },
    ]);

    const result = await buildCalibrationReport(sb, 'v1', silentLogger);
    expect(result).not.toBeNull();
    // With assumptions but no matching reality, accuracy should be 0
    expect(result.aggregate_accuracy).toBe(0);
  });

  it('returns null on exception', async () => {
    const sb = {
      from: vi.fn(() => { throw new Error('unexpected'); }),
    };
    const result = await buildCalibrationReport(sb, 'v1', silentLogger);
    expect(result).toBeNull();
  });
});

// ── updateAssumptionSetStatus ──

describe('updateAssumptionSetStatus', () => {
  it('returns early when supabase is null', () => {
    // Should not throw
    updateAssumptionSetStatus(null, 'v1', 20, { aggregate_accuracy: 0.8 }, silentLogger);
  });

  it('returns early when calibrationReport is null', () => {
    const sb = createMockSupabase();
    updateAssumptionSetStatus(sb, 'v1', 20, null, silentLogger);
    expect(sb.from).not.toHaveBeenCalled();
  });

  it('calls supabase update with derived status', () => {
    const thenFn = vi.fn((cb) => {
      cb({ error: null });
      return { catch: vi.fn() };
    });

    const sb = {
      from: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      in: vi.fn(() => ({ then: thenFn, catch: vi.fn() })),
    };

    const report = { aggregate_accuracy: 0.85, category_scores: {} };
    updateAssumptionSetStatus(sb, 'v1', 20, report, silentLogger);

    expect(sb.from).toHaveBeenCalledWith('assumption_sets');
    expect(sb.update).toHaveBeenCalledWith(
      expect.objectContaining({
        reality_data: report.category_scores,
        calibration_report: report,
        status: 'validated',
        finalized_at_stage: 20,
      }),
    );
  });

  it('derives invalidated status for low accuracy', () => {
    const thenFn = vi.fn((cb) => {
      cb({ error: null });
      return { catch: vi.fn() };
    });

    const sb = {
      from: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      in: vi.fn(() => ({ then: thenFn, catch: vi.fn() })),
    };

    const report = { aggregate_accuracy: 0.1, category_scores: {} };
    updateAssumptionSetStatus(sb, 'v1', 20, report, silentLogger);

    expect(sb.update).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'invalidated' }),
    );
  });

  it('logs warning on update error without throwing', () => {
    const warnFn = vi.fn();
    const logger = { log: () => {}, warn: warnFn, error: () => {} };

    const thenFn = vi.fn((cb) => {
      cb({ error: { message: 'update failed' } });
      return { catch: vi.fn() };
    });

    const sb = {
      from: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      in: vi.fn(() => ({ then: thenFn, catch: vi.fn() })),
    };

    const report = { aggregate_accuracy: 0.5, category_scores: {} };
    updateAssumptionSetStatus(sb, 'v1', 20, report, logger);

    expect(warnFn).toHaveBeenCalledWith(expect.stringContaining('update failed'));
  });
});

// ── runRealityTracking ──

describe('runRealityTracking', () => {
  it('returns null when supabase is not provided', async () => {
    const result = await runRealityTracking({ ventureId: 'v1', stageId: 20 }, {});
    expect(result).toBeNull();
  });

  it('returns null for stage below threshold', async () => {
    const sb = createMockSupabase();
    const result = await runRealityTracking(
      { ventureId: 'v1', stageId: 10 },
      { supabase: sb, logger: silentLogger },
    );
    expect(result).toBeNull();
  });

  it('returns null when collectRealityMeasurements returns null', async () => {
    // Stage >= 17 but no artifacts
    const sb = createMockSupabase({ data: [], error: null });
    const result = await runRealityTracking(
      { ventureId: 'v1', stageId: 20 },
      { supabase: sb, logger: silentLogger },
    );
    expect(result).toBeNull();
  });

  it('returns calibration report on success', async () => {
    const artifacts = [
      {
        lifecycle_stage: 18,
        artifact_type: 'market_report',
        artifact_data: { market_validation: { tam: 900000 } },
      },
    ];
    const assumptionSets = [
      {
        id: 'as1',
        market_assumptions: { tam: 1000000 },
        competitor_assumptions: null,
        product_assumptions: null,
        timing_assumptions: null,
        confidence_scores: {},
        status: 'active',
      },
    ];

    let callIdx = 0;
    const responses = [
      { data: artifacts, error: null },       // collectRealityMeasurements
      { data: assumptionSets, error: null },   // buildCalibrationReport - assumption_sets
      { data: artifacts, error: null },        // buildCalibrationReport - venture_artifacts
      { data: null, error: null },             // updateAssumptionSetStatus
    ];

    const sb = {
      from: vi.fn(() => {
        const resp = responses[callIdx] || { data: null, error: null };
        callIdx++;
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          in: vi.fn().mockResolvedValue(resp),
          gte: vi.fn().mockReturnThis(),
          order: vi.fn().mockResolvedValue(resp),
          update: vi.fn().mockReturnThis(),
          then: vi.fn((cb) => {
            cb(resp);
            return { catch: vi.fn() };
          }),
          catch: vi.fn(),
        };
      }),
    };

    const result = await runRealityTracking(
      { ventureId: 'v1', stageId: 20 },
      { supabase: sb, logger: silentLogger },
    );

    expect(result).not.toBeNull();
    expect(result.venture_id).toBe('v1');
    expect(result.aggregate_accuracy).toBeDefined();
    expect(result.category_scores).toBeDefined();
  });

  it('returns null when buildCalibrationReport returns null', async () => {
    const artifacts = [
      {
        lifecycle_stage: 18,
        artifact_type: 'report',
        artifact_data: { market_validation: { tam: 100 } },
      },
    ];

    let callIdx = 0;
    const responses = [
      { data: artifacts, error: null },                  // collectRealityMeasurements
      { data: null, error: { message: 'no sets' } },    // buildCalibrationReport fails
    ];

    const sb = {
      from: vi.fn(() => {
        const resp = responses[callIdx] || { data: null, error: null };
        callIdx++;
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          in: vi.fn().mockResolvedValue(resp),
          gte: vi.fn().mockReturnThis(),
          order: vi.fn().mockResolvedValue(resp),
          update: vi.fn().mockReturnThis(),
          then: vi.fn((cb) => {
            cb(resp);
            return { catch: vi.fn() };
          }),
          catch: vi.fn(),
        };
      }),
    };

    const result = await runRealityTracking(
      { ventureId: 'v1', stageId: 20 },
      { supabase: sb, logger: silentLogger },
    );
    expect(result).toBeNull();
  });
});
