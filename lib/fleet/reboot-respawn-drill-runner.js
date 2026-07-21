/**
 * @wire-check-exempt: MECHANISM-READY, NOT LIVE-EXECUTED (see notice below) — the load-bearing proof
 * is a LIVE reboot-respawn drill deferred to Solomon on Child B's canary account, so there is no real
 * live invocation site to wire this into today. Mirrors u4-drill-runner.js's exemption reasoning.
 *
 * Reboot-respawn LIVE-DRILL runner — SD-LEO-INFRA-LEO-COMPLETION-001-D (FR-7).
 *
 * Models u4-drill-runner.js: PASS/FAIL observable checks against the REAL runner
 * (lib/fleet/reboot-respawn-runner.js runRebootRespawn) via injectable seams, returning
 * {pass, checks:[{name,pass,detail}]}. The checks assert the four properties reboot-respawn must have:
 *   1. manifest_loaded          — the desired manifest was read (>=1 slot)
 *   2. roster_built             — slotsToRoster produced a supervisor-shaped roster for every slot
 *   3. per_slot_resume_relaunch — each slot's relaunch invocation carries `--resume <its uuid>`
 *                                 (and a slot WITHOUT a resume_uuid stays on the back-compat no-resume
 *                                 path — never a spurious --resume)
 *   4. respawn_events_present   — a fleet_verb_respawn event exists per slot in coordination_events
 *
 * ⚠️ ANTI-TEST-MASKING (Solomon R1 verdict 0e9e466e: no_unit_mock=true, trim_forbidden=true): a
 * mocked-seam UNIT test does NOT satisfy this SD's acceptance. The LOAD-BEARING proof is an in-session
 * NON-mocked simulated-reboot drill (kill live sessions → run the REAL runner against REAL supabase →
 * observe REAL relaunch attempts + a REAL persisted coordination_events record) and, ultimately, a FULL
 * canary live-execution on a real host reboot — DEFERRED to Solomon on Child B's canary account and
 * captured as a completion-flag follow-up. This drill runner is the mechanism for BOTH: injected stubs
 * make its checks deterministic under unit test, but the SAME checks run against the real seams in the
 * live drill (see docs/protocol/fleet-reboot-respawn-drill.md). Do NOT claim a live pass anywhere until
 * runRebootRespawnDrill has actually run against real killed sessions + real supabase.
 */
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { runRebootRespawn } from './reboot-respawn-runner.js';
import { loadDesiredSlots, slotsToRoster } from './desired-slots-store.js';

/**
 * Run the reboot-respawn drill. Wires the REAL runRebootRespawn with the supplied seams so the checks
 * observe the runner's genuine output (invocation argv, emitted events) — never a stand-in for the
 * assertion.
 * @param {object}   args
 * @param {object}   [args.supabase]      - real service client (live drill) or a fake (unit)
 * @param {Function} [args.loadFn]        - async (supabase)=>slots ; defaults to loadDesiredSlots
 * @param {Function} [args.rosterFn]      - (slots)=>roster ; defaults to slotsToRoster
 * @param {Function} [args.spawnFn]       - (program,args,env)=>child ; only invoked when live
 * @param {Function} [args.logFn]         - async (supabase,event)=>result ; the runner's event writer
 * @param {Function} [args.queryEventsFn] - async ()=>Array<{event_type}> ; reads back coordination_events
 * @param {boolean}  [args.live]          - respawn live flag (default false = dry-run mechanism check)
 * @param {Function} [args.now]           - ()=>iso clock
 * @param {object}   [args.opts]          - passthrough to runRebootRespawn (e.g. resolveProfileDir baseDir)
 * @returns {Promise<{pass:boolean, checks:Array<{name:string, pass:boolean, detail:string}>}>}
 */
