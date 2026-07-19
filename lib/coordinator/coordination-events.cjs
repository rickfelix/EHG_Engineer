/**
 * Coordination Observability — flag gate, read-only data gatherer, and
 * fail-open event writer (epic #4).
 *
 * SD-LEO-INFRA-COORDINATION-OBSERVABILITY-ANOMALY-001
 *
 * CommonJS (.cjs) — require()-able by scripts/stale-session-sweep.cjs. The
 * detectors (detectors.cjs) are pure; this module decides whether the feature
 * is enabled, gathers the (READ-ONLY) fleet-state inputs, and persists matches
 * to coordination_events. Persisting is FAIL-OPEN end to end. Default-OFF flag
 * mirrors FLEET_MC_SWEEP_GATE (stale-session-sweep.cjs:41).
 *
 * @module lib/coordinator/coordination-events
 */

'use strict';

const { runDetectors, detectInertWorkerRevival, detectCompletionBoundaryExit } = require('./detectors.cjs');
// SD-LEO-INFRA-COORDINATOR-DISPATCH-TARGET-001: route this alert insert through the
// validated dispatch guard. target_session here is the 'broadcast-coordinator' sentinel,
// which the guard short-circuits (no live-session lookup) — behavior is preserved.
const { insertCoordinationRow } = require('./dispatch.cjs');
// SD-LEO-INFRA-ROLE-SESSION-HANDOFF-PROTOCOL-001-A / FR-2: auto-resolve SPLIT_BRAIN via
// the same election helpers already proven in resolve.cjs (GG: reuse, don't re-implement).
const { isTwoWayV2Enabled, pickCanonicalCoordinator, clearCoordinatorFlagFromSession, STALE_THRESHOLD_MIN } = require('./resolve.cjs');

/** detector_version stamped on every emitted coordination_events row. */
const DETECTOR_VERSION = 'COORD_DETECTORS_V2';

/** Holding statuses that mean a session is actively claiming work. */
const HOLDING_STATUSES = new Set(['active', 'idle']);

// SD-LEO-INFRA-COUNT-TRUNCATION-DISCIPLINE-001 FR-6: detector inputs are processed/counted
// reads — a read silently capped at the PostgREST 1000-row max would mis-fire or suppress
// events. Paginate to completion; each site keeps its pre-existing fail-open policy
// (fetchAllPaginated throws → caught by the site's try/catch).
let _fapModule = null;
async function fapPaginate(queryFactory, opts) {
  _fapModule ||= await import('../db/fetch-all-paginated.mjs');
  return _fapModule.fetchAllPaginated(queryFactory, opts);
}

function coordDetectorsEnabled(env) {
  env = env || process.env;
  return String(env.COORD_DETECTORS_V2 ?? 'false').toLowerCase() !== 'false';
}

function resolveThresholds(env) {
  env = env || process.env;
  return {
    coordinatorFreshMs: (Number(env.COORD_COORDINATOR_FRESH_SEC) || 600) * 1000,
    replyStarvationMs: (Number(env.COORD_REPLY_STARVATION_T_SEC) || 1800) * 1000,
    stuckWorkerMs: (Number(env.COORD_STUCK_WORKER_X_MIN) || 60) * 60 * 1000,
    // SD-FDBK-INFRA-DEPLOY-GAP-DETECTOR-001: grace window before a running session on stale code is flagged.
    deployGapMs: (Number(env.COORD_DEPLOY_GAP_MIN) || 240) * 60 * 1000,
    // SD-LEO-INFRA-LOOP-LIVENESS-DETECTORS-001: warn at 6 days (7-day hard-expiry looms); "looks alive" = 10 min.
    loopExpiryWarnMs: (Number(env.COORD_LOOP_EXPIRY_WARN_MIN) || 8640) * 60 * 1000,
    stalledLoopFreshMs: (Number(env.COORD_STALLED_LOOP_FRESH_MIN) || 10) * 60 * 1000,
    // SD-LEO-INFRA-REVIVE-EVA-HEARTBEAT-ALARM-001: EVA scheduler down if last_poll_at older than 15 min (~15 missed ~60s polls).
    evaSchedulerStaleMs: (Number(env.COORD_EVA_SCHEDULER_STALE_MIN) || 15) * 60 * 1000,
  };
}

