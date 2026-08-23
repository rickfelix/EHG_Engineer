/**
 * SD-LEO-INFRA-MINUS-PATH-INTEGRITY-001 (FR-1) — worker-level tests driving the REAL
 * _advanceStage() path-integrity choke-point: feature-flagged wiring of checkExitGates/
 * checkThesisKillGate/checkGateDebt into the dominant venture-stage advance path. Mirrors the
 * stage-execution-worker-s19-harden.test.js / -product-review-gate.test.js pattern (drives the
 * real method against a fake chainable supabase).
 *
 * Uses stage pair 5->6 throughout (neither the S19 synthetic-actor block [19->20] nor the
 * product-review block [23->24] apply there) so only the NEW path-integrity choke-point and the
 * pre-existing artifact-precondition/high-consequence backstops are in play.
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
  fetchVentureForFixtureCheck: vi.fn().mockResolvedValue({ id: 'v-1', is_demo: false }),
}));
vi.mock('../../../lib/eva/shared-services.js', () => ({ emit: vi.fn().mockResolvedValue({}) }));
vi.mock('../../../lib/eva/autonomy-model.js', () => ({ checkAutonomy: vi.fn().mockResolvedValue({ action: 'block', level: 'L0' }) }));
vi.mock('../../../lib/eva/stage-governance.js', () => ({
  getStageGovernance: vi.fn().mockResolvedValue({ isBlocking: () => false, isReview: () => false, isHighConsequence: () => false }),
}));

import { StageExecutionWorker } from '../../../lib/eva/stage-execution-worker.js';

const logger = { log: vi.fn(), warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() };

/**
 * Thenable chainable supabase fake. `chairman_decisions` is special-cased to actually simulate
 * server-side .in('decision', ADVANCE_INTENT_VERBS) filtering (checkGateDebt's FR-2 fix) so a
 * seeded non-advance-intent decision does not accidentally resolve gate debt in these tests.
 * Every other table returns a fixed per-table row/array, with sane empty-trivial-pass defaults
 * for venture_stages (no declared exit gates), ventures (no armed kill_criteria), and
 * stage_artifact_requirements/venture_artifacts (no required artifacts) so ONLY the
 * path-integrity choke-point (and its 3 composed checks) is under test.
 */
