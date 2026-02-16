/**
 * Tests for Gate Failure Recovery
 * SD-MAN-ORCH-EVA-LIFECYCLE-COMPLETION-001-C
 */

import { describe, it, expect, vi } from 'vitest';
import {
  classifyFailureSeverity,
  retryGateFailure,
  markKilledAtGate,
  routeGateOutcome,
  attemptGateRecovery,
  _internal,
} from '../../../lib/eva/gate-failure-recovery.js';

const silentLogger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), log: vi.fn() };

function mockSupabase(overrides = {}) {
  const insertFn = vi.fn().mockResolvedValue({ error: null });
  const updateFn = vi.fn().mockReturnValue({
    eq: vi.fn().mockResolvedValue({ error: null }),
  });
  const selectFn = vi.fn().mockReturnValue({
    eq: vi.fn().mockReturnValue({
      single: vi.fn().mockResolvedValue({ data: { metadata: {} }, error: null }),
    }),
  });

  return {
    from: vi.fn((table) => {
      if (overrides[table]) return overrides[table];
      return {
        insert: insertFn,
        update: updateFn,
        select: selectFn,
      };
    }),
    _insertFn: insertFn,
  };
}

// ── US-001: classifyFailureSeverity ─────────────────────────

describe('classifyFailureSeverity', () => {
  it('returns critical for ARTIFACT_MISSING', () => {
    expect(classifyFailureSeverity([{ code: 'ARTIFACT_MISSING' }])).toBe('critical');
  });

  it('returns critical for DB_ERROR', () => {
    expect(classifyFailureSeverity([{ code: 'DB_ERROR' }])).toBe('critical');
  });

  it('returns critical for CONFIG_ERROR', () => {
    expect(classifyFailureSeverity([{ code: 'CONFIG_ERROR' }])).toBe('critical');
  });

  it('returns critical for QUALITY_SCORE_MISSING', () => {
    expect(classifyFailureSeverity([{ code: 'QUALITY_SCORE_MISSING' }])).toBe('critical');
  });

  it('returns non-critical for QUALITY_SCORE_BELOW_THRESHOLD', () => {
    expect(classifyFailureSeverity([{ code: 'QUALITY_SCORE_BELOW_THRESHOLD' }])).toBe('non-critical');
  });

  it('returns non-critical for URL_UNREACHABLE', () => {
    expect(classifyFailureSeverity([{ code: 'URL_UNREACHABLE' }])).toBe('non-critical');
  });

  it('returns critical for unknown reason code (fail-safe)', () => {
    expect(classifyFailureSeverity([{ code: 'UNKNOWN_CODE' }])).toBe('critical');
  });

  it('returns critical for empty reasons array', () => {
    expect(classifyFailureSeverity([])).toBe('critical');
  });

  it('returns critical for null/undefined', () => {
    expect(classifyFailureSeverity(null)).toBe('critical');
    expect(classifyFailureSeverity(undefined)).toBe('critical');
  });

  it('returns critical if any reason is critical (mixed)', () => {
    expect(classifyFailureSeverity([
      { code: 'QUALITY_SCORE_BELOW_THRESHOLD' },
      { code: 'DB_ERROR' },
    ])).toBe('critical');
  });

  it('returns non-critical only when all reasons are non-critical', () => {
    expect(classifyFailureSeverity([
      { code: 'QUALITY_SCORE_BELOW_THRESHOLD' },
      { code: 'URL_UNREACHABLE' },
    ])).toBe('non-critical');
  });
});

// ── US-002: retryGateFailure ────────────────────────────────