// SD-FDBK-INFRA-DEPLOY-GAP-DETECTOR-001: latest-merge committer-time (ms) per role's code paths.
// ONE git call per role per sweep tick (not per session). Fail-open: any git/parse failure → 0,
// which makes detectDeployGap SKIP that role (never a false flag). %ct is epoch-seconds, locale/TZ-agnostic.
function computeMergesByRole(repoRoot) {
  let ROLE_CODE_PATHS = {};
  try { ROLE_CODE_PATHS = require('./detectors.cjs').ROLE_CODE_PATHS || {}; } catch (_) { return {}; }
  const { execSync } = require('child_process');
  const out = {};
  for (const role of Object.keys(ROLE_CODE_PATHS)) {
    try {
      const paths = ROLE_CODE_PATHS[role];
      const ct = execSync(`git log -1 --format=%ct -- ${paths.join(' ')}`, {
        cwd: repoRoot, encoding: 'utf8', timeout: 10000, stdio: ['ignore', 'pipe', 'ignore'],
      }).trim();
      const secs = parseInt(ct, 10);
      out[role] = Number.isFinite(secs) ? secs * 1000 : 0;
    } catch (_) { out[role] = 0; }
  }
  return out;
}

function tsMs(ts) {
  if (!ts) return 0;
  const hasTZ = /Z$|[+-]\d{2}:?\d{2}$/.test(String(ts));
  const n = new Date(hasTZ ? ts : ts + 'Z').getTime();
  return Number.isFinite(n) ? n : 0;
}

/**
 * Build the detector input bundle from the live DB. READ-ONLY (selects only).
 * Best-effort / fail-soft: a failed sub-query degrades that one input to
 * empty/0 rather than throwing. Never writes anything.
 *
 * @param {object} supabase - Supabase service client
 * @param {object} [opts] - { now, coordinatorFreshMs }
 * @returns {Promise<object>} bundle consumed by runDetectors
 */
