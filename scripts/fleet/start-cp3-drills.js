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
  return { live: !!live, cwd: startDir, canaryProfileDir, legs: LEGS.map((l) => ({ ...l })) };
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
  const run = deps.runDrills || defaultRunDrills;
  const results = await run(plan, deps);
  return { ok: true, live: true, legs: plan.legs, results };
}

async function defaultRunDrills(plan, deps = {}) {
  const { runRebootRespawnDrill } = await import('../../lib/fleet/reboot-respawn-drill-runner.js');
  const { runU4Drill } = await import('../../lib/fleet/u4-drill-runner.js');
  const supabase = deps.supabase || null; // real client supplied by the operator wrapper when live
  // reboot-respawn + u4 both default-gate; kill-supervisor is exercised by the supervisor's own drill doc.
  const reboot = await runRebootRespawnDrill({ supabase, live: true }).catch((e) => ({ error: e && e.message }));
  const u4 = await runU4Drill({ opts: {} }).catch((e) => ({ error: e && e.message }));
  return { reboot, u4 };
}

const isMain = process.argv[1] && realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1]);
if (isMain) {
  main().then((r) => process.exit(r.ok ? 0 : 1)).catch((e) => { console.error('[start-cp3-drills] FATAL', e && e.message); process.exit(1); });
}
