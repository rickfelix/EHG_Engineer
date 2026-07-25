/**
 * Reboot-respawn RUNNER — SD-LEO-INFRA-LEO-COMPLETION-001-D (FR-5, closes Solomon checkpoint-3 G1b/G2).
 *
 * The piece that makes "zero live session at trigger time" (a host reboot that killed every fleet
 * session) recoverable. On trigger it:
 *   1. loadDesiredSlots(supabase)            — read the FROZEN desired manifest (FR-1)
 *   2. slotsToRoster(slots)                  — build the FLEET_SUPERVISOR_ROSTER-shaped roster (FR-3)
 *   3. for each slot: buildLiveSpawnInvocation({...,resumeUuid}) — the FR-4 `--resume <uuid>` path so
 *      each relaunched tab REATTACHES to its captured Claude Code session, then spawn (live) or log
 *      the intended invocation (dry-run)
 *   4. emit ONE `fleet_verb_respawn` coordination_events row per slot via logCoordinationEvent
 *      (mirroring how spawn-control emits fleet_verb_*).
 *
 * The runner drives the `--resume` path DIRECTLY (rather than delegating to fleet-supervisor's
 * createSupervisor) because the supervisor's roster shape does not thread resume_uuid into its
 * spawn call — reattachment requires the per-slot uuid to reach buildLiveSpawnInvocation, which only
 * this runner does. The roster is still produced (and returned / settable as FLEET_SUPERVISOR_ROSTER)
 * so a full deployment can also hand it to the resident supervisor for ongoing watch/remediation.
 *
 * STAGED / INERT BY DEFAULT (mirrors spawn-control's FLEET_SPAWN_CONTROL_LIVE discipline): with the
 * flag unset `live=false`, so the runner LOGS the intended per-slot resume invocation and the roster
 * and spawns NO OS process — but STILL records a fleet_verb_respawn event per slot (payload.live=false)
 * so the in-session drill (FR-7) can observe that the mechanism ran. Flipping the flag on requires the
 * same operator host-validation gate spawn-control / worker-spawn-executor already document.
 *
 * TESTABILITY: injectable seams (supabase, loadFn, rosterFn, buildInvocationFn, spawnFn, logFn, now,
 * live, resolveProfileDirFn) like u4-drill-runner.js — the read→translate→relaunch→emit logic is
 * deterministic under test WITHOUT mocking away the real behavior (the injected spawnFn/logFn observe
 * the REAL invocation argv and the REAL event payloads this runner builds).
 */
import { loadDesiredSlots, slotsToRoster } from './desired-slots-store.js';
import { buildLiveSpawnInvocation, resolveProfileDir, isLiveEnabled } from './spawn-control.js';

/** Lazily resolve the real coordination-events writer (CJS) so callers need not import it. */
async function defaultLogFn(supabase, event) {
  const { logCoordinationEvent } = await import('../coordinator/coordination-events.cjs');
  return logCoordinationEvent(supabase, event);
}

function defaultSleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

/** Best-effort insert into session_lifecycle_events; never throws (fail-soft, caller doesn't await for correctness). */
async function defaultWriteLifecycleEvent(supabase, event) {
  try { await supabase.from('session_lifecycle_events').insert(event); return true; }
  catch { return false; }
}

/**
 * QF-20260724-911 (split from QF-20260724-739's widened scope, Solomon Mode-B deep-sweep b3c86f61):
 * a fire-and-forget spawnFn() returning without throwing is NOT evidence of a live session -- the
 * code path taken on real recovery and on a silent no-op look IDENTICAL (forgeable-by-construction).
 * Reconcile the spawned pid against a REAL, heartbeating claude_sessions row (bounded poll, never a
 * single point-in-time read) using the SAME health check singleton-refresh-sequencer.cjs already
 * uses to gate retirement decisions -- reused, not reimplemented.
 *
 * QF-20260724-070 (Solomon bar adjudication, durable-bind-audit): a session_id-populated-post-hoc
 * result proves nothing once the bound session later ghosts (the exact false-pass Solomon caught on
 * the ephemeral canary drill). So the instant a REAL healthy bind is confirmed, write an IMMUTABLE
 * session_lifecycle_events audit row capturing that heartbeat proof -- acceptance then survives the
 * session ending, without requiring sustained persistence (CP3 is a live-ACTIVATION checkpoint, not
 * durable-recovery).
 * @returns {Promise<string|null>} the reconciled session_id, or null if never bound within budget.
 */
async function reconcileSpawnedSession(supabase, pid, opts = {}) {
  if (!supabase || !pid) return null;
  let checkNewSessionHealth;
  try {
    ({ checkNewSessionHealth } = await import('../coordinator/singleton-refresh-sequencer.cjs'));
  } catch { return null; }
  const sleepFn = opts.sleepFn || defaultSleep;
  const nowMs = opts.nowMs ?? Date.now();
  const freshMs = opts.reconcileFreshMs ?? 30_000; // a just-spawned session's own fresh-heartbeat window
  const maxAttempts = opts.reconcileMaxAttempts ?? 5;
  const writeLifecycleEventFn = opts.writeLifecycleEventFn || defaultWriteLifecycleEvent;
  const nowFn = opts.now || (() => new Date().toISOString());
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const { data: session } = await supabase.from('claude_sessions')
        .select('session_id, heartbeat_at, loop_state').eq('pid', pid).maybeSingle();
      if (checkNewSessionHealth(session, { nowMs, freshMs }).healthy) {
        await writeLifecycleEventFn(supabase, {
          event_type: 'RESPAWN_BIND_VERIFIED',
          session_id: session.session_id,
          pid,
          metadata: { heartbeat_at: session.heartbeat_at, loop_state: session.loop_state, sd_key: opts.sdKey ?? null, checked_at: nowFn() },
        });
        return session.session_id;
      }
    } catch { /* fail-soft: try again below, or give up */ }
    if (attempt < maxAttempts) await sleepFn(opts.reconcileDelayMs ?? 500);
  }
  return null;
}