async function gatherDetectorInputs(supabase, opts) {
  opts = opts || {};
  const now = opts.now ?? Date.now();
  const freshMs = opts.coordinatorFreshMs ?? 600000;

  const bundle = {
    coordinatorCount: 0, coordinators: [],
    adamCount: 0, adams: [], // SD-LEO-INFRA-ROLE-SESSION-HANDOFF-PROTOCOL-001-C (FR-1): MULTIPLE_ADAMS feed
    idleWorkers: 0, unclaimedItems: 0,
    signals: [], claims: [], sessions: [], sdClaims: [],
  };

  // 1) claude_sessions — derive coordinators, idle workers, sessions, claims.
  let sessions = [];
  try {
    const { data } = await supabase
      .from('claude_sessions')
      // SD-FDBK-INFRA-DEPLOY-GAP-DETECTOR-001: + created_at (immutable session-start anchor for DEPLOY_GAP).
      // SD-LEO-INFRA-LOOP-LIVENESS-DETECTORS-001: + loop_state, expected_silence_until (loop-liveness detectors).
      .select('session_id, sd_key, status, heartbeat_at, metadata, current_phase, created_at, loop_state, expected_silence_until')
      // ROWCAP-CANONICAL-001: order newest-first so the PostgREST 1000-row cap drops only the
      // STALEST sessions — every derivation below is fresh()-gated, so this is behavior-preserving
      // while ensuring the newest live/coordinator/adam sessions are never truncated out.
      .order('heartbeat_at', { ascending: false });
    sessions = data || [];
  } catch (_) { sessions = []; }

  const fresh = (s) => (now - tsMs(s.heartbeat_at)) <= freshMs;
  const coordinators = sessions.filter((s) => s.metadata && String(s.metadata.is_coordinator) === 'true' && fresh(s));
  bundle.coordinators = coordinators;
  bundle.coordinatorCount = coordinators.length;
  // SD-LEO-INFRA-ROLE-SESSION-HANDOFF-PROTOCOL-001-C (FR-1): fresh role=adam sessions feed the
  // MULTIPLE_ADAMS detector (the Adam analogue of coordinatorCount). Same `sessions` fetch — no extra query.
  const adams = sessions.filter((s) => s.metadata && String(s.metadata.role) === 'adam' && fresh(s));
  bundle.adams = adams.map((s) => ({ session_id: s.session_id }));
  bundle.adamCount = adams.length;
  bundle.idleWorkers = sessions.filter((s) => !s.sd_key && HOLDING_STATUSES.has(s.status) && fresh(s)).length;
  // SD-FDBK-INFRA-DEPLOY-GAP-DETECTOR-001: preserve created_at + metadata so detectDeployGap can
  // anchor on session start time and resolve role.
  // SD-LEO-INFRA-LOOP-LIVENESS-DETECTORS-001: also preserve loop_state, heartbeat_at, expected_silence_until
  // so detectLoopExpiry / detectStalledLoop can anchor on loop liveness.
  bundle.sessions = sessions.filter((s) => HOLDING_STATUSES.has(s.status)).map((s) => ({ session_id: s.session_id, sd_key: s.sd_key, created_at: s.created_at, metadata: s.metadata, loop_state: s.loop_state, heartbeat_at: s.heartbeat_at, expected_silence_until: s.expected_silence_until }));
  // Latest-merge times per role for DEPLOY_GAP (fail-open → {} on any error; repoRoot = repo top from this file).
  try { bundle.mergesByRole = computeMergesByRole(require('path').resolve(__dirname, '../..')); } catch (_) { bundle.mergesByRole = {}; }

  // 2) strategic_directives_v2 — sdClaims, unclaimed SDs, and claim phase/updated_at.
  let sds = [];
  try {
    const data = await fapPaginate(() => supabase
      .from('strategic_directives_v2')
      .select('sd_key, claiming_session_id, status, current_phase, updated_at, is_working_on')
      .not('status', 'in', '(completed,cancelled,archived,superseded,deferred)')
      .order('sd_key')); // unique-key tiebreaker for stable pagination
    sds = data || [];
  } catch (_) { sds = []; }

  const sdByKey = new Map(sds.map((s) => [s.sd_key, s]));
  bundle.sdClaims = sds.filter((s) => s.claiming_session_id).map((s) => ({ sd_key: s.sd_key, claiming_session_id: s.claiming_session_id }));
  let unclaimedSds = sds.filter((s) => !s.claiming_session_id && !s.is_working_on && s.status !== 'blocked').length;

  // claims = sessions holding an sd_key, enriched with the SD's phase + updated_at.
  bundle.claims = sessions
    .filter((s) => s.sd_key && HOLDING_STATUSES.has(s.status))
    .map((s) => {
      const sd = sdByKey.get(s.sd_key);
      return {
        session_id: s.session_id,
        sd_key: s.sd_key,
        current_phase: (sd && sd.current_phase) || s.current_phase || null,
        heartbeat_at: s.heartbeat_at,
        sd_updated_at: sd ? sd.updated_at : null,
      };
    });

  // 3) quick_fixes — unclaimed QFs add to the unclaimed-item supply.
  let unclaimedQfs = 0;
  try {
    // FR-6: exact head-count gauge (never rows.length — the 1000-row cap can hide supply).
    const { count, error } = await supabase
      .from('quick_fixes')
      .select('id', { count: 'exact', head: true })
      .is('claiming_session_id', null)
      .in('status', ['open', 'in_progress']);
    unclaimedQfs = (!error && Number.isFinite(count)) ? count : 0;
  } catch (_) { unclaimedQfs = 0; }
  bundle.unclaimedItems = unclaimedSds + unclaimedQfs;

  // 4) session_coordination — recent worker signals for REPLY_STARVATION.
  try {
    const sinceIso = new Date(now - 24 * 3600 * 1000).toISOString();
    const { data } = await supabase
      .from('session_coordination')
      .select('id, sender_session, sender_type, message_type, acknowledged_at, read_at, payload, created_at')
      .gte('created_at', sinceIso)
      .order('created_at', { ascending: false })
      .limit(500);
    bundle.signals = data || [];
  } catch (_) { bundle.signals = []; }

  // 5) eva_scheduler_heartbeat — the EVA dispatch scheduler's liveness row(s) for EVA_SCHEDULER_STALE
  // (SD-LEO-INFRA-REVIVE-EVA-HEARTBEAT-ALARM-001). last_poll_at is the trustworthy anchor; status is
  // intentionally NOT relied on (it freezes on the last value when the process dies). Fail-open → null.
  try {
    const { data } = await supabase
      .from('eva_scheduler_heartbeat')
      .select('id, instance_id, last_poll_at, status');
    bundle.evaSchedulerHeartbeat = data || null;
  } catch (_) { bundle.evaSchedulerHeartbeat = null; }

  // 6) v_sd_completion_integrity — RECENT ghost completions for GHOST_COMPLETION
  // (SD-FDBK-FIX-LFA-ACCEPT-CANONICAL-001 (d)). Windowed to the last 6h so the
  // ~275 pre-fix historical ghosts (separate governed backfill) don't fire every
  // sweep — only a fresh regression of the recorder's canonical write surfaces.
  try {
    const sinceIso = new Date(now - 6 * 3600 * 1000).toISOString();
    const { data } = await supabase
      .from('v_sd_completion_integrity')
      .select('sd_key, updated_at, is_ghost_completed')
      .eq('is_ghost_completed', true)
      .gte('updated_at', sinceIso)
      .limit(50);
    bundle.ghostCompletions = data || [];
  } catch (_) { bundle.ghostCompletions = []; }

  return bundle;
}

