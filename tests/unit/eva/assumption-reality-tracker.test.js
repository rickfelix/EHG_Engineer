/**
 * Assumption-Reality Tracker Unit Tests
 * SD-MAN-ORCH-EVA-INTELLIGENCE-LAYER-001-D
 *
 * Tests: collectRealityMeasurements, buildCalibrationReport,
 *        updateAssumptionSetStatus, runRealityTracking, and internal helpers
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
  computeCategoryAccuracy,
  deriveStatus,
  flattenObject,
  mergeAssumptionCategory,
  extractRealityFromArtifacts,
  REALITY_STAGE_THRESHOLD,
  STATUS_THRESHOLDS,
  ASSUMPTION_CATEGORIES,
} = _internal;

// ── Mock factories ──

function createMockLogger() {
  return { warn: vi.fn(), log: vi.fn(), error: vi.fn(), info: vi.fn() };
}

/**
 * Create a chainable mock supabase client.
 * Each chain method returns `this` so .from().select().eq().gte().order() works.
 * Call `mockSupabase._resolve(data, error)` to set the final resolved value.
 */
function createMockSupabase(resolvedData = [], resolvedError = null) {
  const chain = {
    _resolvedData: resolvedData,
    _resolvedError: resolvedError,
    from: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    order: vi.fn().mockImplementation(function () {
      return Promise.resolve({ data: this._resolvedData, error: this._resolvedError });
    }),
    then: vi.fn().mockImplementation(function (cb) {
      return Promise.resolve({ data: this._resolvedData, error: this._resolvedError }).then(cb);
    }),
    catch: vi.fn().mockReturnThis(),
  };
  return chain;
}

/**
 * Multi-query supabase mock: returns different results for sequential .from() calls.
 * Usage: createMultiQuerySupabase([
 *   { data: [...], error: null },  // first query result
 *   { data: [...], error: null },  // second query result
 * ])
 */
function createMultiQuerySupabase(results) {
  let callIndex = 0;
  const chain = {
    from: vi.fn().mockImplementation(() => {
      const idx = callIndex++;
      const result = results[idx] || { data: null, error: null };
      const queryChain = {
        select: vi.fn().mockReturnThis(),
        insert: vi.fn().mockReturnThis(),
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        in: vi.fn().mockReturnThis(),
        gte: vi.fn().mockReturnThis(),
        order: vi.fn().mockImplementation(() => {
          return Promise.resolve({ data: result.data, error: result.error });
        }),
        then: vi.fn().mockImplementation((cb) => {
          return Promise.resolve({ data: result.data, error: result.error }).then(cb);
        }),
        catch: vi.fn().mockReturnThis(),
      };
      return queryChain;
    }),
  };
  return chain;
}

// ── Pure function tests ──

