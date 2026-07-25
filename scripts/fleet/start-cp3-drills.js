#!/usr/bin/env node
/**
 * start-cp3-drills.js — SD-LEO-INFRA-LEO-APP-LAUNCHER-001 (FR-4).
 *
 * Programmatic, WORKER-STARTABLE entrypoint for the checkpoint-3 S4-S6 activation drills — no keypress
 * / chairman hand required each time. This closes the "not programmatically startable" root cause of the
 * 2-day CP3 stall: the u4 drill was `@wire-check-exempt` (never wired to a live caller) and starting the
 * legs needed a human. Any session this ultimately spawns routes through the canonical buildSessionLaunch
 * (via the drill runners' spawn seams), so it satisfies the launch contract.
 *
 * SAFETY: --dry-run is the DEFAULT — it lists the legs + verifies the canary precondition and spawns/kills
 * NOTHING. --live delegates to the drill runners, which self-gate behind FLEET_SPAWN_CONTROL_LIVE +
 * FLEET_CANARY_KILL_ENABLED; the real live kill/reboot is CP3's acceptance step (Golf), now invokable
 * programmatically instead of by hand.
 */
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolveProfileDir, resolveRepoRoot } from '../../lib/fleet/build-session-launch.cjs';

// The three checkpoint-3 legs (Solomon guards), each producing a REAL fleet_verb_* row when run live.
export const LEGS = [
  { id: 'G1a', name: 'kill-supervisor', verb: 'fleet_verb_restart', runner: 'fleet-supervisor.cjs (SIGKILL supervisor -> tick re-spawn)' },
  { id: 'G1b+G2', name: 'reboot-respawn', verb: 'fleet_verb_respawn', runner: 'reboot-respawn-drill-runner.js' },
  { id: 'G3+U4', name: 'relaunch-under-profile (cookie non-leak)', verb: 'fleet_verb_relaunch_under_profile', runner: 'u4-drill-runner.js' },
];

/**
 * Plan the S4-S6 drill legs. FAIL-LOUD: throws (LaunchResolveError) if the canary profile/cwd cannot
 * resolve — the drills are meaningless and unsafe without a resolvable, DISTINCT canary CLAUDE_CONFIG_DIR
 * (the s1_s3 precondition). Never a silent default.
 * @param {{canaryProfile?:string, cwd?:string, live?:boolean}} spec
 * @param {{env?:object, resolveProfileDir?:Function, resolveRepoRoot?:Function}} [deps]
 * @returns {{live:boolean, cwd:string, canaryProfileDir:string, legs:Array}}
 */
export function planDrills({ canaryProfile = 'canary', cwd, live = false } = {}, deps = {}) {
  const env = deps.env || process.env;
  const resolveProfile = deps.resolveProfileDir || resolveProfileDir;
  const repoRoot = deps.resolveRepoRoot || resolveRepoRoot;
  const canaryProfileDir = resolveProfile(canaryProfile, { env }); // fail-loud precondition
  const startDir = (cwd && String(cwd).trim()) ? String(cwd) : repoRoot(env);
  return { live: !!live, cwd: startDir, canaryProfile, canaryProfileDir, legs: LEGS.map((l) => ({ ...l })) };
}

/** Run the starter. Returns a result object; never runs live kill/reboot itself (delegates + self-gates). */
export async function main(argv = process.argv.slice(2), deps = {}) {
  const live = argv.includes('--live');
  const log = deps.log || ((m) => console.log(m));
  let plan;
  try {
    plan = planDrills({ live }, deps);
  } catch (e) {
    log(`[start-cp3-drills] PRECONDITION FAILED (fail-loud): ${e && e.message}`);
    return { ok: false, error: (e && e.message) || String(e) };
  }
  log(`[start-cp3-drills] ${live ? 'LIVE' : 'DRY-RUN'} — canary profile dir=${plan.canaryProfileDir}; cwd=${plan.cwd}`);
  for (const leg of plan.legs) log(`  leg ${leg.id} ${leg.name} -> ${leg.verb} (${leg.runner})`);
  if (!live) {
    log('[start-cp3-drills] DRY-RUN: no live spawn/kill. Re-run with --live (behind FLEET_SPAWN_CONTROL_LIVE + FLEET_CANARY_KILL_ENABLED) to produce real fleet_verb_* rows.');
    return { ok: true, live: false, legs: plan.legs };
  }
  // LIVE: delegate to the drill runners (which route launches through buildSessionLaunch and self-gate on
  // the live env flags). Injectable for tests so the unit path never spawns.
  // QF-20260724-119: fail-loud (not silent) when --live is invoked under a test runner with no injected
  // runDrills override -- this exact gap caused 12-13 real fleet-worker process spawns on the chairman's
  // machine during CP3 drill-fix testing (correlation_id=cp3-do-it-right-20260724): a non-mocked test
  // called main(['--live'], {...}) with no override, and the worktree's FLEET_SPAWN_CONTROL_LIVE=true let
  // defaultRunDrills() spawn/kill for real.
  if (!deps.runDrills && (process.env.VITEST || process.env.NODE_ENV === 'test')) {
    const msg = '[start-cp3-drills] REFUSED: --live under a test runner (VITEST/NODE_ENV=test) with no injected deps.runDrills would fall through to the REAL defaultRunDrills() and risk live process spawns. Inject deps.runDrills.';
    log(msg);
    return { ok: false, error: msg };
  }
  const run = deps.runDrills || defaultRunDrills;
  const results = await run(plan, deps);
  return { ok: true, live: true, legs: plan.legs, results };
}

