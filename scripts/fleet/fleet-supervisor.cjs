#!/usr/bin/env node
/**
 * Fleet supervisor -- SD-LEO-INFRA-LEO-COMPLETION-001-C (closes Solomon checkpoint-3 gap G1a).
 *
 * A REAL, persistent, KILLABLE launcher-shell supervisor process that owns/watches fleet child
 * sessions by COMPOSING lib/fleet/spawn-control.js's six governed verbs (never reimplementing them).
 * spawn-control.js today is spawn-and-forget (child.unref() at :148, zero retained reference, no
 * watch loop); this adds the missing supervisor: a desired-state roster + a resident watch loop that
 * re-spawns lost children in live mode and logs the intent in dry-run.
 *
 * KILL-SURVIVAL (the G1a property under test):
 *   - Children are spawned DETACHED + unref'd by spawn-control.spawn, so a `kill -9` of THIS
 *     supervisor process leaves them running -- the OS re-parents the detached children. SIGKILL is
 *     uncatchable, so survival is a property of the detached spawn, provable only by a LIVE drill.
 *   - The supervisor NEVER kills its children on its own death. Graceful SIGINT/SIGTERM teardown is
 *     explicitly NON-CASCADING (stopWatch() clears the loop and exits; it does not stop/kill tracked
 *     children). This is a distinct code path from `kill -9` and is asserted separately in unit tests
 *     (TESTING gap #1): a graceful Ctrl-C must NOT cascade-kill the fleet.
 *
 * STAGED / INERT BY DEFAULT (mirrors WORKER_SPAWN_EXECUTOR_LIVE / spawn-control's own discipline):
 *   every OS spawn/restart stays behind FLEET_SPAWN_CONTROL_LIVE (default OFF). With the flag unset
 *   the watch loop only LOGS what it WOULD do -- it spawns/kills nothing. The live drill
 *   (docs/protocol/fleet-supervisor-live-drill.md) runs ONLY on Child B's canary account.
 *
 * TESTABILITY: the pure supervisor core (createSupervisor) takes injectable seams (spawnControl,
 * probeChild, clock, log) so the watch/detect/remediate logic is deterministic under test. The
 * resident entrypoint (require.main === module) is a thin wrapper and does NOT auto-run on import.
 */

const path = require('node:path');

/**
 * SD-LEO-FEAT-WINDOWS-LIBUV-ASSERTION-001 pattern (mirrors lib/heartbeat-manager.mjs armUnrefInterval):
 * a ref'd setInterval keeps the loop alive and, on Windows process exit, trips
 * "Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)" / the exit-143 hang. unref() takes the
 * timer out of that force-close path; the loop still fires while genuine async work is pending.
 */
function armUnrefInterval(fn, ms) {
  const timer = setInterval(fn, ms);
  if (timer && typeof timer.unref === 'function') timer.unref();
  return timer;
}

const DEFAULT_INTERVAL_MS = 30000;

/**
 * Create the pure supervisor core.
 *
 * @param {object}   deps
 * @param {Array<{role:string,callsign:string,accountProfile?:string}>} deps.roster - desired children
 * @param {object}   deps.spawnControl - the spawn-control verb module (spawn/restart/isLiveEnabled)
 * @param {object}   [deps.supabase]   - service client (passed through to spawn-control verbs)
 * @param {boolean}  [deps.live]       - override; defaults to spawnControl.isLiveEnabled()
 * @param {number}   [deps.intervalMs] - watch cadence
 * @param {Function} [deps.probeChild] - async (child)=>boolean liveness probe (injectable for tests)
 * @param {Function} [deps.log]        - logger
 * @param {Function} [deps.now]        - () => ms clock (injectable)
 */
