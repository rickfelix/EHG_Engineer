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
 * QF-20260724-923 (fix-of-the-fix, correlation_id=cp3-do-it-right-20260724, chairman-approved
 * 2026-07-24): the prior version wired the CALL SITES but not the DATA CONTRACTS between them, so
 * `--live` still wrote zero-to-one real fleet_verb_* rows. Three defects closed here:
 *
 *   (bug1) reboot-respawn never received a real spawnFn -- SECURITY FENCE FIRST: the reboot leg
 *          reads ALL enabled fleet_desired_slots, so a real spawner is only ever wired AFTER filtering
 *          to canary-profile slots (canaryOnlyLoadFn below). A live spawn from this drill entrypoint
 *          can therefore never target a non-canary (production) worker, regardless of what's seeded.
 *   (bug2) canaryRestart/canaryRelaunchUnderProfile were called with `{ supabase }`, but
 *          canary-guard.js's guardedVerb reads `opts.supabaseClient` -- the mismatched key made
 *          resolveCanaryTarget always fail closed (silently, before this fix added visibility).
 *          Also: the resolved `target` IDENTITY OBJECT was passed where guardedVerb expects a
 *          callsign STRING (resolveSessionIdentity does `j[by] === value`, an object never matches).
 *   (bug3) See the DB-side fix: the seeded fleet_desired_slots.name must be `Canary-`-prefixed
 *          (capital C) to satisfy canary-guard.js's isCanaryCallsign defense-in-depth check -- not
 *          fixed in code, tracked as a data migration alongside this change.
 *
 * Every dependency remains injectable so this is unit-testable with ZERO live spawn/kill; the
 * canary-guard gating (assertCanaryTarget + FLEET_CANARY_KILL_ENABLED) still fail-closes a real run
 * against a non-canary, and the reboot leg's slot-filter fail-closes independently of the guard.
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

  // Resolve the live canary session (canary-guard fail-closes if none / not a real canary). `target`
  // here is the RESOLVED IDENTITY OBJECT ({resolved, identity:{session_id,callsign,...}} shape) --
  // extract the callsign STRING for every downstream call that needs a target key (bug2: passing the
  // whole object where guardedVerb's by:'callsign' resolution expects a string always fails not_found).
  const target = await resolveCanary(supabase, { by: 'account_profile', value: 'canary' });
  const targetCallsign = (target && target.resolved && target.identity && target.identity.callsign) || null;
  // NOTE: reassigned after G1a below (its restart always replaces the session behind this callsign,
  // so the pre-G1a session_id snapshot goes stale before G3/U4 needs it for its own event query).
  let sessionId = (target && target.resolved && target.identity && target.identity.session_id) || null;
  const fromProfile = process.env.FLEET_LIVE_PROFILE || 'live';
  const toProfile = plan?.canaryProfile || 'canary';
  const queryEventsFn = deps.queryEventsFn || (async (sid) => {
    const { data } = await supabase.from('coordination_events').select('event_type,payload,session_id')
      .eq('session_id', sid).like('event_type', 'fleet_verb_%');
    return data || [];
  });
  // QF-20260724-113 (FR-b): reboot-respawn's respawn_events_present check takes a NO-ARG
  // queryEventsFn (unlike U4's session-scoped one, since reboot-respawn creates one replacement
  // session PER slot, not a single target) -- without this the live CLI path always failed
  // respawn_events_present ("no queryEventsFn supplied") even on a genuinely successful respawn.
  const rebootQueryEventsFn = deps.rebootQueryEventsFn || (async () => {
    const { data } = await supabase.from('coordination_events').select('event_type,payload,session_id')
      .eq('event_type', 'fleet_verb_respawn').order('created_at', { ascending: false }).limit(50);
    return data || [];
  });

  // TEST-ISOLATION HARDENING (cp3-do-it-right-20260724 incident post-mortem, coordinator-approved
  // plan): the OS-spawn injection seam must cover ALL THREE legs, not just the reboot leg -- relying
  // on FLEET_SPAWN_CONTROL_LIVE=false alone left G1a/G3-U4 with no independent stub, so a stale/leaked
  // env value was the ONLY thing standing between a test run and a real process spawn. spawn-control.js's
  // spawn() already has its own correct real-spawn default (3-arg: program,args,env, cwd closed over
  // internally) -- we deliberately do NOT supply our own default here (that would require a 4th `cwd`
  // arg, mismatching spawn-control.js's contract); only pass an override through when a caller injects
  // one (deps.spawnFn), leaving spawn-control.js's own default to engage in production.
  const injectedSpawnFn = deps.spawnFn;

  // QF-20260724-335 (parallel fleet fix, reconciled here): an explicit, intentional run-correlator
  // stamped on all 3 leg fleet_verb events of this single --live invocation -- timing/session-proximity
  // alone is insufficient (a stray dry-run/accidental-spawn batch can collide with a real run); Solomon's
  // S7 acceptance requires a unique intentional binding of the 3 legs to one CP3 run.
  const sdKey = deps.sdKey || 'CHECKPOINT-3';

  // G1a kill-supervisor -> fleet_verb_restart (canary-guarded). Requires an EXISTING live canary
  // session to target -- reports the gap explicitly (never silently swallowed) when none exists yet.
  const g1a = targetCallsign
    ? await Promise.resolve(canaryRestart(targetCallsign, { supabaseClient: supabase, spawnFn: injectedSpawnFn, sdKey })).catch((e) => ({ error: e && e.message }))
    : { ok: false, reason: 'no_live_canary_session' };

  // SELF-STAMP RECONCILED (cp3-do-it-right-20260724 + parallel QF-20260724-295): canary-guard.js's
  // canaryRestart now self-stamps the fresh respawn itself (PID-keyed, more robust than this file's
  // earlier timestamp-window poll, which is removed) -- the ONE thing still needed here is refreshing
  // `sessionId` for U4's own event_log_presence query, since QF-20260724-739 now threads the bound
  // session_id straight through spawn()'s return value (spawnResult.session_id), no extra lookup needed.
  if (g1a && g1a.ok && g1a.spawnResult && g1a.spawnResult.session_id) {
    sessionId = g1a.spawnResult.session_id;
  }

  // (3) G1b+G2 reboot-respawn -> fleet_verb_respawn (real client, not null). SECURITY FENCE (bug1):
  // filter to canary-profile desired slots BEFORE a real spawner is ever wired -- this is the ONLY
  // thing that makes it safe to default a real child_process.spawn here (mirrors the already-live-
  // proven wiring in scripts/fleet/reboot-respawn.cjs, scoped to canary-only for this entrypoint).
  const canaryOnlyLoadFn = deps.loadFn || (async (sb) => {
    const { loadDesiredSlots } = await import('../../lib/fleet/desired-slots-store.js');
    const slots = await loadDesiredSlots(sb);
    return slots.filter((s) => s && s.account_profile === 'canary');
  });
  const canarySpawnFn = deps.spawnFn || (await (async () => {
    const { spawn: spawnProcess } = await import('node:child_process');
    return (program, args, env, cwd) => {
      const child = spawnProcess(program, args, { detached: true, stdio: 'ignore', cwd, env: { ...process.env, ...env } });
      child.unref();
      return child;
    };
  })());
  // QF-20260724-113 (FR-b): use the properly-defaulted rebootQueryEventsFn (falls back to a real
  // DB query when no deps override is injected) instead of the raw, undefined-in-production
  // deps.rebootQueryEventsFn -- closes the "respawn_events_present always fails on a genuine live
  // run" gap even when the underlying respawn succeeded.
  const reboot = await runRebootRespawnDrill({
    supabase, live: true, loadFn: canaryOnlyLoadFn, spawnFn: canarySpawnFn, queryEventsFn: rebootQueryEventsFn, opts: { sdKey },
  }).catch((e) => ({ error: e && e.message }));

  // (2) G3+U4 relaunch-under-profile -> fleet_verb_relaunch_under_profile (bug2 fix: supabaseClient
  // key + callsign string). Same explicit no-target reporting as G1a. canaryRelaunchUnderProfile
  // self-stamps its own fresh respawn the same way canaryRestart does -- no extra step needed here.
  const u4 = targetCallsign
    ? await runU4Drill({
        target: targetCallsign, fromProfile, toProfile, sessionId,
        relaunchFn: canaryRelaunchUnderProfile, resolveFn: resolveProfileDir, queryEventsFn,
        opts: { supabaseClient: supabase, spawnFn: injectedSpawnFn, sdKey },
      }).catch((e) => ({ error: e && e.message }))
    : { pass: false, checks: [{ name: 'target_resolution', pass: false, detail: 'no live canary session to target (account_profile=canary)' }] };

  return { g1a, reboot, u4 };
}

/**
 * Observability fix (cp3-do-it-right-20260724): root-causing the QF-923 gap required reading source
 * instead of stdout, because the CLI wrapper never printed the returned per-leg results/errors before
 * exiting. Print a compact leg-by-leg summary here so a future silent failure is visible from the CLI
 * alone.
 */
function printResultsSummary(results) {
  if (!results) return;
  console.log('[start-cp3-drills] leg results:');
  for (const [leg, outcome] of Object.entries(results)) {
    console.log(`  ${leg}: ${JSON.stringify(outcome)}`);
  }
}

const isMain = process.argv[1] && realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1]);
if (isMain) {
  main().then((r) => {
    printResultsSummary(r.results);
    process.exit(r.ok ? 0 : 1);
  }).catch((e) => { console.error('[start-cp3-drills] FATAL', e && e.message); process.exit(1); });
}
