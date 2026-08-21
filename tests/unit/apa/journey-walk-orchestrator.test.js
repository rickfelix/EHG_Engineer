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

  return { deps, teardown, supabaseUpdate, supabaseSingle, sdMetadata };
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
    expect(deps.recordResult).toHaveBeenCalledTimes(2);
    expect(deps.recordResult).toHaveBeenNthCalledWith(1, 'run-1', expect.objectContaining({ id: 'stp-1' }), 'PASS', expect.objectContaining({ errorMessage: undefined }));
    expect(deps.recordResult).toHaveBeenNthCalledWith(2, 'run-1', expect.objectContaining({ id: 'stp-2' }), 'FAIL', expect.objectContaining({ errorMessage: 'no verified UI mapping' }));
    expect(deps.completeSession).toHaveBeenCalledWith('run-1');
    expect(teardown).toHaveBeenCalledTimes(1);

    expect(result.status).toBe('fail'); // completedAllSteps: false
    expect(result.testRunId).toBe('run-1');
    expect(result.passRate).toBe(50);
    expect(result.brokenAtStep).toBe('stp-2');
    expect(result.preflightResults).toEqual([{ name: 'land', success: true, url: 'http://fixture', renderedStateSummary: 'preflight ok' }]);
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

    await expect(runVentureJourneyWalk({ sdId: 'sd-1', ventureKey: 'X', baseUrl: 'http://fixture', journeySteps: STEPS, deps }))
      .rejects.toThrow('unexpected walk crash');
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
});