function createSupervisor(deps = {}) {
  const {
    roster = [],
    spawnControl,
    supabase = null,
    intervalMs = DEFAULT_INTERVAL_MS,
    log = () => {},
    now = () => Date.now(),
  } = deps;
  if (!spawnControl || typeof spawnControl.spawn !== 'function') {
    throw new Error('createSupervisor: deps.spawnControl (with spawn/restart) is required');
  }
  const live = deps.live ?? (typeof spawnControl.isLiveEnabled === 'function' ? spawnControl.isLiveEnabled() : false);
  const probeChild = deps.probeChild || defaultProbeChild(supabase);

  // Retained references -- the thing spawn-and-forget lacks. Keyed by callsign.
  const tracked = new Map();
  let timer = null;
  let started = false;

  async function spawnOne(child) {
    const res = await spawnControl.spawn(
      { role: child.role, callsign: child.callsign, accountProfile: child.accountProfile },
      { supabaseClient: supabase, live },
    );
    tracked.set(child.callsign, { child, lastResult: res, spawnedAt: now() });
    log(`[fleet-supervisor] ${live ? 'spawned' : 'DRY-RUN would spawn'} ${child.role}/${child.callsign}`);
    return res;
  }

  /** Start: spawn the whole roster once, then arm the resident watch loop. */
  async function start() {
    if (started) return { started: true, already: true };
    started = true;
    for (const child of roster) await spawnOne(child);
    timer = armUnrefInterval(() => { tick().catch((e) => log(`[fleet-supervisor] tick error: ${e && e.message}`)); }, intervalMs);
    log(`[fleet-supervisor] watch loop armed (${intervalMs}ms, live=${live}, roster=${roster.length})`);
    return { started: true, live, watching: roster.length };
  }

  /**
   * One watch pass: for each tracked child, probe liveness; a lost child is re-spawned via
   * spawn-control.restart in LIVE mode (which emits a real fleet_verb_restart event), or logged in
   * dry-run. A no-op loop that never remediates would pass kill-survival vacuously -- this is what
   * makes the supervisor actually supervise (TESTING gap #4).
   */
  async function tick() {
    const outcomes = [];
    for (const [callsign, entry] of tracked) {
      const alive = await probeChild(entry.child);
      if (alive) { outcomes.push({ callsign, action: 'alive' }); continue; }
      if (!live) {
        log(`[fleet-supervisor] DRY-RUN would restart lost child ${callsign}`);
        outcomes.push({ callsign, action: 'would_restart' });
        continue;
      }
      const res = await spawnControl.restart(callsign, { supabaseClient: supabase, live, by: 'callsign' });
      entry.lastResult = res;
      entry.spawnedAt = now();
      outcomes.push({ callsign, action: 'restarted', ok: !!(res && res.ok) });
      log(`[fleet-supervisor] restarted lost child ${callsign}: ok=${!!(res && res.ok)}`);
    }
    return outcomes;
  }

  /**
   * Stop the watch loop. NON-CASCADING BY DEFAULT: this does NOT stop or kill tracked children --
   * a graceful shutdown of the supervisor must leave the fleet running (kill-survival parity with
   * the uncatchable `kill -9` path). Pass { cascade:true } ONLY for an intentional teardown.
   */
  async function stopWatch(opts = {}) {
    if (timer) { clearInterval(timer); timer = null; }
    started = false;
    if (opts.cascade === true && typeof spawnControl.stop === 'function') {
      for (const callsign of tracked.keys()) {
        await spawnControl.stop(callsign, { supabaseClient: supabase, live, by: 'callsign' });
      }
      log('[fleet-supervisor] CASCADE stop: tracked children stopped');
      return { stopped: true, cascade: true };
    }
    log('[fleet-supervisor] watch loop stopped (non-cascading -- children left running)');
    return { stopped: true, cascade: false };
  }

  return {
    start,
    tick,
    stopWatch,
    get tracked() { return tracked; },
    get live() { return live; },
    isWatching: () => timer !== null,
  };
}

/**
 * Default liveness probe: a child is alive if a live claude_sessions row exists for its callsign.
 * Uses the canonical resolver rather than a hand-rolled query. Fail-CLOSED (treat as not-alive on
 * probe error) so a transient DB hiccup errs toward re-spawn attempts, never toward silent gaps.
 */
function defaultProbeChild(supabase) {
  return async function probe(child) {
    if (!supabase) return true; // no DB wired -> cannot judge; do not thrash
    try {
      const { resolveLiveSession } = await import('../../lib/fleet/session-registry-adapter.js');
      const r = await resolveLiveSession(supabase, { by: 'callsign', value: child.callsign });
      return !!(r && r.resolved);
    } catch {
      return false;
    }
  };
}

module.exports = { createSupervisor, armUnrefInterval, defaultProbeChild, DEFAULT_INTERVAL_MS };

// Resident entrypoint -- thin wrapper; does NOT run on import (TESTING gap #3).
if (require.main === module) {
  (async () => {
    const spawnControl = await import('../../lib/fleet/spawn-control.js');
    const { createSupabaseServiceClient } = require('../../lib/supabase-client.cjs');
    const supabase = createSupabaseServiceClient();
    // Roster comes from the desired-state manifest (Child B slot schema) in a full deployment; for
    // the drill it is supplied via FLEET_SUPERVISOR_ROSTER (JSON) so the operator controls it.
    let roster = [];
    try { roster = JSON.parse(process.env.FLEET_SUPERVISOR_ROSTER || '[]'); } catch { roster = []; }
    const sup = createSupervisor({ roster, spawnControl, supabase, log: (m) => console.log(m) });

    // NON-CASCADING graceful teardown: stop watching, leave children running, then exit.
    const shutdown = async (sig) => {
      console.log(`[fleet-supervisor] ${sig} received -- non-cascading shutdown (children keep running)`);
      await sup.stopWatch(); // default: cascade=false
      process.exit(0);
    };
    process.on('SIGINT', () => { shutdown('SIGINT'); });
    process.on('SIGTERM', () => { shutdown('SIGTERM'); });

    await sup.start();
    console.log(`[fleet-supervisor] resident (pid=${process.pid}, live=${sup.live}). kill -9 me; the fleet survives.`);
  })().catch((e) => { console.error('[fleet-supervisor] fatal:', e && e.message); process.exit(1); });
}