describe('retryGateFailure', () => {
  it('returns recovered on first retry success', async () => {
    const supabase = mockSupabase();
    const rerunFn = vi.fn().mockResolvedValue({ status: 'PASS', reasons: [] });

    const result = await retryGateFailure(
      { ventureId: 'v1', fromStage: 5, toStage: 6, failureReasons: [{ code: 'URL_UNREACHABLE' }], rerunAnalysisFn: rerunFn },
      { supabase, logger: silentLogger }
    );

    expect(result.status).toBe('recovered');
    expect(result.attempts).toBe(1);
    expect(rerunFn).toHaveBeenCalledTimes(1);
  });

  it('returns recovered on third retry', async () => {
    const supabase = mockSupabase();
    const rerunFn = vi.fn()
      .mockResolvedValueOnce({ status: 'FAIL', reasons: [{ code: 'URL_UNREACHABLE' }] })
      .mockResolvedValueOnce({ status: 'FAIL', reasons: [{ code: 'URL_UNREACHABLE' }] })
      .mockResolvedValueOnce({ status: 'PASS', reasons: [] });

    const result = await retryGateFailure(
      { ventureId: 'v1', fromStage: 5, toStage: 6, failureReasons: [{ code: 'URL_UNREACHABLE' }], rerunAnalysisFn: rerunFn },
      { supabase, logger: silentLogger }
    );

    expect(result.status).toBe('recovered');
    expect(result.attempts).toBe(3);
  });

  it('returns exhausted after 3 failed retries', async () => {
    const supabase = mockSupabase();
    const rerunFn = vi.fn().mockResolvedValue({ status: 'FAIL', reasons: [{ code: 'URL_UNREACHABLE' }] });

    const result = await retryGateFailure(
      { ventureId: 'v1', fromStage: 5, toStage: 6, failureReasons: [{ code: 'URL_UNREACHABLE' }], rerunAnalysisFn: rerunFn },
      { supabase, logger: silentLogger }
    );

    expect(result.status).toBe('exhausted');
    expect(result.attempts).toBe(3);
    expect(rerunFn).toHaveBeenCalledTimes(3);
  });

  it('passes retry context with attempt number and previous reasons', async () => {
    const supabase = mockSupabase();
    const rerunFn = vi.fn().mockResolvedValue({ status: 'PASS', reasons: [] });

    await retryGateFailure(
      { ventureId: 'v1', fromStage: 9, toStage: 10, failureReasons: [{ code: 'URL_UNREACHABLE' }], rerunAnalysisFn: rerunFn },
      { supabase, logger: silentLogger }
    );

    const retryContext = rerunFn.mock.calls[0][2];
    expect(retryContext.attempt).toBe(1);
    expect(retryContext.maxRetries).toBe(3);
    expect(retryContext.previousReasons).toEqual([{ code: 'URL_UNREACHABLE' }]);
    expect(retryContext.fromStage).toBe(9);
    expect(retryContext.toStage).toBe(10);
  });

  it('logs each retry attempt to eva_event_log', async () => {
    const supabase = mockSupabase();
    const rerunFn = vi.fn().mockResolvedValue({ status: 'PASS', reasons: [] });

    await retryGateFailure(
      { ventureId: 'v1', fromStage: 5, toStage: 6, failureReasons: [{ code: 'URL_UNREACHABLE' }], rerunAnalysisFn: rerunFn },
      { supabase, logger: silentLogger }
    );

    // Should log attempt + success events
    const eventLogCalls = supabase.from.mock.calls.filter(c => c[0] === 'eva_event_log');
    expect(eventLogCalls.length).toBeGreaterThanOrEqual(2);
  });

  it('handles rerun function throwing errors', async () => {
    const supabase = mockSupabase();
    const rerunFn = vi.fn().mockRejectedValue(new Error('analysis failed'));

    const result = await retryGateFailure(
      { ventureId: 'v1', fromStage: 5, toStage: 6, failureReasons: [{ code: 'URL_UNREACHABLE' }], rerunAnalysisFn: rerunFn },
      { supabase, logger: silentLogger }
    );

    expect(result.status).toBe('exhausted');
    expect(result.attempts).toBe(3);
  });
});

// ── US-003: markKilledAtGate ────────────────────────────────

describe('markKilledAtGate', () => {
  it('updates venture orchestrator_state to killed_at_reality_gate', async () => {
    const updateEq = vi.fn().mockResolvedValue({ error: null });
    const supabase = mockSupabase({
      eva_ventures: { update: vi.fn().mockReturnValue({ eq: updateEq }) },
      eva_event_log: { insert: vi.fn().mockResolvedValue({ error: null }) },
    });

    const result = await markKilledAtGate(supabase, 'v1', { reasons: [{ code: 'DB_ERROR' }], fromStage: 5, logger: silentLogger });
    expect(result.killed).toBe(true);
  });

  it('returns error on missing supabase', async () => {
    const result = await markKilledAtGate(null, 'v1');
    expect(result.killed).toBe(false);
    expect(result.error).toContain('Missing');
  });

  it('returns error on DB failure', async () => {
    const supabase = mockSupabase({
      eva_ventures: { update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: { message: 'db fail' } }) }) },
    });

    const result = await markKilledAtGate(supabase, 'v1', { logger: silentLogger });
    expect(result.killed).toBe(false);
    expect(result.error).toBe('db fail');
  });
});

