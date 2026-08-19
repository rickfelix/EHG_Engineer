/**
 * Tests for vision-to-patterns.js malformed dimension guard
 * SD: SD-LEARN-FIX-ADDRESS-VGAP-A05EVENTBUSINT-001
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the event bus before importing
vi.mock('../../lib/eva/event-bus/vision-events.js', () => ({
  publishVisionEvent: vi.fn(),
  VISION_EVENTS: { GAP_DETECTED: 'vision.gap_detected' },
}));

const { syncVisionScoresToPatterns } = await import('../../scripts/eva/vision-to-patterns.js');

/**
 * Build a chainable thenable mock query builder for one table.
 * `data` is what `await query` resolves to; chain methods (.select/.eq/.lt/...)
 * all return the same builder so depth doesn't matter.
 */
function makeBuilder(data, extras = {}) {
  const result = { data, error: null };
  const builder = { ...extras };
  const chainMethods = [
    'select', 'eq', 'neq', 'in', 'is', 'or', 'not', 'ilike', 'like',
    'gte', 'lte', 'gt', 'lt', 'contains', 'order', 'limit', 'range',
  ];
  for (const m of chainMethods) {
    if (!builder[m]) builder[m] = vi.fn(() => builder);
  }
  builder.single = vi.fn().mockResolvedValue(result);
  builder.maybeSingle = vi.fn().mockResolvedValue(result);
  builder.then = (onFulfilled, onRejected) =>
    Promise.resolve(result).then(onFulfilled, onRejected);
  return builder;
}

function createMockSupabase(scoreRecords, existingPatterns = []) {
  const mockUpdate = vi.fn(() => ({
    eq: vi.fn().mockResolvedValue({ error: null }),
  }));
  const mockInsert = vi.fn().mockResolvedValue({ error: null });

  return {
    from: vi.fn((table) => {
      if (table === 'eva_vision_scores') {
        return makeBuilder(scoreRecords);
      }
      if (table === 'issue_patterns') {
        return makeBuilder(existingPatterns, { update: mockUpdate, insert: mockInsert });
      }
      // Fallback: any other table returns empty data but still chainable.
      return makeBuilder([]);
    }),
    _mockInsert: mockInsert,
    _mockUpdate: mockUpdate,
  };
}

