// SD-ARCH-HOTSPOT-SWEEP-001 (PRD FR-1 / FR-3): registry-level tests for
// lib/sweep/pass-registry.cjs — shape contract, per-pass try/catch isolation, and an
// enumeration of what each pass mutates (living audit; FR-3's original framing assumed
// the QA/strategic_directives_v2 mutation logic would be relocated into a formal
// {name, run(ctx)} registry pass file. It was not wired into MAIN_PASSES — instead the
// QA claim-safety block (steps 3b-3d + FIX #2) was hoisted verbatim into its own
// top-level function, runQaFixtureScan(), still defined in scripts/stale-session-sweep.cjs
// itself (same file, not lib/sweep/passes/), specifically so the existing
// stale-session-sweep-claim-safety.test.js / sweep-residuals.test.js /
// stale-sweep-qf211-claim-guards.test.js / stale-sweep-qf162-release-announce.test.js
// source-text pins (all four readFileSync the whole stale-session-sweep.cjs file and
// regex-match against its full text, not against main() specifically) stayed valid with
// zero migration — the pinned code moved within the file, never out of it. Same pattern
// applied to the tail-of-tick coordinator housekeeping block via
// runCoordinatorHousekeeping(). Neither function is a registry pass (no ordering/
// kill-switch need — both are order-insensitive, fail-open, already individually
// try/catch-isolated), so this audit table intentionally excludes them.

import { describe, it, expect, vi } from 'vitest';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));
const { EARLY_PASSES, MAIN_PASSES, runPasses } = require('../../../../lib/sweep/pass-registry.cjs');