/**
 * QF-20260724-923: WIRE the live path so `--live` writes THREE real fleet_verb_* rows (was a stub that
 * passed supabase=null + gave runU4Drill only {opts:{}} -> zero evidence). Every dependency is
 * injectable so this is unit-testable with ZERO live spawn/kill; the canary-guard gating
 * (assertCanaryTarget + FLEET_CANARY_KILL_ENABLED) still fail-closes a real run against a non-canary.
 */
export async function defaultRunDrills(plan, deps = {}) {
  const load = async (p, name, injected) => injected || (await import(p))[name];
  const runRebootRespawnDrill = await load('../../lib/fleet/reboot-respawn-drill-runner.js', 'runRebootRespawnDrill', deps.runRebootRespawnDrill);
  const runU4Drill = await load('../../lib/fleet/u4-drill-runner.js', 'runU4Drill', deps.runU4Drill);
  const cg = deps.canaryGuard || await import('../../lib/fleet/canary-guard.js');
  const resolveCanary = deps.resolveCanaryTarget || cg.resolveCanaryTarget;
  const canaryRestart = deps.canaryRestart || cg.canaryRestart;
  const canaryRelaunchUnderProfile = deps.canaryRelaunchUnderProfile || cg.canaryRelaunchUnderProfile;

  // (1) real SERVICE client so the drills can loadDesiredSlots + WRITE fleet_verb_* rows (was null).
  const supabase = deps.supabase || (await import('../../lib/supabase-client.cjs')).createSupabaseServiceClient();

  // Resolve the live canary session (canary-guard fail-closes if none / not a real canary).
  const target = await resolveCanary(supabase, { by: 'account_profile', value: 'canary' });
  const sessionId = target && (target.session_id || target.id);
  const fromProfile = process.env.FLEET_LIVE_PROFILE || 'live';
  const toProfile = plan?.canaryProfile || 'canary';
  const queryEventsFn = deps.queryEventsFn || (async (sid) => {
    const { data } = await supabase.from('coordination_events').select('event_type,payload,session_id')
      .eq('session_id', sid).like('event_type', 'fleet_verb_%');
    return data || [];
  });
  // QF-20260725-139: SCOPE THE AUDIT POPULATION TO *THIS* RUN.
  //
  // Both reboot queries below read a TRAILING-50 window, i.e. recent history, not this invocation.
  // respawn_bind_audited (reboot-respawn-drill-runner.js) passes iff auditedCount === boundSessionIds
  // .length, and that window held 4 historical bound respawns from 2026-07-25T00:16-00:17Z against 0
  // all-time RESPAWN_BIND_VERIFIED rows -- so the check evaluated 0 === 4, and a FLAWLESS run would
  // have made it 1 === 5. Still red. It was not a threshold a good run could clear; it was
  // arithmetically closed, and no drill outcome could pass while those rows stayed in the population.
  //
  // A predetermined red is worse than a plain bug: arriving in a chairman-watched acceptance run it
  // reads as "the bind leg failed" and sends someone hunting a defect that does not exist.
  //
  // WHY TIME AND NOT sd_key: the run-correlator stamped by QF-20260724-335 defaults to 'CHECKPOINT-3',
  // which is exactly what those 4 historical rows already carry -- filtering on it excludes NOTHING.
  // (Recorded because it was tried.) Drill-start time IS the discriminator that separates them; a
  // run-unique id in the payload would be stronger, but none is emitted today.
  //
  // THIS SCOPES THE POPULATION, IT DOES NOT WEAKEN THE CHECK -- the assertion is untouched, and it must
  // still be able to fail: one bind + its audit row gives 1 === 1 and PASSES; a run whose bind emitter
  // fails gives 0 === 1 and goes RED, and that red is now informative because it reflects THIS run.
  const runStartedAt = deps.runStartedAt || new Date().toISOString();
  // QF-20260724-113 (FR-b): reboot-respawn's respawn_events_present check takes a NO-ARG
  // queryEventsFn (unlike U4's session-scoped one, since reboot-respawn creates one replacement
  // session PER slot, not a single target) -- without this the live CLI path always failed
  // respawn_events_present ("no queryEventsFn supplied") even on a genuinely successful respawn.
  const rebootQueryEventsFn = deps.rebootQueryEventsFn || (async () => {
    const { data } = await supabase.from('coordination_events').select('event_type,payload,session_id')
      .eq('event_type', 'fleet_verb_respawn').gte('created_at', runStartedAt)
      .order('created_at', { ascending: false }).limit(50);
    return data || [];
  });
  // QF-20260724-070: wire the durable-bind-audit query so the live drill's respawn_bind_audited check
  // (a real heartbeat proof recorded AT BIND TIME, surviving the session later ghosting) has real
  // evidence to read -- without this the check would fail-closed on every genuine live bind.
  // QF-20260725-139: scoped to this run for the SAME reason -- an audit row from an earlier run must
  // never be able to satisfy a bind performed by this one.
  const rebootQueryLifecycleEventsFn = deps.rebootQueryLifecycleEventsFn || (async () => {
    const { data } = await supabase.from('session_lifecycle_events').select('event_type,session_id')
      .eq('event_type', 'RESPAWN_BIND_VERIFIED').gte('created_at', runStartedAt)
      .order('created_at', { ascending: false }).limit(50);
    return data || [];
  });

  // QF-20260724-335: an explicit, intentional run-correlator stamped on all 3 leg fleet_verb events
  // of this single --live invocation. Timing/session-proximity correlation is insufficient (a stray
  // dry-run/accidental-spawn batch can collide with a real run) -- Solomon's S7 acceptance requires a
  // unique intentional binding of the 3 legs to one CP3 run.
  const sdKey = deps.sdKey || 'CHECKPOINT-3';

  // QF-20260724-499: defaultRunDrills only ever runs after main()'s `if (!live) return` gate, so
  // live is ALREADY known true here -- pass it explicitly on every leg (as reboot already did)
  // instead of letting restart/relaunch fall through to spawn-control.js's isLiveEnabled() (an
  // independent FLEET_SPAWN_CONTROL_LIVE env read that silently no-ops to dry-run when unset in
  // THIS process, even though this --live invocation is genuine). Without this, restart+relaunch
  // spawnReplacement() never gets live:true and unconditionally emits replacement_not_live.
  // G1a kill-supervisor -> fleet_verb_restart (canary-guarded).
  const g1a = await Promise.resolve(canaryRestart(target, { supabase, sdKey, live: true })).catch((e) => ({ error: e && e.message }));
  // (3) G1b+G2 reboot-respawn -> fleet_verb_respawn (now with a real client, not null).
  const reboot = await runRebootRespawnDrill({ supabase, live: true, queryEventsFn: rebootQueryEventsFn, queryLifecycleEventsFn: rebootQueryLifecycleEventsFn, opts: { sdKey } }).catch((e) => ({ error: e && e.message }));
  // (2) G3+U4 relaunch-under-profile -> fleet_verb_relaunch_under_profile (required args wired, was {opts:{}}).
  const u4 = await runU4Drill({
    target, fromProfile, toProfile, sessionId,
    relaunchFn: canaryRelaunchUnderProfile, resolveFn: resolveProfileDir, queryEventsFn, opts: { supabase, sdKey, live: true },
  }).catch((e) => ({ error: e && e.message }));

  return { g1a, reboot, u4 };
}

const isMain = process.argv[1] && realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1]);
if (isMain) {
  main().then((r) => process.exit(r.ok ? 0 : 1)).catch((e) => { console.error('[start-cp3-drills] FATAL', e && e.message); process.exit(1); });
}