function makeSupabase({
  ventureRow = { metadata: {} },
  stageWork = { advisory_data: {} },
  ventureStagesRow = { metadata: { gates: {} }, required_artifacts: [] },
  gateResultRows = [],
  chairmanDecisionRows = [],
  flagRow = undefined, // undefined = ABSENT row (must default to disabled/observe-only)
} = {}) {
  const calls = { venturesUpdate: 0, systemEvents: [] };
  const from = (table) => {
    const terminalData =
      table === 'ventures' ? ventureRow :
      table === 'venture_stage_work' ? stageWork :
      table === 'venture_stages' ? ventureStagesRow :
      table === 'eva_stage_gate_results' ? gateResultRows :
      table === 'chairman_decisions' ? chairmanDecisionRows :
      table === 'leo_feature_flags' ? (flagRow === undefined ? null : flagRow) :
      table === 'stage_artifact_requirements' ? [] :
      table === 'venture_artifacts' ? [] :
      null;
    const inFilters = [];
    const applyInFilters = (rows) =>
      Array.isArray(rows) ? rows.filter((row) => inFilters.every(({ column, values }) => values.includes(row[column]))) : rows;
    const chain = {
      select: () => chain,
      eq: () => chain,
      neq: () => chain,
      in(column, values) { inFilters.push({ column, values }); return chain; },
      gt: () => chain,
      order: () => chain,
      limit: () => chain,
      maybeSingle: async () => ({ data: Array.isArray(terminalData) ? (applyInFilters(terminalData)[0] ?? null) : terminalData, error: null }),
      single: async () => ({ data: terminalData, error: null }),
      upsert: async () => ({ data: null, error: null }),
      insert: async (row) => { if (table === 'system_events') calls.systemEvents.push(row); return { data: null, error: null }; },
      update: () => { if (table === 'ventures') calls.venturesUpdate += 1; return chain; },
      then: (resolve) => resolve({ data: applyInFilters(terminalData), error: null }),
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

describe('_advanceStage path-integrity choke-point (FR-1) — real method', () => {
  beforeEach(() => vi.clearAllMocks());

  it('TS-0a BASELINE (pre-fix behavior, must still hold): a failed BLOCKING gate + no decision advances anyway with no would-have-REFUSED log, when the flag row is absent', async () => {
    // NOTE: this is deliberately the SAME scenario as TS-1's flag-OFF case below -- it exists
    // separately so the flag-absent default (TS-11-adjacent) and the "still advances, still logs"
    // behavior are each independently pinned.
    const supabase = makeSupabase({
      gateResultRows: [{ gate_type: 'kill', passed: false, overall_score: 42 }],
      chairmanDecisionRows: [],
      flagRow: undefined,
    });
    const worker = makeWorker(supabase);

    const result = await worker._advanceStage('v-1', 5, 6, {});

    expect(result?.blocked).not.toBe(true);
    expect(supabase.calls.venturesUpdate).toBe(1);
  });

  it('TS-1: flag OFF -- advances exactly as before (no regression) AND logs a would-have-REFUSED warning naming the fired limb', async () => {
    const supabase = makeSupabase({
      gateResultRows: [{ gate_type: 'kill', passed: false, overall_score: 42 }],
      chairmanDecisionRows: [],
      flagRow: { is_enabled: false },
    });
    const worker = makeWorker(supabase);

    const result = await worker._advanceStage('v-1', 5, 6, {});

    expect(result?.blocked).not.toBe(true);
    expect(supabase.calls.venturesUpdate).toBe(1);
    const warnCalls = logger.warn.mock.calls.map((c) => c[0]).join('\n');
    expect(warnCalls).toMatch(/PATH-INTEGRITY CHOKE-POINT/);
    expect(warnCalls).toMatch(/would have REFUSED/);
    expect(warnCalls).toMatch(/gate_debt/);
  });

  it('TS-2: flag ON -- BLOCKS with the exact { advanced:false, blocked:true, reason } shape, never throws, and the checkGateDebt limb fires specifically (exit-gates/thesis-kill trivially pass)', async () => {
    const supabase = makeSupabase({
      gateResultRows: [{ gate_type: 'kill', passed: false, overall_score: 42 }],
      chairmanDecisionRows: [],
      flagRow: { is_enabled: true },
    });
    const worker = makeWorker(supabase);

    const result = await worker._advanceStage('v-1', 5, 6, {});

    expect(result).toEqual({ advanced: false, blocked: true, reason: expect.stringContaining('gate_debt') });
    expect(Object.keys(result).sort()).toEqual(['advanced', 'blocked', 'reason']);
    expect(supabase.calls.venturesUpdate).toBe(0);
    // D8: must name WHICH limb fired -- exit_gates/thesis_kill must NOT appear (they trivially pass).
    expect(result.reason).not.toMatch(/exit_gates|thesis_kill/);
  });

  it('TS-2 regression control: flag ON, gate PASSED (no failed blocking gate) -- advances normally, checkGateDebt never fires', async () => {
    const supabase = makeSupabase({
      gateResultRows: [{ gate_type: 'kill', passed: true, overall_score: 90 }],
      chairmanDecisionRows: [],
      flagRow: { is_enabled: true },
    });
    const worker = makeWorker(supabase);

    const result = await worker._advanceStage('v-1', 5, 6, {});

    expect(result?.blocked).not.toBe(true);
    expect(supabase.calls.venturesUpdate).toBe(1);
  });

  it('TS-2 regression control: flag ON, failed blocking gate BUT an approved allow-listed decision (proceed) resolves it -- advances normally', async () => {
    const supabase = makeSupabase({
      gateResultRows: [{ gate_type: 'kill', passed: false, overall_score: 42 }],
      chairmanDecisionRows: [{ id: 'd1', decision: 'proceed', status: 'approved' }],
      flagRow: { is_enabled: true },
    });
    const worker = makeWorker(supabase);

    const result = await worker._advanceStage('v-1', 5, 6, {});

    expect(result?.blocked).not.toBe(true);
    expect(supabase.calls.venturesUpdate).toBe(1);
  });

  it('TS-11: flag row EXISTS with is_enabled===false at merge time (direct value assertion)', async () => {
    // Static assertion against the migration content, not a behavioral proxy -- mirrors D5's
    // "not inferred from TS-7 passing" discipline used for FR-4's kill-switch default.
    const fs = await import('node:fs');
    const path = await import('node:path');
    const migration = fs.readFileSync(
      path.resolve(process.cwd(), 'database/migrations/20260823_register_path_integrity_flags.sql'),
      'utf8'
    );
    expect(migration).toMatch(/PATH_INTEGRITY_EXIT_GATE_ENFORCE/);
    expect(migration).toMatch(/false,\s*\n\s*'disabled'/);
  });

  it('TS-11: an ABSENT flag row resolves to disabled (observe-only), never enforced', async () => {
    const supabase = makeSupabase({
      gateResultRows: [{ gate_type: 'kill', passed: false, overall_score: 42 }],
      chairmanDecisionRows: [],
      flagRow: undefined,
    });
    const worker = makeWorker(supabase);

    const result = await worker._advanceStage('v-1', 5, 6, {});

    expect(result?.blocked).not.toBe(true);
    expect(supabase.calls.venturesUpdate).toBe(1);
  });

  // SECURITY EXEC-TO-PLAN finding SEC-PATH-001: checkExitGates dispatches to the growable
  // GATE_VERIFIERS registry; an uncaught throw from any of the 3 composed checks must NEVER
  // escape _advanceStage() (proved empirically by SECURITY: it previously did, with
  // venturesUpdate=0 and no result object -- the exact D1 polarity violation this test pins).
  it('SEC-PATH-001: a throw from a composed check (e.g. checkExitGates) never escapes -- falls through to advance, matching flag-OFF "zero behavior change"', async () => {
    const supabase = makeSupabase({ flagRow: undefined });
    const realFrom = supabase.from;
    // venture_stages is read TWICE: once by the pre-existing (out-of-scope) checkStageArtifactPrecondition
    // backstop, once by FR-1's checkExitGates -- only the SECOND (FR-1's own composed check) should throw,
    // so this test isolates SEC-PATH-001's exact repro without tripping an unrelated earlier backstop.
    let ventureStagesCalls = 0;
    supabase.from = (table) => {
      if (table === 'venture_stages') {
        ventureStagesCalls += 1;
        if (ventureStagesCalls > 1) {
          return { select: () => { throw new Error('injected evaluator throw (SEC-PATH-001 repro)'); } };
        }
      }
      return realFrom(table);
    };
    const worker = makeWorker(supabase);

    const result = await worker._advanceStage('v-1', 5, 6, {});

    expect(result?.blocked).not.toBe(true);
    expect(supabase.calls.venturesUpdate).toBe(1);
    const warnCalls = logger.warn.mock.calls.map((c) => c[0]).join('\n');
    expect(warnCalls).toMatch(/composed-check evaluator error/);
  });

  it('does not run for a venture/stage with no failed blocking gate at all (zero-noise control)', async () => {
    const supabase = makeSupabase({ flagRow: { is_enabled: true } });
    const worker = makeWorker(supabase);

    const result = await worker._advanceStage('v-1', 5, 6, {});

    expect(result?.blocked).not.toBe(true);
    expect(supabase.calls.venturesUpdate).toBe(1);
  });
});

describe('gate-conformance.js doc-block (FR-1, TS-14 doc-consistency)', () => {
  it('no longer claims _advanceStage() does NOT call the gate checks', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const doc = fs.readFileSync(
      path.resolve(process.cwd(), 'lib/eva/lifecycle/gate-conformance.js'),
      'utf8'
    );
    expect(doc).not.toMatch(/_advanceStage\(\) \(the dominant path/);
  });
});
