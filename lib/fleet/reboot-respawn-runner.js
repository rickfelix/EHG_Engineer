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
import os from 'node:os';
import { loadDesiredSlots, slotsToRoster } from './desired-slots-store.js';
import { buildLiveSpawnInvocation, resolveProfileDir, isLiveEnabled, CANARY_PROFILE } from './spawn-control.js';
// SD-LEO-INFRA-SESSION-SPAWN-AND-PROMPT-LIBRARY-001-F (FR-1): the launch-contract predicate, wired
// at the live spawn seam below. Same .cjs-from-ESM interop spawn-control.js already uses.
import { assertLaunchContract } from './build-session-launch.cjs';

/** Lazily resolve the real coordination-events writer (CJS) so callers need not import it. */
async function defaultLogFn(supabase, event) {
  const { logCoordinationEvent } = await import('../coordinator/coordination-events.cjs');
  return logCoordinationEvent(supabase, event);
}

// SD-LEO-INFRA-FLEET-CANNOT-SELF-001 FR-3 — a genuine post-reboot run must always attempt every
// singleton, including coordinator; this runner is the ONLY recovery path when every session (and
// every liveness signal) died with the host. 15 minutes is deliberately generous relative to actual
// Windows boot+logon+scheduled-task-fire timing so a normal reboot never crosses it before the
// coordinator slot spawns. Outside this window, a re-trigger (e.g. an operator validating the
// scheduled task via `schtasks /Run`) is presumed NOT a reboot, so the dedup guard below engages.
const BOOT_WINDOW_MS = 15 * 60 * 1000;

/** Lazily resolve the real coordinator-liveness resolver (CJS), mirroring defaultLogFn's pattern. */
async function defaultCoordinatorResolverFn(supabase) {
  const { getActiveCoordinatorId } = await import('../coordinator/resolve.cjs');
  return getActiveCoordinatorId(supabase);
}

/**
 * QF-20260724-290: lazily resolve the CANONICAL fleet-worker keepalive prompt (CJS) — the same text
 * worker-spawn-executor.cjs launches its workers with. A respawned tab that receives no prompt has
 * nothing to do: it registers, heartbeats once, and exits (ghost), which is precisely what made the
 * respawn leg unverifiable post-hoc. Single source of truth — never re-author the prompt text here.
 *
 * QF-20260727-488 — NOW ROLE-AWARE, in this order (do not reorder, do not key on role alone):
 *   (a) couldBeCanaryCallsign(callsign) -> ALWAYS FIRST, UNCONDITIONALLY WINS. Canaries ARE
 *       role='worker', so keying selection on role alone would hand every canary the claiming
 *       directive — startup-prompt-selection.js's own header forbids exactly that.
 *   (b) role is a known non-worker spawnable role (coordinator/solomon/adam) -> that role's
 *       directive, via resolveRoleSpawnOpts so the role->prompt map has one owner.
 *   (c) otherwise -> today's callsign-namespace selection, UNCHANGED.
 * fleet_desired_slots currently holds only role='worker' rows, so this arm is LATENT today — it
 * arms the moment a non-worker slot is added, closing the gap before it goes live rather than
 * after.
 */
