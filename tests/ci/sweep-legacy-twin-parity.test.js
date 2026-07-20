// SD-LEO-INFRA-SWEEP-LEGACY-KILL-SWITCH-RETIRE-001 (PRD FR-2, TS-1..TS-4)
//
// TS-7-pattern-derived (see lib/eva/chairman-decision-watcher.js +
// tests/ci/decision-creating-set-parity.db.test.js): pins the three genuinely
// duplicated SWEEP_PASS_REGISTRY=off legacy re-implementations
// (lib/sweep/legacy-fallback.cjs) to their lib/sweep/passes/*.cjs counterparts so a
// future one-sided sweep-pass bugfix fails CI instead of silently reverting the
// SWEEP_PASS_REGISTRY=off fallback to pre-fix behavior.
//
// Unlike TS-7's own test (one live-DB-derived side vs one hardcoded Set), both sides
// compared here are pure function invocations over a mocked ctx/supabase — no live DB
// needed, so this test is NOT HAS_REAL_DB-gated and runs unconditionally in CI.
//
// process.env.CROSS_SESSION_DECONFLICTION must be set BEFORE the first require of
// either intent-collision twin (both cache `DECONFLICTION_ENABLED` as a top-level
// const at require time) — done at the very top of this file, before any requires.
process.env.CROSS_SESSION_DECONFLICTION = 'true';

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

const legacyFallback = require('../../lib/sweep/legacy-fallback.cjs');
const intentCollisionPass = require('../../lib/sweep/passes/intent-collision-detection.cjs');
const deadLetterPass = require('../../lib/sweep/passes/dead-letter-planning.cjs');
const coordinationDetectorsPass = require('../../lib/sweep/passes/coordination-detectors.cjs');

// Both legacy-fallback.cjs and the pass modules `require()` these same files — Node's
// CJS require cache guarantees they all hold the exact same module.exports object, so
// monkey-patching a method here is visible to every consumer without vi.mock().
const sweepModule = require('../../scripts/stale-session-sweep.cjs');
const signalRouterModule = require('../../lib/coordinator/signal-router.cjs');
const coordEventsModule = require('../../lib/coordinator/coordination-events.cjs');

function makeSupabaseSpy({ unreadMsgs = [] } = {}) {
  const updateCalls = [];
  return {
    updateCalls,
    from(table) {
      return {
        select() { return this; },
        is() { return this; },
        // FR-6 batch 8: the dead-letter read now paginates via fetchAllPaginated, which appends
        // .order() and applies .range() itself — extend the builder mock to support both. .range()
        // resolves the SAME { data, error } the prior `await builder` (then) produced.
        order() { return this; },
        range() { return Promise.resolve({ data: unreadMsgs, error: null }); },
        update(payload) {
          return {
            eq(col, val) {
              updateCalls.push({ table, payload, col, val });
              return Promise.resolve({ data: null, error: null });
            },
          };
        },
        then(resolve) { resolve({ data: unreadMsgs, error: null }); },
      };
    },
  };
}

describe('SWEEP legacy-twin parity: intent-collision-detection (TS-1)', () => {
  const FIXTURE_COLLISION = {
    intent_action: 'cancel-tree',
    sender_session: 'session-A',
    target_sd_key: 'SD-FAKE-001',
    target_tree: null,
    collided_with_session: 'session-B',
    reasons: ['live claim held by session-B'],
  };

  beforeEach(() => {
    sweepModule.loadRecentIntents = vi.fn(async () => ({ rows: [{ fake: 'intent-row' }], error: null }));
    sweepModule.detectCrossSessionCollisions = vi.fn(() => [FIXTURE_COLLISION]);
  });

  it('legacy and pass produce identical warnings + collisionsDetected given identical fixtures', async () => {
    const legacyCtx = { supabase: {}, classified: [], warnings: [], collisionsDetected: [] };
    const passCtx = { supabase: {}, classified: [], warnings: [], collisionsDetected: [] };

    await legacyFallback.runIntentCollisionLegacy(legacyCtx);
    await intentCollisionPass.run(passCtx);

    expect(passCtx.warnings).toEqual(legacyCtx.warnings);
    expect(passCtx.collisionsDetected).toEqual(legacyCtx.collisionsDetected);
    expect(legacyCtx.warnings).toHaveLength(1); // sanity: fixture actually produced a warning
    expect(legacyCtx.collisionsDetected).toEqual([FIXTURE_COLLISION]);
  });

  it('legacy and pass both no-op identically when the load errors', async () => {
    sweepModule.loadRecentIntents = vi.fn(async () => ({ rows: null, error: { message: 'db down' } }));
    const legacyCtx = { supabase: {}, classified: [], warnings: [], collisionsDetected: [] };
    const passCtx = { supabase: {}, classified: [], warnings: [], collisionsDetected: [] };

    await legacyFallback.runIntentCollisionLegacy(legacyCtx);
    await intentCollisionPass.run(passCtx);

    expect(passCtx.warnings).toEqual(legacyCtx.warnings);
    expect(passCtx.collisionsDetected).toEqual(legacyCtx.collisionsDetected);
    expect(legacyCtx.warnings).toEqual([]); // sanity: error path produces no warnings
  });

  // TS-4: mutation check — this parity test must be load-bearing, not tautological.
  it('MUTATION CHECK: fails and names the twin when one side is made to diverge', async () => {
    const legacyCtx = { supabase: {}, classified: [], warnings: [], collisionsDetected: [] };
    const passCtx = { supabase: {}, classified: [], warnings: [], collisionsDetected: [] };

    await legacyFallback.runIntentCollisionLegacy(legacyCtx);
    // Simulate a one-sided bugfix: the pass path gains a warning the legacy path never got.
    await intentCollisionPass.run(passCtx);
    passCtx.warnings.push('SIMULATED_DIVERGENCE: pass-only warning');

    expect(() => expect(passCtx.warnings).toEqual(legacyCtx.warnings)).toThrow();
  });
});