// ── US-004: routeGateOutcome ────────────────────────────────

describe('routeGateOutcome', () => {
  it('routes critical failure to DFE (chairman_decisions)', async () => {
    const insertFn = vi.fn().mockResolvedValue({ error: null });
    const supabase = mockSupabase({
      chairman_decisions: { insert: insertFn },
    });

    const result = await routeGateOutcome('v1', 'critical', { reasons: [{ code: 'DB_ERROR' }], fromStage: 5, toStage: 6 }, { supabase, logger: silentLogger });
    expect(result.routed).toBe(true);
    expect(result.path).toBe('dfe');
    expect(insertFn).toHaveBeenCalled();
  });

  it('routes non-critical failure to venture metadata (auto-track)', async () => {
    const updateEq = vi.fn().mockResolvedValue({ error: null });
    const supabase = mockSupabase({
      eva_ventures: {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: { metadata: { existing: true } }, error: null }),
          }),
        }),
        update: vi.fn().mockReturnValue({ eq: updateEq }),
      },
    });

    const result = await routeGateOutcome('v1', 'non-critical', { reasons: [{ code: 'URL_UNREACHABLE' }], fromStage: 5, toStage: 6 }, { supabase, logger: silentLogger });
    expect(result.routed).toBe(true);
    expect(result.path).toBe('auto_track');
  });

  it('returns error on missing inputs', async () => {
    const result = await routeGateOutcome(null, 'critical', {}, { supabase: null, logger: silentLogger });
    expect(result.routed).toBe(false);
  });
});

// ── US-005: attemptGateRecovery ─────────────────────────────

describe('attemptGateRecovery', () => {
  it('skips retry for critical failures and kills venture', async () => {
    const insertFn = vi.fn().mockResolvedValue({ error: null });
    const updateEq = vi.fn().mockResolvedValue({ error: null });
    const supabase = mockSupabase({
      chairman_decisions: { insert: insertFn },
      eva_ventures: {
        update: vi.fn().mockReturnValue({ eq: updateEq }),
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: { metadata: {} }, error: null }),
          }),
        }),
      },
      eva_event_log: { insert: vi.fn().mockResolvedValue({ error: null }) },
    });
    const rerunFn = vi.fn();

    const result = await attemptGateRecovery(
      { ventureId: 'v1', fromStage: 5, toStage: 6, gateResult: { reasons: [{ code: 'DB_ERROR' }] }, rerunAnalysisFn: rerunFn },
      { supabase, logger: silentLogger }
    );

    expect(result.recovered).toBe(false);
    expect(result.killed).toBe(true);
    expect(rerunFn).not.toHaveBeenCalled(); // No retry for critical
  });

  it('retries non-critical failures and recovers on success', async () => {
    const supabase = mockSupabase({
      eva_event_log: { insert: vi.fn().mockResolvedValue({ error: null }) },
    });
    const rerunFn = vi.fn().mockResolvedValue({ status: 'PASS', reasons: [] });

    const result = await attemptGateRecovery(
      { ventureId: 'v1', fromStage: 5, toStage: 6, gateResult: { reasons: [{ code: 'QUALITY_SCORE_BELOW_THRESHOLD' }] }, rerunAnalysisFn: rerunFn },
      { supabase, logger: silentLogger }
    );

    expect(result.recovered).toBe(true);
    expect(result.gateResult).toBeDefined();
  });

  it('kills venture when non-critical retries are exhausted', async () => {
    const updateEq = vi.fn().mockResolvedValue({ error: null });
    const supabase = mockSupabase({
      eva_event_log: { insert: vi.fn().mockResolvedValue({ error: null }) },
      eva_ventures: {
        update: vi.fn().mockReturnValue({ eq: updateEq }),
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: { metadata: {} }, error: null }),
          }),
        }),
      },
    });
    const rerunFn = vi.fn().mockResolvedValue({ status: 'FAIL', reasons: [{ code: 'QUALITY_SCORE_BELOW_THRESHOLD' }] });

    const result = await attemptGateRecovery(
      { ventureId: 'v1', fromStage: 5, toStage: 6, gateResult: { reasons: [{ code: 'QUALITY_SCORE_BELOW_THRESHOLD' }] }, rerunAnalysisFn: rerunFn },
      { supabase, logger: silentLogger }
    );

    expect(result.recovered).toBe(false);
    expect(result.killed).toBe(true);
    expect(rerunFn).toHaveBeenCalledTimes(3);
  });
});
