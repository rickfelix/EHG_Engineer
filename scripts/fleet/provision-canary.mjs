#!/usr/bin/env node
/**
 * provision-canary.mjs — SD-LEO-INFRA-LAUNCHER-CAN-HOST-001 (FR-1).
 *
 * THE GAP THIS CLOSES. provisionCanary (lib/fleet/canary-provision.js:69) is imported by NOTHING
 * outside its own unit test — repo-wide grep confirms it; the only other match,
 * scripts/canary/run-canary-probe.mjs:67, is an unrelated same-named LOCAL function. So the
 * provisioning step exists, is tested, and has never once run. This file is the missing caller.
 *
 * WHY THIS DELIBERATELY DOES NOT CLAIM TO CLOSE DISCOVERABILITY. Wiring up a caller does not by
 * itself cause metadata.account_profile='canary' to be written. Traced end to end before writing this:
 *   1. provisionCanary calls spawn-control spawn() with accountProfile:'canary'. spawn() uses that
 *      value at exactly one place (spawn-control.js:162) to resolve a profile DIRECTORY. It is never
 *      written to metadata; spawn() has no stamp step at all.
 *   2. The ONLY writer of account_profile='canary' repo-wide is stampRespawnedCanary
 *      (canary-guard.js:173), whose only callers are canary-guard.js:121/:132 — the RESPAWN and
 *      RELAUNCH verbs. The fresh-spawn path provisioning uses never reaches it.
 *   3. That writer is itself dead: it finds its row with .eq('pid', pid) (canary-guard.js:167) where
 *      pid is the wt.exe launcher pid, while claude_sessions.pid holds the CLAUDE CODE pid. It polls
 *      8x/500ms, matches nothing, returns respawn_not_registered. spawn()'s own metadata write at
 *      :202 has the identical break.
 * canary-guard.js:153 already documents (1) in a comment. The comment is accurate; nobody acted on it.
 *
 * So a live run of this CLI today spawns, polls the gate, and exits registration_timeout — the same
 * fail-closed the drill hits, one layer further in. That is WHY the value here is the DIAGNOSIS: the
 * exit reason names which of the three links broke, so the one permitted live run produces an answer
 * instead of a re-run. Discoverability closes when FR-3 fixes correlation and stamps the fresh-spawn
 * path; this CLI is its prerequisite and its instrument, not its completion.
 *
 * SAFETY: dry-run is the DEFAULT. --live is an explicit opt-in that this module never infers, and it
 * only reaches spawn-control, which self-gates behind FLEET_SPAWN_CONTROL_LIVE. Running the CP3 drill
 * is NOT in scope and this file cannot start one — it never imports start-cp3-drills.js, canaryRestart,
 * runRebootRespawnDrill or runU4Drill.
 */
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { provisionCanary } from '../../lib/fleet/canary-provision.js';

/**
 * Exit-code contract. Deliberately three-valued so a caller (and CI) can tell "the fleet is broken"
 * apart from "the gate is legitimately unmet" — collapsing those two is what let this stay invisible.
 */
export const EXIT = { OK: 0, INFRA: 1, GATE_UNMET: 2 };

/**
 * Per-reason diagnosis. The point of this table is that a bare `registration_timeout` is unactionable:
 * it looks identical whether the slot is unseeded, the spawn never launched, or the session launched
 * fine and only the STAMP failed. Each string names the next thing to check, in order.
 */
export const DIAGNOSIS = {
  already_live: 'A resolvable canary already exists — no spawn was attempted (idempotent).',
  provisioned: 'Canary spawned AND resolved by account_profile. Discoverability is genuinely closed.',
  dry_run: 'DRY-RUN — nothing spawned. Re-run with --live (and FLEET_SPAWN_CONTROL_LIVE set) to act.',
  no_canary_slot_seeded:
    'fleet_desired_slots has no enabled canary slot. Provisioning cannot invent one — S3 seeding must run first.',
  registration_timeout:
    'Spawned, but no session ever resolved by account_profile=canary. EXPECTED until FR-3 lands: '
    + 'spawn() never writes metadata.account_profile (it uses accountProfile only for the profile dir, '
    + 'spawn-control.js:162), and the sole writer stampRespawnedCanary (canary-guard.js:173) is both '
    + 'off the fresh-spawn path and pid-correlation-dead (:167). Check whether a session REGISTERED at '
    + 'all before blaming the spawn: if claude_sessions gained a row, the spawn worked and only the '
    + 'stamp is missing.',
};