async function defaultStartupPrompt(callsign, role, logFn) {
  const { FLEET_WORKER_STARTUP_PROMPT } = await import('../coordinator/coordination-events.cjs');
  const { couldBeCanaryCallsign, resolveStartupPromptForCallsign } = await import('./startup-prompt-selection.js');

  if (!couldBeCanaryCallsign(callsign)) {
    const { resolveRoleSpawnOpts } = await import('./role-startup-prompt.js');
    const roleOpts = resolveRoleSpawnOpts(role);
    if (Object.hasOwn(roleOpts, 'startupPrompt')) return roleOpts.startupPrompt;
  }

  // SD-...-PROMPT-LIBRARY-001-D FR-3: keyed on the CALLSIGN NAMESPACE, so a canary can never be
  // handed the claiming-worker directive. Canary + unidentifiable resolve to null (no prompt) until
  // the canary prompt exists — see resolveStartupPromptForCallsign's header.
  const { prompt } = resolveStartupPromptForCallsign(callsign, {
    workerPrompt: FLEET_WORKER_STARTUP_PROMPT,
    canaryPrompt: null, // FR-8 outstanding: no canary constant exists yet
    logFn: logFn || (() => {}),
  });
  return prompt;
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
/**
 * SD-LEO-INFRA-LAUNCHER-CAN-HOST-001 follow-up (TESTING adversarial review F1): this used to look the
 * spawned session up by `.eq('pid', pid)` ONLY -- the same dead join FR-3 replaced in spawn-control.js.
 * `pid` here is the wt.exe LAUNCHER pid, already exited, while claude_sessions.pid holds the CLAUDE CODE
 * pid, so it could never match. FR-3 taught the runner to MINT and emit `claude --session-id <uuid>`
 * (reboot-respawn-runner.js buildInvocationFn call) but stopped short of consuming it here, so
 * payload.live, session_id and the QF-20260724-070 RESPAWN_BIND_VERIFIED audit all still rode on a join
 * that build-session-launch.cjs itself documents as unmatched. Correct argv, dead correlation -- this
 * SD's own defect, one module over.
 *
 * Now prefers the MINTED session id and keeps pid only as a fallback for a caller that minted none.
 * @param {{pid:number|null, sessionId:string|null}} ids
 */
async function reconcileSpawnedSession(supabase, { pid, sessionId } = {}, opts = {}) {
  if (!supabase || (!pid && !sessionId)) return null;
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
      // Prefer the spawner-MINTED id: the child registers under exactly that value, so this is a
      // direct lookup rather than a join against a launcher pid that has already exited.
      const { data: session } = sessionId
        ? await supabase.from('claude_sessions')
          .select('session_id, heartbeat_at, loop_state').eq('session_id', sessionId).maybeSingle()
        : await supabase.from('claude_sessions')
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
 * @param {Function} [opts.buildInvocationFn] - ({role,callsign,profileDir,resumeUuid,startupPrompt})=>invocation ; defaults to buildLiveSpawnInvocation
 * @param {string|null} [opts.startupPrompt]  - keepalive prompt for each respawned tab; omit for the canonical FLEET_WORKER_STARTUP_PROMPT, null to opt out
 * @param {Function} [opts.spawnFn]           - (program,args,env)=>child ; ONLY invoked when live
 * @param {Function} [opts.logFn]             - async (supabase,event)=>result ; defaults to logCoordinationEvent
 * @param {Function} [opts.resolveProfileDirFn] - (name,opts)=>dir ; defaults to resolveProfileDir
 * @param {Function} [opts.coordinatorResolverFn] - (supabase)=>Promise<sessionId|null> ; SD-LEO-INFRA-FLEET-CANNOT-SELF-001 FR-3, defaults to getActiveCoordinatorId
 * @param {Function} [opts.uptimeFn]           - ()=>seconds ; SD-LEO-INFRA-FLEET-CANNOT-SELF-001 FR-3, defaults to os.uptime
 * @param {boolean}  [opts.live]              - override; defaults to isLiveEnabled()
 * @param {Function} [opts.log]               - line logger
 * @param {Function} [opts.now]               - ()=>iso string clock
 * @returns {Promise<{live:boolean, roster:Array<object>, slotCount:number, results:Array<{callsign:string, role:string, invocation:object|null, resume_uuid:string|null, spawned:boolean, eventLogged:boolean, skip_reason?:string}>}>}
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
    coordinatorResolverFn = defaultCoordinatorResolverFn,
    uptimeFn = () => os.uptime(),
    log = () => {},
    now = () => new Date().toISOString(),
  } = opts;
  const live = opts.live ?? isLiveEnabled();
  // SD-...-PROMPT-LIBRARY-001-D FR-3a — RESOLUTION MOVED INSIDE THE PER-SLOT LOOP. The previous
  // comment here said "resolve ONCE per run, not per slot" (QF-20260724-290). That was correct while
  // every slot got the same worker prompt; it is WRONG now that the prompt is keyed on the CALLSIGN
  // NAMESPACE, because no callsign is in scope at this point — the loop below binds it at `slot.name`.
  //
  // THIS IS THE HIGHEST-RISK LINE IN THE SD. fleet_desired_slots currently holds exactly ONE row,
  // Canary-pilot, so this runner is the ONLY path the fleet ever respawns. Hoisting the resolution
  // back out of the loop silently hands that canary the claiming-worker directive while every other
  // test stays green. See the mixed-namespace roster test that pins this.
  //
  // The explicit-key opt-out is PRESERVED: a caller passing startupPrompt (including null) still
  // overrides for every slot, unchanged. Only the DEFAULT path became per-slot.
  const startupPromptOverridden = 'startupPrompt' in opts;
  const startupPromptOverride = startupPromptOverridden ? opts.startupPrompt : undefined;

  const slots = await loadFn(supabase);
  const roster = rosterFn(slots);
  log(`[reboot-respawn] loaded ${slots.length} desired slot(s); live=${live}; roster=${JSON.stringify(roster)}`);

  const results = [];
  for (const slot of slots) {
    const role = slot.role || 'worker';
    const callsign = slot.name;
    const resumeUuid = slot.resume_uuid || null;

    // SD-LEO-INFRA-FLEET-CANNOT-SELF-001 FR-3 — coordinator-only, boot-window-gated dedup guard.
    // Adam/Solomon already have their own adequate singleton guards (singleton-spawn-decision.mjs's
    // decideSingleAdamGuard/decideSingleSolomonGuard), which fire downstream of this runner at their
    // own session startup, so they need no new check here. Coordinator is the one role
    // singleton-spawn-decision.mjs documents as "NEVER REFUSED... silent takeover is designed
    // behaviour" — correct for an operator deliberately starting a fresh coordinator, wrong for THIS
    // runner firing on a false trigger (e.g. an operator validating the newly-installed scheduled
    // task via `schtasks /Run`) outside a genuine reboot. Reuses getActiveCoordinatorId (via
    // coordinatorResolverFn) rather than any of this codebase's other liveness/freshness predicates.
    let skipReason = null;
    if (role === 'coordinator') {
      const uptimeMs = Number(uptimeFn()) * 1000;
      const withinBootWindow = Number.isFinite(uptimeMs) && uptimeMs < BOOT_WINDOW_MS;
      if (!withinBootWindow) {
        let liveCoordinatorId = null;
        try {
          liveCoordinatorId = await coordinatorResolverFn(supabase);
        } catch (e) {
          // Fail TOWARD attempting the spawn — an uncertain/unreliable liveness read must never
          // suppress a legitimate restore. liveCoordinatorId stays null; the slot proceeds below.
          log(`[reboot-respawn] coordinator liveness check failed for ${callsign}, proceeding with spawn: ${e && e.message}`);
        }
        if (liveCoordinatorId) {
          skipReason = 'coordinator_already_live';
          log(`[reboot-respawn] SKIPPING ${callsign}: live coordinator ${liveCoordinatorId} already resolved outside the post-boot window (uptime=${Math.round(uptimeMs / 1000)}s)`);
        }
      }
    }

    // SD-LEO-INFRA-FLEET-CANNOT-SELF-001 FR-1 — CHANGED from fail-soft (a bad/absent profile
    // degraded to no CLAUDE_CONFIG_DIR and still spawned un-isolated) to fail-loud-but-locally-
    // scoped: skip ONLY this slot, every other slot still gets attempted. fleet_desired_slots is a
    // curated, singleton-only manifest (FR-2) — every row is expected to carry an explicit
    // account_profile (a real name or the 'host-default' sentinel), so an absent or unresolvable
    // one is no longer a benign, expected state the way it legitimately still is for an arbitrary
    // spawn-control.js spawn() caller (that fail-soft policy is deliberately UNCHANGED there — see
    // its own comment — because most ordinary workers correctly carry no account_profile at all).
    let profileDir = null;
    if (!skipReason) {
      if (!slot.account_profile) {
        skipReason = 'no_account_profile';
        log(`[reboot-respawn] SKIPPING ${callsign}: no account_profile recorded (not even 'host-default') — refusing to launch un-isolated`);
      } else {
        try {
          profileDir = resolveProfileDirFn(slot.account_profile, opts);
        } catch (e) {
          skipReason = 'profile_resolve_failed';
          log(`[reboot-respawn] SKIPPING ${callsign}: profile resolve failed for '${slot.account_profile}': ${e && e.message}`);
        }
      }
    }

    let invocation = null;
    let spawned = false;
    let child = null;
    if (!skipReason) {
    // FR-3a: resolve the prompt HERE, where `callsign` is finally in scope.
    // QF-20260727-488: `role` is threaded in too — it has been in scope since :186, unused by
    // prompt selection until now.
    const startupPrompt = startupPromptOverridden
      ? startupPromptOverride
      : await defaultStartupPrompt(callsign, role, log);

    // FR-3: forward opts so the minted --session-id is injectable (uuidFn) rather than only
    // reachable via crypto.randomUUID inside the builder.
    invocation = buildInvocationFn({ role, callsign, profileDir, resumeUuid, startupPrompt }, opts);

    if (live && typeof spawnFn === 'function') {
      try {
        // SD-LEO-INFRA-SESSION-SPAWN-AND-PROMPT-LIBRARY-001-F (FR-1): enforce the launch contract at
        // the EXECUTION seam. This is the HIGHEST-VALUE of the three, because buildInvocationFn above
        // is caller-INJECTABLE — it is the only path by which a non-conformant invocation can reach a
        // live spawn without editing the builder or manipulating env.
        //
        // FR-3: deliberately INSIDE the live guard. reboot-respawn-drill-runner.test.js:260 injects a
        // degenerate invocation with live:false to prove a resume-masking check fires; that degenerate
        // input is LOAD-BEARING for the test, and asserting outside this guard would abort before the
        // check runs and destroy the test's purpose. Inside the guard it never reaches that test, so no
        // opt-out flag is needed — one would be dead code.
        //
        // FR-2: STRUCTURAL clauses only. The fail-SOFT profile degrade documented above (an
        // unresolvable profile still spawns, without CLAUDE_CONFIG_DIR) is preserved exactly —
        // expectProfile stays FALSE, so that policy is untouched by this SD.
        //
        // SCOPE OF THE CHECK: it inspects the DECLARED invocation.env, not the merged child
        // environment — reboot-respawn.cjs spreads process.env under invocation.env (and, unlike
        // spawn-control, does not strip inherited CLAUDE_* session markers). So this proves declared
        // intent about the launch shape, never the child's effective environment.
        const contract = assertLaunchContract(invocation);
        if (!contract.ok) {
          throw new Error(`LAUNCH CONTRACT VIOLATION — refusing to respawn ${role}/${callsign}: ${contract.violations.join('; ')}`);
        }
        // SD-LEO-INFRA-SESSION-SPAWN-AND-PROMPT-LIBRARY-001-E FR-4 — PRE-REGISTER A CANARY SLOT.
        //
        // THIS PATH IS THE WORST CASE and the reason FR-4 could not be metadata-only: this runner
        // writes NO canary metadata at any point, so account_profile and fleet_identity.callsign are
        // not merely late here, they never arrive. A canary respawned at boot was therefore
        // indistinguishable from an ordinary worker for its entire life, and the claim fence had
        // nothing to read. The spawner-minted invocation.sessionId is the only signal available
        // before the process exists.
        //
        // Immediately before spawnFn on purpose: the child can check in within milliseconds.
        //
        // FAIL CLOSED, DELIBERATELY AGAINST THIS FILE'S FAIL-SOFT HOUSE STYLE (an unresolvable profile
        // above degrades and still spawns). That policy is right for a profile dir and wrong for a
        // safety marker: an unmarked canary passes the claim fence and takes real work off the shared
        // queue. Throwing here is caught by this block's existing handler, which logs and leaves
        // spawned=false, so the blast radius is EXACTLY this slot — every other slot still respawns and
        // the fleet still comes back from a reboot, minus one probe.
        if (slot.account_profile === CANARY_PROFILE) {
          const { writeCanaryPreRegistration } = await import('./canary-session.js');
          const preReg = await writeCanaryPreRegistration(supabase, invocation.sessionId, { callsign, reason: 'reboot_respawn' });
          if (!preReg.ok) {
            throw new Error(`CANARY PRE-REGISTRATION FAILED — refusing to respawn ${callsign} unmarked: ${preReg.error}`);
          }
        }
        child = spawnFn(invocation.program, invocation.args, invocation.env);
        spawned = true;
        log(`[reboot-respawn] respawned ${role}/${callsign} (resume=${resumeUuid || 'none'})`);
      } catch (e) {
        log(`[reboot-respawn] spawn FAILED for ${callsign}: ${e && e.message}`);
      }
    } else {
      log(`[reboot-respawn] DRY-RUN would respawn ${role}/${callsign}: ${invocation.program} ${invocation.args.join(' ')}`);
    }
    } // end `if (!skipReason)` — SD-LEO-INFRA-FLEET-CANNOT-SELF-001 FR-1/FR-3

    // QF-20260724-911: payload.live is derived FROM ground-truth reconciliation, not from spawnFn()
    // having returned without throwing -- see reconcileSpawnedSession() above.
    // F1: pass the MINTED id (invocation.sessionId) alongside the launcher pid so reconciliation
    // joins on the value the child actually registers under.
    const sessionId = spawned && child && child.pid
      ? await reconcileSpawnedSession(supabase, { pid: child.pid, sessionId: invocation.sessionId }, opts)
      : null;
    const boundLive = sessionId !== null;
    // QF-20260725-813 (FOURTH instance of the lost-live family; QF-20260724-499 threaded live into
    // the restart + relaunch legs and missed THIS one). THE SEAM FIX, not a per-leg patch: a LIVE
    // request that never reached spawnFn used to emit outcome:'dry_run' — byte-identical to a
    // deliberate mechanism check. Intent was not lost at the boundary (opts.live arrives fine); it was
    // ERASED HERE, because outcome collapsed "live requested but unattempted" into "dry run by design".
    // spawnFn DEFAULTS TO null, so any caller that omits it (e.g. scripts/fleet/start-cp3-drills.js)
    // silently took this path with live:true.
    // WHY IT WAS CRITICAL: the drill's evidence guard counts 'dry_run' as a valid event, so a live
    // acceptance run that spawned nothing self-reported GREEN having proven nothing — a false ACCEPT.
    // 'respawn_unattempted' is therefore a DISTINCT outcome, never conflated with dry_run, and
    // live_requested carries the INTENT end-to-end alongside boundLive's ground-truth ACHIEVEMENT
    // (QF-20260724-911's invariant is preserved exactly: payload.live still derives from reconciliation,
    // never from spawnFn returning without throwing).
    // SD-LEO-INFRA-FLEET-CANNOT-SELF-001 FR-1/FR-3: a skipped slot gets its OWN distinct outcome,
    // never conflated with 'dry_run' (which means "would have spawned, live is just off") — a skip
    // means this slot was deliberately NOT attempted at all, live or not.
    const outcome = skipReason
      ? `skipped_${skipReason}`
      : (boundLive
        ? 'ok'
        : (spawned ? 'respawn_unbound' : (live ? 'respawn_unattempted' : 'dry_run')));

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
          // QF-20260725-813: the REQUESTED intent, carried end-to-end so a reader can always tell a
          // live attempt that achieved nothing (live_requested:true, live:false) apart from a
          // deliberate dry run (both false). Without this the two were indistinguishable downstream.
          live_requested: live,
          outcome,
          // SD-LEO-INFRA-FLEET-CANNOT-SELF-001 FR-1/FR-3: null on every non-skipped slot, unchanged
          // shape from before this SD.
          skip_reason: skipReason,
          at: now(),
        },
      });
      eventLogged = !!(res && res.ok);
    } catch { /* fail-open: event emission never blocks a respawn outcome */ }

    results.push({ callsign, role, invocation, resume_uuid: resumeUuid, spawned, live: boundLive, session_id: sessionId, eventLogged, skip_reason: skipReason });
  }

  return { live, roster, slotCount: slots.length, results };
}