/**
 * Insert one coordination_events row. FAIL-OPEN: never throws.
 * @param {object} supabase
 * @param {{ event_type, severity, session_id?, sd_key?, payload? }} event
 * @returns {Promise<{ ok: boolean, id?: string, error?: string }>}
 */
async function logCoordinationEvent(supabase, event) {
  try {
    const row = {
      event_type: event.event_type,
      severity: event.severity || 'info',
      session_id: event.session_id ?? null,
      sd_key: event.sd_key ?? null,
      detector_version: DETECTOR_VERSION,
      payload: event.payload ?? {},
    };
    const { data, error } = await supabase.from('coordination_events').insert(row).select('id').single();
    if (error) {
      console.warn(`   ⚠️  [COORD_EVENT_WRITE_FAILED] ${event.event_type}: ${error.message} (non-fatal)`);
      return { ok: false, error: error.message };
    }
    return { ok: true, id: data.id };
  } catch (e) {
    console.warn(`   ⚠️  [COORD_EVENT_WRITE_THREW] ${event && event.event_type}: ${(e && e.message) || e} (non-fatal)`);
    return { ok: false, error: String((e && e.message) || e) };
  }
}

/**
 * Run the detectors over an injected bundle and (flag on) log each match.
 * Returns the structured matches so the caller can also print visible flags.
 * FAIL-OPEN; OFF flag → [] with ZERO writes.
 * @param {object} supabase
 * @param {object} data - bundle from gatherDetectorInputs (or a test fixture)
 * @param {object} [opts] - { env, now, priorPhases }
 * @returns {Promise<Array<object>>}
 */
