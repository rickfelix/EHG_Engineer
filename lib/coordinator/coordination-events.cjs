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

const { runDetectors } = require('./detectors.cjs');

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
  };
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
      .select('session_id, sd_key, status, heartbeat_at, metadata, current_phase');
    sessions = data || [];
  } catch (_) { sessions = []; }

  const fresh = (s) => (now - tsMs(s.heartbeat_at)) <= freshMs;
  const coordinators = sessions.filter((s) => s.metadata && String(s.metadata.is_coordinator) === 'true' && fresh(s));
  bundle.coordinators = coordinators;
  bundle.coordinatorCount = coordinators.length;
  bundle.idleWorkers = sessions.filter((s) => !s.sd_key && HOLDING_STATUSES.has(s.status) && fresh(s)).length;
  bundle.sessions = sessions.filter((s) => HOLDING_STATUSES.has(s.status)).map((s) => ({ session_id: s.session_id, sd_key: s.sd_key }));

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

module.exports = {
  DETECTOR_VERSION,
  coordDetectorsEnabled,
  resolveThresholds,
  gatherDetectorInputs,
  logCoordinationEvent,
  runAndLogDetectors,
};
