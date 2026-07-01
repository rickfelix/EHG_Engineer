'use strict';
/**
 * Canonical live-fleet-session query helpers — the SINGLE server-side-bounded path for
 * "which claude_sessions rows are live fleet workers / how many". Generalizes the
 * isTieringActive fix (#5303) so no caller re-implements the buggy pattern.
 *
 * THE BUG THIS CLOSES: an UNFILTERED `claude_sessions.select()` is capped by PostgREST at
 * 1000 rows and returns the OLDEST 1000 of ~13k, so the NEWEST live workers are EXCLUDED and
 * any liveness/count read returns 0 or undercounts (the false "0 LIVE workers" fleet-winddown
 * alarm; a candidate cause of Adam's inbox-drain miss). Because these helpers order by
 * heartbeat_at DESC, `.limit(N)` only ever truncates the STALEST rows — the newest live
 * workers are ALWAYS in the returned page.
 *
 * Liveness SEMANTICS are NOT re-implemented here: the page is piped through the JS-side SSOT
 * `liveFleetWorkers()` (lib/fleet/genuine-worker.mjs). This module only owns the bounded QUERY.
 *
 * Module is CommonJS and dynamic-import()s the ESM genuine-worker.mjs (same pattern as
 * lib/fleet/tier-ladder.cjs) so both CJS (require) and ESM callers can use it.
 *
 * SD-LEO-INFRA-LIVE-FLEET-SESSIONS-ROWCAP-CANONICAL-001 (FR-1, FR-2).
 */

/**
 * The claude_sessions columns liveFleetWorkers()/isFleetWorker()/everClaimed() require.
 * Kept identical to the isTieringActive select (#5303) so the liveness SSOT gets every field.
 */
const LIVE_SESSION_COLUMNS =
  'session_id, status, metadata, heartbeat_at, sd_key, claimed_at, worktree_path, continuous_sds_completed';

/**
 * Defaults. `limit` MUST exceed peak concurrent live-in-window; because rows are ordered
 * heartbeat_at DESC the cap only ever drops the STALEST rows, so 200 (~22x the current ~9
 * live) is safe headroom that also absorbs the belt-depth 3x-worker growth target. `windowMs`
 * and `statuses` mirror the liveness SSOT (15-min window; active/idle are the live statuses).
 */
const LIVE_FLEET_DEFAULTS = Object.freeze({ windowMs: 900000, limit: 200, statuses: ['active', 'idle'] });

/** Resolve the active coordinator id (excluded from the fleet) unless the caller supplied one. */
async function resolveCoordinatorId(supabase, opts) {
  if (opts.coordinatorId !== undefined) return opts.coordinatorId;
  try {
    const { getActiveCoordinatorId } = require('../coordinator/resolve.cjs');
    return await getActiveCoordinatorId(supabase).catch(() => null);
  } catch {
    return null;
  }
}

/**
 * Live genuine fleet workers from the claude_sessions BASE TABLE, server-side bounded.
 * @param {object} supabase a supabase client (service-role preferred so reads aren't RLS-filtered)
 * @param {{nowMs?:number, windowMs?:number, limit?:number, statuses?:string[], coordinatorId?:string|null}} [opts]
 * @returns {Promise<Array<object>>} live genuine worker session rows ([] on query error — fail-closed)
 */
async function liveFleetSessions(supabase, opts = {}) {
  const { liveFleetWorkers } = await import('./genuine-worker.mjs');
  const nowMs = Number.isFinite(opts.nowMs) ? opts.nowMs : Date.now();
  const windowMs = Number.isFinite(opts.windowMs) ? opts.windowMs : LIVE_FLEET_DEFAULTS.windowMs;
  const limit = Number.isFinite(opts.limit) ? opts.limit : LIVE_FLEET_DEFAULTS.limit;
  const statuses = Array.isArray(opts.statuses) ? opts.statuses : LIVE_FLEET_DEFAULTS.statuses;
  const coordinatorId = await resolveCoordinatorId(supabase, opts);

  const { data, error } = await supabase
    .from('claude_sessions')
    .select(LIVE_SESSION_COLUMNS)
    .in('status', statuses)
    .gte('heartbeat_at', new Date(nowMs - windowMs).toISOString())
    .order('heartbeat_at', { ascending: false })
    .limit(limit);
  if (error || !Array.isArray(data)) return []; // fail-closed: an error is not "0 live", but callers treat [] safely
  return liveFleetWorkers(data, coordinatorId, nowMs, windowMs);
}

/** Convenience: the COUNT of live genuine fleet workers (what most gauges actually want). */
async function liveFleetSessionCount(supabase, opts = {}) {
  return (await liveFleetSessions(supabase, opts)).length;
}

/**
 * Live rows from the v_active_sessions VIEW, server-side bounded. The base-table helper can't
 * serve view consumers: v_active_sessions exposes computed-only columns (computed_status,
 * heartbeat_age_seconds, ccPidAlive) absent from claude_sessions, and it too exceeds 1000 rows,
 * so an unfiltered `.from('v_active_sessions').select()` is capped and drops the freshest.
 * We bound it by `.order('heartbeat_age_seconds', asc).limit(N)` — freshest first, so the cap
 * only drops the STALEST — and return the view rows unchanged (callers use the computed columns).
 *
 * FAIL DIRECTION — deliberately OPPOSITE to liveFleetSessions(): this helper PROPAGATES (throws)
 * on a query error rather than returning []. Its safety-critical consumer is the quiescence
 * gauge (assessFleetActivity), which must fail OPEN to ACTIVE — "never silence the fleet on a
 * query error." Swallowing to [] here would read 0-live-and-quiescent on a transient error and
 * could trigger a FALSE wind-down (the very class this SD closes). The caller's own try/catch
 * decides the fail direction; do NOT swallow here.
 * @param {object} supabase a supabase client
 * @param {{limit?:number, columns?:string}} [opts]
 * @returns {Promise<Array<object>>} the freshest live view rows (THROWS on query error)
 */
async function liveActiveSessionsView(supabase, opts = {}) {
  const limit = Number.isFinite(opts.limit) ? opts.limit : LIVE_FLEET_DEFAULTS.limit;
  const columns = typeof opts.columns === 'string' ? opts.columns : '*';
  const { data, error } = await supabase
    .from('v_active_sessions')
    .select(columns)
    .order('heartbeat_age_seconds', { ascending: true })
    .limit(limit);
  if (error) throw error; // fail-OPEN: let the caller's catch decide (quiescence fails to ACTIVE)
  return Array.isArray(data) ? data : [];
}

module.exports = {
  liveFleetSessions,
  liveFleetSessionCount,
  liveActiveSessionsView,
  LIVE_FLEET_DEFAULTS,
  LIVE_SESSION_COLUMNS,
};