async function runAndLogDetectors(supabase, data, opts) {
  opts = opts || {};
  const env = opts.env || process.env;
  if (!coordDetectorsEnabled(env)) return [];
  const thresholds = resolveThresholds(env);
  let matches = [];
  try {
    matches = runDetectors(data, {
      now: opts.now,
      replyStarvationMs: thresholds.replyStarvationMs,
      stuckWorkerMs: thresholds.stuckWorkerMs,
      priorPhases: opts.priorPhases,
      deployGapMs: thresholds.deployGapMs, // SD-FDBK-INFRA-DEPLOY-GAP-DETECTOR-001
      // SD-LEO-INFRA-LOOP-LIVENESS-DETECTORS-001
      loopExpiryWarnMs: thresholds.loopExpiryWarnMs,
      stalledLoopFreshMs: thresholds.stalledLoopFreshMs,
      // SD-LEO-INFRA-REVIVE-EVA-HEARTBEAT-ALARM-001
      evaSchedulerStaleMs: thresholds.evaSchedulerStaleMs,
    });
  } catch (e) {
    console.warn(`   ⚠️  [COORD_DETECTORS_THREW] ${(e && e.message) || e} (non-fatal)`);
    return [];
  }
  const out = [];
  for (const m of matches) {
    const res = await logCoordinationEvent(supabase, {
      event_type: m.event_type,
      severity: m.severity,
      session_id: (data && data.contextSessionId) ?? null,
      sd_key: (data && data.contextSdKey) ?? null,
      payload: { reason: m.reason, evidence: m.evidence },
    });
    out.push(Object.assign({}, m, { logged: res.ok }));
  }

  // SD-LEO-INFRA-ROLE-SESSION-HANDOFF-PROTOCOL-001-A / FR-2: flag-gated SPLIT_BRAIN auto-resolve.
  // After all events are logged, if any match is SPLIT_BRAIN and the flag is ON, elect the
  // canonical winner from a SINGLE snapshot and retire all other holders. Fail-open: never throws,
  // never blocks the sweep. Idempotent: ≤1 holder in the snapshot → no-op.
  if (isTwoWayV2Enabled() && out.some((m) => m.event_type === 'SPLIT_BRAIN')) {
    try {
      const cutoff = new Date((opts.now ?? Date.now()) - STALE_THRESHOLD_MIN * 60_000).toISOString();
      // FR-6 GUARD read for the retire mutation below — paginated so a capped snapshot can
      // never elect against a partial holder set; on failure the catch below SKIPS retirement.
      const snapshot = await fapPaginate(() => supabase
        .from('claude_sessions')
        .select('session_id, heartbeat_at, metadata')
        .gte('heartbeat_at', cutoff)
        .filter('metadata->>is_coordinator', 'eq', 'true')
        .order('session_id')); // unique-key tiebreaker for stable pagination
      if (Array.isArray(snapshot) && snapshot.length > 1) {
        const winner = pickCanonicalCoordinator(snapshot);
        if (winner) {
          // Clear all holders EXCEPT the winner. Use the snapshot for consistency —
          // do NOT re-query so the winner session_id never gets cleared.
          for (const row of snapshot) {
            if (row.session_id !== winner.session_id) {
              try { await clearCoordinatorFlagFromSession(supabase, row.session_id); } catch { /* fail-open */ }
            }
          }
        }
      }
      // ≤1 holder → already resolved; no-op.
    } catch (guardErr) {
      // GUARD_UNAVAILABLE: holder-snapshot read failed — SKIP retirement this sweep (never act
      // on a failed/partial read). Fail-open — never throw, never block the sweep.
      try { console.warn(`GUARD_UNAVAILABLE: SPLIT_BRAIN auto-resolve skipped this sweep — ${(guardErr && guardErr.message) || 'unknown'}`); } catch { /* noop */ }
    }
  }

  return out;
}

/**
 * Default-OFF flag for the inert-worker-revival surfacing feature
 * (SD-LEO-INFRA-SURFACE-INERT-WORKER-001). Independent of COORD_DETECTORS_V2 so
 * the operator alert can roll out / back separately. Mirrors coordDetectorsEnabled.
 */
function inertWorkerDetectorEnabled(env) {
  env = env || process.env;
  return String(env.SURFACE_INERT_WORKER_V1 ?? 'false').toLowerCase() !== 'false';
}

/** Inert-worker age threshold (ms) from INERT_WORKER_AGE_MIN (default 360 min). */
function inertWorkerThresholdMs(env) {
  env = env || process.env;
  return (Number(env.INERT_WORKER_AGE_MIN) || 360) * 60 * 1000;
}

/**
 * Canonical paste-able fleet-worker /loop startup prompt embedded in the operator
 * alert (FR-2). The coordinator cannot restore worker capacity on this host (no
 * spawn-executor consumes worker_spawn_requests); pasting this into an idle Claude
 * Code window is the only path that wakes a worker today. Single source of truth
 * (coordinator.md has no marked prompt block); concise + actionable.
 */