describe('syncVisionScoresToPatterns', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('should skip dimensions with undefined score', async () => {
    const scores = [{
      id: 'test-1',
      sd_id: 'SD-TEST-001',
      total_score: 50,
      dimension_scores: {
        A05_event_bus_integration: { name: undefined, score: undefined },
      },
      rubric_snapshot: { vision_key: 'v1', arch_key: 'a1' },
    }];

    const supabase = createMockSupabase(scores);
    const result = await syncVisionScoresToPatterns(supabase, { dryRun: true });

    // Should be skipped, not synced
    expect(result.skipped).toBe(1);
    expect(result.synced).toBe(0);
    expect(result.errors).toBe(0);
  });

  it('should skip dimensions with NaN score', async () => {
    const scores = [{
      id: 'test-2',
      sd_id: 'SD-TEST-002',
      total_score: 45,
      dimension_scores: {
        A01: { name: 'test_dim', score: NaN },
      },
      rubric_snapshot: {},
    }];

    const supabase = createMockSupabase(scores);
    const result = await syncVisionScoresToPatterns(supabase, { dryRun: true });

    expect(result.skipped).toBe(1);
    expect(result.synced).toBe(0);
  });

  it('should skip dimensions with null score', async () => {
    const scores = [{
      id: 'test-3',
      sd_id: 'SD-TEST-003',
      total_score: 40,
      dimension_scores: {
        V01: { name: 'broken_dim', score: null },
      },
      rubric_snapshot: {},
    }];

    const supabase = createMockSupabase(scores);
    const result = await syncVisionScoresToPatterns(supabase, { dryRun: true });

    expect(result.skipped).toBe(1);
    expect(result.synced).toBe(0);
  });

  it('should process valid low-scoring dimensions normally', async () => {
    const scores = [{
      id: 'test-4',
      sd_id: 'SD-TEST-004',
      total_score: 50,
      dimension_scores: {
        A05: { name: 'event_bus_integration', score: 45 },
      },
      rubric_snapshot: { vision_key: 'v1', arch_key: 'a1' },
    }];

    const supabase = createMockSupabase(scores);
    const result = await syncVisionScoresToPatterns(supabase, { dryRun: true });

    expect(result.synced).toBe(1);
    expect(result.skipped).toBe(0);
  });

  it('should extract name from dimension key when dim.name is undefined but score is valid', async () => {
    const scores = [{
      id: 'test-5',
      sd_id: 'SD-TEST-005',
      total_score: 50,
      dimension_scores: {
        A05_event_bus_integration: { name: undefined, score: 35 },
      },
      rubric_snapshot: { vision_key: 'v1', arch_key: 'a1' },
    }];

    const supabase = createMockSupabase(scores);
    const result = await syncVisionScoresToPatterns(supabase, { dryRun: true });

    // Score 35 is valid and below threshold (60), so it should be synced
    expect(result.synced).toBe(1);
  });

  it('should skip high-scoring dimensions', async () => {
    const scores = [{
      id: 'test-6',
      sd_id: 'SD-TEST-006',
      total_score: 50,
      dimension_scores: {
        A05: { name: 'good_dim', score: 85 },
      },
      rubric_snapshot: {},
    }];

    const supabase = createMockSupabase(scores);
    const result = await syncVisionScoresToPatterns(supabase, { dryRun: true });

    expect(result.skipped).toBe(1);
    expect(result.synced).toBe(0);
  });

  it('should handle mixed valid and malformed dimensions', async () => {
    const scores = [{
      id: 'test-7',
      sd_id: 'SD-TEST-007',
      total_score: 50,
      dimension_scores: {
        A01: { name: 'valid_low', score: 30 },
        A02: { name: undefined, score: undefined },
        A03: { name: 'valid_high', score: 90 },
        A04: { name: 'also_broken', score: NaN },
      },
      rubric_snapshot: { vision_key: 'v1', arch_key: 'a1' },
    }];

    const supabase = createMockSupabase(scores);
    const result = await syncVisionScoresToPatterns(supabase, { dryRun: true });

    // A01: synced (valid, below threshold)
    // A02: skipped (undefined score)
    // A03: skipped (above threshold)
    // A04: skipped (NaN score)
    expect(result.synced).toBe(1);
    expect(result.skipped).toBe(3);
  });

  // SD-LEO-INFRA-LEARN-VISION-GAP-RUBRIC-CLASSIFY-001 -------------------------------------

  it('TS-2: eva-5dim-v1 row is excluded from the threshold comparison (whole-row), not synced, not counted as malformed -- includes a value >= 60 to prove exclusion is not merely coincident with an already-low score', async () => {
    const scores = [{
      id: 'eva-ts2',
      sd_id: 'SD-EVA-TS2',
      total_score: 40,
      dimension_scores: {
        feasibility: 7,
        impact: 8,
        innovation: 6,
        strategic_alignment: 5,
        sustainability: 65, // deliberately >= SCORE_THRESHOLD (60)
      },
      rubric_snapshot: {},
    }];

    const supabase = createMockSupabase(scores);
    const result = await syncVisionScoresToPatterns(supabase, { dryRun: true });

    expect(result.excluded).toBe(5);
    expect(result.synced).toBe(0);
    expect(result.skipped).toBe(0);
  });

  it('TS-3: latency-3dim row excludes only the elapsed_ms key (per-key), while a mixed comparable key still syncs normally', async () => {
    const scores = [{
      id: 'lat-ts3',
      sd_id: 'SD-LAT-TS3',
      total_score: 45,
      dimension_scores: {
        elapsed_ms: 5000,
        smoke_tests_pass: { name: 'smoke tests pass', score: 30 },
      },
      rubric_snapshot: {},
    }];

    const supabase = createMockSupabase(scores);
    const result = await syncVisionScoresToPatterns(supabase, { dryRun: true });

    expect(result.excluded).toBe(1); // elapsed_ms only
    expect(result.synced).toBe(1); // smoke_tests_pass, below threshold
    expect(result.skipped).toBe(0);
  });

  it('a null dimension_scores (not an empty object) is also tallied as unscored -- ship-review finding: the pre-existing top-level guard silently continued with zero counter impact before this fix', async () => {
    const scores = [{
      id: 'null-scores', sd_id: 'SD-NULL-SCORES', total_score: 20,
      dimension_scores: null,
      rubric_snapshot: {},
    }];

    const supabase = createMockSupabase(scores);
    const result = await syncVisionScoresToPatterns(supabase, { dryRun: true });

    expect(result.unscored).toBe(1);
    expect(result.synced).toBe(0);
    expect(result.skipped).toBe(0);
  });

  it('TS-4: an empty dimension_scores object is tallied as unscored, not silently ignored', async () => {
    const scores = [{
      id: 'empty-ts4',
      sd_id: 'SD-EMPTY-TS4',
      total_score: 20,
      dimension_scores: {},
      rubric_snapshot: {},
    }];

    const supabase = createMockSupabase(scores);
    const result = await syncVisionScoresToPatterns(supabase, { dryRun: true });

    expect(result.unscored).toBe(1);
    expect(result.synced).toBe(0);
    expect(result.skipped).toBe(0);
    expect(result.excluded).toBe(0);
  });

  // SD-LEO-INFRA-LEARN-VISION-GAP-RUBRIC-CLASSIFY-001 (FR-1 AC5): a LITERAL NULL dimension
  // VALUE (not {score: null} -- the pre-existing null test covers that and never reaches
  // this path) crashed the pre-fix code at `dim.score` with a TypeError. dimScoreOf is
  // null-safe and the warn line uses dim?.name; this test is what stops either regressing.
  it('does not crash on a literal null dimension value (pre-existing crash fixed by this SD)', async () => {
    const scores = [{
      id: 'nullval', sd_id: 'SD-NULLVAL', total_score: 40,
      dimension_scores: { V01: null, V02: { name: 'ok', score: 30 } },
      rubric_snapshot: {},
    }];

    const supabase = createMockSupabase(scores);
    const result = await syncVisionScoresToPatterns(supabase, { dryRun: true });

    expect(result.skipped).toBe(1); // the null value, caught as malformed
    expect(result.synced).toBe(1);  // the sibling still processes normally
  });

  // SD-LEO-INFRA-LEARN-VISION-GAP-RUBRIC-CLASSIFY-001 (FR-1 AC4): Infinity/-Infinity are
  // `typeof 'number'` and survive a bare typeof check -- only Number.isFinite rejects them.
  // excluded===0 additionally pins that they are MALFORMED, never mistaken for exclusions.
  it('catches Infinity and -Infinity as malformed, not as valid or excluded values', async () => {
    const scores = [{
      id: 'inf', sd_id: 'SD-INF', total_score: 40,
      dimension_scores: { V01: Infinity, V02: -Infinity, V03: { name: 'ok', score: 30 } },
      rubric_snapshot: {},
    }];

    const supabase = createMockSupabase(scores);
    const result = await syncVisionScoresToPatterns(supabase, { dryRun: true });

    expect(result.skipped).toBe(2);
    expect(result.synced).toBe(1);
    expect(result.excluded).toBe(0);
  });

  it('TS-9: a NaN-valued dimension inside an otherwise-valid eva-5dim-v1 row is caught as malformed BEFORE the exclusion check -- malformed wins, resolving a genuine ordering ambiguity', async () => {
    const scores = [{
      id: 'eva-ts9',
      sd_id: 'SD-EVA-TS9',
      total_score: 30,
      dimension_scores: {
        feasibility: 7,
        impact: NaN,
        innovation: 6,
        strategic_alignment: 5,
        sustainability: 4,
      },
      rubric_snapshot: {},
    }];

    const supabase = createMockSupabase(scores);
    const result = await syncVisionScoresToPatterns(supabase, { dryRun: true });

    expect(result.skipped).toBe(1); // the NaN dim
    expect(result.excluded).toBe(4); // the four valid-but-non-comparable dims
    expect(result.synced).toBe(0);
  });

  it('return shape always carries excluded/unscored, including the empty-scores early-return path (guards the CLI summary destructure, TS-10)', async () => {
    const supabase = createMockSupabase([]); // zero eva_vision_scores rows in window
    const result = await syncVisionScoresToPatterns(supabase, { dryRun: true });

    expect(result).toEqual({ synced: 0, skipped: 0, errors: 0, resolved: 0, excluded: 0, unscored: 0, couldNotVerify: 0 });
  });
});