export async function runRebootRespawnDrill({ supabase, loadFn, rosterFn, spawnFn, logFn, queryEventsFn, buildInvocationFn, live = false, now, opts = {} } = {}) {
  const checks = [];
  const load = loadFn || loadDesiredSlots;
  const roster = rosterFn || slotsToRoster;

  // Check 1: manifest loaded.
  const slots = await load(supabase);
  checks.push({
    name: 'manifest_loaded',
    pass: Array.isArray(slots) && slots.length > 0,
    detail: Array.isArray(slots) && slots.length > 0
      ? `desired manifest loaded: ${slots.length} slot(s)`
      : 'desired manifest EMPTY (table unapplied or no seeded slots) — nothing to respawn',
  });

  // Check 2: roster built (one supervisor-shaped entry per named slot).
  const builtRoster = roster(slots);
  const namedSlots = (slots || []).filter((s) => s && s.name);
  checks.push({
    name: 'roster_built',
    pass: Array.isArray(builtRoster) && builtRoster.length === namedSlots.length && builtRoster.every((r) => r.callsign && r.role),
    detail: `roster entries: ${builtRoster.length} for ${namedSlots.length} named slot(s)`,
  });

  // Drive the REAL runner with the injected seams (feeding it the slots/roster we already loaded so
  // check 1/2 and the run see the same manifest). This is the genuine behavior under test.
  const runResult = await runRebootRespawn({
    supabase,
    loadFn: async () => slots,
    rosterFn: () => builtRoster,
    buildInvocationFn,
    spawnFn,
    logFn,
    live,
    now,
    ...opts,
  });

  // Check 3: per-slot --resume relaunch attempted for every slot; the resume token appears in the argv
  // for slots that HAVE one, and is absent for slots that do not (back-compat, never spurious).
  const relaunchAttempted = runResult.results.length === slots.length;
  const perSlotResumeOk = runResult.results.every((r, i) => {
    const argv = (r.invocation && r.invocation.args) || [];
    const uuid = slots[i] && slots[i].resume_uuid;
    if (uuid) return argv.includes('--resume') && argv.includes(uuid);
    return !argv.includes('--resume');
  });
  checks.push({
    name: 'per_slot_resume_relaunch',
    pass: relaunchAttempted && perSlotResumeOk,
    detail: relaunchAttempted && perSlotResumeOk
      ? `all ${runResult.results.length} slot(s) relaunched with the correct --resume token`
      : `relaunch/resume mismatch (attempted ${runResult.results.length}/${slots.length})`,
  });

  // Check 4: a fleet_verb_respawn event exists per slot (log-before/at-action, spec parity with U4).
  let events = [];
  if (typeof queryEventsFn === 'function') {
    try { events = await queryEventsFn(); } catch { events = []; }
  }
  const respawnEvents = (events || []).filter((e) => e && e.event_type === 'fleet_verb_respawn').length;
  checks.push({
    name: 'respawn_events_present',
    pass: typeof queryEventsFn === 'function' ? respawnEvents >= slots.length : false,
    detail: typeof queryEventsFn === 'function'
      ? `fleet_verb_respawn events found: ${respawnEvents} (need >= ${slots.length})`
      : 'no queryEventsFn supplied — cannot assert persisted respawn events (live drill MUST supply one)',
  });

  return { pass: checks.every((c) => c.pass), checks };
}

/**
 * No-false-live-claim guardrail (mirrors u4-drill-runner.printLiveExecutionPrecondition). States the
 * runner is mechanism-ready, NOT live-executed, and names the exact operator gate + the Solomon-deferred
 * canary leg.
 */
export function printLiveExecutionPrecondition() {
  return [
    'Reboot-respawn drill runner is MECHANISM-READY, NOT live-executed against a real reboot.',
    'The load-bearing proof (Solomon R1 verdict 0e9e466e: no_unit_mock=true, trim_forbidden=true) is a',
    'LIVE reboot-respawn drill — a mocked-seam unit test does NOT satisfy acceptance.',
    'In-session NON-mocked simulated-reboot drill (deliverable now) requires:',
    '  1. A seeded desired manifest (fleet_desired_slots rows, or a fixture) with per-slot resume_uuid.',
    '  2. FLEET_SPAWN_CONTROL_LIVE=true after host-validating the wt.exe invocation on this host',
    '     (docs/protocol/fleet-reboot-respawn-drill.md).',
    '  3. Real killed live sessions to observe relaunch ATTEMPTS + a persisted coordination_events',
    '     fleet_verb_respawn record (queryEventsFn over the real table).',
    'FULL canary live-execution (a real host reboot) is DEFERRED to Solomon on Child B\'s canary account',
    'and captured as a completion-flag follow-up — mirroring u4-drill-runner.js\'s',
    'MECHANISM-READY-NOT-LIVE-EXECUTED state. Do NOT claim a live pass until this has run for real.',
  ].join('\n');
}

const invokedDirectly = (() => {
  try {
    return process.argv[1] && realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1]);
  } catch {
    return false;
  }
})();

if (invokedDirectly) {
  console.log(printLiveExecutionPrecondition());
}