const FLEET_WORKER_STARTUP_PROMPT = [
  '/loop You are an autonomous LEO fleet worker under the active coordinator. Each pass:',
  '1) Check in AS a loop step: run /checkin (or read your session_coordination inbox) and act on any coordinator directive. NEVER hand-roll a bounded Bash poll loop to wait for work — it overshoots the 120000ms Bash timeout and exit-143s; the /loop + step-6 ScheduleWakeup cadence is the re-poll mechanism.',
  '2) Run "npm run sd:next" and claim the highest-priority workable SD with "node scripts/sd-start.js <SD-KEY>" (or resume one you already hold).',
  '3) Drive it LEAD->PLAN->EXEC via "node scripts/handoff.js execute <PHASE> <SD-KEY>"; invoke the required sub-agents (Task tool) before each handoff so fresh evidence exists.',
  '4) Re-affirm your claim (re-run sd-start, idempotent) after long sub-agent runs and before each handoff.',
  '5) Route any blocker to the coordinator via "node scripts/worker-signal.cjs <type> <msg>"; never stop for the human.',
  '6) MANDATORY: ScheduleWakeup at the END of EVERY pass (short delay if work is in-flight, ~20min if idle) — NOT only when no SD is workable. A /loop only re-fires on a wakeup tick, so ending a pass without one = SILENT incognito (the #1 attrition cause; your idle worktree then gets reaped by the claim-sweep). Do NOT emit a bare /compact and stop.',
  '7) To END the loop on purpose, set claude_sessions.loop_state to exited for your session, then stop. NEVER run /coordinator stop.',
].join('\n');

/** Build the inert-worker detector input from the live DB. READ-ONLY, fail-soft. */
async function gatherInertWorkerInputs(supabase) {
  let requests = [];
  try {
    const { data } = await supabase
      .from('worker_spawn_requests')
      .select('id, requested_callsign, status, requested_at, fulfilled_at, expires_at')
      .eq('status', 'pending')
      .is('fulfilled_at', null);
    requests = data || [];
  } catch (_) { requests = []; }
  return { requests };
}

/**
 * Emit ONE de-duped operator alert (session_coordination INFO + payload.kind).
 * FAIL-OPEN. Skips when an unacknowledged, unexpired inert_worker_alert exists.
 * No new coordination_message_type enum value (INFO + payload discrimination).
 * @returns {Promise<{ ok: boolean, skipped?: boolean, id?: string, error?: string }>}
 */
async function emitInertWorkerAlert(supabase, evidence, opts) {
  opts = opts || {};
  const nowMs = opts.now ?? Date.now();
  try {
    const nowIso = new Date(nowMs).toISOString();
    const { data: dupes } = await supabase
      .from('session_coordination')
      .select('id')
      .eq('message_type', 'INFO')
      .eq('payload->>kind', 'inert_worker_alert')
      .is('acknowledged_at', null)
      .gt('expires_at', nowIso)
      .limit(1);
    if (dupes && dupes.length > 0) {
      return { ok: true, skipped: true, id: dupes[0].id };
    }
    const aged = (evidence && evidence.aged_count) || 0;
    const expiresAt = new Date(nowMs + 24 * 3600 * 1000).toISOString();
    const body = 'Worker-revival is INERT on this host: ' + aged + ' pending worker_spawn_requests are aged past threshold with no spawn-executor consuming them. The coordinator cannot restore worker capacity automatically. Paste the prompt below into an idle Claude Code window to wake a worker:\n\n' + FLEET_WORKER_STARTUP_PROMPT;
    const row = {
      target_session: 'broadcast-coordinator',
      sender_type: 'sweep',
      message_type: 'INFO',
      subject: '[INERT_WORKER_ALERT] ' + aged + ' aged spawn request(s) unconsumed - paste prompt to wake a worker',
      body,
      payload: { kind: 'inert_worker_alert', severity: 'critical', aged_count: aged, evidence },
      expires_at: expiresAt,
    };
    const { data, error } = await insertCoordinationRow(supabase, row, { select: 'id', single: true });
    if (error) {
      console.warn('   [INERT_WORKER_ALERT_FAILED] ' + error.message + ' (non-fatal)');
      return { ok: false, error: error.message };
    }
    return { ok: true, id: data.id };
  } catch (e) {
    console.warn('   [INERT_WORKER_ALERT_THREW] ' + ((e && e.message) || e) + ' (non-fatal)');
    return { ok: false, error: String((e && e.message) || e) };
  }
}

