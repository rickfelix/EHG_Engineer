/**
 * Unit tests for lib/apa/journey-walk-orchestrator.js — SD-LEO-INFRA-VENTURE-JOURNEY-UAT-001
 * FR-2. All external effects (live-instance acquisition, browser walk, result-recorder,
 * Supabase) are injected via `deps` — no network, no real DB.
 *
 * @module tests/unit/apa/journey-walk-orchestrator.test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runVentureJourneyWalk } from '../../../lib/apa/journey-walk-orchestrator.js';

const STEPS = [
  { step_id: 'stp-1', journey_id: 'jny-1', persona_ref: 'Persona', goal: 'do step one', action: 'do step one', expected_outcome: 'step one done', route: '/one', screen_ref: 'screen-1' },
  { step_id: 'stp-2', journey_id: 'jny-1', persona_ref: 'Persona', goal: 'do step two', action: 'do step two', expected_outcome: 'step two done', route: '/two', screen_ref: 'screen-2' },
];

function makeDeps(overrides = {}) {
  const sdMetadata = { some_existing_key: 'must-survive' };
  const supabaseUpdate = vi.fn(async () => ({ error: null }));
  const supabaseSingle = vi.fn(async () => ({ data: { metadata: sdMetadata }, error: null }));
  const fromChain = {
    select: vi.fn(() => fromChain),
    eq: vi.fn(() => fromChain),
    single: supabaseSingle,
    update: vi.fn((payload) => { supabaseUpdate(payload); return fromChain; }),
  };
  const supabase = { from: vi.fn(() => fromChain) };

  const teardown = vi.fn(async () => {});
  const page = { fake: 'page' };

  const deps = {
    acquireLiveInstance: vi.fn(async () => ({ ok: true, page, browser: {}, teardown })),
    runJourneyWalk: vi.fn(async () => ({
      outcomes: [
        { step: 'stp-1', url: 'http://fixture/one', renderedStateSummary: 'ok', success: true, failureReason: null },
        { step: 'stp-2', url: null, renderedStateSummary: null, success: false, failureReason: 'no verified UI mapping' },
      ],
      completedAllSteps: false,
      brokenAtStep: 'stp-2',
    })),
    buildStepExecutor: vi.fn(() => vi.fn(async () => ({ url: 'x', renderedStateSummary: 'x' }))),
    getVentureRegistration: vi.fn(() => ({ preflightChecks: [], stepOverrides: {} })),
    startSession: vi.fn(async () => ({ id: 'run-1' })),
    recordResult: vi.fn(async () => ({})),
    completeSession: vi.fn(async () => ({ passRate: 50 })),
    getSupabase: vi.fn(async () => supabase),
    ...overrides,
  };

  return { deps, teardown, supabaseUpdate, supabaseSingle, sdMetadata, supabase, fromChain };
}

describe('runVentureJourneyWalk() — no journey steps', () => {
  it('returns skipped without acquiring an instance', async () => {
    const { deps } = makeDeps();
    const result = await runVentureJourneyWalk({ sdId: 'sd-1', ventureKey: 'X', baseUrl: 'http://fixture', journeySteps: [], deps });

    expect(result.status).toBe('skipped');
    expect(result.reason).toBe('no_journey_steps');
    expect(deps.acquireLiveInstance).not.toHaveBeenCalled();
  });

  it('treats null journeySteps the same as empty', async () => {
    const { deps } = makeDeps();
    const result = await runVentureJourneyWalk({ sdId: 'sd-1', ventureKey: 'X', baseUrl: 'http://fixture', journeySteps: null, deps });
    expect(result.status).toBe('skipped');
  });
});

describe('runVentureJourneyWalk() — instance unreachable', () => {
  it('reports blocked with the acquisition reason, never starts a UAT session', async () => {
    const { deps } = makeDeps({
      acquireLiveInstance: vi.fn(async () => ({ ok: false, reason: 'http_503' })),
    });

    const result = await runVentureJourneyWalk({ sdId: 'sd-1', ventureKey: 'X', baseUrl: 'http://fixture', journeySteps: STEPS, deps });

    expect(result.status).toBe('blocked');
    expect(result.reason).toBe('instance_unreachable: http_503');
    expect(deps.startSession).not.toHaveBeenCalled();
  });
});

describe('runVentureJourneyWalk() — full walk with a partial failure', () => {
  it('runs preflight checks, walks steps, records each outcome, completes the session, and always tears down', async () => {
    const preflightRun = vi.fn(async () => ({ url: 'http://fixture', renderedStateSummary: 'preflight ok' }));
    const { deps, teardown } = makeDeps({
      getVentureRegistration: vi.fn(() => ({ preflightChecks: [{ name: 'land', run: preflightRun }], stepOverrides: {} })),
    });

    const result = await runVentureJourneyWalk({ sdId: 'sd-1', ventureKey: 'ALTIFYAI', baseUrl: 'http://fixture', journeySteps: STEPS, deps });

    expect(preflightRun).toHaveBeenCalledTimes(1);
    expect(deps.startSession).toHaveBeenCalledWith('sd-1', expect.objectContaining({ triggeredBy: 'JOURNEY_WALK' }));
    // QF dcc36266 retro action item: startSession must receive ventureId/stageNumber so
    // lib/eva/uat-robustness-gate.js's metadata->>venture_id / metadata->>stage_number
    // lookup can match this run.
    expect(deps.startSession).toHaveBeenCalledWith('sd-1', expect.objectContaining({ ventureId: null, stageNumber: null }));
    expect(deps.recordResult).toHaveBeenCalledTimes(2);
    expect(deps.recordResult).toHaveBeenNthCalledWith(1, 'run-1', expect.objectContaining({ id: 'stp-1' }), 'PASS', expect.objectContaining({ errorMessage: undefined }));
    expect(deps.recordResult).toHaveBeenNthCalledWith(2, 'run-1', expect.objectContaining({ id: 'stp-2' }), 'FAIL', expect.objectContaining({ errorMessage: 'no verified UI mapping' }));
    // coordinator directive ac40a109 / lib/eva/uat-robustness-gate.js: completeSession must
    // receive a truthy controlPackEvidence (metadata.control_pack_evaluated=true) or a
    // GREEN gate reads as proof the control pack ran when it never did. Derived from the
    // walk's own real per-step outcomes (1 assertion per step, not fabricated).
    expect(deps.completeSession).toHaveBeenCalledWith('run-1', {
      manifest: [
        { journeyId: 'stp-1', minimumAssertions: 1 },
        { journeyId: 'stp-2', minimumAssertions: 1 },
      ],
      executedJourneys: [
        { journeyId: 'stp-1', executedAssertions: 1 },
        { journeyId: 'stp-2', executedAssertions: 1 },
      ],
      // QF-20260902-206: evidence_hash inputs -- real per-outcome + whole-walk hashes, never a
      // fabricated placeholder. Hash VALUES aren't pinned here (implementation detail of
      // computeDedupHash); only the real shape (3 hex-sha256 strings: 2 outcomes + 1 whole-walk).
      evidenceManifest: {
        integrity: { artifact_hashes: expect.arrayContaining([expect.stringMatching(/^[0-9a-f]{64}$/)]) },
        test_run: 'run-1',
      },
      deploymentSha: expect.any(String),
    });
    const [, controlPackEvidenceArg] = deps.completeSession.mock.calls[0];
    expect(controlPackEvidenceArg.evidenceManifest.integrity.artifact_hashes).toHaveLength(3); // 2 outcomes + 1 whole-walk
    expect(teardown).toHaveBeenCalledTimes(1);

    expect(result.status).toBe('fail'); // completedAllSteps: false
    expect(result.testRunId).toBe('run-1');
    expect(result.passRate).toBe(50);
    expect(result.brokenAtStep).toBe('stp-2');
    expect(result.preflightResults).toEqual([{ name: 'land', success: true, url: 'http://fixture', renderedStateSummary: 'preflight ok' }]);
  });

  it('a step never reached by the walk is named in the manifest but absent from executedJourneys (never silently satisfied)', async () => {
    const { deps } = makeDeps({
      // Walk only produced ONE outcome even though STEPS defines two — mirrors a walk that
      // broke before reaching stp-2 (browser-executor.js stops on the first failure).
      runJourneyWalk: vi.fn(async () => ({
        outcomes: [
          { step: 'stp-1', url: 'http://fixture/one', renderedStateSummary: 'ok', success: true, failureReason: null },
        ],
        completedAllSteps: false,
        brokenAtStep: 'stp-2',
      })),
    });

    await runVentureJourneyWalk({ sdId: 'sd-1', ventureKey: 'ALTIFYAI', baseUrl: 'http://fixture', journeySteps: STEPS, deps });

    const [, controlPackEvidence] = deps.completeSession.mock.calls[0];
    expect(controlPackEvidence.manifest.map((m) => m.journeyId)).toEqual(['stp-1', 'stp-2']);
    expect(controlPackEvidence.executedJourneys.map((e) => e.journeyId)).toEqual(['stp-1']);
  });

  it('honors an injected deps.controlPackEvidence instead of auto-deriving one', async () => {
    const injected = { manifest: [], executedJourneys: [], fenceEvidence: { canExerciseApp: true, exclusionPredicateDeclared: true, exclusionPredicateAssertedInVentureCi: true } };
    const { deps } = makeDeps({ controlPackEvidence: injected });

    await runVentureJourneyWalk({ sdId: 'sd-1', ventureKey: 'ALTIFYAI', baseUrl: 'http://fixture', journeySteps: STEPS, deps });

    expect(deps.completeSession).toHaveBeenCalledWith('run-1', injected);
  });

  it('FR-4: threads a resolved commit_sha into startSession, via the injectable deps.resolveCommitSha override', async () => {
    const { deps } = makeDeps({ resolveCommitSha: vi.fn(() => 'abc1234deadbeef') });

    await runVentureJourneyWalk({ sdId: 'sd-1', ventureKey: 'ALTIFYAI', baseUrl: 'http://fixture', journeySteps: STEPS, deps });

    expect(deps.resolveCommitSha).toHaveBeenCalledTimes(1);
    expect(deps.startSession).toHaveBeenCalledWith('sd-1', expect.objectContaining({ commitSha: 'abc1234deadbeef' }));
  });

  it('FR-4: a resolveCommitSha override that cannot resolve (e.g. no git available) passes commitSha:null rather than throwing', async () => {
    const { deps } = makeDeps({ resolveCommitSha: vi.fn(() => null) });

    const result = await runVentureJourneyWalk({ sdId: 'sd-1', ventureKey: 'ALTIFYAI', baseUrl: 'http://fixture', journeySteps: STEPS, deps });

    expect(deps.startSession).toHaveBeenCalledWith('sd-1', expect.objectContaining({ commitSha: null }));
    expect(result.status).toBe('fail'); // walk still completes normally
  });

  it('threads params.ventureId and params.stageNumber into startSession when supplied', async () => {
    const { deps } = makeDeps();

    await runVentureJourneyWalk({
      sdId: 'sd-1',
      ventureId: 'venture-42',
      stageNumber: 20,
      ventureKey: 'ALTIFYAI',
      baseUrl: 'http://fixture',
      journeySteps: STEPS,
      deps,
    });

    expect(deps.startSession).toHaveBeenCalledWith('sd-1', expect.objectContaining({ ventureId: 'venture-42', stageNumber: 20 }));
  });

  it('records a failed preflight check without aborting the walk', async () => {
    const { deps } = makeDeps({
      getVentureRegistration: vi.fn(() => ({
        preflightChecks: [{ name: 'broken-check', run: vi.fn(async () => { throw new Error('preflight boom'); }) }],
        stepOverrides: {},
      })),
    });

    const result = await runVentureJourneyWalk({ sdId: 'sd-1', ventureKey: 'X', baseUrl: 'http://fixture', journeySteps: STEPS, deps });

    expect(result.preflightResults).toEqual([{ name: 'broken-check', success: false, failureReason: 'preflight boom' }]);
    expect(deps.startSession).toHaveBeenCalled(); // preflight failure doesn't block the walk itself
  });

  it('tears down the acquired instance even if the walk throws unexpectedly', async () => {
    const { deps, teardown } = makeDeps({
      runJourneyWalk: vi.fn(async () => { throw new Error('unexpected walk crash'); }),
    });

    // SD-LEO-INFRA-FIX-JOURNEY-WALK-001 FR-1: a throw after startSession() must be recorded
    // as data (status='error'), never rethrown -- matches the module's own documented
    // contract and the other stamped-result paths (skipped/blocked above).
    const result = await runVentureJourneyWalk({ sdId: 'sd-1', ventureKey: 'X', baseUrl: 'http://fixture', journeySteps: STEPS, deps });
    expect(result.status).toBe('error');
    expect(result.reason).toBe('unexpected walk crash');
    expect(result.testRunId).toBe('run-1'); // testRun was assigned before the throw
    expect(teardown).toHaveBeenCalledTimes(1);
  });

  it('SECURITY (EXEC): collapses whitespace/control chars and caps the reason at 500 chars', async () => {
    const longMessage = `line one\ncrafted\r\nsecond line\t${'x'.repeat(600)}`;
    const { deps } = makeDeps({
      runJourneyWalk: vi.fn(async () => { throw new Error(longMessage); }),
    });

    const result = await runVentureJourneyWalk({ sdId: 'sd-1', ventureKey: 'X', baseUrl: 'http://fixture', journeySteps: STEPS, deps });
    expect(result.status).toBe('error');
    expect(result.reason).not.toContain('\n');
    expect(result.reason).not.toContain('\r');
    expect(result.reason.length).toBeLessThanOrEqual(500);
  });

  it('does not crash with a TypeError when the throw happens BEFORE testRun is assigned', async () => {
    const { deps, teardown } = makeDeps({
      getVentureRegistration: vi.fn(() => { throw new Error('registration boom'); }),
    });

    const result = await runVentureJourneyWalk({ sdId: 'sd-1', ventureKey: 'X', baseUrl: 'http://fixture', journeySteps: STEPS, deps });
    expect(result.status).toBe('error');
    expect(result.reason).toBe('registration boom');
    expect(result.testRunId).toBeNull(); // no testRun existed yet -- no TypeError, no crash
    expect(deps.startSession).not.toHaveBeenCalled();
    expect(teardown).toHaveBeenCalledTimes(1);
  });
});

describe('runVentureJourneyWalk() — stamps metadata.journey_walk_result', () => {
  it('read-merge-writes so pre-existing metadata keys survive', async () => {
    const { deps, supabaseUpdate, sdMetadata } = makeDeps();

    await runVentureJourneyWalk({ sdId: 'sd-1', ventureKey: 'X', baseUrl: 'http://fixture', journeySteps: STEPS, deps });

    expect(supabaseUpdate).toHaveBeenCalledTimes(1);
    const payload = supabaseUpdate.mock.calls[0][0];
    expect(payload.metadata.some_existing_key).toBe(sdMetadata.some_existing_key);
    expect(payload.metadata.journey_walk_result).toMatchObject({ status: 'fail', testRunId: 'run-1', passRate: 50, brokenAtStep: 'stp-2' });
  });

  it('does not throw if the stamp itself fails (best-effort) — the computed result is still returned', async () => {
    const { deps } = makeDeps({
      getSupabase: vi.fn(async () => { throw new Error('db unavailable'); }),
    });

    const result = await runVentureJourneyWalk({ sdId: 'sd-1', ventureKey: 'X', baseUrl: 'http://fixture', journeySteps: STEPS, deps });
    expect(result.status).toBe('fail');
    expect(result.testRunId).toBe('run-1');
  });

  it('QF-20260901-063: looks up by sd_key when sdId is a human-readable SD-KEY (not a UUID)', async () => {
    const { deps, fromChain } = makeDeps();

    await runVentureJourneyWalk({ sdId: 'SD-ALTIFYAI-LEO-ORCH-SPRINT-2026-002', ventureKey: 'X', baseUrl: 'http://fixture', journeySteps: STEPS, deps });

    expect(fromChain.eq).toHaveBeenCalledWith('sd_key', 'SD-ALTIFYAI-LEO-ORCH-SPRINT-2026-002');
  });

  it('QF-20260901-063: looks up by id when sdId is a UUID (e.g. orchestrator.id from db-sourced-findings.js)', async () => {
    const uuid = '50763b6a-1fad-4e1e-b2fc-296a1d66ebf9';
    const { deps, fromChain } = makeDeps();

    await runVentureJourneyWalk({ sdId: uuid, ventureKey: 'X', baseUrl: 'http://fixture', journeySteps: STEPS, deps });

    expect(fromChain.eq).toHaveBeenCalledWith('id', uuid);
  });
});
