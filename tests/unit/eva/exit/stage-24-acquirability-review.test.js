/**
 * Unit tests for Stage 24 Analysis Step - Acquirability Review (Exit Readiness Aggregation)
 *
 * Tests the pure aggregation logic in stage-24-acquirability-review.js:
 * - Weighted score computation (stage0 30%, buildDelta 30%, separability 40%)
 * - Trend detection from delta arrays
 * - Graceful degradation with defaults and warnings
 * - DB write to venture_exit_profiles.readiness_assessment
 * - Exported helper constants and functions
 *
 * NO LLM calls - all logic is deterministic.
 *
 * @module tests/unit/eva/exit/stage-24-acquirability-review
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  analyzeStage24AcquirabilityReview,
  WEIGHTS,
  BUILD_PHASE_STAGES,
  normalizeDelta,
  computeTrend,
} from '../../../../lib/eva/stage-templates/analysis-steps/stage-24-acquirability-review.js';

// ── Helpers ──────────────────────────────────────────────────

const VENTURE_ID = 'test-venture-uuid-1234';

/** Silent logger to suppress console output during tests. */
const silentLogger = {
  log: vi.fn(),
  warn: vi.fn(),
};

/**
 * Build a mock Supabase client with chained query methods.
 * Each table gets its own chain; configure return values via the returned handles.
 */
function createMockSupabase() {
  // Per-table result stores
  const results = {
    venture_stage_work: { data: null, error: null },
    venture_separability_scores: { data: null, error: null },
    venture_exit_profiles_select: { data: null, error: null },
    venture_exit_profiles_update: { data: null, error: null },
  };

  // Track which table + operation is active
  let activeTable = null;
  let activeOp = null; // 'select' | 'update'

  const chain = {
    select: vi.fn().mockImplementation(() => chain),
    eq: vi.fn().mockImplementation(() => chain),
    in: vi.fn().mockImplementation(() => chain),
    order: vi.fn().mockImplementation(() => chain),
    limit: vi.fn().mockImplementation(() => chain),
    update: vi.fn().mockImplementation(() => {
      activeOp = 'update';
      return chain;
    }),
    maybeSingle: vi.fn().mockImplementation(() => {
      if (activeTable === 'venture_stage_work') {
        return Promise.resolve(results.venture_stage_work);
      }
      if (activeTable === 'venture_separability_scores') {
        return Promise.resolve(results.venture_separability_scores);
      }
      if (activeTable === 'venture_exit_profiles') {
        if (activeOp === 'update') {
          return Promise.resolve(results.venture_exit_profiles_update);
        }
        return Promise.resolve(results.venture_exit_profiles_select);
      }
      return Promise.resolve({ data: null, error: null });
    }),
  };

  // For venture_stage_work .in() queries that return arrays, we need a different terminal
  // The source code uses .order() then iterates data (no maybeSingle for build deltas)
  // Build deltas query does NOT call maybeSingle - it gets the result from the chain directly.
  // Looking at the source: fetchBuildDeltas returns the chain result after .order()
  // Actually: the source destructures { data, error } directly from the await chain
  // So the chain itself must resolve. Let me re-examine...

  // The source calls:
  //   const { data, error } = await supabase.from(...).select(...).eq(...).in(...).order(...)
  // This means .order() must return a thenable/promise with { data, error }
  // And for stage0: .eq(...).eq(...).maybeSingle() is the terminal

  // We need a more precise mock that tracks the call path.
  // Let's use a simpler approach: create per-table chainable mocks.

  // Store for build deltas (array response from .order)
  let buildDeltasResult = { data: [], error: null };

  const stageWorkChain = {
    select: vi.fn(),
    eq: vi.fn(),
    in: vi.fn(),
    order: vi.fn(),
    maybeSingle: vi.fn(),
  };

  const separabilityChain = {
    select: vi.fn(),
    eq: vi.fn(),
    order: vi.fn(),
    limit: vi.fn(),
    maybeSingle: vi.fn(),
  };

  const exitProfileChain = {
    select: vi.fn(),
    eq: vi.fn(),
    update: vi.fn(),
    maybeSingle: vi.fn(),
  };

  // Wire stage work chain: two paths (stage0 via maybeSingle, deltas via order)
  let _stageWorkCallCount = 0;
  let stage0Result = { data: null, error: null };

  stageWorkChain.select.mockReturnValue(stageWorkChain);
  stageWorkChain.eq.mockReturnValue(stageWorkChain);
  stageWorkChain.in.mockReturnValue(stageWorkChain);
  // .order() is the terminal for build deltas - return a thenable
  stageWorkChain.order.mockImplementation(() => {
    return Promise.resolve(buildDeltasResult);
  });
  // .maybeSingle() is the terminal for stage0
  stageWorkChain.maybeSingle.mockImplementation(() => {
    return Promise.resolve(stage0Result);
  });

  // Wire separability chain
  let separabilityResult = { data: null, error: null };
  separabilityChain.select.mockReturnValue(separabilityChain);
  separabilityChain.eq.mockReturnValue(separabilityChain);
  separabilityChain.order.mockReturnValue(separabilityChain);
  separabilityChain.limit.mockReturnValue(separabilityChain);
  separabilityChain.maybeSingle.mockImplementation(() => {
    return Promise.resolve(separabilityResult);
  });

  // Wire exit profile chain
  let exitProfileSelectResult = { data: null, error: null };
  let exitProfileUpdateResult = { data: null, error: null };
  exitProfileChain.select.mockReturnValue(exitProfileChain);
  exitProfileChain.eq.mockReturnValue(exitProfileChain);
  exitProfileChain.update.mockReturnValue(exitProfileChain);
  exitProfileChain.maybeSingle.mockImplementation(() => {
    // Determine if this is a select or update path
    // select path: .from().select().eq().eq().maybeSingle()
    // update path: .from().update().eq() — no maybeSingle on update path
    // Actually in the source, update path doesn't call maybeSingle.
    // The select path for exit profiles calls maybeSingle.
    return Promise.resolve(exitProfileSelectResult);
  });

  // Track from() calls to route to the right chain
  // The source calls from() for: venture_stage_work (twice), venture_separability_scores, venture_exit_profiles (twice)
  // We need to distinguish the two venture_stage_work calls:
  //   1. fetchStage0Score: .select().eq(ventureId).eq(lifecycle_stage, 0).maybeSingle()
  //   2. fetchBuildDeltas: .select().eq(ventureId).in(lifecycle_stage, [...]).order()

  const fromFn = vi.fn().mockImplementation((table) => {
    if (table === 'venture_stage_work') {
      _stageWorkCallCount++;
      // Return a fresh chain each time so .eq/.in routing works
      // We'll detect stage0 vs deltas by whether .in() or .maybeSingle() is called
      const perCallChain = {};
      let _isInQuery = false;

      perCallChain.select = vi.fn().mockReturnValue(perCallChain);
      perCallChain.eq = vi.fn().mockReturnValue(perCallChain);
      perCallChain.in = vi.fn().mockImplementation(() => {
        _isInQuery = true;
        return perCallChain;
      });
      perCallChain.order = vi.fn().mockImplementation(() => {
        // This is the build deltas path
        return Promise.resolve(buildDeltasResult);
      });
      perCallChain.maybeSingle = vi.fn().mockImplementation(() => {
        // This is the stage0 path
        return Promise.resolve(stage0Result);
      });

      return perCallChain;
    }
    if (table === 'venture_separability_scores') {
      return separabilityChain;
    }
    if (table === 'venture_exit_profiles') {
      // Two calls: first is select (check profile exists), second is update
      const perCallChain = {};
      let _isUpdate = false;

      perCallChain.select = vi.fn().mockReturnValue(perCallChain);
      perCallChain.eq = vi.fn().mockReturnValue(perCallChain);
      perCallChain.update = vi.fn().mockImplementation(() => {
        _isUpdate = true;
        return perCallChain;
      });
      perCallChain.maybeSingle = vi.fn().mockImplementation(() => {
        return Promise.resolve(exitProfileSelectResult);
      });
      // For the update path: { error } = await supabase.from().update().eq()
      // .eq() on the update path must be thenable
      // Actually let's handle this differently: after .update() is called, .eq() returns thenable
      const _updateEqChain = {
        then: (resolve) => resolve(exitProfileUpdateResult),
      };
      // Override: when update is called, chain eq to return thenable
      perCallChain.update = vi.fn().mockImplementation(() => {
        return {
          eq: vi.fn().mockReturnValue(Promise.resolve(exitProfileUpdateResult)),
        };
      });

      return perCallChain;
    }
    // Fallback
    return {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    };
  });

  return {
    from: fromFn,
    // Configuration helpers for tests
    _setStage0: (result) => { stage0Result = result; },
    _setBuildDeltas: (result) => { buildDeltasResult = result; },
    _setSeparability: (result) => { separabilityResult = result; },
    _setExitProfileSelect: (result) => { exitProfileSelectResult = result; },
    _setExitProfileUpdate: (result) => { exitProfileUpdateResult = result; },
  };
}

