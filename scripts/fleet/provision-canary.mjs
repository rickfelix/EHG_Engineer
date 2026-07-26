#!/usr/bin/env node
/**
 * provision-canary.mjs — SD-LEO-INFRA-LAUNCHER-CAN-HOST-001 (FR-1).
 *
 * WHAT THIS FILE IS. The CLI entrypoint for provisionCanary (lib/fleet/canary-provision.js). It
 * imports that function below and calls it — this file IS the caller, and provisionCanary RUNS.
 *
 * This header used to open with "provisionCanary is imported by NOTHING outside its own unit test …
 * has never once run", in the PRESENT TENSE. That was the problem statement this file was created to
 * close, and it became false the moment the file existed. It is not a harmless leftover: a reader
 * verified by direct inspection that the function WAS wired, then let this banner talk them back out
 * of their own correct finding, and spent a full retraction cycle on it.
 *
 * A problem statement written in the present tense outlives the problem. Record the gap in the commit
 * that closes it, not in a banner on the fix.
 *
 * HISTORY, KEPT SHORT AND CURRENT. This header used to say the CLI could not close discoverability:
 * that spawn() had no stamp step, that the only account_profile writer was stampRespawnedCanary on the
 * respawn path, and that a live run would always exit registration_timeout. ALL THREE ARE NOW FALSE and
 * were left standing after the code moved underneath them (caught by PLAN_VERIFICATION review). What is
 * true now:
 *   - spawn() DOES stamp metadata.account_profile on the fresh-spawn path (FR-3).
 *   - correlation is by spawner-MINTED `claude --session-id <uuid>`, proven live: the registered
 *     session_id came back byte-identical to the minted uuid.
 *   - a live run PROVISIONED a canary: resolveCanaryTarget(by account_profile=canary) returns
 *     resolved:true, with window_handle persisted and the child running from the isolated canary
 *     profile dir.
 * A stale comment that describes a fixed defect as live is not harmless -- it sends the next reader
 * down a path that no longer exists, which is the same failure mode as the wrong-suspect diagnosis
 * this file's DIAGNOSIS table was rewritten to avoid.
 *
 * The DIAGNOSIS table below remains the point of this CLI: a bare timeout is unactionable, so each exit
 * reason names the next thing to check.
 *
 * SAFETY: dry-run is the DEFAULT. --live is an explicit opt-in that this module never infers.
 *
 * CORRECTION (SECURITY adversarial review, SEC-CANHOST-02): an earlier version of this comment claimed
 * --live "only reaches spawn-control, which self-gates behind FLEET_SPAWN_CONTROL_LIVE". THAT WAS FALSE
 * and it was the dangerous kind of false — a safety claim on an operator-facing CLI. canary-provision.js
 * forwards `live` as opts.live, and spawn-control.js reads `opts.live ?? isLiveEnabled()`, so an explicit
 * opt OVERRIDES the env gate. `provision-canary.mjs --live` really did spawn with
 * FLEET_SPAWN_CONTROL_LIVE unset. The `??` override is pre-existing and used deliberately elsewhere, so
 * rather than change that shared semantic, THIS CLI now requires BOTH: the --live flag AND
 * FLEET_SPAWN_CONTROL_LIVE=true. The comment is now true of this entrypoint because the code enforces it.
 *
 * Running the CP3 drill is NOT in scope and this file cannot start one — it never imports
 * start-cp3-drills.js, canaryRestart, runRebootRespawnDrill or runU4Drill.
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
    'Spawned, but no session resolved by account_profile=canary. DIAGNOSE IN THIS ORDER, because the '
    + 'first live run showed all three earlier legs SUCCEEDING while this still failed: '
    + '(1) did a claude_sessions row appear at all? If yes the spawn and registration both worked. '
    + '(2) does that row carry the MINTED session id logged above? If yes, --session-id took effect. '
    + '(3) is its metadata EMPTY? Then the session-bind loop in spawn-control closed BEFORE the child '
    + 'registered -- window_handle, account_profile and the session_id bind are all written inside that '
    + 'one block, so a missed bind silently discards all three. Measured 2026-07-25: the bind closed '
    + '1.3s too early. The budget has since been widened (SESSION_BIND_MAX_ATTEMPTS); if this recurs, '
    + 'measure the gap between fleet_verb_spawn and claude_sessions.created_at rather than re-running.',
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
  const provision = deps.provisionFn || provisionCanary;

  // SEC-CANHOST-02: BOTH conditions required. --live alone would override spawn-control's env gate
  // (`opts.live ?? isLiveEnabled()`), so the flag by itself is not the second factor it reads as.
  const env = deps.env || process.env;
  const requestedLive = argv.includes('--live');
  const envAllowsLive = String(env.FLEET_SPAWN_CONTROL_LIVE || '').toLowerCase() === 'true';
  const live = requestedLive && envAllowsLive;
  if (requestedLive && !envAllowsLive) {
    // Refuse rather than silently downgrading to dry-run: an operator who typed --live and got a
    // "DRY-RUN" line could easily read it as "it ran". Say exactly which factor is missing.
    log('[provision-canary] REFUSING --live: FLEET_SPAWN_CONTROL_LIVE is not set to true.');
    log('[provision-canary] Both are required. Nothing was spawned.');
    return { ok: false, exitCode: EXIT.INFRA, status: 'infra', reason: 'live_requires_env_gate' };
  }

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
  // Surface the MINTED session id. Without it the first live run could not be diagnosed from outside:
  // a session had registered, but nothing logged the id the spawner chose, so there was no way to tell
  // "the child ignored --session-id" from "the child registered under it, just later than we looked".
  const minted = result && result.spawn && result.spawn.invocation && result.spawn.invocation.sessionId;
  if (minted) log(`[provision-canary] minted session id: ${minted} — the child should register under exactly this`);
  if (result && result.spawn && result.spawn.pid) log(`[provision-canary] launcher pid: ${result.spawn.pid} (wt.exe; exits immediately — NOT the Claude Code pid)`);
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
