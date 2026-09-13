/**
 * SD-LEO-INFRA-STAGE-LAUNCH-READINESS-001 FR-7 AC#4.
 *
 * End-to-end regression: a fixture venture with zero usage-event rows (so its
 * launch_usage_signal artifact is absent) crossing the 24->25 boundary must NOT
 * produce a new chairman_decisions row -- FR-4's carve-out, exercised through the
 * real evaluateRealityGate() -> attemptGateRecovery() -> routeGateOutcome() chain,
 * not just routeGateOutcome() in isolation (see gate-failure-recovery-fr4-
 * producerless.test.js for that narrower unit coverage).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { evaluateRealityGate, _resetBoundaryCacheForTest } from '../../../lib/eva/reality-gates.js';
import { attemptGateRecovery } from '../../../lib/eva/gate-failure-recovery.js';

const silentLogger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), log: vi.fn() };

/**
 * Fixture venture: zero usage_events rows -> the venture_usage_events RPC never fired ->
 * zero venture_artifacts rows for launch_usage_signal. gate_boundary_config requires it
 * at the 24->25 boundary (mirrors the live row added by database/chairman-gated/
 * 20260826_venture_usage_events_rpc.sql).
 */
function buildSupabase({ chairmanDecisionsInsert, feedbackInsert }) {
  return {
    from(table) {
      if (table === 'gate_boundary_config') {
        return {
          select: () => Promise.resolve({
            data: [{ from_stage: 24, to_stage: 25, required_artifacts: ['launch_usage_signal'], quality_thresholds: {}, url_verification_required: false, description: 'BUILD LOOP -> LAUNCH & LEARN' }],
            error: null,
          }),
        };
      }
      if (table === 'venture_artifacts') {
        // Zero rows -- the fixture venture has no launch_usage_signal artifact
        // (its sole producer, the usage-events RPC, only fires post-launch).
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                in: () => ({ limit: () => Promise.resolve({ data: [], error: null }) }),
              }),
            }),
          }),
        };
      }
      if (table === 'chairman_decisions') {
        return { insert: chairmanDecisionsInsert };
      }
      if (table === 'feedback') {
        return {
          select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }),
          insert: feedbackInsert,
        };
      }
      if (table === 'eva_ventures' || table === 'eva_event_log') {
        return {
          update: () => ({ eq: async () => ({ error: null }) }),
          insert: async () => ({ error: null }),
        };
      }
      throw new Error(`unexpected table in fixture: ${table}`);
    },
  };
}

describe('FR-7 AC#4: zero-usage-event venture at the 24->25 boundary', () => {
  beforeEach(() => {
    _resetBoundaryCacheForTest();
  });

  it('does not insert a chairman_decisions row; routes to harness_backlog instead', async () => {
    const chairmanDecisionsInsert = vi.fn().mockResolvedValue({ error: null });
    const insertedFeedback = [];
    const feedbackInsert = vi.fn((row) => {
      insertedFeedback.push(row);
      return { select: () => ({ single: async () => ({ data: { id: 'fb-fr7' }, error: null }) }) };
    });
    const supabase = buildSupabase({ chairmanDecisionsInsert, feedbackInsert });

    const gateResult = await evaluateRealityGate(
      { ventureId: 'v-fr7-zero-usage', fromStage: 24, toStage: 25, supabase, logger: silentLogger }
    );

    // BLOCKED, not FAIL: reality-gates.js's own final-status contract for any
    // non-empty reasons list ("Chairman decides venture fate" -- this FR-4 carve-out
    // decides that fate automatically for the pure producer-less-artifact case).
    expect(gateResult.status).toBe('BLOCKED');
    expect(gateResult.reasons).toHaveLength(1);
    expect(gateResult.reasons[0].code).toBe('ARTIFACT_MISSING');
    expect(gateResult.reasons[0].artifact_type).toBe('launch_usage_signal');

    const recovery = await attemptGateRecovery(
      { ventureId: 'v-fr7-zero-usage', fromStage: 24, toStage: 25, gateResult, rerunAnalysisFn: vi.fn() },
      { supabase, logger: silentLogger }
    );

    expect(recovery.killed).toBe(true);
    expect(chairmanDecisionsInsert).not.toHaveBeenCalled();
    expect(insertedFeedback).toHaveLength(1);
    expect(insertedFeedback[0].category).toBe('harness_backlog');
    expect(insertedFeedback[0].title).toMatch(/launch_usage_signal/);
  });
});