/**
 * Run the reboot-respawn sequence.
 * @param {object}   opts
 * @param {object}   [opts.supabase]           - service client (passed to loadFn/logFn)
 * @param {Function} [opts.loadFn]             - async (supabase)=>slots ; defaults to loadDesiredSlots
 * @param {Function} [opts.rosterFn]          - (slots)=>roster ; defaults to slotsToRoster
 * @param {Function} [opts.buildInvocationFn] - ({role,callsign,profileDir,resumeUuid})=>invocation ; defaults to buildLiveSpawnInvocation
 * @param {Function} [opts.spawnFn]           - (program,args,env)=>child ; ONLY invoked when live
 * @param {Function} [opts.logFn]             - async (supabase,event)=>result ; defaults to logCoordinationEvent
 * @param {Function} [opts.resolveProfileDirFn] - (name,opts)=>dir ; defaults to resolveProfileDir
 * @param {boolean}  [opts.live]              - override; defaults to isLiveEnabled()
 * @param {Function} [opts.log]               - line logger
 * @param {Function} [opts.now]               - ()=>iso string clock
 * @returns {Promise<{live:boolean, roster:Array<object>, slotCount:number, results:Array<{callsign:string, role:string, invocation:object, resume_uuid:string|null, spawned:boolean, eventLogged:boolean}>}>}
 */
export async function runRebootRespawn(opts = {}) {
  const {
    supabase = null,
    loadFn = loadDesiredSlots,
    rosterFn = slotsToRoster,
    buildInvocationFn = buildLiveSpawnInvocation,
    spawnFn = null,
    logFn = defaultLogFn,
    resolveProfileDirFn = resolveProfileDir,
    log = () => {},
    now = () => new Date().toISOString(),
  } = opts;
  const live = opts.live ?? isLiveEnabled();

  const slots = await loadFn(supabase);
  const roster = rosterFn(slots);
  log(`[reboot-respawn] loaded ${slots.length} desired slot(s); live=${live}; roster=${JSON.stringify(roster)}`);

  const results = [];
  for (const slot of slots) {
    const role = slot.role || 'worker';
    const callsign = slot.name;
    const resumeUuid = slot.resume_uuid || null;

    // Resolve the account-profile dir the SAME way spawn-control does (allowlisted, non-traversal).
    // Fail-soft: a bad/absent profile degrades to no CLAUDE_CONFIG_DIR rather than aborting the slot.
    let profileDir = null;
    if (slot.account_profile) {
      try { profileDir = resolveProfileDirFn(slot.account_profile, opts); }
      catch (e) { log(`[reboot-respawn] profile resolve failed for ${callsign} (${slot.account_profile}): ${e && e.message}`); profileDir = null; }
    }

    const invocation = buildInvocationFn({ role, callsign, profileDir, resumeUuid });

    let spawned = false;
    let child = null;
    if (live && typeof spawnFn === 'function') {
      try {
        child = spawnFn(invocation.program, invocation.args, invocation.env);
        spawned = true;
        log(`[reboot-respawn] respawned ${role}/${callsign} (resume=${resumeUuid || 'none'})`);
      } catch (e) {
        log(`[reboot-respawn] spawn FAILED for ${callsign}: ${e && e.message}`);
      }
    } else {
      log(`[reboot-respawn] DRY-RUN would respawn ${role}/${callsign}: ${invocation.program} ${invocation.args.join(' ')}`);
    }

    // QF-20260724-911: payload.live is derived FROM ground-truth reconciliation, not from spawnFn()
    // having returned without throwing -- see reconcileSpawnedSession() above.
    const sessionId = spawned && child && child.pid ? await reconcileSpawnedSession(supabase, child.pid, opts) : null;
    const boundLive = sessionId !== null;
    const outcome = boundLive ? 'ok' : (spawned ? 'respawn_unbound' : 'dry_run');

    // FR-5: one fleet_verb_respawn event per slot (recorded in dry-run too, payload.live=false).
    let eventLogged = false;
    try {
      const res = await logFn(supabase, {
        event_type: 'fleet_verb_respawn',
        session_id: sessionId,
        // QF-20260724-335: explicit run-correlator (opt-in via opts.sdKey) so a set of drill legs
        // can be attributed to one invocation -- see spawn-control.js's emitVerbEvent for the same
        // convention on the other 2 CP3 legs.
        sd_key: opts.sdKey ?? null,
        payload: {
          verb: 'respawn',
          callsign,
          role,
          resume_uuid: resumeUuid,
          live: boundLive,
          outcome,
          at: now(),
        },
      });
      eventLogged = !!(res && res.ok);
    } catch { /* fail-open: event emission never blocks a respawn outcome */ }

    results.push({ callsign, role, invocation, resume_uuid: resumeUuid, spawned, live: boundLive, session_id: sessionId, eventLogged });
  }

  return { live, roster, slotCount: slots.length, results };
}
