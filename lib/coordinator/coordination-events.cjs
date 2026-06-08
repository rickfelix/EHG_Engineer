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

const { runDetectors, detectInertWorkerRevival } = require('./detectors.cjs');
// SD-LEO-INFRA-COORDINATOR-DISPATCH-TARGET-001: route this alert insert through the
// validated dispatch guard. target_session here is the 'broadcast-coordinator' sentinel,
// which the guard short-circuits (no live-session lookup) — behavior is preserved.
const { insertCoordinationRow } = require('./dispatch.cjs');

/** detector_version stamped on every emitted coordination_events row. */
const DETECTOR_VERSION = 'COORD_DETECTORS_V2';

/** Holding statuses that mean a session is actively claiming work. */
const HOLDING_STATUSES = new Set(['active', 'idle']);

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
    idleWorkers: 0, unclaimedItems: 0,
    signals: [], claims: [], sessions: [], sdClaims: [],
  };

  // 1) claude_sessions — derive coordinators, idle workers, sessions, claims.
  let sessions = [];
  try {
    const { data } = await supabase
      .from('claude_sessions')
      // SD-FDBK-INFRA-DEPLOY-GAP-DETECTOR-001: + created_at (immutable session-start anchor for DEPLOY_GAP).
      .select('session_id, sd_key, status, heartbeat_at, metadata, current_phase, created_at');
    sessions = data || [];
  } catch (_) { sessions = []; }

  const fresh = (s) => (now - tsMs(s.heartbeat_at)) <= freshMs;
  const coordinators = sessions.filter((s) => s.metadata && String(s.metadata.is_coordinator) === 'true' && fresh(s));
  bundle.coordinators = coordinators;
  bundle.coordinatorCount = coordinators.length;
  bundle.idleWorkers = sessions.filter((s) => !s.sd_key && HOLDING_STATUSES.has(s.status) && fresh(s)).length;
  // SD-FDBK-INFRA-DEPLOY-GAP-DETECTOR-001: preserve created_at + metadata so detectDeployGap can
  // anchor on session start time and resolve role.
  bundle.sessions = sessions.filter((s) => HOLDING_STATUSES.has(s.status)).map((s) => ({ session_id: s.session_id, sd_key: s.sd_key, created_at: s.created_at, metadata: s.metadata }));
  // Latest-merge times per role for DEPLOY_GAP (fail-open → {} on any error; repoRoot = repo top from this file).
  try { bundle.mergesByRole = computeMergesByRole(require('path').resolve(__dirname, '../..')); } catch (_) { bundle.mergesByRole = {}; }

  // 2) strategic_directives_v2 — sdClaims, unclaimed SDs, and claim phase/updated_at.
  let sds = [];
  try {
    const { data } = await supabase
      .from('strategic_directives_v2')
      .select('sd_key, claiming_session_id, status, current_phase, updated_at, is_working_on')
      .not('status', 'in', '(completed,cancelled,archived,superseded,deferred)');
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
    const { data } = await supabase
      .from('quick_fixes')
      .select('id, claiming_session_id, status')
      .is('claiming_session_id', null)
      .in('status', ['open', 'in_progress']);
    unclaimedQfs = (data || []).length;
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
  // SD-FDBK-INFRA-DEPLOY-GAP-DETECTOR-001
  computeMergesByRole,
};