// ── Tests ────────────────────────────────────────────────────

describe('stage-24-acquirability-review.js - Exit Readiness Aggregation', () => {

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  // ── 1. Exported helpers ──────────────────────────────────

  describe('Exported constants and helpers', () => {
    it('WEIGHTS should define stage0=0.30, buildDelta=0.30, separability=0.40', () => {
      expect(WEIGHTS).toEqual({
        stage0: 0.30,
        buildDelta: 0.30,
        separability: 0.40,
      });
      // Weights must sum to 1.0
      const sum = WEIGHTS.stage0 + WEIGHTS.buildDelta + WEIGHTS.separability;
      expect(sum).toBeCloseTo(1.0, 10);
    });

    it('BUILD_PHASE_STAGES should be [18, 19, 20, 21, 22]', () => {
      expect(BUILD_PHASE_STAGES).toEqual([18, 19, 20, 21, 22]);
    });

    describe('normalizeDelta()', () => {
      it('should normalize -50 to 0', () => {
        expect(normalizeDelta(-50)).toBe(0);
      });

      it('should normalize 0 to 50', () => {
        expect(normalizeDelta(0)).toBe(50);
      });

      it('should normalize +50 to 100', () => {
        expect(normalizeDelta(50)).toBe(100);
      });

      it('should normalize +25 to 75', () => {
        expect(normalizeDelta(25)).toBe(75);
      });

      it('should normalize -25 to 25', () => {
        expect(normalizeDelta(-25)).toBe(25);
      });

      it('should clamp values below -50 to 0', () => {
        expect(normalizeDelta(-100)).toBe(0);
      });

      it('should clamp values above +50 to 100', () => {
        expect(normalizeDelta(100)).toBe(100);
      });
    });

    describe('computeTrend()', () => {
      it('should return "stable" for empty array', () => {
        expect(computeTrend([])).toBe('stable');
      });

      it('should return "stable" for single element', () => {
        expect(computeTrend([5])).toBe('stable');
      });

      it('should return "stable" for null input', () => {
        expect(computeTrend(null)).toBe('stable');
      });

      it('should return "improving" when all deltas are positive and increasing', () => {
        // First half: [2, 4] avg=3, Second half: [8, 10] avg=9
        // diff = 9 - 3 = 6 > 3 => 'improving'
        expect(computeTrend([2, 4, 8, 10])).toBe('improving');
      });

      it('should return "declining" when all deltas are negative and decreasing', () => {
        // First half: [10, 8] avg=9, Second half: [2, 0] avg=1
        // diff = 1 - 9 = -8 < -3 => 'declining'
        expect(computeTrend([10, 8, 2, 0])).toBe('declining');
      });

      it('should return "stable" when deltas are mixed/flat', () => {
        // First half: [5, 5] avg=5, Second half: [5, 5] avg=5
        // diff = 0, within [-3, 3] => 'stable'
        expect(computeTrend([5, 5, 5, 5])).toBe('stable');
      });

      it('should return "stable" when difference is within threshold (<=3)', () => {
        // First half: [5] avg=5, Second half: [7] avg=7
        // diff = 2 <= 3 => 'stable'
        expect(computeTrend([5, 7])).toBe('stable');
      });

      it('should detect improving from odd-length arrays', () => {
        // [1, 2, 3, 4, 10]
        // mid = floor(5/2) = 2
        // First half: [1, 2] avg=1.5, Second half: [3, 4, 10] avg=5.67
        // diff = 5.67 - 1.5 = 4.17 > 3 => 'improving'
        expect(computeTrend([1, 2, 3, 4, 10])).toBe('improving');
      });
    });
  });

  // ── 2. With stageData (no DB) ────────────────────────────

  describe('With stageData provided (no DB queries)', () => {
    it('should compute overall_score as weighted average of stage0, build delta, separability', async () => {
      const result = await analyzeStage24AcquirabilityReview({
        ventureId: VENTURE_ID,
        stageData: {
          stage0: 70,
          buildDeltas: [
            { stage: 18, delta: 10, score: 60 },
            { stage: 19, delta: 20, score: 70 },
            { stage: 20, delta: 10, score: 60 },
          ],
          separabilityScore: { overall_score: 80 },
        },
        logger: silentLogger,
      });

      // stage0 = 70 (clamped 0-100)
      // avgDeltaRaw = (10 + 20 + 10) / 3 = 13.333...
      // normalizedBuildDelta = ((13.333 - (-50)) / 100) * 100 = 63.333...
      // separabilityScore = 80
      // overall = round(70*0.30 + 63.333*0.30 + 80*0.40) = round(21 + 19 + 32) = round(72)
      const expectedOverall = Math.round(
        70 * 0.30 + normalizeDelta(40 / 3) * 0.30 + 80 * 0.40,
      );
      expect(result.overall_score).toBe(expectedOverall);
      expect(result._soft_gate).toBe(true);
      expect(result.warnings).toEqual([]);
    });

    it('should include dimension_breakdown with all three dimensions', async () => {
      const result = await analyzeStage24AcquirabilityReview({
        ventureId: VENTURE_ID,
        stageData: {
          stage0: 60,
          buildDeltas: [{ stage: 18, delta: 5, score: 55 }],
          separabilityScore: { overall_score: 70, infrastructure_independence: 65, ip_clarity: 80 },
        },
        logger: silentLogger,
      });

      expect(result.dimension_breakdown).toBeDefined();
      expect(result.dimension_breakdown.stage0_acquirability).toBeDefined();
      expect(result.dimension_breakdown.stage0_acquirability.raw_score).toBe(60);
      expect(result.dimension_breakdown.stage0_acquirability.weight).toBe(0.30);
      expect(result.dimension_breakdown.stage0_acquirability.source).toBe('stageData');

      expect(result.dimension_breakdown.build_phase_delta).toBeDefined();
      expect(result.dimension_breakdown.build_phase_delta.stages_with_data).toBe(1);
      expect(result.dimension_breakdown.build_phase_delta.source).toBe('stageData');

      expect(result.dimension_breakdown.separability).toBeDefined();
      expect(result.dimension_breakdown.separability.raw_score).toBe(70);
      expect(result.dimension_breakdown.separability.weight).toBe(0.40);
      expect(result.dimension_breakdown.separability.dimensions.infrastructure_independence).toBe(65);
      expect(result.dimension_breakdown.separability.dimensions.ip_clarity).toBe(80);
      expect(result.dimension_breakdown.separability.source).toBe('stageData');
    });

    it('should populate data_sources correctly from stageData', async () => {
      const result = await analyzeStage24AcquirabilityReview({
        ventureId: VENTURE_ID,
        stageData: {
          stage0: 50,
          buildDeltas: [{ stage: 18, delta: 0, score: 50 }],
          separabilityScore: { overall_score: 50 },
        },
        logger: silentLogger,
      });

      expect(result.data_sources.stage0_available).toBe(true);
      expect(result.data_sources.build_deltas_count).toBe(1);
      expect(result.data_sources.separability_available).toBe(true);
    });

    it('should include venture_id and generated_at in the report', async () => {
      const result = await analyzeStage24AcquirabilityReview({
        ventureId: VENTURE_ID,
        stageData: {
          stage0: 50,
          buildDeltas: [],
          separabilityScore: null,
        },
        logger: silentLogger,
      });

      expect(result.venture_id).toBe(VENTURE_ID);
      expect(result.generated_at).toBeDefined();
      expect(typeof result.generated_at).toBe('string');
    });

    it('should include _latencyMs in the result', async () => {
      const result = await analyzeStage24AcquirabilityReview({
        ventureId: VENTURE_ID,
        stageData: {
          stage0: 50,
          buildDeltas: [],
          separabilityScore: null,
        },
        logger: silentLogger,
      });

      expect(typeof result._latencyMs).toBe('number');
      expect(result._latencyMs).toBeGreaterThanOrEqual(0);
    });
  });

  // ── 3. Trend detection ───────────────────────────────────

  describe('Trend detection in full analysis', () => {
    it('should detect "improving" trend when deltas increase over time', async () => {
      const result = await analyzeStage24AcquirabilityReview({
        ventureId: VENTURE_ID,
        stageData: {
          stage0: 60,
          buildDeltas: [
            { stage: 18, delta: 2, score: 52 },
            { stage: 19, delta: 4, score: 54 },
            { stage: 20, delta: 8, score: 58 },
            { stage: 21, delta: 12, score: 62 },
          ],
          separabilityScore: { overall_score: 70 },
        },
        logger: silentLogger,
      });

      // First half: [2, 4] avg=3, Second half: [8, 12] avg=10, diff=7 > 3
      expect(result.trend).toBe('improving');
    });

    it('should detect "declining" trend when deltas decrease over time', async () => {
      const result = await analyzeStage24AcquirabilityReview({
        ventureId: VENTURE_ID,
        stageData: {
          stage0: 60,
          buildDeltas: [
            { stage: 18, delta: 15, score: 65 },
            { stage: 19, delta: 10, score: 60 },
            { stage: 20, delta: 2, score: 52 },
            { stage: 21, delta: -5, score: 45 },
          ],
          separabilityScore: { overall_score: 70 },
        },
        logger: silentLogger,
      });

      // First half: [15, 10] avg=12.5, Second half: [2, -5] avg=-1.5, diff=-14 < -3
      expect(result.trend).toBe('declining');
    });

    it('should detect "stable" trend when deltas are flat', async () => {
      const result = await analyzeStage24AcquirabilityReview({
        ventureId: VENTURE_ID,
        stageData: {
          stage0: 60,
          buildDeltas: [
            { stage: 18, delta: 5, score: 55 },
            { stage: 19, delta: 5, score: 55 },
            { stage: 20, delta: 5, score: 55 },
            { stage: 21, delta: 5, score: 55 },
          ],
          separabilityScore: { overall_score: 70 },
        },
        logger: silentLogger,
      });

      // First half: [5, 5] avg=5, Second half: [5, 5] avg=5, diff=0
      expect(result.trend).toBe('stable');
    });

    it('should return "stable" when fewer than 2 build deltas', async () => {
      const result = await analyzeStage24AcquirabilityReview({
        ventureId: VENTURE_ID,
        stageData: {
          stage0: 60,
          buildDeltas: [{ stage: 18, delta: 10, score: 60 }],
          separabilityScore: { overall_score: 70 },
        },
        logger: silentLogger,
      });

      expect(result.trend).toBe('stable');
    });
  });

  // ── 4. Graceful degradation ──────────────────────────────

  describe('Graceful degradation with missing data', () => {
    it('should use default 50 and add warning when stage0 is missing', async () => {
      const result = await analyzeStage24AcquirabilityReview({
        ventureId: VENTURE_ID,
        stageData: {
          // stage0 intentionally omitted
          buildDeltas: [{ stage: 18, delta: 10, score: 60 }],
          separabilityScore: { overall_score: 70 },
        },
        logger: silentLogger,
      });

      expect(result.warnings).toContain('Stage 0 acquirability score not available; using default (50).');
      expect(result.dimension_breakdown.stage0_acquirability.raw_score).toBe(50);
    });

    it('should add warning when build deltas are empty', async () => {
      const result = await analyzeStage24AcquirabilityReview({
        ventureId: VENTURE_ID,
        stageData: {
          stage0: 60,
          buildDeltas: [],
          separabilityScore: { overall_score: 70 },
        },
        logger: silentLogger,
      });

      expect(result.warnings).toContain('Build phase deltas (stages 18-22) not available; using neutral delta (0).');
      // normalizedBuildDelta for delta=0 should be 50
      expect(result.dimension_breakdown.build_phase_delta.normalized_score).toBe(50);
      expect(result.dimension_breakdown.build_phase_delta.stages_with_data).toBe(0);
    });

    it('should use default 50 and add warning when separability is missing', async () => {
      const result = await analyzeStage24AcquirabilityReview({
        ventureId: VENTURE_ID,
        stageData: {
          stage0: 60,
          buildDeltas: [{ stage: 18, delta: 10, score: 60 }],
          separabilityScore: null,
        },
        logger: silentLogger,
      });

      expect(result.warnings).toContain('Separability score not available; using default (50).');
      expect(result.dimension_breakdown.separability.raw_score).toBe(50);
      expect(result.dimension_breakdown.separability.dimensions).toBeNull();
    });

    it('should accumulate multiple warnings when all data is missing', async () => {
      const result = await analyzeStage24AcquirabilityReview({
        ventureId: VENTURE_ID,
        stageData: {
          // all fields omitted or null
          buildDeltas: [],
          separabilityScore: null,
        },
        logger: silentLogger,
      });

      expect(result.warnings.length).toBeGreaterThanOrEqual(2);
      expect(result.warnings).toContain('Stage 0 acquirability score not available; using default (50).');
      expect(result.warnings).toContain('Build phase deltas (stages 18-22) not available; using neutral delta (0).');
      expect(result.warnings).toContain('Separability score not available; using default (50).');

      // All defaults: stage0=50, delta normalized=50, sep=50
      // overall = round(50*0.30 + 50*0.30 + 50*0.40) = round(15+15+20) = 50
      expect(result.overall_score).toBe(50);
    });

    it('should still set _soft_gate: true even with all defaults', async () => {
      const result = await analyzeStage24AcquirabilityReview({
        ventureId: VENTURE_ID,
        stageData: {
          buildDeltas: [],
          separabilityScore: null,
        },
        logger: silentLogger,
      });

      expect(result._soft_gate).toBe(true);
    });
  });

  // ── 5. DB write behavior ─────────────────────────────────

  describe('DB write to venture_exit_profiles', () => {
    it('should write readiness_assessment when profile exists', async () => {
      const supabase = createMockSupabase();
      const profileId = 'profile-uuid-abc';

      // Set up DB responses: stage0 and deltas come from stageData so no DB fetch needed
      // But exit profile select should return a profile
      supabase._setExitProfileSelect({ data: { id: profileId }, error: null });
      supabase._setExitProfileUpdate({ error: null });

      const result = await analyzeStage24AcquirabilityReview({
        ventureId: VENTURE_ID,
        supabase,
        stageData: {
          stage0: 70,
          buildDeltas: [{ stage: 18, delta: 10, score: 60 }],
          separabilityScore: { overall_score: 80 },
        },
        logger: silentLogger,
      });

      // Verify from() was called for venture_exit_profiles
      const exitProfileCalls = supabase.from.mock.calls.filter(
        (call) => call[0] === 'venture_exit_profiles',
      );
      expect(exitProfileCalls.length).toBeGreaterThanOrEqual(1);
      expect(result._soft_gate).toBe(true);
      expect(result.warnings).toEqual([]);
    });

    it('should skip DB write and add warning when no current profile exists', async () => {
      const supabase = createMockSupabase();

      // No profile found
      supabase._setExitProfileSelect({ data: null, error: null });

      const result = await analyzeStage24AcquirabilityReview({
        ventureId: VENTURE_ID,
        supabase,
        stageData: {
          stage0: 70,
          buildDeltas: [{ stage: 18, delta: 10, score: 60 }],
          separabilityScore: { overall_score: 80 },
        },
        logger: silentLogger,
      });

      expect(result.warnings).toContain(
        'No current venture_exit_profiles row found; readiness_assessment not persisted to DB.',
      );
      expect(silentLogger.warn).toHaveBeenCalled();
    });

    it('should add warning on profile query error', async () => {
      const supabase = createMockSupabase();

      supabase._setExitProfileSelect({ data: null, error: { message: 'connection timeout' } });

      const result = await analyzeStage24AcquirabilityReview({
        ventureId: VENTURE_ID,
        supabase,
        stageData: {
          stage0: 70,
          buildDeltas: [{ stage: 18, delta: 10, score: 60 }],
          separabilityScore: { overall_score: 80 },
        },
        logger: silentLogger,
      });

      expect(result.warnings).toEqual(
        expect.arrayContaining([
          expect.stringContaining('DB query error when looking up exit profile'),
        ]),
      );
    });

    it('should not attempt DB write when supabase is not provided', async () => {
      const result = await analyzeStage24AcquirabilityReview({
        ventureId: VENTURE_ID,
        // supabase intentionally omitted
        stageData: {
          stage0: 70,
          buildDeltas: [{ stage: 18, delta: 10, score: 60 }],
          separabilityScore: { overall_score: 80 },
        },
        logger: silentLogger,
      });

      // No DB-related warnings
      expect(result.warnings).toEqual([]);
      expect(result._soft_gate).toBe(true);
    });
  });

  // ── 6. DB fetch behavior (no stageData) ──────────────────

  describe('DB fetch when stageData not provided', () => {
    it('should fetch stage0 score from venture_stage_work', async () => {
      const supabase = createMockSupabase();

      // Stage0 returns a health_score
      supabase._setStage0({
        data: { health_score: 65, advisory_data: null },
        error: null,
      });
      supabase._setBuildDeltas({ data: [], error: null });
      supabase._setSeparability({ data: null, error: null });
      supabase._setExitProfileSelect({ data: null, error: null });

      const result = await analyzeStage24AcquirabilityReview({
        ventureId: VENTURE_ID,
        supabase,
        logger: silentLogger,
      });

      // Stage0 should come from DB health_score
      expect(result.dimension_breakdown.stage0_acquirability.raw_score).toBe(65);
      expect(result.dimension_breakdown.stage0_acquirability.source).toBe('database');
    });

    it('should prefer advisory_data.acquirability_score over health_score', async () => {
      const supabase = createMockSupabase();

      supabase._setStage0({
        data: {
          health_score: 40,
          advisory_data: { acquirability_score: 85 },
        },
        error: null,
      });
      supabase._setBuildDeltas({ data: [], error: null });
      supabase._setSeparability({ data: null, error: null });
      supabase._setExitProfileSelect({ data: null, error: null });

      const result = await analyzeStage24AcquirabilityReview({
        ventureId: VENTURE_ID,
        supabase,
        logger: silentLogger,
      });

      // Should use acquirability_score (85), not health_score (40)
      expect(result.dimension_breakdown.stage0_acquirability.raw_score).toBe(85);
    });

    it('should fetch build deltas from venture_stage_work stages 18-22', async () => {
      const supabase = createMockSupabase();

      supabase._setStage0({ data: { health_score: 60, advisory_data: null }, error: null });
      supabase._setBuildDeltas({
        data: [
          { lifecycle_stage: 18, health_score: 55, advisory_data: { acquirability_delta: 5 } },
          { lifecycle_stage: 19, health_score: 60, advisory_data: { acquirability_delta: 10 } },
          { lifecycle_stage: 20, health_score: 65, advisory_data: { acquirability_delta: 15 } },
        ],
        error: null,
      });
      supabase._setSeparability({ data: null, error: null });
      supabase._setExitProfileSelect({ data: null, error: null });

      const result = await analyzeStage24AcquirabilityReview({
        ventureId: VENTURE_ID,
        supabase,
        logger: silentLogger,
      });

      expect(result.dimension_breakdown.build_phase_delta.stages_with_data).toBe(3);
      expect(result.dimension_breakdown.build_phase_delta.source).toBe('database');
      // avgDelta = (5+10+15)/3 = 10, normalized = ((10+50)/100)*100 = 60
      expect(result.dimension_breakdown.build_phase_delta.normalized_score).toBe(60);
    });

    it('should fetch separability score from venture_separability_scores', async () => {
      const supabase = createMockSupabase();

      supabase._setStage0({ data: { health_score: 60, advisory_data: null }, error: null });
      supabase._setBuildDeltas({ data: [], error: null });
      supabase._setSeparability({
        data: {
          overall_score: 72,
          infrastructure_independence: 80,
          data_portability: 60,
          ip_clarity: 75,
          team_dependency: 70,
          operational_autonomy: 68,
          scored_at: '2026-03-01T00:00:00Z',
        },
        error: null,
      });
      supabase._setExitProfileSelect({ data: null, error: null });

      const result = await analyzeStage24AcquirabilityReview({
        ventureId: VENTURE_ID,
        supabase,
        logger: silentLogger,
      });

      expect(result.dimension_breakdown.separability.raw_score).toBe(72);
      expect(result.dimension_breakdown.separability.source).toBe('database');
      expect(result.dimension_breakdown.separability.dimensions.infrastructure_independence).toBe(80);
      expect(result.dimension_breakdown.separability.scored_at).toBe('2026-03-01T00:00:00Z');
    });

    it('should use defaults when DB queries return null/errors', async () => {
      const supabase = createMockSupabase();

      supabase._setStage0({ data: null, error: null });
      supabase._setBuildDeltas({ data: null, error: null }); // null data triggers empty array
      supabase._setSeparability({ data: null, error: null });
      supabase._setExitProfileSelect({ data: null, error: null });

      const result = await analyzeStage24AcquirabilityReview({
        ventureId: VENTURE_ID,
        supabase,
        logger: silentLogger,
      });

      // All defaults: 50, 50, 50 => overall 50
      expect(result.overall_score).toBe(50);
      expect(result.warnings.length).toBeGreaterThanOrEqual(2);
    });
  });

  // ── 7. Full scenario ─────────────────────────────────────

  describe('Full scenario: stage0=80, deltas=[10,-5,15,0,5], separability=75', () => {
    it('should compute correct weighted score with all dimensions', async () => {
      const buildDeltas = [
        { stage: 18, delta: 10, score: 60 },
        { stage: 19, delta: -5, score: 45 },
        { stage: 20, delta: 15, score: 65 },
        { stage: 21, delta: 0, score: 50 },
        { stage: 22, delta: 5, score: 55 },
      ];

      const result = await analyzeStage24AcquirabilityReview({
        ventureId: VENTURE_ID,
        stageData: {
          stage0: 80,
          buildDeltas,
          separabilityScore: { overall_score: 75 },
        },
        logger: silentLogger,
      });

      // Stage0 contribution: 80 * 0.30 = 24
      // Avg delta: (10 + (-5) + 15 + 0 + 5) / 5 = 25 / 5 = 5
      // Normalized delta: ((5 - (-50)) / 100) * 100 = 55
      // Build delta contribution: 55 * 0.30 = 16.5
      // Separability contribution: 75 * 0.40 = 30
      // Overall = round(24 + 16.5 + 30) = round(70.5) = 71
      const avgDelta = (10 + (-5) + 15 + 0 + 5) / 5; // 5
      const normalizedDelta = normalizeDelta(avgDelta); // 55
      const expectedOverall = Math.round(
        80 * 0.30 + normalizedDelta * 0.30 + 75 * 0.40,
      );

      expect(result.overall_score).toBe(expectedOverall);
      expect(result.overall_score).toBe(71); // Verify explicitly

      // Verify _soft_gate
      expect(result._soft_gate).toBe(true);

      // Verify dimension breakdown exists for all three
      expect(result.dimension_breakdown.stage0_acquirability).toBeDefined();
      expect(result.dimension_breakdown.build_phase_delta).toBeDefined();
      expect(result.dimension_breakdown.separability).toBeDefined();

      // Stage0 breakdown
      expect(result.dimension_breakdown.stage0_acquirability.raw_score).toBe(80);
      expect(result.dimension_breakdown.stage0_acquirability.weight).toBe(0.30);

      // Build delta breakdown
      expect(result.dimension_breakdown.build_phase_delta.raw_delta).toBe(5);
      expect(result.dimension_breakdown.build_phase_delta.normalized_score).toBe(55);
      expect(result.dimension_breakdown.build_phase_delta.stages_with_data).toBe(5);
      expect(result.dimension_breakdown.build_phase_delta.per_stage).toHaveLength(5);

      // Separability breakdown
      expect(result.dimension_breakdown.separability.raw_score).toBe(75);
      expect(result.dimension_breakdown.separability.weight).toBe(0.40);

      // No warnings expected (all data provided)
      expect(result.warnings).toEqual([]);
    });

    it('should detect correct trend for the delta sequence [10,-5,15,0,5]', async () => {
      const buildDeltas = [
        { stage: 18, delta: 10, score: 60 },
        { stage: 19, delta: -5, score: 45 },
        { stage: 20, delta: 15, score: 65 },
        { stage: 21, delta: 0, score: 50 },
        { stage: 22, delta: 5, score: 55 },
      ];

      const result = await analyzeStage24AcquirabilityReview({
        ventureId: VENTURE_ID,
        stageData: {
          stage0: 80,
          buildDeltas,
          separabilityScore: { overall_score: 75 },
        },
        logger: silentLogger,
      });

      // mid = floor(5/2) = 2
      // First half: [10, -5] avg = 2.5
      // Second half: [15, 0, 5] avg = 6.67
      // diff = 6.67 - 2.5 = 4.17 > 3 => 'improving'
      expect(result.trend).toBe('improving');
    });

    it('should generate appropriate recommendations for overall=71', async () => {
      const result = await analyzeStage24AcquirabilityReview({
        ventureId: VENTURE_ID,
        stageData: {
          stage0: 80,
          buildDeltas: [
            { stage: 18, delta: 10, score: 60 },
            { stage: 19, delta: -5, score: 45 },
            { stage: 20, delta: 15, score: 65 },
            { stage: 21, delta: 0, score: 50 },
            { stage: 22, delta: 5, score: 55 },
          ],
          separabilityScore: { overall_score: 75 },
        },
        logger: silentLogger,
      });

      // overall=71 (< 75 so no "strong exit readiness")
      // stage0=80 (>= 60, no stage0 warnings)
      // normalizedBuildDelta=55 (40-70 range, no build delta rec)
      // separability=75 (60-80 range, no separability rec either)
      // overall >= 50, so no "below threshold" rec
      // Should get the fallback recommendation
      expect(result.recommendations.length).toBeGreaterThanOrEqual(1);
    });

    it('should identify risk factors for negative deltas in the sequence', async () => {
      const result = await analyzeStage24AcquirabilityReview({
        ventureId: VENTURE_ID,
        stageData: {
          stage0: 80,
          buildDeltas: [
            { stage: 18, delta: 10, score: 60 },
            { stage: 19, delta: -5, score: 45 },
            { stage: 20, delta: 15, score: 65 },
            { stage: 21, delta: 0, score: 50 },
            { stage: 22, delta: 5, score: 55 },
          ],
          separabilityScore: { overall_score: 75 },
        },
        logger: silentLogger,
      });

      // Stage 19 has delta=-5 (negative), so risk should mention regression
      const regressionRisk = result.risk_factors.find((r) =>
        r.includes('Negative acquirability deltas'),
      );
      expect(regressionRisk).toBeDefined();
      expect(regressionRisk).toContain('Stage 19');
    });
  });

  // ── 8. Recommendations and risk factors ──────────────────

  describe('Recommendations engine', () => {
    it('should recommend buyer outreach when overall >= 75', async () => {
      const result = await analyzeStage24AcquirabilityReview({
        ventureId: VENTURE_ID,
        stageData: {
          stage0: 90,
          buildDeltas: [{ stage: 18, delta: 20, score: 70 }],
          separabilityScore: { overall_score: 90 },
        },
        logger: silentLogger,
      });

      expect(result.recommendations).toContain(
        'Venture demonstrates strong exit readiness. Consider initiating buyer outreach.',
      );
    });

    it('should warn about low stage0 score when < 40', async () => {
      const result = await analyzeStage24AcquirabilityReview({
        ventureId: VENTURE_ID,
        stageData: {
          stage0: 30,
          buildDeltas: [{ stage: 18, delta: 5, score: 55 }],
          separabilityScore: { overall_score: 60 },
        },
        logger: silentLogger,
      });

      expect(result.recommendations).toEqual(
        expect.arrayContaining([
          expect.stringContaining('Initial acquirability assessment was low'),
        ]),
      );
    });

    it('should warn about low separability when < 40', async () => {
      const result = await analyzeStage24AcquirabilityReview({
        ventureId: VENTURE_ID,
        stageData: {
          stage0: 60,
          buildDeltas: [{ stage: 18, delta: 5, score: 55 }],
          separabilityScore: { overall_score: 30 },
        },
        logger: silentLogger,
      });

      expect(result.recommendations).toEqual(
        expect.arrayContaining([
          expect.stringContaining('Separability score is low'),
        ]),
      );
    });

    it('should warn about below-threshold overall when < 50', async () => {
      const result = await analyzeStage24AcquirabilityReview({
        ventureId: VENTURE_ID,
        stageData: {
          stage0: 20,
          buildDeltas: [{ stage: 18, delta: -30, score: 20 }],
          separabilityScore: { overall_score: 25 },
        },
        logger: silentLogger,
      });

      expect(result.recommendations).toEqual(
        expect.arrayContaining([
          expect.stringContaining('below threshold'),
        ]),
      );
    });
  });

  describe('Risk factors engine', () => {
    it('should flag very low stage0 score as risk', async () => {
      const result = await analyzeStage24AcquirabilityReview({
        ventureId: VENTURE_ID,
        stageData: {
          stage0: 20,
          buildDeltas: [{ stage: 18, delta: 5, score: 55 }],
          separabilityScore: { overall_score: 60 },
        },
        logger: silentLogger,
      });

      expect(result.risk_factors).toEqual(
        expect.arrayContaining([
          expect.stringContaining('Very low initial acquirability score'),
        ]),
      );
    });

    it('should flag low infrastructure independence as risk', async () => {
      const result = await analyzeStage24AcquirabilityReview({
        ventureId: VENTURE_ID,
        stageData: {
          stage0: 60,
          buildDeltas: [{ stage: 18, delta: 5, score: 55 }],
          separabilityScore: {
            overall_score: 50,
            infrastructure_independence: 30,
            ip_clarity: 80,
            data_portability: 70,
          },
        },
        logger: silentLogger,
      });

      expect(result.risk_factors).toEqual(
        expect.arrayContaining([
          expect.stringContaining('Low infrastructure independence'),
        ]),
      );
    });

    it('should flag low IP clarity as risk', async () => {
      const result = await analyzeStage24AcquirabilityReview({
        ventureId: VENTURE_ID,
        stageData: {
          stage0: 60,
          buildDeltas: [{ stage: 18, delta: 5, score: 55 }],
          separabilityScore: {
            overall_score: 50,
            infrastructure_independence: 80,
            ip_clarity: 30,
            data_portability: 70,
          },
        },
        logger: silentLogger,
      });

      expect(result.risk_factors).toEqual(
        expect.arrayContaining([
          expect.stringContaining('IP clarity score is low'),
        ]),
      );
    });

    it('should flag data portability concerns as risk', async () => {
      const result = await analyzeStage24AcquirabilityReview({
        ventureId: VENTURE_ID,
        stageData: {
          stage0: 60,
          buildDeltas: [{ stage: 18, delta: 5, score: 55 }],
          separabilityScore: {
            overall_score: 50,
            infrastructure_independence: 80,
            ip_clarity: 80,
            data_portability: 30,
          },
        },
        logger: silentLogger,
      });

      expect(result.risk_factors).toEqual(
        expect.arrayContaining([
          expect.stringContaining('Data portability concerns'),
        ]),
      );
    });

    it('should include data gap warning in risks when warnings exist', async () => {
      const result = await analyzeStage24AcquirabilityReview({
        ventureId: VENTURE_ID,
        stageData: {
          // Missing stage0 -> warning generated
          buildDeltas: [{ stage: 18, delta: 5, score: 55 }],
          separabilityScore: { overall_score: 60 },
        },
        logger: silentLogger,
      });

      expect(result.risk_factors).toEqual(
        expect.arrayContaining([
          expect.stringContaining('Data gaps detected'),
        ]),
      );
    });
  });

  // ── 9. Edge cases ────────────────────────────────────────

  describe('Edge cases', () => {
    it('should clamp stage0 score above 100 to 100', async () => {
      const result = await analyzeStage24AcquirabilityReview({
        ventureId: VENTURE_ID,
        stageData: {
          stage0: 150,
          buildDeltas: [],
          separabilityScore: null,
        },
        logger: silentLogger,
      });

      expect(result.dimension_breakdown.stage0_acquirability.raw_score).toBe(100);
    });

    it('should clamp stage0 score below 0 to 0', async () => {
      const result = await analyzeStage24AcquirabilityReview({
        ventureId: VENTURE_ID,
        stageData: {
          stage0: -20,
          buildDeltas: [],
          separabilityScore: null,
        },
        logger: silentLogger,
      });

      expect(result.dimension_breakdown.stage0_acquirability.raw_score).toBe(0);
    });

    it('should clamp separability score to 0-100 range', async () => {
      const result = await analyzeStage24AcquirabilityReview({
        ventureId: VENTURE_ID,
        stageData: {
          stage0: 50,
          buildDeltas: [],
          separabilityScore: { overall_score: 120 },
        },
        logger: silentLogger,
      });

      expect(result.dimension_breakdown.separability.raw_score).toBe(100);
    });

    it('should handle extreme negative deltas gracefully', async () => {
      const result = await analyzeStage24AcquirabilityReview({
        ventureId: VENTURE_ID,
        stageData: {
          stage0: 50,
          buildDeltas: [
            { stage: 18, delta: -100, score: 0 },
            { stage: 19, delta: -100, score: 0 },
          ],
          separabilityScore: { overall_score: 50 },
        },
        logger: silentLogger,
      });

      // Avg delta = -100, clamped to -50, normalized to 0
      expect(result.dimension_breakdown.build_phase_delta.normalized_score).toBe(0);
      // overall = round(50*0.30 + 0*0.30 + 50*0.40) = round(15 + 0 + 20) = 35
      expect(result.overall_score).toBe(35);
    });

    it('should use console as default logger when none provided', async () => {
      // This test verifies the function does not throw when logger is omitted
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      try {
        const result = await analyzeStage24AcquirabilityReview({
          ventureId: VENTURE_ID,
          stageData: {
            stage0: 50,
            buildDeltas: [],
            separabilityScore: null,
          },
        });

        expect(result._soft_gate).toBe(true);
        expect(consoleSpy).toHaveBeenCalled();
      } finally {
        consoleSpy.mockRestore();
      }
    });
  });
});
