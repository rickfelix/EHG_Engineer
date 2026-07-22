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
    // Pilot fix FR-3 (CHECKPOINT-3): isolation must NOT silently degrade. A slot that REQUESTED an
    // account_profile whose dir cannot be resolved (e.g. FLEET_ACCOUNT_PROFILES_DIR absent) FAILS LOUD
    // — skip the spawn and record the slot as failed rather than launching with no CLAUDE_CONFIG_DIR (a
    // silently-unisolated session would pass a shallow drill and fail reality). A slot with NO profile
    // requested proceeds normally (profileDir=null is legitimate there).
    let profileDir = null;
    if (slot.account_profile) {
      try {
        profileDir = resolveProfileDirFn(slot.account_profile, opts);
      } catch (e) {
        const reason = `profile resolve failed for ${callsign} (${slot.account_profile}): ${e && e.message}`;
        log(`[reboot-respawn] ISOLATION FAIL-LOUD — ${reason}; skipping slot (no silent no-isolation spawn)`);
        results.push({ callsign, role, invocation: null, resume_uuid: resumeUuid, spawned: false, eventLogged: false, isolation_failed: true, reason });
        continue;
      }
    }

    const invocation = buildInvocationFn({ role, callsign, profileDir, resumeUuid });

    let spawned = false;
    if (live && typeof spawnFn === 'function') {
      try {
        spawnFn(invocation.program, invocation.args, invocation.env, invocation.cwd);
        spawned = true;
        log(`[reboot-respawn] respawned ${role}/${callsign} (resume=${resumeUuid || 'none'})`);
      } catch (e) {
        log(`[reboot-respawn] spawn FAILED for ${callsign}: ${e && e.message}`);
      }
    } else {
      log(`[reboot-respawn] DRY-RUN would respawn ${role}/${callsign}: ${invocation.program} ${invocation.args.join(' ')}`);
    }

    // FR-5: one fleet_verb_respawn event per slot (recorded in dry-run too, payload.live=false).
    let eventLogged = false;
    try {
      const res = await logFn(supabase, {
        event_type: 'fleet_verb_respawn',
        session_id: null,
        payload: {
          verb: 'respawn',
          callsign,
          role,
          resume_uuid: resumeUuid,
          live: spawned,
          at: now(),
        },
      });
      eventLogged = !!(res && res.ok);
    } catch { /* fail-open: event emission never blocks a respawn outcome */ }

    results.push({ callsign, role, invocation, resume_uuid: resumeUuid, spawned, eventLogged });
  }

  return { live, roster, slotCount: slots.length, results };
}
