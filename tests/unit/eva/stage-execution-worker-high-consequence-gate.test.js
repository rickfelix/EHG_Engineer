/**
 * SD-LEO-FEAT-MAKE-HIGH-CONSEQUENCE-001 (FR-3) — unit tests for the high-consequence
 * blocking-gate choke-point, the 4th backstop in StageExecutionWorker._advanceStage().
 * Mirrors stage-execution-worker-product-review-gate.test.js's pattern: drives the
 * REAL _advanceStage() method against a mocked, chainable supabase fake.
 *
 * Complements tests/integration/eva/high-consequence-blocking-gate-realdb.test.js
 * (real DB, covers TS-1/2/4/6/9/10) with the two scenarios that are unsafe or
 * impractical to force against shared live infrastructure:
 *   - TS-8: fail-CLOSED when the evaluator itself throws
 *   - TS-11: the kill-switch flag disables the check entirely
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../lib/eva/eva-orchestrator.js', () => ({ processStage: vi.fn() }));
vi.mock('../../../lib/eva/orchestrator-state-machine.js', () => ({
  acquireProcessingLock: vi.fn(), releaseProcessingLock: vi.fn(), markCompleted: vi.fn(),
  ORCHESTRATOR_STATES: { IDLE: 'idle', PROCESSING: 'processing', BLOCKED: 'blocked', FAILED: 'failed', KILLED_AT_REALITY_GATE: 'killed_at_reality_gate' },
}));
vi.mock('../../../lib/eva/chairman-decision-watcher.js', () => ({
  createOrReusePendingDecision: vi.fn(),
  waitForDecision: vi.fn(),
  isFixtureVenture: vi.fn().mockReturnValue(false),
  fetchVentureForFixtureCheck: vi.fn().mockResolvedValue({ id: 'v-1', name: 'Real Venture', is_demo: false }),
}));
vi.mock('../../../lib/eva/shared-services.js', () => ({ emit: vi.fn().mockResolvedValue({}) }));
vi.mock('../../../lib/eva/autonomy-model.js', () => ({ checkAutonomy: vi.fn().mockResolvedValue({ action: 'block', level: 'L0' }) }));
vi.mock('../../../lib/eva/chairman-product-review.js', () => ({ requestProductReview: vi.fn().mockResolvedValue({ id: 'decision-x', isNew: true }) }));

// Mutable per-test override for isHighConsequence — the mock factory reads this at
// CALL time (not module-load time), so each test can reassign it in isolation.
let mockIsHighConsequence = () => false;
vi.mock('../../../lib/eva/stage-governance.js', () => ({
  getStageGovernance: vi.fn(async () => ({
    isBlocking: () => false,
    isReview: () => false,
    isHighConsequence: (n) => mockIsHighConsequence(n),
  })),
}));

import { StageExecutionWorker } from '../../../lib/eva/stage-execution-worker.js';
import { getStageGovernance } from '../../../lib/eva/stage-governance.js';

const logger = { log: vi.fn(), warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() };

/**
 * Thenable chainable supabase fake. Distinguishes by TABLE + the actual .eq() filter
 * values applied, not just table name -- the pre-existing artifact-precondition
 * backstop (checkStageArtifactPrecondition, lib/eva/stage-artifact-precondition.js)
 * ALSO unconditionally reads leo_feature_flags (flag_key='LEO_S22_GATES_ENABLED') on
 * every call, so a table-name-only mock cannot tell that read apart from THIS new
 * check's flag_key='LEO_HIGH_CONSEQUENCE_GATES_ENABLED' read. Defaults every OTHER
 * table (ventures, venture_stages, stage_artifact_requirements) to a response that
 * makes the artifact-precondition check resolve to blocked:false with zero required
 * artifacts, so the high-consequence check is the only blocker these tests exercise.
 *
 * `leoFeatureFlagRow` / `throwOnHcFlagRead` apply ONLY to the
 * LEO_HIGH_CONSEQUENCE_GATES_ENABLED read; `pendingBlockingDecision` /
 * `throwOnChairmanDecisionsRead` apply to the chairman_decisions read.
 */
function makeSupabase({ leoFeatureFlagRow = null, pendingBlockingDecision = null, throwOnHcFlagRead = false, throwOnChairmanDecisionsRead = false } = {}) {
  const calls = { venturesUpdate: 0 };
  const from = (table) => {
    const eqFilters = [];
    const chain = {
      select: () => chain,
      eq: (col, val) => { eqFilters.push([col, val]); return chain; },
      neq: () => chain,
      in: () => chain,
      gt: () => chain,
      order: () => chain,
      limit: () => chain,
      maybeSingle: async () => {
        if (table === 'leo_feature_flags') {
          const isHcFlagQuery = eqFilters.some(([c, v]) => c === 'flag_key' && v === 'LEO_HIGH_CONSEQUENCE_GATES_ENABLED');
          if (isHcFlagQuery) {
            if (throwOnHcFlagRead) throw new Error('db down');
            return { data: leoFeatureFlagRow, error: null };
          }
          return { data: null, error: null }; // e.g. LEO_S22_GATES_ENABLED -> absent
        }
        if (table === 'chairman_decisions') {
          if (throwOnChairmanDecisionsRead) throw new Error('db down');
          return { data: pendingBlockingDecision, error: null };
        }
        if (table === 'ventures') return { data: { metadata: {} }, error: null };
        if (table === 'venture_stages') return { data: { required_artifacts: [] }, error: null };
        return { data: null, error: null };
      },
      single: async () => ({ data: null, error: null }),
      upsert: async () => ({ data: null, error: null }),
      insert: async () => ({ data: null, error: null }),
      update: () => { if (table === 'ventures') calls.venturesUpdate += 1; return chain; },
      then: (resolve) => resolve({ data: table === 'stage_artifact_requirements' ? [] : null, error: null }),
    };
    return chain;
  };
  return { from, calls };
}