describe('syncVisionScoresToPatterns auto-resolve cascade safety (TS-6, FR-5)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  /**
   * A pattern_id-aware mock, distinct from createMockSupabase above: the shared
   * fallback treats every issue_patterns query identically (returns the full seeded
   * array regardless of filter), which made an earlier draft of this test vacuous --
   * a seeded pattern satisfied ANY pattern_id lookup and the auto-resolve branch
   * (vision-to-patterns.js:307-329) never actually executed. This mock distinguishes
   * the per-pattern upsert lookup (.eq('pattern_id', X), no .ilike) from the
   * auto-resolve scan (.ilike('pattern_id','VGAP-%').in('status',[...])) by tracking
   * which chain methods were invoked.
   */
  function createAutoResolveMockSupabase(scoreRecords, seededActivePatterns) {
    const updateCalls = [];
    const insertCalls = [];

    return {
      from: vi.fn((table) => {
        if (table === 'eva_vision_scores') return makeBuilder(scoreRecords);
        if (table === 'issue_patterns') {
          let usedIlike = false;
          let eqPatternId = null;
          const builder = {};
          builder.select = vi.fn(() => builder);
          builder.eq = vi.fn((col, val) => {
            if (col === 'pattern_id') eqPatternId = val;
            return builder;
          });
          builder.ilike = vi.fn(() => { usedIlike = true; return builder; });
          builder.in = vi.fn(() => builder);
          builder.order = vi.fn(() => builder);
          builder.limit = vi.fn(() => builder);
          builder.range = vi.fn(() => builder);
          builder.update = vi.fn((payload) => ({
            eq: vi.fn((col, val) => {
              updateCalls.push({ id: val, payload });
              return Promise.resolve({ error: null });
            }),
          }));
          builder.insert = vi.fn((payload) => {
            insertCalls.push(payload);
            return Promise.resolve({ error: null });
          });
          builder.then = (onFulfilled, onRejected) => {
            const data = usedIlike
              ? seededActivePatterns // auto-resolve scan: sees the full active set
              : seededActivePatterns.filter((p) => p.pattern_id === eqPatternId); // specific lookup
            return Promise.resolve({ data, error: null }).then(onFulfilled, onRejected);
          };
          return builder;
        }
        return makeBuilder([]);
      }),
      _updateCalls: updateCalls,
      _insertCalls: insertCalls,
    };
  }

  it('TS-6: reclassification/exclusion under the corrected logic never falsely auto-resolves a still-valid active pattern (negative control), a genuinely-improved dimension gets auto-resolved (positive control), and a dimension merely absent from this run is left alone (QF-20260816-109)', async () => {
    // Mixed-rubric fixture. The PRE-FIX key set this sync produces is a hard-coded
    // literal derived from buildPatternId's known transform, not computed by calling
    // the function under test -- computing it here would make the assertion
    // tautological (PAT-TEST-PINS-FACT-NOT-BEHAVIOUR-001).
    const scoreRecords = [
      {
        id: 'vav-ts6', sd_id: 'SD-VAV-TS6', total_score: 50,
        dimension_scores: {
          A01: { name: 'vision dim 1', score: 30 },
          A02: { score: 90 }, A03: { score: 90 }, A04: { score: 90 }, A05: { score: 90 },
          A06: { score: 90 }, A07: { score: 90 }, A08: { score: 90 },
          V01: { score: 90 }, V02: { score: 90 }, V03: { score: 90 },
          // QF-20260816-109: re-measured this run at >= SCORE_THRESHOLD -> positive evidence
          // that VGAP-obsolete genuinely improved (the pre-fix "positive control" instead
          // relied on VGAP-obsolete being merely ABSENT from every record below, which this
          // fix no longer treats as improvement -- see p-unseen further down).
          obsolete: { name: 'improved dim', score: 75 },
        },
        rubric_snapshot: {},
      },
      {
        id: 'heal-ts6', sd_id: 'SD-HEAL-TS6', total_score: 40,
        dimension_scores: {
          capabilities_present: { score: 90 },
          key_changes_delivered: { score: 90 },
          smoke_tests_pass: { score: 90 },
          success_criteria_met: { score: 30 }, // -> VGAP-successcriteri (negative control target)
          success_metrics_achieved: { score: 90 },
        },
        rubric_snapshot: {},
      },
      {
        id: 'lat-ts6', sd_id: 'SD-LAT-TS6', total_score: 45,
        dimension_scores: {
          elapsed_ms: 5000, // excluded per-key
          semantic: { name: 'semantic', score: 25 }, // -> VGAP-semantic, still synced
        },
        rubric_snapshot: {},
      },
      {
        id: 'eva-ts6', sd_id: 'SD-EVA-TS6', total_score: 36,
        dimension_scores: {
          feasibility: 7, impact: 8, innovation: 6, strategic_alignment: 5, sustainability: 4,
        }, // whole-row excluded -- none of VGAP-feasibility/impact/etc. should exist in dimAggregates
        rubric_snapshot: {},
      },
    ];

    const seededActivePatterns = [
      // Negative control: this dimension IS present (and still low) in the sync above --
      // must NOT be auto-resolved.
      { id: 'p-negative', pattern_id: 'VGAP-successcriteri', status: 'active', metadata: {} },
      // Positive control: this dimension IS present this run AND re-measured >= threshold
      // (see the `obsolete` dim added to vav-ts6 above) -- MUST be auto-resolved, proving
      // the mechanism itself still fires on genuine positive evidence.
      { id: 'p-positive', pattern_id: 'VGAP-obsolete', status: 'active', metadata: {} },
      // QF-20260816-109: genuinely absent from every record in this sync (no scoreRecord
      // references it at all) -- the pre-fix bug auto-resolved this; the corrected logic
      // must leave it alone (could_not_verify), since absence is not evidence of improvement.
      { id: 'p-unseen', pattern_id: 'VGAP-neverseen', status: 'active', metadata: {} },
    ];

    const supabase = createAutoResolveMockSupabase(scoreRecords, seededActivePatterns);
    const result = await syncVisionScoresToPatterns(supabase, { dryRun: false });

    // Positive control: observed this run AND re-measured >= threshold -> genuinely
    // improved -> auto-resolved (proves the mechanism at vision-to-patterns.js still fires,
    // so this test is not vacuous).
    expect(result.resolved).toBe(1);
    const resolveCalls = supabase._updateCalls.filter((c) => c.payload.status === 'resolved');
    expect(resolveCalls).toHaveLength(1);
    expect(resolveCalls[0].id).toBe('p-positive');

    // Negative control: still present (and still low) in this sync -> may receive the
    // NORMAL upsert-refresh update (severity/occurrence_count), but NEVER one carrying
    // status:'resolved' -- the property the corrected FR-2 design must preserve.
    const negativeControlResolveCalls = supabase._updateCalls.filter(
      (c) => c.id === 'p-negative' && c.payload.status === 'resolved'
    );
    expect(negativeControlResolveCalls).toHaveLength(0);

    // QF-20260816-109: genuinely absent (not in stillLowDims, not in improvedPatternIds) ->
    // could_not_verify, never resolved, status left untouched.
    expect(result.couldNotVerify).toBe(1);
    const unseenResolveCalls = supabase._updateCalls.filter(
      (c) => c.id === 'p-unseen' && c.payload.status === 'resolved'
    );
    expect(unseenResolveCalls).toHaveLength(0);
    const unseenMarkCalls = supabase._updateCalls.filter(
      (c) => c.id === 'p-unseen' && c.payload.metadata?.last_sync_outcome === 'could_not_verify'
    );
    expect(unseenMarkCalls).toHaveLength(1);
  });
});