describe('Assumption-Reality Tracker', () => {
  let mockLogger;

  beforeEach(() => {
    mockLogger = createMockLogger();
  });

  // ── computeFieldError ──

  describe('computeFieldError', () => {
    it('returns 0 for identical numbers', () => {
      expect(computeFieldError(100, 100)).toBe(0);
    });

    it('returns 0 for both zeros', () => {
      expect(computeFieldError(0, 0)).toBe(0);
    });

    it('computes relative error for numeric values', () => {
      // |100 - 80| / max(100, 80, 1) = 20/100 = 0.2
      expect(computeFieldError(100, 80)).toBeCloseTo(0.2, 5);
    });

    it('caps numeric error at 1', () => {
      // |1 - 1000| / max(1, 1000, 1) = 999/1000 = 0.999
      expect(computeFieldError(1, 1000)).toBeLessThanOrEqual(1);
    });

    it('returns 0 for matching strings (case-insensitive)', () => {
      expect(computeFieldError('High', 'high')).toBe(0);
    });

    it('returns 1 for mismatched strings', () => {
      expect(computeFieldError('High', 'Low')).toBe(1);
    });

    it('returns 0 for matching booleans', () => {
      expect(computeFieldError(true, true)).toBe(0);
      expect(computeFieldError(false, false)).toBe(0);
    });

    it('returns 1 for mismatched booleans', () => {
      expect(computeFieldError(true, false)).toBe(1);
    });

    it('returns 1 for type mismatch', () => {
      expect(computeFieldError(100, 'hundred')).toBe(1);
      expect(computeFieldError(true, 1)).toBe(1);
      expect(computeFieldError('yes', true)).toBe(1);
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
    it('returns empty object for null/undefined input', () => {
      expect(flattenObject(null)).toEqual({});
      expect(flattenObject(undefined)).toEqual({});
    });

    it('returns empty object for non-object input', () => {
      expect(flattenObject('string')).toEqual({});
      expect(flattenObject(42)).toEqual({});
    });

    it('flattens a single-level object', () => {
      expect(flattenObject({ a: 1, b: 'x' })).toEqual({ a: 1, b: 'x' });
    });

    it('flattens nested objects to dot-notation keys', () => {
      const input = { market: { size: 1000, growth: 0.15 } };
      expect(flattenObject(input)).toEqual({
        'market.size': 1000,
        'market.growth': 0.15,
      });
    });

    it('flattens deeply nested objects', () => {
      const input = { a: { b: { c: 42 } } };
      expect(flattenObject(input)).toEqual({ 'a.b.c': 42 });
    });

    it('preserves arrays as leaf values', () => {
      const input = { tags: ['a', 'b'], nested: { items: [1, 2] } };
      expect(flattenObject(input)).toEqual({
        tags: ['a', 'b'],
        'nested.items': [1, 2],
      });
    });

    it('preserves null values as leaves', () => {
      const input = { a: null, b: { c: null } };
      expect(flattenObject(input)).toEqual({ a: null, 'b.c': null });
    });

    it('uses prefix when provided', () => {
      expect(flattenObject({ x: 1 }, 'root')).toEqual({ 'root.x': 1 });
    });
  });

  // ── computeCategoryAccuracy ──

  describe('computeCategoryAccuracy', () => {
    it('returns zero accuracy for empty assumptions', () => {
      const result = computeCategoryAccuracy({}, { tam: 5000 });
      expect(result.accuracy).toBe(0);
      expect(result.matchedFields).toBe(0);
      expect(result.totalFields).toBe(0);
      expect(result.errorMagnitude).toBe(1);
    });

    it('returns zero accuracy when no fields match', () => {
      const assumptions = { tam: 5000, growth: 0.2 };
      const reality = { revenue: 1000, churn: 0.05 };
      const result = computeCategoryAccuracy(assumptions, reality);
      expect(result.accuracy).toBe(0);
      expect(result.matchedFields).toBe(0);
      expect(result.totalFields).toBe(2);
      expect(result.errorMagnitude).toBe(1);
    });

    it('computes accuracy for fully matched fields', () => {
      const assumptions = { tam: 5000, growth: 0.2 };
      const reality = { tam: 5000, growth: 0.2 };
      const result = computeCategoryAccuracy(assumptions, reality);
      expect(result.accuracy).toBe(1);
      expect(result.matchedFields).toBe(2);
      expect(result.totalFields).toBe(2);
      expect(result.errorMagnitude).toBe(0);
    });

    it('computes partial accuracy for partially matched fields', () => {
      const assumptions = { tam: 5000, growth: 0.2, segment: 'enterprise' };
      const reality = { tam: 4000, growth: 0.2 };
      // tam: |5000-4000|/5000 = 0.2, growth: 0 => avg error = 0.1 => accuracy = 0.9
      const result = computeCategoryAccuracy(assumptions, reality);
      expect(result.matchedFields).toBe(2);
      expect(result.totalFields).toBe(3);
      expect(result.accuracy).toBeCloseTo(0.9, 1);
    });
  });

  // ── mergeAssumptionCategory ──

  describe('mergeAssumptionCategory', () => {
    it('merges data from multiple assumption sets', () => {
      const sets = [
        { market_assumptions: { tam: 5000 } },
        { market_assumptions: { growth: 0.15 } },
      ];
      const result = mergeAssumptionCategory(sets, 'market_assumptions');
      expect(result).toEqual({ tam: 5000, growth: 0.15 });
    });

    it('later sets override earlier sets for same key', () => {
      const sets = [
        { market_assumptions: { tam: 5000 } },
        { market_assumptions: { tam: 6000 } },
      ];
      const result = mergeAssumptionCategory(sets, 'market_assumptions');
      expect(result.tam).toBe(6000);
    });

    it('returns empty object when no sets have the category', () => {
      const sets = [{ market_assumptions: null }, {}];
      const result = mergeAssumptionCategory(sets, 'market_assumptions');
      expect(result).toEqual({});
    });

    it('flattens nested assumption data', () => {
      const sets = [{ market_assumptions: { detail: { tam: 5000 } } }];
      const result = mergeAssumptionCategory(sets, 'market_assumptions');
      expect(result).toEqual({ 'detail.tam': 5000 });
    });
  });

  // ── extractRealityFromArtifacts ──

  describe('extractRealityFromArtifacts', () => {
    it('returns empty category buckets for empty artifacts', () => {
      const result = extractRealityFromArtifacts([]);
      expect(result).toEqual({
        market_assumptions: {},
        competitor_assumptions: {},
        product_assumptions: {},
        timing_assumptions: {},
      });
    });

    it('extracts market_validation into market_assumptions', () => {
      const artifacts = [{
        artifact_data: { market_validation: { tam: 8000, growth: 0.12 } },
      }];
      const result = extractRealityFromArtifacts(artifacts);
      expect(result.market_assumptions).toEqual({ tam: 8000, growth: 0.12 });
    });

    it('extracts competitive_analysis into competitor_assumptions', () => {
      const artifacts = [{
        artifact_data: { competitive_analysis: { players: 5 } },
      }];
      const result = extractRealityFromArtifacts(artifacts);
      expect(result.competitor_assumptions).toEqual({ players: 5 });
    });

    it('extracts product_metrics into product_assumptions', () => {
      const artifacts = [{
        artifact_data: { product_metrics: { dau: 500 } },
      }];
      const result = extractRealityFromArtifacts(artifacts);
      expect(result.product_assumptions).toEqual({ dau: 500 });
    });

    it('extracts timeline_actual into timing_assumptions', () => {
      const artifacts = [{
        artifact_data: { timeline_actual: { months_to_mvp: 4 } },
      }];
      const result = extractRealityFromArtifacts(artifacts);
      expect(result.timing_assumptions).toEqual({ months_to_mvp: 4 });
    });

    it('skips artifacts with null or non-object data', () => {
      const artifacts = [
        { artifact_data: null },
        { artifact_data: 'not an object' },
        { artifact_data: { market_metrics: { tam: 1000 } } },
      ];
      const result = extractRealityFromArtifacts(artifacts);
      expect(result.market_assumptions).toEqual({ tam: 1000 });
    });

    it('merges multiple artifacts into same category', () => {
      const artifacts = [
        { artifact_data: { market_validation: { tam: 5000 } } },
        { artifact_data: { market_metrics: { growth: 0.1 } } },
      ];
      const result = extractRealityFromArtifacts(artifacts);
      expect(result.market_assumptions).toEqual({ tam: 5000, growth: 0.1 });
    });
  });

  // ── Constants ──

  describe('Constants', () => {
    it('exposes REALITY_STAGE_THRESHOLD as 17', () => {
      expect(REALITY_STAGE_THRESHOLD).toBe(17);
    });

    it('exposes STATUS_THRESHOLDS with correct values', () => {
      expect(STATUS_THRESHOLDS.VALIDATED).toBe(0.7);
      expect(STATUS_THRESHOLDS.INVALIDATED).toBe(0.3);
    });

    it('exposes four ASSUMPTION_CATEGORIES', () => {
      expect(ASSUMPTION_CATEGORIES).toHaveLength(4);
      expect(ASSUMPTION_CATEGORIES).toContain('market_assumptions');
      expect(ASSUMPTION_CATEGORIES).toContain('competitor_assumptions');
      expect(ASSUMPTION_CATEGORIES).toContain('product_assumptions');
      expect(ASSUMPTION_CATEGORIES).toContain('timing_assumptions');
    });
  });

  // ── collectRealityMeasurements ──

  describe('collectRealityMeasurements', () => {
    it('returns null for stages below threshold', async () => {
      const result = await collectRealityMeasurements({}, 'v-1', 16, mockLogger);
      expect(result).toBeNull();
    });

    it('returns null for stage exactly at threshold - 1', async () => {
      const result = await collectRealityMeasurements({}, 'v-1', REALITY_STAGE_THRESHOLD - 1, mockLogger);
      expect(result).toBeNull();
    });

    it('returns null when supabase query errors', async () => {
      const mockSb = createMockSupabase(null, { message: 'query failed' });
      const result = await collectRealityMeasurements(mockSb, 'v-1', 17, mockLogger);
      expect(result).toBeNull();
      expect(mockLogger.warn).toHaveBeenCalledWith(expect.stringContaining('Artifact query failed'));
    });

    it('returns null when no artifacts found', async () => {
      const mockSb = createMockSupabase([], null);
      const result = await collectRealityMeasurements(mockSb, 'v-1', 17, mockLogger);
      expect(result).toBeNull();
    });

    it('extracts market data from artifacts', async () => {
      const artifacts = [
        {
          lifecycle_stage: 18,
          artifact_type: 'market_report',
          artifact_data: { market_validation: { tam: 10000 } },
        },
      ];
      const mockSb = createMockSupabase(artifacts, null);
      const result = await collectRealityMeasurements(mockSb, 'v-1', 18, mockLogger);
      expect(result).not.toBeNull();
      expect(result.market_assumptions).toHaveLength(1);
      expect(result.market_assumptions[0].data).toEqual({ tam: 10000 });
      expect(result.market_assumptions[0].stage).toBe(18);
    });

    it('extracts competitor data from artifacts', async () => {
      const artifacts = [{
        lifecycle_stage: 17,
        artifact_type: 'competitive',
        artifact_data: { competitive_analysis: { players: 3 } },
      }];
      const mockSb = createMockSupabase(artifacts, null);
      const result = await collectRealityMeasurements(mockSb, 'v-1', 17, mockLogger);
      expect(result.competitor_assumptions).toHaveLength(1);
      expect(result.competitor_assumptions[0].data).toEqual({ players: 3 });
    });

    it('extracts product data from user_feedback', async () => {
      const artifacts = [{
        lifecycle_stage: 20,
        artifact_type: 'feedback',
        artifact_data: { user_feedback: { nps: 45 } },
      }];
      const mockSb = createMockSupabase(artifacts, null);
      const result = await collectRealityMeasurements(mockSb, 'v-1', 20, mockLogger);
      expect(result.product_assumptions).toHaveLength(1);
      expect(result.product_assumptions[0].data).toEqual({ nps: 45 });
    });

    it('extracts timing data from milestone_tracking', async () => {
      const artifacts = [{
        lifecycle_stage: 19,
        artifact_type: 'timeline',
        artifact_data: { milestone_tracking: { on_track: true } },
      }];
      const mockSb = createMockSupabase(artifacts, null);
      const result = await collectRealityMeasurements(mockSb, 'v-1', 19, mockLogger);
      expect(result.timing_assumptions).toHaveLength(1);
    });

    it('skips artifacts with non-object artifact_data', async () => {
      const artifacts = [
        { lifecycle_stage: 17, artifact_type: 'x', artifact_data: null },
        { lifecycle_stage: 17, artifact_type: 'y', artifact_data: 'bad' },
      ];
      const mockSb = createMockSupabase(artifacts, null);
      const result = await collectRealityMeasurements(mockSb, 'v-1', 17, mockLogger);
      // All categories should be empty arrays
      expect(result.market_assumptions).toHaveLength(0);
      expect(result.competitor_assumptions).toHaveLength(0);
      expect(result.product_assumptions).toHaveLength(0);
      expect(result.timing_assumptions).toHaveLength(0);
    });

    it('queries from venture_artifacts with correct filters', async () => {
      const mockSb = createMockSupabase([], null);
      await collectRealityMeasurements(mockSb, 'v-abc', 17, mockLogger);
      expect(mockSb.from).toHaveBeenCalledWith('venture_artifacts');
      expect(mockSb.select).toHaveBeenCalledWith('artifact_type, artifact_data, lifecycle_stage');
      expect(mockSb.eq).toHaveBeenCalledWith('venture_id', 'v-abc');
      expect(mockSb.eq).toHaveBeenCalledWith('is_current', true);
      expect(mockSb.gte).toHaveBeenCalledWith('lifecycle_stage', 17);
    });
  });

  // ── buildCalibrationReport ──

  describe('buildCalibrationReport', () => {
    it('returns null when assumption_sets query fails', async () => {
      const mockSb = createMultiQuerySupabase([
        { data: null, error: { message: 'db error' } },
      ]);
      const result = await buildCalibrationReport(mockSb, 'v-1', mockLogger);
      expect(result).toBeNull();
      expect(mockLogger.warn).toHaveBeenCalledWith(expect.stringContaining('Assumption sets query failed'));
    });

    it('returns null when no assumption sets exist', async () => {
      const mockSb = createMultiQuerySupabase([
        { data: [], error: null },
      ]);
      const result = await buildCalibrationReport(mockSb, 'v-1', mockLogger);
      expect(result).toBeNull();
    });

    it('returns null when artifact query fails', async () => {
      const mockSb = createMultiQuerySupabase([
        { data: [{ id: 'as-1', market_assumptions: { tam: 5000 } }], error: null },
        { data: null, error: { message: 'artifact error' } },
      ]);
      const result = await buildCalibrationReport(mockSb, 'v-1', mockLogger);
      expect(result).toBeNull();
      expect(mockLogger.warn).toHaveBeenCalledWith(expect.stringContaining('Reality artifacts query failed'));
    });

    it('computes per-category accuracy scores', async () => {
      const mockSb = createMultiQuerySupabase([
        {
          data: [{
            id: 'as-1',
            market_assumptions: { tam: 5000, growth: 0.2 },
            competitor_assumptions: null,
            product_assumptions: null,
            timing_assumptions: null,
            confidence_scores: {},
            status: 'active',
          }],
          error: null,
        },
        {
          data: [{
            artifact_type: 'market_report',
            artifact_data: { market_validation: { tam: 5000, growth: 0.2 } },
            lifecycle_stage: 18,
          }],
          error: null,
        },
      ]);

      const result = await buildCalibrationReport(mockSb, 'v-1', mockLogger);
      expect(result).not.toBeNull();
      expect(result.venture_id).toBe('v-1');
      expect(result.aggregate_accuracy).toBe(1);
      expect(result.category_scores.market_assumptions).toBeDefined();
      expect(result.category_scores.market_assumptions.accuracy).toBe(1);
      expect(result.assumption_set_count).toBe(1);
      expect(result.calibrator_version).toBe('1.0.0');
      expect(result.calibrated_at).toBeDefined();
    });

    it('handles empty artifacts gracefully', async () => {
      const mockSb = createMultiQuerySupabase([
        {
          data: [{
            id: 'as-1',
            market_assumptions: { tam: 5000 },
            competitor_assumptions: null,
            product_assumptions: null,
            timing_assumptions: null,
            confidence_scores: {},
            status: 'active',
          }],
          error: null,
        },
        { data: [], error: null },
      ]);

      const result = await buildCalibrationReport(mockSb, 'v-1', mockLogger);
      expect(result).not.toBeNull();
      // No reality data, so accuracy should be 0 for any category with assumptions
      expect(result.aggregate_accuracy).toBe(0);
      expect(result.reality_artifact_count).toBe(0);
    });
  });

  // ── updateAssumptionSetStatus ──

  describe('updateAssumptionSetStatus', () => {
    it('does nothing when supabase is null', () => {
      updateAssumptionSetStatus(null, 'v-1', 18, { aggregate_accuracy: 0.8 }, mockLogger);
      // Should not throw
    });

    it('does nothing when calibrationReport is null', () => {
      const mockSb = createMockSupabase();
      updateAssumptionSetStatus(mockSb, 'v-1', 18, null, mockLogger);
      expect(mockSb.from).not.toHaveBeenCalled();
    });

    it('calls supabase update with validated status for accuracy >= 0.7', async () => {
      const report = { aggregate_accuracy: 0.85, category_scores: {} };
      const mockSb = createMockSupabase();
      // Override update chain to be thenable
      mockSb.in.mockReturnValue({
        then: vi.fn().mockImplementation((cb) => {
          cb({ error: null });
          return { catch: vi.fn() };
        }),
      });

      updateAssumptionSetStatus(mockSb, 'v-1', 20, report, mockLogger);
      await new Promise((r) => setTimeout(r, 10));

      expect(mockSb.from).toHaveBeenCalledWith('assumption_sets');
      expect(mockSb.update).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'validated',
          finalized_at_stage: 20,
          calibration_report: report,
        }),
      );
    });

    it('calls supabase update with invalidated status for accuracy < 0.3', async () => {
      const report = { aggregate_accuracy: 0.1, category_scores: {} };
      const mockSb = createMockSupabase();
      mockSb.in.mockReturnValue({
        then: vi.fn().mockImplementation((cb) => {
          cb({ error: null });
          return { catch: vi.fn() };
        }),
      });

      updateAssumptionSetStatus(mockSb, 'v-1', 20, report, mockLogger);
      await new Promise((r) => setTimeout(r, 10));

      expect(mockSb.update).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'invalidated' }),
      );
    });

    it('calls supabase update with partially_validated status for accuracy between thresholds', async () => {
      const report = { aggregate_accuracy: 0.5, category_scores: {} };
      const mockSb = createMockSupabase();
      mockSb.in.mockReturnValue({
        then: vi.fn().mockImplementation((cb) => {
          cb({ error: null });
          return { catch: vi.fn() };
        }),
      });

      updateAssumptionSetStatus(mockSb, 'v-1', 20, report, mockLogger);
      await new Promise((r) => setTimeout(r, 10));

      expect(mockSb.update).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'partially_validated' }),
      );
    });

    it('does not throw on supabase error (fire-and-forget)', async () => {
      const report = { aggregate_accuracy: 0.8, category_scores: {} };
      const mockSb = createMockSupabase();
      mockSb.in.mockReturnValue({
        then: vi.fn().mockImplementation((cb) => {
          cb({ error: { message: 'update failed' } });
          return { catch: vi.fn() };
        }),
      });

      // Should not throw
      expect(() => {
        updateAssumptionSetStatus(mockSb, 'v-1', 20, report, mockLogger);
      }).not.toThrow();

      await new Promise((r) => setTimeout(r, 10));
      expect(mockLogger.warn).toHaveBeenCalledWith(expect.stringContaining('Update failed (non-fatal)'));
    });

    it('does not throw on promise rejection (fire-and-forget)', async () => {
      const report = { aggregate_accuracy: 0.8, category_scores: {} };
      const mockSb = createMockSupabase();
      mockSb.in.mockReturnValue({
        then: vi.fn().mockImplementation(() => {
          return {
            catch: vi.fn().mockImplementation((handler) => {
              handler(new Error('network error'));
            }),
          };
        }),
      });

      expect(() => {
        updateAssumptionSetStatus(mockSb, 'v-1', 20, report, mockLogger);
      }).not.toThrow();

      await new Promise((r) => setTimeout(r, 10));
      expect(mockLogger.warn).toHaveBeenCalledWith(expect.stringContaining('Update error (non-fatal)'));
    });
  });

  // ── runRealityTracking ──

  describe('runRealityTracking', () => {
    it('returns null when supabase is not provided', async () => {
      const result = await runRealityTracking({ ventureId: 'v-1', stageId: 18 }, { logger: mockLogger });
      expect(result).toBeNull();
    });

    it('returns null when stageId is below threshold', async () => {
      const mockSb = createMockSupabase();
      const result = await runRealityTracking(
        { ventureId: 'v-1', stageId: 10 },
        { supabase: mockSb, logger: mockLogger },
      );
      expect(result).toBeNull();
    });

    it('returns null when collectRealityMeasurements returns null (no artifacts)', async () => {
      // First query (collectRealityMeasurements) returns empty
      const mockSb = createMultiQuerySupabase([
        { data: [], error: null },
      ]);
      const result = await runRealityTracking(
        { ventureId: 'v-1', stageId: 18 },
        { supabase: mockSb, logger: mockLogger },
      );
      expect(result).toBeNull();
    });

    it('returns calibration report for full pipeline success', async () => {
      // We need 3 queries: collectRealityMeasurements, then buildCalibrationReport (2 queries)
      const artifacts = [{
        lifecycle_stage: 18,
        artifact_type: 'market_report',
        artifact_data: { market_validation: { tam: 5000 } },
      }];
      const assumptionSets = [{
        id: 'as-1',
        market_assumptions: { tam: 5000 },
        competitor_assumptions: null,
        product_assumptions: null,
        timing_assumptions: null,
        confidence_scores: {},
        status: 'active',
      }];

      const mockSb = createMultiQuerySupabase([
        { data: artifacts, error: null },       // collectRealityMeasurements
        { data: assumptionSets, error: null },  // buildCalibrationReport - assumption_sets
        { data: artifacts, error: null },        // buildCalibrationReport - artifacts
      ]);

      const result = await runRealityTracking(
        { ventureId: 'v-1', stageId: 18 },
        { supabase: mockSb, logger: mockLogger },
      );

      expect(result).not.toBeNull();
      expect(result.venture_id).toBe('v-1');
      expect(result.aggregate_accuracy).toBeDefined();
      expect(result.category_scores).toBeDefined();
    });

    it('returns null when buildCalibrationReport fails', async () => {
      const artifacts = [{
        lifecycle_stage: 18,
        artifact_type: 'x',
        artifact_data: { market_validation: { tam: 5000 } },
      }];

      const mockSb = createMultiQuerySupabase([
        { data: artifacts, error: null },                       // collectRealityMeasurements
        { data: null, error: { message: 'assumption error' } }, // buildCalibrationReport fails
      ]);

      const result = await runRealityTracking(
        { ventureId: 'v-1', stageId: 18 },
        { supabase: mockSb, logger: mockLogger },
      );

      expect(result).toBeNull();
    });
  });
});