function makeWorker(supabase) {
  const worker = new StageExecutionWorker({ supabase, logger, pollIntervalMs: 999999 });
  worker._logStageTransition = vi.fn().mockResolvedValue(undefined);
  worker._runPostStageHooks = vi.fn().mockResolvedValue(undefined);
  return worker;
}

describe('_advanceStage high-consequence blocking-gate choke-point (FR-3) — real method', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsHighConsequence = () => false;
  });

  it('short-circuits with ZERO chairman_decisions queries for a non-high-consequence stage (leo_feature_flags is still legitimately read by the pre-existing artifact-precondition backstop for a DIFFERENT flag_key)', async () => {
    mockIsHighConsequence = () => false;
    let touchedChairmanDecisions = false;
    const supabase = makeSupabase();
    const realFrom = supabase.from;
    supabase.from = (table) => {
      if (table === 'chairman_decisions') touchedChairmanDecisions = true;
      return realFrom(table);
    };
    const worker = makeWorker(supabase);

    const result = await worker._advanceStage('v-1', 10, 11, {});

    expect(result?.blocked).not.toBe(true);
    expect(touchedChairmanDecisions).toBe(false);
  });

  it('TS-1/TS-2 (mock-level): HOLDS on a pending blocking=true decision for a high-consequence stage', async () => {
    mockIsHighConsequence = () => true;
    const supabase = makeSupabase({ pendingBlockingDecision: { id: 'decision-1' } });
    const worker = makeWorker(supabase);

    const result = await worker._advanceStage('v-1', 10, 11, {});

    expect(result).toEqual({ advanced: false, blocked: true, reason: 'high_consequence_gate_blocked' });
  });

  it('releases advancement once the pending decision is resolved (query returns no matching row)', async () => {
    mockIsHighConsequence = () => true;
    const supabase = makeSupabase({ pendingBlockingDecision: null });
    const worker = makeWorker(supabase);

    const result = await worker._advanceStage('v-1', 10, 11, {});

    expect(result?.blocked).not.toBe(true);
    expect(supabase.calls.venturesUpdate).toBe(1);
  });

  // TS-11
  it('TS-11: the kill-switch flag (is_enabled=false) disables the check entirely, even with a pending blocking decision', async () => {
    mockIsHighConsequence = () => true;
    const supabase = makeSupabase({
      leoFeatureFlagRow: { is_enabled: false },
      pendingBlockingDecision: { id: 'decision-1' }, // would normally hold
    });
    const worker = makeWorker(supabase);

    const result = await worker._advanceStage('v-1', 10, 11, {});

    expect(result?.blocked).not.toBe(true);
    expect(supabase.calls.venturesUpdate).toBe(1);
  });

  it('kill-switch flag row absent defaults to ENABLED — still holds on a pending blocking decision', async () => {
    mockIsHighConsequence = () => true;
    const supabase = makeSupabase({ leoFeatureFlagRow: null, pendingBlockingDecision: { id: 'decision-1' } });
    const worker = makeWorker(supabase);

    const result = await worker._advanceStage('v-1', 10, 11, {});

    expect(result).toEqual({ advanced: false, blocked: true, reason: 'high_consequence_gate_blocked' });
  });

  // TS-8
  it('TS-8: fails CLOSED (holds) when the chairman_decisions evaluator query throws', async () => {
    mockIsHighConsequence = () => true;
    const supabase = makeSupabase({ throwOnChairmanDecisionsRead: true });
    const worker = makeWorker(supabase);

    const result = await worker._advanceStage('v-1', 10, 11, {});

    expect(result).toEqual({ advanced: false, blocked: true, reason: 'high_consequence_gate_blocked' });
    expect(supabase.calls.venturesUpdate).toBe(0);
  });

  it('TS-8b: fails CLOSED when the leo_feature_flags kill-switch read itself throws', async () => {
    mockIsHighConsequence = () => true;
    const supabase = makeSupabase({ throwOnHcFlagRead: true });
    const worker = makeWorker(supabase);

    const result = await worker._advanceStage('v-1', 10, 11, {});

    expect(result).toEqual({ advanced: false, blocked: true, reason: 'high_consequence_gate_blocked' });
    expect(supabase.calls.venturesUpdate).toBe(0);
  });

  it('TS-8c: fails CLOSED when getStageGovernance itself throws (cannot determine classification)', async () => {
    getStageGovernance.mockRejectedValueOnce(new Error('governance read failed'));
    const supabase = makeSupabase();
    const worker = makeWorker(supabase);

    const result = await worker._advanceStage('v-1', 10, 11, {});

    expect(result).toEqual({ advanced: false, blocked: true, reason: 'high_consequence_gate_blocked' });
    expect(supabase.calls.venturesUpdate).toBe(0);
  });
});