describe('sweep pass-registry (SD-ARCH-HOTSPOT-SWEEP-001)', () => {
  it('every EARLY_PASSES and MAIN_PASSES entry has the {name, run} shape', () => {
    for (const pass of [...EARLY_PASSES, ...MAIN_PASSES]) {
      expect(typeof pass.name).toBe('string');
      expect(pass.name.length).toBeGreaterThan(0);
      expect(typeof pass.run).toBe('function');
    }
  });

  it('has at least 5 passes total across EARLY_PASSES + MAIN_PASSES (PRD FR-1 acceptance)', () => {
    expect(EARLY_PASSES.length + MAIN_PASSES.length).toBeGreaterThanOrEqual(5);
  });

  it('pass names are unique (no accidental duplicate registration)', () => {
    const names = [...EARLY_PASSES, ...MAIN_PASSES].map(p => p.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('MAIN_PASSES contains the 5 passes named in the PRD, in source-preserving order', () => {
    expect(MAIN_PASSES.map(p => p.name)).toEqual([
      'identity-collision-split',
      'claim-boundary-probe',
      'intent-collision-detection',
      'dead-letter-planning',
      'coordination-detectors',
    ]);
  });

  it('runPasses isolates a throwing pass — warnings.push, does not throw, does not abort remaining passes', async () => {
    const order = [];
    const passes = [
      { name: 'ok-1', run: async () => { order.push('ok-1'); } },
      { name: 'boom', run: async () => { order.push('boom'); throw new Error('simulated pass failure'); } },
      { name: 'ok-2', run: async () => { order.push('ok-2'); } },
    ];
    const warnings = [];
    await expect(runPasses(passes, { warnings })).resolves.toBeUndefined();
    expect(order).toEqual(['ok-1', 'boom', 'ok-2']); // all three ran despite the middle one throwing
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatch(/PASS_FAILED\(boom\): simulated pass failure/);
  });

  it('runPasses calls each pass exactly once with the same ctx object', async () => {
    const ctx = { warnings: [] };
    const runA = vi.fn(async () => {});
    const runB = vi.fn(async () => {});
    await runPasses([{ name: 'a', run: runA }, { name: 'b', run: runB }], ctx);
    expect(runA).toHaveBeenCalledTimes(1);
    expect(runA).toHaveBeenCalledWith(ctx);
    expect(runB).toHaveBeenCalledTimes(1);
    expect(runB).toHaveBeenCalledWith(ctx);
  });

  it('runPasses RETHROWS for critical passes — abort-on-throw parity with the pre-refactor main() (adversarial-review fix, PR #5755)', async () => {
    const order = [];
    const passes = [
      { name: 'ok-1', run: async () => { order.push('ok-1'); } },
      { name: 'crit-boom', critical: true, run: async () => { order.push('crit-boom'); throw new Error('split failed'); } },
      { name: 'never-runs', run: async () => { order.push('never-runs'); } },
    ];
    const warnings = [];
    await expect(runPasses(passes, { warnings })).rejects.toThrow('split failed');
    expect(order).toEqual(['ok-1', 'crit-boom']); // abort: the pass after the critical throw never ran
    expect(warnings).toHaveLength(0); // rethrow, not isolate — no PASS_FAILED warning
  });

  it('identity-collision-split is registered critical (unsplit sessions must abort the tick, not fail open)', () => {
    const pass = MAIN_PASSES.find(p => p.name === 'identity-collision-split');
    expect(pass.critical).toBe(true);
  });
});

// Living audit (FR-3 spirit): which Supabase tables does each extracted pass touch,
// and does it delegate to a still-existing original function (no duplicate logic) or
// contain physically relocated logic? Update this table when passes are added/changed.
describe('sweep pass-registry — mutation/delegation audit (documentation test)', () => {
  const AUDIT = {
    'clear-stale-qf-claims': { tables: ['quick_fixes', 'claude_sessions (read)'], delegatesTo: 'clearStaleQfClaims (stale-session-sweep.cjs, undeleted)' },
    'identity-collision-split': { tables: ['claude_sessions', 'session_coordination'], delegatesTo: 'splitCollidingSessions (stale-session-sweep.cjs, undeleted)' },
    'claim-boundary-probe': { tables: ['claude_sessions', 'session_coordination', 'strategic_directives_v2 (read)', 'sd_phase_handoffs (read)'], delegatesTo: 'runClaimBoundaryProbe (stale-session-sweep.cjs, undeleted)' },
    'intent-collision-detection': { tables: ['session_coordination (read)'], delegatesTo: 'loadRecentIntents + detectCrossSessionCollisions (stale-session-sweep.cjs, undeleted)' },
    'dead-letter-planning': { tables: ['session_coordination'], delegatesTo: 'planDeadLetters (stale-session-sweep.cjs, undeleted; pure)' },
    'coordination-detectors': { tables: ['claude_sessions (read)', 'session_coordination', 'coordination_events', 'worker_spawn_requests (read)'], delegatesTo: 'lib/coordinator/signal-router.cjs + coordination-events.cjs (unchanged)' },
  };

  it('every pass in EARLY_PASSES/MAIN_PASSES has an audit entry', () => {
    for (const pass of [...EARLY_PASSES, ...MAIN_PASSES]) {
      expect(AUDIT[pass.name], `no audit entry for pass "${pass.name}" — extend this test`).toBeDefined();
    }
  });

  it('none of the extracted MAIN_PASSES/EARLY_PASSES entries touch strategic_directives_v2 with the QA-fixture-scan pattern', () => {
    // The QA-fixture-scan block (workingOnCompleted/orphanedClaims/stuckApproval, the
    // TEST_FIXTURE_SD_KEY_LIKE-guarded mutations that stale-session-sweep-claim-safety.test.js
    // pins) WAS extracted in this SD — to runQaFixtureScan(), a plain top-level function in
    // scripts/stale-session-sweep.cjs, not a formal registry pass (see file header comment).
    // This assertion documents that the registry itself (EARLY_PASSES/MAIN_PASSES) still
    // excludes it — a future SD promoting runQaFixtureScan to a real {name, run(ctx)} pass
    // should update this AUDIT table when it does.
    for (const entry of Object.values(AUDIT)) {
      expect(entry.tables.some(t => t.startsWith('strategic_directives_v2') && !t.includes('read'))).toBe(false);
    }
  });
});

// PRD TS-4 (integration): clearStaleQfClaims (dispatched via EARLY_PASSES) must complete
// before dispatchWorkAssignmentsIfAllowed observes claim availability in the SAME tick —
// an ordering regression would surface as a claim staying falsely unavailable for one
// extra 5-minute cycle. main() is not independently invokable without a live Supabase
// client, so this is a source-order pin (same technique the 4 claim-safety pinning test
// files already use): the EARLY_PASSES registry call must textually precede the
// dispatchWorkAssignmentsIfAllowed call site in scripts/stale-session-sweep.cjs.
describe('sweep registry ordering (SD-ARCH-HOTSPOT-SWEEP-001 / PRD TS-4)', () => {
  it('EARLY_PASSES (clearStaleQfClaims) call site precedes dispatchWorkAssignmentsIfAllowed call site', () => {
    const fs = require('fs');
    const path = require('path');
    const sourcePath = path.resolve(__dirname, '../../../../scripts/stale-session-sweep.cjs');
    const source = fs.readFileSync(sourcePath, 'utf8');

    const earlyPassesIdx = source.indexOf('passRegistryModule.EARLY_PASSES');
    // Match the CALL site (`await dispatchWorkAssignmentsIfAllowed(supabase,`), not the
    // `async function dispatchWorkAssignmentsIfAllowed(...)` declaration, which sits much
    // earlier in the file (a helper defined before main()).
    const dispatchIdx = source.indexOf('await dispatchWorkAssignmentsIfAllowed(supabase,');

    expect(earlyPassesIdx).toBeGreaterThan(-1);
    expect(dispatchIdx).toBeGreaterThan(-1);
    expect(earlyPassesIdx).toBeLessThan(dispatchIdx);
  });
});

// Adversarial-review regression pins (PR #5755). The CRITICAL found there: the
// runQaFixtureScan() hoist moved five variable declarations out of main() while three
// main() sites still consumed them — a guaranteed ReferenceError on every tick that no
// unit test could catch (nothing executes main()). These pins hold the repaired contract:
// the hoisted function must RETURN the five locals, and main() must REBIND them at the
// call site. Source-text technique, same as the claim-safety pinning files.
describe('runQaFixtureScan scope contract (adversarial-review fix, PR #5755)', () => {
  const fs = require('fs');
  const path = require('path');
  const sourcePath = path.resolve(__dirname, '../../../../scripts/stale-session-sweep.cjs');
  const source = fs.readFileSync(sourcePath, 'utf8');
  const FIVE = ['sdStatusMap', 'workingOnCompleted', 'orphanedClaims', 'stuckApproval', 'terminalWithClaims'];

  it('runQaFixtureScan returns the five formerly-main()-scoped locals', () => {
    const re = new RegExp(`return\\s*\\{\\s*${FIVE.join('\\s*,\\s*')}\\s*\\}`);
    expect(source).toMatch(re);
  });

  it('main() rebinds all five at the runQaFixtureScan call site', () => {
    const re = new RegExp(`const\\s*\\{[^}]*${FIVE.join('[^}]*')}[^}]*\\}\\s*=\\s*\\n?\\s*await runQaFixtureScan\\(`);
    expect(source).toMatch(re);
  });

  it('claim-boundary-probe registry dispatch sits AFTER the HEADLESS_ZOMBIE release block (ordering parity with legacy mode)', () => {
    // Anchor on SWEEP_HEADLESS_ZOMBIE (the released_reason INSIDE the release loop), not the
    // filter line at the block's start — pins "after the whole block", not "after block start".
    const zombieIdx = source.indexOf("'SWEEP_HEADLESS_ZOMBIE'");
    const probeDispatchIdx = source.indexOf('runPasses([passRegistryModule.MAIN_PASSES[1]]');
    expect(zombieIdx).toBeGreaterThan(-1);
    expect(probeDispatchIdx).toBeGreaterThan(-1);
    expect(probeDispatchIdx).toBeGreaterThan(zombieIdx);
  });
});
