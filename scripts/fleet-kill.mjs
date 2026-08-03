#!/usr/bin/env node
/**
 * SD-LEO-FEAT-FLEET-SESSION-LIFECYCLE-001 / FR-2 — operator CLI for the graceful kill.
 *
 * OPERATOR-INITIATED ONLY. No watchdog, sweep or cron may call this — a policy already ratified
 * in two places (stale-session-sweep.cjs :290 and :2058-2060). This file is an entry point, never
 * an importable side effect: the orchestration lives in lib/fleet/graceful-kill.mjs and this
 * module only binds it to real collaborators.
 *
 * Usage:
 *   node scripts/fleet-kill.mjs <session-id> [--reason "<text>"] [--dry-run]
 *
 * Gated by FLEET_GRACEFUL_KILL_ENABLED=on. Its own flag — FLEET_CANARY_KILL_ENABLED is NOT
 * consulted, because that flag's canary-only assert is what keeps drills off production seats.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

import { gracefulKillSession, isGracefulKillEnabled } from '../lib/fleet/graceful-kill.mjs';
import { sampleToolActivityTwice } from '../lib/fleet/release-work-item.mjs';
import { bestEffortReleaseSd } from '../lib/fleet/best-effort-release.mjs';
import { createSupabaseServiceClient } from '../lib/supabase-client.js';
import { isMainModule } from '../lib/utils/is-main-module.js';

const require = createRequire(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const { pidIsClaude, readTickPidfile } = require('../lib/fleet/claimant-liveness.cjs');
const { runPreparkWip } = require('../lib/fleet/prepark-wip.cjs');

/**
 * pidIsClaude is TRI-STATE: 'MATCH' | 'NO_MATCH' | 'PROBE_FAILED'. Map it deliberately.
 *
 * PROBE_FAILED MUST NOT COLLAPSE TO false. Both false and undefined end in a refusal, but they
 * are different facts and produce different operator messages: false means "this pid is not the
 * agent — most likely the shell wrapper claude_sessions.pid falls back to", while PROBE_FAILED
 * means "the probe itself broke and told us nothing". The helper's own docblock is explicit that
 * PROBE_FAILED is NOT death; flattening it would report a wrong-process diagnosis we never made.
 */
export function claudeProbeToTriState(result) {
  if (result === 'MATCH') return true;
  if (result === 'NO_MATCH') return false;
  return undefined; // PROBE_FAILED, or anything unrecognised
}

/** The SessionStart marker records the tick pid; a disagreement with the DB pid is a refusal. */
export function markerPidFor(sessionId, repoRoot = REPO_ROOT) {
  const marker = readTickPidfile(sessionId, repoRoot);
  const pid = marker && (marker.pid ?? marker.tick_pid);
  return Number.isInteger(pid) ? pid : null;
}

export function buildKillDeps(supabase, sessionId, { reason, dryRun = false } = {}) {
  return {
    reason: reason || 'operator_graceful_kill',
    getSession: async () => {
      const { data } = await supabase
        .from('claude_sessions')
        .select('session_id, pid, sd_key, worktree_path, status')
        .eq('session_id', sessionId)
        .maybeSingle();
      return data || null;
    },
    readMarkerPid: (sid) => markerPidFor(sid),
    pidIsClaude: (pid) => claudeProbeToTriState(pidIsClaude(pid)),
    sampleToolActivity: (sb, sid) => sampleToolActivityTwice(sb, sid, { intervalMs: 5_000 }),
    runPreparkWip,
    releaseClaim: async (sessionId, sdKey) => {
      const r = await bestEffortReleaseSd(supabase, sessionId, reason || 'operator_graceful_kill',
        () => {}, sdKey ? { expectedSdKey: sdKey } : {});
      return { released: r.released === true };
    },
    // A dry run exercises every check and stops before the irreversible step.
    kill: dryRun ? async () => {} : undefined,
    // verifyGone MUST be supplied on the production path. It was previously left undefined here,
    // and graceful-kill reads it as `gone = verifyGone ? await verifyGone(pid) : true` — so `gone`
    // was unconditionally true, the SIGKILL escalation was dead code, and the verdict returned
    // "terminated and verified absent" having verified nothing. A destructive op asserting an
    // observation it never made is the failure mode this SD exists to remove, not one to ship.
    //
    // FAIL CLOSED on the tri-state, for the same reason claudeProbeToTriState refuses to flatten
    // PROBE_FAILED: gone is true ONLY on a definitive NO_MATCH (the pid is no longer the agent).
    // MATCH means still alive; undefined means the probe told us nothing. Neither is evidence of
    // death, so both report not-gone — which escalates to SIGKILL and then honestly returns
    // 'refused' rather than a status flip we cannot back up.
    verifyGone: dryRun ? async () => true : async (pid) => claudeProbeToTriState(pidIsClaude(pid)) === false,
  };
}

async function main() {
  const argv = process.argv.slice(2);
  const sessionId = argv.find((a) => !a.startsWith('--'));
  const dryRun = argv.includes('--dry-run');
  const reasonIdx = argv.indexOf('--reason');
  const reason = reasonIdx >= 0 ? argv[reasonIdx + 1] : undefined;

  if (!sessionId) {
    console.error('Usage: node scripts/fleet-kill.mjs <session-id> [--reason "<text>"] [--dry-run]');
    process.exit(2);
  }
  if (!isGracefulKillEnabled()) {
    console.error('FLEET_GRACEFUL_KILL_ENABLED is not "on" — refusing. This verb is operator-initiated and default-off.');
    process.exit(3);
  }

  const supabase = createSupabaseServiceClient();
  const deps = buildKillDeps(supabase, sessionId, { reason, dryRun });

  // spawn-control's stop() records the fleet_verb_stop event and re-runs the claim release +
  // hand-back. THAT RE-RUN IS NOT CAS-GUARDED, WHICH THIS COMMENT USED TO CLAIM. It is merely
  // usually inert, because release_sd() nulls claude_sessions.sd_key and releaseHeldWorkItem
  // no-ops on the null — an incidental side effect, not a predicate. So graceful-kill forwards
  // what it actually learned: opts.gone. Without it, a kill that could NOT be verified would
  // still hand the work item back here, silently undoing the fail-closed decision made two steps
  // earlier (GK-1, SD-LEO-INFRA-RELEASE-WORK-ITEM-001).
  // Imported lazily so a dry run that never reaches step 7 does not pull the module in.
  deps.recordStop = dryRun ? null : async (sid, o = {}) => {
    const { stop } = await import('../lib/fleet/spawn-control.js');
    await stop(sid, { by: 'session_id', supabaseClient: supabase, holderVerifiedGone: o.gone });
  };

  const verdict = await gracefulKillSession(supabase, sessionId, deps);

  console.log(JSON.stringify({ sessionId, dryRun, ...verdict }, null, 2));
  // A halt is a SUCCESSFUL refusal to destroy work, not a crash — but it must not read as a kill.
  process.exit(verdict.outcome === 'killed' ? 0 : 1);
}

if (isMainModule(import.meta.url)) {
  main().catch((err) => {
    console.error(`fleet-kill failed: ${(err && err.message) || err}`);
    process.exit(1);
  });
}