/**
 * Flag-gated, fail-open: detect inert worker-revival and (on match) emit ONE
 * de-duped operator alert. OFF flag => null with ZERO reads/writes.
 * @returns {Promise<{ matched: boolean, aged_count?: number, alert?: object } | null>}
 */
async function runInertWorkerSurfacing(supabase, opts) {
  opts = opts || {};
  const env = opts.env || process.env;
  if (!inertWorkerDetectorEnabled(env)) return null;
  try {
    const now = opts.now ?? Date.now();
    const inputs = await gatherInertWorkerInputs(supabase);
    const res = detectInertWorkerRevival({ requests: inputs.requests, now, thresholdMs: inertWorkerThresholdMs(env) });
    if (!res.matched) return { matched: false };
    const alert = await emitInertWorkerAlert(supabase, res.evidence, { now });
    return { matched: true, aged_count: res.evidence.aged_count, alert };
  } catch (e) {
    console.warn('   [INERT_WORKER_SURFACING_THREW] ' + ((e && e.message) || e) + ' (non-fatal)');
    return null;
  }
}

/**
 * QF-20260705-817: default-OFF flag for the completion-boundary-exit surfacing feature.
 * Independent of COORD_DETECTORS_V2 / SURFACE_INERT_WORKER_V1 so it can roll out/back on its own.
 */
function completionBoundaryExitDetectorEnabled(env) {
  env = env || process.env;
  return String(env.SURFACE_COMPLETION_BOUNDARY_EXIT_V1 ?? 'false').toLowerCase() !== 'false';
}

/** Build the completion-boundary-exit detector input from the live DB. READ-ONLY, fail-soft. */
async function gatherCompletionBoundaryExitInputs(supabase, opts) {
  opts = opts || {};
  const now = opts.now ?? Date.now();
  let sessions = [];
  try {
    const sinceIso = new Date(now - 24 * 3600 * 1000).toISOString();
    const data = await fapPaginate(() => supabase
      .from('claude_sessions')
      .select('session_id, sd_key, released_reason, released_at, heartbeat_at')
      .is('sd_key', null)
      .gte('released_at', sinceIso)
      .order('session_id')); // unique-key tiebreaker for stable pagination
    sessions = data || [];
  } catch (_) { sessions = []; }
  let unclaimedItems = 0;
  try {
    const [sds, qfs] = await Promise.all([
      fapPaginate(() => supabase.from('strategic_directives_v2').select('sd_key, claiming_session_id, is_working_on, status')
        .not('status', 'in', '(completed,cancelled,archived,superseded,deferred)')
        .order('sd_key')), // unique-key tiebreaker for stable pagination
      fapPaginate(() => supabase.from('quick_fixes').select('id, claiming_session_id, status')
        .is('claiming_session_id', null).in('status', ['open', 'in_progress'])
        .order('id')), // unique-key tiebreaker for stable pagination
    ]);
    const unclaimedSds = (sds || []).filter((s) => !s.claiming_session_id && !s.is_working_on && s.status !== 'blocked').length;
    unclaimedItems = unclaimedSds + (qfs || []).length;
  } catch (_) { unclaimedItems = 0; }
  return { sessions, unclaimedItems };
}

/**
 * Emit ONE de-duped operator alert for a completion-boundary loop exit. Reuses the SAME
 * FLEET_WORKER_STARTUP_PROMPT re-paste text as the inert-worker alert (single source of truth).
 * FAIL-OPEN. Skips when an unacknowledged, unexpired same-kind alert already exists.
 * @returns {Promise<{ ok: boolean, skipped?: boolean, id?: string, error?: string }>}
 */