/**
 * Map a provisionCanary result onto {exitCode, status, diagnosis}. Pure — no client, no env, no clock,
 * so the exit-code contract is testable without touching a fleet.
 * @param {{ok?:boolean, reason?:string}} result
 */
export function classifyProvisionOutcome(result) {
  const reason = (result && result.reason) || 'unknown';
  const ok = Boolean(result && result.ok);
  // Fail-closed on an unrecognised reason: an unknown state is INFRA, never a silent OK.
  const known = Object.prototype.hasOwnProperty.call(DIAGNOSIS, reason);
  const exitCode = ok ? EXIT.OK : known ? EXIT.GATE_UNMET : EXIT.INFRA;
  return {
    exitCode,
    status: ok ? 'ok' : known ? 'gate_unmet' : 'infra',
    reason,
    diagnosis: known ? DIAGNOSIS[reason] : `Unrecognised reason '${reason}' — treating as INFRA, not as a met gate.`,
  };
}

/**
 * @param {string[]} argv
 * @param {{supabase?:object, provisionFn?:Function, log?:Function, createClientFn?:Function}} [deps]
 */
export async function main(argv = process.argv.slice(2), deps = {}) {
  const log = deps.log || ((m) => console.log(m));
  const live = argv.includes('--live');
  const provision = deps.provisionFn || provisionCanary;

  // Client is constructed INSIDE main and only when not injected — the unit project does not load
  // .env and CI has no secrets, so a module-scope client would red the whole file in CI.
  // createClientFn is a REAL seam, not decoration: without it the no-client test constructs a live
  // service client and runs provisionCanary against the production fleet (measured — that one test
  // took 14.2s of network I/O while the other nine took 1ms each). A unit test must never do that.
  let supabase = deps.supabase;
  if (!supabase) {
    try {
      const createClient = deps.createClientFn
        || (await import('../../lib/supabase-client.cjs')).createSupabaseServiceClient;
      supabase = createClient();
    } catch (e) {
      log(`[provision-canary] INFRA: cannot construct supabase client: ${e && e.message}`);
      return { ok: false, exitCode: EXIT.INFRA, status: 'infra', reason: 'no_supabase' };
    }
  }

  log(`[provision-canary] ${live ? 'LIVE' : 'DRY-RUN'} — target: a session resolvable by account_profile=canary`);

  let result;
  try {
    result = await provision({ supabase, live, logFn: log });
  } catch (e) {
    log(`[provision-canary] INFRA: provisionCanary threw: ${e && e.message}`);
    return { ok: false, exitCode: EXIT.INFRA, status: 'infra', reason: 'threw' };
  }

  const outcome = classifyProvisionOutcome(result);
  log(`[provision-canary] ${outcome.status.toUpperCase()} reason=${outcome.reason}`);
  log(`[provision-canary] ${outcome.diagnosis}`);
  return { ...outcome, ok: outcome.exitCode === EXIT.OK, result };
}

// Direct-invocation guard (realpath so a symlinked/worktree path still matches).
const invokedDirectly = (() => {
  try { return realpathSync(process.argv[1] || '') === realpathSync(fileURLToPath(import.meta.url)); }
  catch { return false; }
})();

if (invokedDirectly) {
  main().then((r) => { process.exitCode = r.exitCode; })
    .catch((e) => { console.error(`[provision-canary] fatal: ${e && e.message}`); process.exitCode = EXIT.INFRA; });
}
