/**
 * Tests for Reality Gates
 * SD-LEO-ORCH-CLI-VENTURE-LIFECYCLE-002-B
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  evaluateRealityGate,
  getBoundaryConfig,
  isGatedBoundary,
  BOUNDARY_CONFIG,
  REASON_CODES,
  MODULE_VERSION,
  _internal,
  _resetBoundaryCacheForTest,
} from '../../../lib/eva/reality-gates.js';
import { createFaithfulRealtimeChannelMock } from '../../helpers/faithful-supabase-realtime-mock.js';

// QF-20260829-634: gate_boundary_config and venture_artifacts are two different
// tables hitting this same mocked `supabase.from()`. boundaryRows feeds the
// gate_boundary_config().select() read (leg 2/3 resolution); artifacts feeds the
// venture_artifacts()...in() read (existing per-artifact PASS/BLOCK checks).
// Passing boundaryRows=null simulates "no canonical row for this transition"
// (map-miss, DB otherwise healthy) rather than a genuine DB error.
function createMockDb(artifacts = [], boundaryRows = null) {
  return {
    from: vi.fn((table) => {
      if (table === 'gate_boundary_config') {
        return { select: vi.fn().mockResolvedValue({ data: boundaryRows || [], error: null }) };
      }
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        in: vi.fn().mockResolvedValue({ data: artifacts, error: null }),
      };
    }),
  };
}

// Genuine gate_boundary_config read failure (leg 2: must be distinguished from a
// map-miss -- both used to collapse into the same deprecated-fallback branch).
function createBoundaryErrorDb(message = 'DB connection failed') {
  return {
    from: vi.fn((table) => {
      if (table === 'gate_boundary_config') {
        return { select: vi.fn().mockResolvedValue({ data: null, error: { message } }) };
      }
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        in: vi.fn().mockResolvedValue({ data: [], error: null }),
      };
    }),
  };
}

// venture_artifacts fetch failure, with a HEALTHY canonical boundary row supplied --
// isolates the pre-existing "DB error on artifact fetch" fail-closed path from the
// leg-2/leg-3 boundary-config resolution path.
function createErrorDb(message = 'DB connection failed', boundaryRows = null) {
  return {
    from: vi.fn((table) => {
      if (table === 'gate_boundary_config') {
        return { select: vi.fn().mockResolvedValue({ data: boundaryRows || [], error: null }) };
      }
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        in: vi.fn().mockResolvedValue({ data: null, error: { message } }),
      };
    }),
  };
}

const silentLogger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };

describe('RealityGates', () => {
  // _loadBoundaryFromDB caches gate_boundary_config for 60s at module scope.
  // Without a reset, whichever test runs first "wins" the cache for every
  // subsequent test in this file, regardless of that test's own mocked rows.
  beforeEach(() => {
    _resetBoundaryCacheForTest();
  });

  describe('isGatedBoundary', () => {
    // QF-20260829-634 leg 1: BOUNDARY_CONFIG is now the designated-gated-boundary
    // registry (6 keys, DB is the sole content authority). 24->25 is included --
    // it previously had a DB canonical row but NO BOUNDARY_CONFIG key, so
    // isGatedBoundary(24,25) silently returned false and a BLOCKED verdict from
    // evaluateRealityGate would never actually stop the orchestrator (the exact
    // incident class root-caused for 23->24 in escalation 5cd5d5c3).
    it('should return true for configured boundaries', () => {
      expect(isGatedBoundary(5, 6)).toBe(true);
      expect(isGatedBoundary(9, 10)).toBe(true);
      expect(isGatedBoundary(12, 13)).toBe(true);
      expect(isGatedBoundary(17, 18)).toBe(true);
      expect(isGatedBoundary(23, 24)).toBe(true);
      expect(isGatedBoundary(24, 25)).toBe(true);
    });

    it('should return false for non-gated transitions', () => {
      expect(isGatedBoundary(1, 2)).toBe(false);
      expect(isGatedBoundary(7, 8)).toBe(false);
      expect(isGatedBoundary(20, 21)).toBe(false);
    });
  });

  describe('getBoundaryConfig', () => {
    // QF-20260829-634 leg 1: hardcoded required_artifacts content is RETIRED (empty)
    // for every entry -- gate_boundary_config (DB) is the sole content authority.
    // The key's presence is what matters now (registry membership for
    // isGatedBoundary / the leg-3 designated-boundary check), not its content.
    it('should return a retired (contentless) config for a designated boundary', () => {
      const config = getBoundaryConfig(5, 6);
      expect(config).toBeDefined();
      expect(config.description).toBe('SPARK → ENGINE');
      expect(config.required_artifacts).toEqual([]);
    });

    it('should return null for non-gated boundary', () => {
      expect(getBoundaryConfig(1, 2)).toBeNull();
    });
  });

  describe('evaluateRealityGate - NOT_APPLICABLE', () => {
    it('should return NOT_APPLICABLE for non-gated transitions', async () => {
      const result = await evaluateRealityGate({
        ventureId: 'v1',
        fromStage: 1,
        toStage: 2,
        supabase: createMockDb(),
        logger: silentLogger,
      });
      expect(result.status).toBe('NOT_APPLICABLE');
      expect(result.reasons).toHaveLength(0);
    });
  });

  describe('evaluateRealityGate - validation', () => {
    it('should FAIL when ventureId is missing', async () => {
      const result = await evaluateRealityGate({
        ventureId: null,
        fromStage: 5,
        toStage: 6,
        supabase: createMockDb(),
        logger: silentLogger,
      });
      expect(result.status).toBe('FAIL');
      expect(result.reasons[0].code).toBe(REASON_CODES.CONFIG_ERROR);
    });

    it('should FAIL when supabase is missing', async () => {
      const result = await evaluateRealityGate({
        ventureId: 'v1',
        fromStage: 5,
        toStage: 6,
        supabase: null,
        logger: silentLogger,
      });
      expect(result.status).toBe('FAIL');
      expect(result.reasons[0].code).toBe(REASON_CODES.CONFIG_ERROR);
    });
  });

  // QF-20260829-634: these tests now supply a real gate_boundary_config row for
  // 5->6 (matching the canonical DB shape) so they exercise the DB-driven artifact
  // evaluation path -- previously the mock had no gate_boundary_config stub at all,
  // so `dbConfig` was always null and these tests were unknowingly exercising the
  // now-retired hardcoded BOUNDARY_CONFIG fallback content instead.
  const BOUNDARY_5_6_ROW = {
    from_stage: 5, to_stage: 6,
    required_artifacts: ['truth_problem_statement', 'truth_target_market_analysis', 'truth_value_proposition'],
    quality_thresholds: { truth_problem_statement: 0.6, truth_target_market_analysis: 0.5, truth_value_proposition: 0.6 },
    url_verification_required: false,
  };

  describe('evaluateRealityGate - artifact checks', () => {
    it('should PASS when all required artifacts exist with sufficient quality', async () => {
      const artifacts = [
        { artifact_type: 'truth_problem_statement', quality_score: 0.8, is_current: true },
        { artifact_type: 'truth_target_market_analysis', quality_score: 0.7, is_current: true },
        { artifact_type: 'truth_value_proposition', quality_score: 0.9, is_current: true },
      ];
      const result = await evaluateRealityGate({
        ventureId: 'v1',
        fromStage: 5,
        toStage: 6,
        supabase: createMockDb(artifacts, [BOUNDARY_5_6_ROW]),
        logger: silentLogger,
      });
      expect(result.status).toBe('PASS');
      expect(result.config_source).toBe('gate_boundary_config');
      expect(result.reasons).toHaveLength(0);
    });

    it('should BLOCK when required artifact is missing', async () => {
      const artifacts = [
        { artifact_type: 'truth_problem_statement', quality_score: 0.8, is_current: true },
      ];
      const result = await evaluateRealityGate({
        ventureId: 'v1',
        fromStage: 5,
        toStage: 6,
        supabase: createMockDb(artifacts, [BOUNDARY_5_6_ROW]),
        logger: silentLogger,
      });
      expect(result.status).toBe('BLOCKED');
      expect(result.passed).toBe(false);
      const missingReasons = result.reasons.filter(r => r.code === REASON_CODES.ARTIFACT_MISSING);
      expect(missingReasons.length).toBe(2);
    });

    it('should BLOCK when quality score is below threshold', async () => {
      const artifacts = [
        { artifact_type: 'truth_problem_statement', quality_score: 0.3, is_current: true },
        { artifact_type: 'truth_target_market_analysis', quality_score: 0.5, is_current: true },
        { artifact_type: 'truth_value_proposition', quality_score: 0.6, is_current: true },
      ];
      const result = await evaluateRealityGate({
        ventureId: 'v1',
        fromStage: 5,
        toStage: 6,
        supabase: createMockDb(artifacts, [BOUNDARY_5_6_ROW]),
        logger: silentLogger,
      });
      expect(result.status).toBe('BLOCKED');
      expect(result.passed).toBe(false);
      const qualityReasons = result.reasons.filter(r => r.code === REASON_CODES.QUALITY_SCORE_BELOW_THRESHOLD);
      expect(qualityReasons.length).toBe(1);
    });

    it('should BLOCK when quality score is null', async () => {
      const artifacts = [
        { artifact_type: 'truth_problem_statement', quality_score: null, is_current: true },
        { artifact_type: 'truth_target_market_analysis', quality_score: 0.5, is_current: true },
        { artifact_type: 'truth_value_proposition', quality_score: 0.6, is_current: true },
      ];
      const result = await evaluateRealityGate({
        ventureId: 'v1',
        fromStage: 5,
        toStage: 6,
        supabase: createMockDb(artifacts, [BOUNDARY_5_6_ROW]),
        logger: silentLogger,
      });
      expect(result.status).toBe('BLOCKED');
      expect(result.passed).toBe(false);
      const missingScore = result.reasons.find(r => r.code === REASON_CODES.QUALITY_SCORE_MISSING);
      expect(missingScore).toBeDefined();
    });
  });

  describe('evaluateRealityGate - DB errors (fail-closed)', () => {
    it('should FAIL on database error fetching venture_artifacts', async () => {
      // Canonical boundary row resolves fine; the venture_artifacts fetch itself fails.
      const result = await evaluateRealityGate({
        ventureId: 'v1',
        fromStage: 5,
        toStage: 6,
        supabase: createErrorDb('Connection timeout', [BOUNDARY_5_6_ROW]),
        logger: silentLogger,
      });
      expect(result.status).toBe('FAIL');
      expect(result.reasons[0].code).toBe(REASON_CODES.DB_ERROR);
    });
  });

  describe('evaluateRealityGate - leg 2: genuine DB read failure vs map-miss', () => {
    it('should FAIL CLOSED when gate_boundary_config itself errors for a designated boundary', async () => {
      const result = await evaluateRealityGate({
        ventureId: 'v1',
        fromStage: 5,
        toStage: 6,
        supabase: createBoundaryErrorDb('gate_boundary_config unreachable'),
        logger: silentLogger,
      });
      expect(result.status).toBe('FAIL');
      expect(result.passed).toBe(false);
      expect(result.reasons[0].code).toBe(REASON_CODES.DB_ERROR);
    });
  });

  describe('evaluateRealityGate - leg 3: absent canonical row on a designated boundary is LOUD', () => {
    // The exact incident class root-caused in escalation 5cd5d5c3: gate_boundary_config
    // read SUCCEEDS (no error) but returns no row for a designated boundary (e.g. lost
    // during a stage renumbering). Must fail closed, never an advisory NOT_APPLICABLE pass.
    it('should FAIL CLOSED, not advisory-pass, when a designated boundary has no canonical row', async () => {
      const result = await evaluateRealityGate({
        ventureId: 'v1',
        fromStage: 23,
        toStage: 24,
        supabase: createMockDb([], null), // DB read succeeds; zero rows for 23->24
        logger: silentLogger,
      });
      expect(result.status).toBe('FAIL');
      expect(result.passed).toBe(false);
      expect(result.reasons[0].code).toBe(REASON_CODES.CANONICAL_ROW_MISSING);
    });

    it('should still advisory-pass a non-designated boundary with no canonical row', async () => {
      const result = await evaluateRealityGate({
        ventureId: 'v1',
        fromStage: 1,
        toStage: 2,
        supabase: createMockDb([], null),
        logger: silentLogger,
      });
      expect(result.status).toBe('NOT_APPLICABLE');
      expect(result.passed).toBe(true);
    });
  });

  describe('evaluateRealityGate - explicit empty-requirements marker', () => {
    // A canonical row that EXISTS with required_artifacts: [] is a deliberate
    // "this boundary needs no artifacts" declaration, distinct from a genuinely
    // absent row (leg 3, fails closed above). Must advisory-pass, not fail closed.
    it('should PASS (not FAIL) when the canonical row explicitly declares no required artifacts', async () => {
      const emptyMarkerRow = {
        from_stage: 23, to_stage: 24,
        required_artifacts: [],
        quality_thresholds: {},
        url_verification_required: false,
      };
      const result = await evaluateRealityGate({
        ventureId: 'v1',
        fromStage: 23,
        toStage: 24,
        supabase: createMockDb([], [emptyMarkerRow]),
        logger: silentLogger,
      });
      expect(result.status).toBe('PASS');
      expect(result.passed).toBe(true);
      expect(result.config_source).toBe('gate_boundary_config');
    });
  });

  // TODO(SD-LEO-INFRA-REALITY-GATE-ARTIFACT-001 follow-up): these 3 URL tests use boundary 16->17
  // which has never been in BOUNDARY_CONFIG (current entries: 5->6, 9->10, 12->13, 17->18, 23->24).
  // They also reference artifact_types (build_mvp_build, build_test_coverage_report, launch_deployment_runbook)
  // that no current stage emits per lifecycle_stage_config. The URL verification code path is preserved;
  // these tests need to be rewritten against a real boundary with url_verification_required=true.
  describe.skip('evaluateRealityGate - URL verification', () => {
    it('should PASS when URL is reachable', async () => {
      const artifacts = [
        { artifact_type: 'build_mvp_build', quality_score: 0.8, file_url: 'https://app.example.com', is_current: true },
        { artifact_type: 'build_test_coverage_report', quality_score: 0.7, is_current: true },
        { artifact_type: 'launch_deployment_runbook', quality_score: 0.6, is_current: true },
      ];
      const httpClient = vi.fn().mockResolvedValue({ status: 200 });
      const result = await evaluateRealityGate({
        ventureId: 'v1',
        fromStage: 16,
        toStage: 17,
        supabase: createMockDb(artifacts),
        httpClient,
        logger: silentLogger,
      });
      expect(result.status).toBe('PASS');
      expect(httpClient).toHaveBeenCalled();
    });

    it('should BLOCK when URL is unreachable', async () => {
      const artifacts = [
        { artifact_type: 'build_mvp_build', quality_score: 0.8, file_url: 'https://app.example.com', is_current: true },
        { artifact_type: 'build_test_coverage_report', quality_score: 0.7, is_current: true },
        { artifact_type: 'launch_deployment_runbook', quality_score: 0.6, is_current: true },
      ];
      const httpClient = vi.fn().mockResolvedValue({ status: 500 });
      const result = await evaluateRealityGate({
        ventureId: 'v1',
        fromStage: 16,
        toStage: 17,
        supabase: createMockDb(artifacts),
        httpClient,
        logger: silentLogger,
      });
      expect(result.status).toBe('BLOCKED');
      const urlReason = result.reasons.find(r => r.code === REASON_CODES.URL_UNREACHABLE);
      expect(urlReason).toBeDefined();
    });

    it('should skip URL verification in simulation mode', async () => {
      const artifacts = [
        { artifact_type: 'build_mvp_build', quality_score: 0.8, file_url: null, is_current: true },
        { artifact_type: 'build_test_coverage_report', quality_score: 0.7, is_current: true },
        { artifact_type: 'launch_deployment_runbook', quality_score: 0.6, is_current: true },
      ];
      const httpClient = vi.fn();
      const result = await evaluateRealityGate({
        ventureId: 'v1',
        fromStage: 16,
        toStage: 17,
        supabase: createMockDb(artifacts),
        httpClient,
        simulationMode: true,
        logger: silentLogger,
      });
      expect(result.status).toBe('PASS');
      expect(result.simulation_mode).toBe(true);
      expect(httpClient).not.toHaveBeenCalled();
      const urlReasons = result.reasons.filter(r => r.code === REASON_CODES.URL_UNREACHABLE);
      expect(urlReasons).toHaveLength(0);
    });
  });

  describe('verifyUrl (internal)', () => {
    it('should retry on timeout', async () => {
      const httpClient = vi.fn()
        .mockRejectedValueOnce({ code: 'ETIMEDOUT', message: 'timeout' })
        .mockResolvedValueOnce({ status: 200 });
      const result = await _internal.verifyUrl('https://example.com', httpClient, silentLogger);
      expect(result.reachable).toBe(true);
      expect(httpClient).toHaveBeenCalledTimes(2);
    });

    it('should not retry on non-timeout errors', async () => {
      const httpClient = vi.fn().mockRejectedValue({ code: 'ECONNREFUSED', message: 'refused' });
      const result = await _internal.verifyUrl('https://example.com', httpClient, silentLogger);
      expect(result.reachable).toBe(false);
      expect(httpClient).toHaveBeenCalledTimes(1);
    });
  });

  describe('BOUNDARY_CONFIG', () => {
    // QF-20260829-634 leg 1: re-keyed to the full designated-boundary registry
    // (adds 24->25, which had a DB canonical row but no BOUNDARY_CONFIG key).
    it('should have exactly 6 configured boundaries', () => {
      expect(Object.keys(BOUNDARY_CONFIG)).toEqual(['5->6', '9->10', '12->13', '17->18', '23->24', '24->25']);
    });

    // Content is RETIRED (empty) for every entry -- gate_boundary_config (DB) is the
    // sole content authority post-FR-2. Key presence alone now signals "designated
    // Reality Gate boundary"; stale pre-renumber artifact types are never re-checked.
    it('should have retired (empty) required_artifacts for every boundary', () => {
      for (const [_key, config] of Object.entries(BOUNDARY_CONFIG)) {
        expect(config.required_artifacts).toEqual([]);
        expect(config.description).toBeTruthy();
      }
    });
  });

  describe('exports', () => {
    it('should export MODULE_VERSION', () => {
      expect(MODULE_VERSION).toBe('1.0.0');
    });

    it('should export all REASON_CODES', () => {
      // QF-20260829-634 leg 3: +CANONICAL_ROW_MISSING (absent canonical row on a
      // designated boundary must be LOUD, distinct from a genuine DB_ERROR).
      expect(Object.keys(REASON_CODES)).toHaveLength(7);
    });
  });

  describe('Realtime channel teardown safety (QF-20260701-709)', () => {
    // QF-20260701-709: SD-FDBK-FIX-EVA-STAGE-GOVERNANCE-001's original fix (calling
    // supabase.removeChannel() instead of channel.unsubscribe()) was INEFFECTIVE --
    // removeChannel() also calls unsubscribe() internally, which under CI's
    // no-reachable-Realtime-server condition synchronously re-fires this same status
    // callback via phoenix's Channel.leave(), reproducing the identical
    // RangeError: Maximum call stack size exceeded. The correct fix drops the local
    // reference only and calls NEITHER unsubscribe() NOR removeChannel() from inside
    // the callback. These tests use a mock whose unsubscribe()/removeChannel() WOULD
    // recursively re-invoke the callback (reproducing the real vendored-client
    // behavior) and assert neither is ever called -- proving the recursion never gets
    // a chance to start. Uses the shared faithful mock
    // (tests/helpers/faithful-supabase-realtime-mock.js), wrapped with this file's own
    // `from()` shape.
    function makeMockDbWithRecursiveTeardown() {
      const { channelMock, removeChannel, getStatusCallback, getUnsubscribeCallCount, getRemoveChannelCallCount } =
        createFaithfulRealtimeChannelMock();
      const sb = {
        from: vi.fn(() => ({ select: () => Promise.resolve({ data: [], error: null }) })),
        channel: () => channelMock,
        removeChannel,
      };
      return {
        sb,
        getStatusCallback,
        getUnsubscribeCallCount,
        getRemoveChannelCallCount,
      };
    }

    it('CHANNEL_ERROR/CLOSED/TIMED_OUT status drops the reference WITHOUT calling unsubscribe() or removeChannel() (both would recurse)', async () => {
      _resetBoundaryCacheForTest();
      const { sb, getStatusCallback, getUnsubscribeCallCount, getRemoveChannelCallCount } = makeMockDbWithRecursiveTeardown();

      // Unconfigured transition (999->1000) -- evaluateRealityGate returns NOT_APPLICABLE
      // immediately after _loadBoundaryFromDB runs, isolating the channel-teardown path
      // from unrelated artifact-lookup logic.
      await evaluateRealityGate({
        ventureId: 'v1',
        fromStage: 999,
        toStage: 1000,
        supabase: sb,
        logger: silentLogger,
      });

      const statusCallback = getStatusCallback();
      expect(statusCallback).toBeTypeOf('function');

      expect(() => statusCallback('CHANNEL_ERROR')).not.toThrow();

      expect(getUnsubscribeCallCount()).toBe(0);
      expect(getRemoveChannelCallCount()).toBe(0);

      _resetBoundaryCacheForTest();
    });

    it('a genuinely re-entrant CLOSED re-fire (simulating phoenix Channel.leave()) does not throw and calls no teardown method', async () => {
      _resetBoundaryCacheForTest();
      const { sb, getStatusCallback, getUnsubscribeCallCount, getRemoveChannelCallCount } = makeMockDbWithRecursiveTeardown();

      await evaluateRealityGate({
        ventureId: 'v1',
        fromStage: 999,
        toStage: 1000,
        supabase: sb,
        logger: silentLogger,
      });

      const statusCallback = getStatusCallback();
      expect(() => {
        statusCallback('CLOSED');
        statusCallback('CLOSED');
      }).not.toThrow();

      expect(getUnsubscribeCallCount()).toBe(0);
      expect(getRemoveChannelCallCount()).toBe(0);

      _resetBoundaryCacheForTest();
    });

    it('a channel whose unsubscribe()/removeChannel() recursively re-invoke the status callback would overflow the stack if either were called -- proves neither is', async () => {
      _resetBoundaryCacheForTest();
      const { sb, getStatusCallback, getUnsubscribeCallCount, getRemoveChannelCallCount } = makeMockDbWithRecursiveTeardown();

      await evaluateRealityGate({
        ventureId: 'v1',
        fromStage: 999,
        toStage: 1000,
        supabase: sb,
        logger: silentLogger,
      });

      const statusCallback = getStatusCallback();
      expect(() => statusCallback('TIMED_OUT')).not.toThrow();
      expect(getUnsubscribeCallCount()).toBe(0);
      expect(getRemoveChannelCallCount()).toBe(0);

      _resetBoundaryCacheForTest();
    });
  });
});
