/**
 * SD-...-PROMPT-LIBRARY-001-D FR-3a — the prompt must resolve PER SLOT, not once per run.
 *
 * WHY THIS TEST EXISTS AND WHY THE ROSTER IS MIXED. reboot-respawn-runner used to resolve the
 * startup prompt outside the per-slot loop, behind a comment reading "resolve ONCE per run, not
 * per slot". That was correct when every slot got the same worker prompt and WRONG once the
 * prompt is keyed on the callsign namespace — no callsign is in scope at the hoist point.
 *
 * fleet_desired_slots currently holds exactly ONE row (Canary-pilot), so this runner is the only
 * path the fleet ever respawns. That makes the hoist the single highest-risk regression in the SD.
 *
 * CRITICALLY, A ONE-CANARY FIXTURE CANNOT CATCH IT: with a single slot, "resolve per slot" and a
 * wrong "resolve once from slots[0]" produce IDENTICAL output. The roster below is therefore
 * MIXED-NAMESPACE and asserted in BOTH orders, so a per-run resolution cannot pass by accident.
 */
import { describe, it, expect, vi } from 'vitest';
import { runRebootRespawn } from '../../../lib/fleet/reboot-respawn-runner.js';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { FLEET_WORKER_STARTUP_PROMPT } = require('../../../lib/coordinator/coordination-events.cjs');

/** Capture the startupPrompt each slot's invocation was built with. */
function harness(slots) {
  const seen = [];
  return {
    seen,
    opts: {
      loadFn: async () => slots,
      rosterFn: (s) => s.map((x) => x.name),
      buildInvocationFn: ({ callsign, startupPrompt }) => {
        seen.push({ callsign, startupPrompt });
        return { program: 'wt.exe', args: [], env: {}, sessionId: 'sid' };
      },
      // SD-LEO-INFRA-FLEET-CANNOT-SELF-001 FR-1: this file's subject is PROMPT resolution, not
      // profile resolution -- stubbed so a slot is never skipped for an unrelated reason (e.g. a
      // test env with no FLEET_ACCOUNT_PROFILES_DIR configured, which the real resolver would
      // now correctly treat as a resolve failure and skip the slot for).
      resolveProfileDirFn: () => 'C:\\fake\\profile',
      live: false,
      log: () => {},
      logFn: () => {},
    },
  };
}

// SD-LEO-INFRA-FLEET-CANNOT-SELF-001 FR-1: Charlie now carries an explicit account_profile
// ('host-default') -- an absent one is no longer a benign default here, it means SKIP (see
// reboot-respawn-skip-and-coordinator-dedup.test.js), which would starve this file's actual
// subject (per-slot PROMPT resolution) of a built invocation to inspect at all.
const MIXED = [
  { name: 'Canary-pilot', role: 'worker', account_profile: 'canary' },
  { name: 'Charlie', role: 'worker', account_profile: 'host-default' },
];

describe('FR-3a — per-slot prompt resolution in reboot-respawn-runner', () => {
  it('gives the WORKER slot the worker prompt and the CANARY slot NOT the worker prompt', async () => {
    const h = harness(MIXED);
    await runRebootRespawn(h.opts);

    const canary = h.seen.find((s) => s.callsign === 'Canary-pilot');
    const worker = h.seen.find((s) => s.callsign === 'Charlie');

    expect(worker.startupPrompt).toBe(FLEET_WORKER_STARTUP_PROMPT);
    // THE HAZARD THIS SD EXISTS TO PREVENT: a canary must never receive the claiming directive.
    expect(canary.startupPrompt).not.toBe(FLEET_WORKER_STARTUP_PROMPT);
    // FR-8 outstanding: no canary prompt exists yet, so the safe interim is NO prompt (ghost),
    // which is today's behaviour — never a fallthrough to the worker directive.
    expect(canary.startupPrompt).toBeNull();
  });

  it('holds with the roster order REVERSED — a per-run resolution would leak slots[0] to both', async () => {
    const h = harness([...MIXED].reverse());
    await runRebootRespawn(h.opts);

    const canary = h.seen.find((s) => s.callsign === 'Canary-pilot');
    const worker = h.seen.find((s) => s.callsign === 'Charlie');

    expect(worker.startupPrompt).toBe(FLEET_WORKER_STARTUP_PROMPT);
    expect(canary.startupPrompt).toBeNull();
    // The two slots must differ. A hoisted resolution makes them identical in BOTH orders, which
    // is precisely what a single-slot fixture cannot distinguish.
    expect(worker.startupPrompt).not.toBe(canary.startupPrompt);
  });

  it('an UNIDENTIFIABLE slot gets no prompt rather than defaulting to the worker directive', async () => {
    const h = harness([{ name: '', role: 'worker', account_profile: 'host-default' }]);
    await runRebootRespawn(h.opts);
    expect(h.seen[0].startupPrompt).toBeNull();
    expect(h.seen[0].startupPrompt).not.toBe(FLEET_WORKER_STARTUP_PROMPT);
  });

  it('PRESERVES the explicit-key opt-out: an explicit startupPrompt still overrides every slot', async () => {
    const h = harness(MIXED);
    await runRebootRespawn({ ...h.opts, startupPrompt: 'EXPLICIT' });
    expect(h.seen.map((s) => s.startupPrompt)).toEqual(['EXPLICIT', 'EXPLICIT']);
  });

  it('PRESERVES explicit null (deliberate respawn with no keepalive)', async () => {
    const h = harness(MIXED);
    await runRebootRespawn({ ...h.opts, startupPrompt: null });
    expect(h.seen.map((s) => s.startupPrompt)).toEqual([null, null]);
  });
});