describe('syncVisionScoresToPatterns positive-evidence gating (QF-20260816-109)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  /** Mirrors createAutoResolveMockSupabase above -- distinguishes the per-pattern eq lookup
   * from the ilike auto-resolve scan so the resolve branch actually executes. */
  function createGatingMockSupabase(scoreRecords, seededActivePatterns) {
    const updateCalls = [];

    return {
      from: vi.fn((table) => {
        if (table === 'eva_vision_scores') return makeBuilder(scoreRecords);
        if (table === 'issue_patterns') {
          let usedIlike = false;
          let eqPatternId = null;
          const builder = {};
          builder.select = vi.fn(() => builder);
          builder.eq = vi.fn((col, val) => {
            if (col === 'pattern_id') eqPatternId = val;
            return builder;
          });
          builder.ilike = vi.fn(() => { usedIlike = true; return builder; });
          builder.in = vi.fn(() => builder);
          builder.order = vi.fn(() => builder);
          builder.limit = vi.fn(() => builder);
          builder.range = vi.fn(() => builder);
          builder.update = vi.fn((payload) => ({
            eq: vi.fn((col, val) => {
              updateCalls.push({ id: val, payload });
              return Promise.resolve({ error: null });
            }),
          }));
          builder.insert = vi.fn(() => Promise.resolve({ error: null }));
          builder.then = (onFulfilled, onRejected) => {
            const data = usedIlike
              ? seededActivePatterns
              : seededActivePatterns.filter((p) => p.pattern_id === eqPatternId);
            return Promise.resolve({ data, error: null }).then(onFulfilled, onRejected);
          };
          return builder;
        }
        return makeBuilder([]);
      }),
      _updateCalls: updateCalls,
    };
  }

  it('a dim that reads malformed this run leaves its VGAP active (could_not_verify), not resolved -- ticket repro step 1', async () => {
    const scoreRecords = [{
      id: 'malformed-run', sd_id: 'SD-MALFORMED-RUN', total_score: 40,
      dimension_scores: { flaky: { name: undefined, score: undefined } },
      rubric_snapshot: {},
    }];
    const seededActivePatterns = [
      { id: 'p-flaky', pattern_id: 'VGAP-flaky', status: 'active', metadata: {} },
    ];
    const supabase = createGatingMockSupabase(scoreRecords, seededActivePatterns);
    const result = await syncVisionScoresToPatterns(supabase, { dryRun: false });

    expect(result.resolved).toBe(0);
    expect(supabase._updateCalls.filter((c) => c.payload.status === 'resolved')).toHaveLength(0);
    expect(result.couldNotVerify).toBe(1);
  });

  it('a dim absent because its own SD total_score rose to >=70 leaves its VGAP active (could_not_verify), not resolved -- ticket repro step 2', async () => {
    const scoreRecords = [{
      // Unrelated SD still below 70 this run -- keeps scores.length > 0 so the auto-resolve
      // cascade actually executes (an empty `scores` array short-circuits before ever
      // reaching it, which is a separate, already-safe path this test is not exercising).
      id: 'other-sd', sd_id: 'SD-OTHER', total_score: 50,
      dimension_scores: { other_dim: { name: 'other', score: 30 } },
      rubric_snapshot: {},
    }];
    const seededActivePatterns = [
      { id: 'p-risingsd', pattern_id: 'VGAP-risingsd', status: 'active', metadata: {} },
    ];
    const supabase = createGatingMockSupabase(scoreRecords, seededActivePatterns);
    const result = await syncVisionScoresToPatterns(supabase, { dryRun: false });

    expect(result.resolved).toBe(0);
    expect(supabase._updateCalls.filter((c) => c.payload.status === 'resolved')).toHaveLength(0);
    expect(result.couldNotVerify).toBe(1);
  });

  it('a dim re-measured this run at >= SCORE_THRESHOLD gets its VGAP auto-resolved -- ticket repro step 3', async () => {
    const scoreRecords = [{
      id: 'remeasured', sd_id: 'SD-REMEASURED', total_score: 65,
      dimension_scores: { fixed: { name: 'fixed dim', score: 72 } },
      rubric_snapshot: {},
    }];
    const seededActivePatterns = [
      { id: 'p-fixed', pattern_id: 'VGAP-fixed', status: 'active', metadata: {} },
    ];
    const supabase = createGatingMockSupabase(scoreRecords, seededActivePatterns);
    const result = await syncVisionScoresToPatterns(supabase, { dryRun: false });

    expect(result.resolved).toBe(1);
    const resolveCalls = supabase._updateCalls.filter((c) => c.payload.status === 'resolved');
    expect(resolveCalls).toHaveLength(1);
    expect(resolveCalls[0].id).toBe('p-fixed');
    expect(result.couldNotVerify).toBe(0);
  });

  it('mixed evidence in one run (same pattern_id low in one record, improved in another) never resolves -- stillLowDims must win over improvedPatternIds', async () => {
    const scoreRecords = [
      {
        id: 'mixed-low', sd_id: 'SD-MIXED-LOW', total_score: 40,
        dimension_scores: { shared: { name: 'shared dim', score: 30 } },
        rubric_snapshot: {},
      },
      {
        id: 'mixed-high', sd_id: 'SD-MIXED-HIGH', total_score: 65,
        dimension_scores: { shared: { name: 'shared dim', score: 80 } },
        rubric_snapshot: {},
      },
    ];
    const seededActivePatterns = [
      { id: 'p-shared', pattern_id: 'VGAP-shared', status: 'active', metadata: {} },
    ];
    const supabase = createGatingMockSupabase(scoreRecords, seededActivePatterns);
    const result = await syncVisionScoresToPatterns(supabase, { dryRun: false });

    expect(result.resolved).toBe(0);
    expect(result.couldNotVerify).toBe(0);
    expect(supabase._updateCalls.filter((c) => c.id === 'p-shared' && c.payload.status === 'resolved')).toHaveLength(0);
  });
});