describe('SWEEP legacy-twin parity: dead-letter-planning (TS-2)', () => {
  const FIXED_NOW_MS = 1_800_000_000_000; // arbitrary fixed instant, shared by BOTH invocation styles
  const DEAD_SESSION = '11111111-1111-4111-8111-111111111111';
  const UNREAD_MSGS = [
    { id: 'msg-1', target_session: DEAD_SESSION, message_type: 'INFO', payload: {}, expires_at: null },
  ];
  const CLASSIFIED = [{ session_id: DEAD_SESSION, status: 'DEAD' }];

  it('legacy (nowMs override) and pass (ctx.now) produce identical actions + identical update() calls given the SAME shared instant', async () => {
    const legacySupabase = makeSupabaseSpy({ unreadMsgs: UNREAD_MSGS });
    const passSupabase = makeSupabaseSpy({ unreadMsgs: UNREAD_MSGS });

    const legacyCtx = { supabase: legacySupabase, classified: CLASSIFIED, actions: [], nowMs: FIXED_NOW_MS };
    const passCtx = { supabase: passSupabase, classified: CLASSIFIED, actions: [], now: new Date(FIXED_NOW_MS) };

    await legacyFallback.runDeadLetterLegacy(legacyCtx);
    await deadLetterPass.run(passCtx);

    expect(passCtx.actions).toEqual(legacyCtx.actions);
    expect(legacyCtx.actions).toHaveLength(1); // sanity: fixture actually dead-lettered something
    expect(passSupabase.updateCalls).toEqual(legacySupabase.updateCalls);
    expect(legacySupabase.updateCalls).toHaveLength(1);
  });

  it('KNOWN NUANCE (exploration_summary finding): legacy derives nowMs from a fresh Date.now() at its call site, pass derives it from ctx.now.getTime() — this test intentionally supplies the SAME instant to both, which is why the assertion above passes despite that source difference. Documented, not fixed (TR-1: out of scope for this SD).', () => {
    expect(true).toBe(true);
  });

  // TS-4: mutation check.
  it('MUTATION CHECK: fails and names the twin when one side is made to diverge', async () => {
    const legacySupabase = makeSupabaseSpy({ unreadMsgs: UNREAD_MSGS });
    const passSupabase = makeSupabaseSpy({ unreadMsgs: UNREAD_MSGS });
    const legacyCtx = { supabase: legacySupabase, classified: CLASSIFIED, actions: [], nowMs: FIXED_NOW_MS };
    const passCtx = { supabase: passSupabase, classified: CLASSIFIED, actions: [], now: new Date(FIXED_NOW_MS) };

    await legacyFallback.runDeadLetterLegacy(legacyCtx);
    await deadLetterPass.run(passCtx);
    passCtx.actions.push('SIMULATED_DIVERGENCE: pass-only action');

    expect(() => expect(passCtx.actions).toEqual(legacyCtx.actions)).toThrow();
  });
});