async function emitCompletionBoundaryExitAlert(supabase, evidence, opts) {
  opts = opts || {};
  const nowMs = opts.now ?? Date.now();
  try {
    const nowIso = new Date(nowMs).toISOString();
    const { data: dupes } = await supabase
      .from('session_coordination')
      .select('id')
      .eq('message_type', 'INFO')
      .eq('payload->>kind', 'completion_boundary_exit_alert')
      .is('acknowledged_at', null)
      .gt('expires_at', nowIso)
      .limit(1);
    if (dupes && dupes.length > 0) return { ok: true, skipped: true, id: dupes[0].id };
    const exited = (evidence && evidence.exited_count) || 0;
    const expiresAt = new Date(nowMs + 24 * 3600 * 1000).toISOString();
    const body = exited + ' worker session(s) loop-exited right after completing a phase/SD, with unclaimed work waiting — no self-revival possible. Paste the prompt below into an idle Claude Code window to wake a worker:\n\n' + FLEET_WORKER_STARTUP_PROMPT;
    const row = {
      target_session: 'broadcast-coordinator',
      sender_type: 'sweep',
      message_type: 'INFO',
      subject: '[COMPLETION_BOUNDARY_EXIT] ' + exited + ' worker(s) silent-exited post-completion - paste prompt to wake',
      body,
      payload: { kind: 'completion_boundary_exit_alert', severity: 'high', exited_count: exited, evidence },
      expires_at: expiresAt,
    };
    const { data, error } = await insertCoordinationRow(supabase, row, { select: 'id', single: true });
    if (error) {
      console.warn('   [COMPLETION_BOUNDARY_EXIT_ALERT_FAILED] ' + error.message + ' (non-fatal)');
      return { ok: false, error: error.message };
    }
    return { ok: true, id: data.id };
  } catch (e) {
    console.warn('   [COMPLETION_BOUNDARY_EXIT_ALERT_THREW] ' + ((e && e.message) || e) + ' (non-fatal)');
    return { ok: false, error: String((e && e.message) || e) };
  }
}

/**
 * Flag-gated, fail-open: detect completion-boundary loop exits and (on match) emit ONE de-duped
 * operator alert. OFF flag => null with ZERO reads/writes.
 * @returns {Promise<{ matched: boolean, exited_count?: number, alert?: object } | null>}
 */
async function runCompletionBoundaryExitSurfacing(supabase, opts) {
  opts = opts || {};
  const env = opts.env || process.env;
  if (!completionBoundaryExitDetectorEnabled(env)) return null;
  try {
    const now = opts.now ?? Date.now();
    const inputs = await gatherCompletionBoundaryExitInputs(supabase, { now });
    const res = detectCompletionBoundaryExit({ sessions: inputs.sessions, unclaimedItems: inputs.unclaimedItems, now });
    if (!res.matched) return { matched: false };
    const alert = await emitCompletionBoundaryExitAlert(supabase, res.evidence, { now });
    return { matched: true, exited_count: res.evidence.exited_count, alert };
  } catch (e) {
    console.warn('   [COMPLETION_BOUNDARY_EXIT_SURFACING_THREW] ' + ((e && e.message) || e) + ' (non-fatal)');
    return null;
  }
}

module.exports = {
  DETECTOR_VERSION,
  coordDetectorsEnabled,
  resolveThresholds,
  gatherDetectorInputs,
  logCoordinationEvent,
  runAndLogDetectors,
  inertWorkerDetectorEnabled,
  inertWorkerThresholdMs,
  FLEET_WORKER_STARTUP_PROMPT,
  gatherInertWorkerInputs,
  emitInertWorkerAlert,
  runInertWorkerSurfacing,
  // QF-20260705-817
  completionBoundaryExitDetectorEnabled,
  gatherCompletionBoundaryExitInputs,
  emitCompletionBoundaryExitAlert,
  runCompletionBoundaryExitSurfacing,
  // SD-FDBK-INFRA-DEPLOY-GAP-DETECTOR-001
  computeMergesByRole,
};