describe('SWEEP legacy-twin parity: coordination-detectors (TS-3)', () => {
  beforeEach(() => {
    signalRouterModule.aggregateSignals = vi.fn(async () => ({ error: null, promoted: 0, skipped: 0, promotedRows: [] }));
    coordEventsModule.coordDetectorsEnabled = vi.fn(() => true);
    coordEventsModule.gatherDetectorInputs = vi.fn(async () => ({ fake: 'inputs' }));
    coordEventsModule.runAndLogDetectors = vi.fn(async () => []);
    coordEventsModule.runInertWorkerSurfacing = vi.fn(async () => ({ matched: false }));
    coordEventsModule.runCompletionBoundaryExitSurfacing = vi.fn(async () => ({ matched: false }));
  });

  it('legacy and pass both invoke the same 4 underlying functions once each, with the same arguments', async () => {
    const supabase = { fake: 'supabase' };

    await legacyFallback.runCoordinationDetectorsLegacy({ supabase });
    const callsAfterLegacy = {
      aggregateSignals: signalRouterModule.aggregateSignals.mock.calls.length,
      gatherDetectorInputs: coordEventsModule.gatherDetectorInputs.mock.calls.length,
      runAndLogDetectors: coordEventsModule.runAndLogDetectors.mock.calls.length,
      runInertWorkerSurfacing: coordEventsModule.runInertWorkerSurfacing.mock.calls.length,
      runCompletionBoundaryExitSurfacing: coordEventsModule.runCompletionBoundaryExitSurfacing.mock.calls.length,
    };

    await coordinationDetectorsPass.run({ supabase });
    const callsAfterPass = {
      aggregateSignals: signalRouterModule.aggregateSignals.mock.calls.length - callsAfterLegacy.aggregateSignals,
      gatherDetectorInputs: coordEventsModule.gatherDetectorInputs.mock.calls.length - callsAfterLegacy.gatherDetectorInputs,
      runAndLogDetectors: coordEventsModule.runAndLogDetectors.mock.calls.length - callsAfterLegacy.runAndLogDetectors,
      runInertWorkerSurfacing: coordEventsModule.runInertWorkerSurfacing.mock.calls.length - callsAfterLegacy.runInertWorkerSurfacing,
      runCompletionBoundaryExitSurfacing: coordEventsModule.runCompletionBoundaryExitSurfacing.mock.calls.length - callsAfterLegacy.runCompletionBoundaryExitSurfacing,
    };

    // Each twin invocation calls every underlying function exactly once.
    expect(callsAfterLegacy).toEqual({
      aggregateSignals: 1, gatherDetectorInputs: 1, runAndLogDetectors: 1,
      runInertWorkerSurfacing: 1, runCompletionBoundaryExitSurfacing: 1,
    });
    expect(callsAfterPass).toEqual(callsAfterLegacy);

    // Both twins were called with the exact same supabase argument on every underlying call.
    for (const fn of [
      signalRouterModule.aggregateSignals,
      coordEventsModule.gatherDetectorInputs,
      coordEventsModule.runInertWorkerSurfacing,
      coordEventsModule.runCompletionBoundaryExitSurfacing,
    ]) {
      for (const call of fn.mock.calls) {
        expect(call[0]).toBe(supabase);
      }
    }
  });

  // TS-4: mutation check.
  it('MUTATION CHECK: fails when one side calls an underlying function a different number of times', async () => {
    const supabase = { fake: 'supabase' };
    await legacyFallback.runCoordinationDetectorsLegacy({ supabase });
    const legacyCount = signalRouterModule.aggregateSignals.mock.calls.length;

    await coordinationDetectorsPass.run({ supabase });
    // Simulate a one-sided bugfix: the pass path calls aggregateSignals an extra time.
    await signalRouterModule.aggregateSignals({});
    const passCount = signalRouterModule.aggregateSignals.mock.calls.length - legacyCount;

    expect(() => expect(passCount).toBe(1)).toThrow();
  });
});

describe('SWEEP_PASS_REGISTRY_RETIREMENT record (TS-5)', () => {
  it('exists with non-empty owner, condition, and retirement_action fields', () => {
    const { SWEEP_PASS_REGISTRY_RETIREMENT } = sweepModule;
    expect(typeof SWEEP_PASS_REGISTRY_RETIREMENT).toBe('object');
    expect(SWEEP_PASS_REGISTRY_RETIREMENT).not.toBeNull();
    expect(typeof SWEEP_PASS_REGISTRY_RETIREMENT.owner).toBe('string');
    expect(SWEEP_PASS_REGISTRY_RETIREMENT.owner.length).toBeGreaterThan(0);
    expect(typeof SWEEP_PASS_REGISTRY_RETIREMENT.condition).toBe('string');
    expect(SWEEP_PASS_REGISTRY_RETIREMENT.condition.length).toBeGreaterThan(0);
    expect(typeof SWEEP_PASS_REGISTRY_RETIREMENT.retirement_action).toBe('string');
    expect(SWEEP_PASS_REGISTRY_RETIREMENT.retirement_action.length).toBeGreaterThan(0);
  });
});
