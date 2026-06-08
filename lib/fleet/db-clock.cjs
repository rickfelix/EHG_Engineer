'use strict';
/**
 * db-clock — SD-FDBK-INFRA-NODE-CLOCK-SKEW-001
 *
 * Coordinator staleness checks compute age as (node-process clock - a DB timestamp).
 * When the node clock skews from the DB server clock (observed ~3-4h on this host),
 * those node-relative comparisons flip the staleness verdict → false HEARTBEAT_TIMEOUT
 * and false claim/coordinator/worktree releases.
 *
 * getDbNowMs() returns the DB SERVER clock in epoch-ms so a check can use a clock
 * reference that matches the stored DB timestamps, removing the reader's node-clock
 * skew from the verdict. It derives DB-now WITHOUT a new DB function/migration by
 * reading one fresh v_active_sessions row: that view already computes
 *   heartbeat_age_seconds = EXTRACT(epoch FROM now() - heartbeat_at)   [DB-side]
 * so  Date.parse(heartbeat_at) + heartbeat_age_seconds*1000 == the DB server now()
 * (the heartbeat_at term cancels — even if it was written by a skewed worker clock).
 *
 * CONTRACT:
 *  - FAIL-OPEN: on any error / no row / NaN, returns the node clock (legacy behavior)
 *    after a one-line warn. NEVER throws → adoption can never regress availability.
 *  - PER-CHECK: the returned value is DB-now AS OF this call. Use it immediately within
 *    one staleness decision; do NOT cache it across a multi-minute run (it would age).
 *  - THRESHOLD-AGNOSTIC: returns an absolute clock only; each caller keeps its OWN
 *    threshold (the documented 300s claim-liveness vs 600s display two-threshold model).
 *
 * CJS so both .cjs (resolve, sweep) and .mjs (claim-guard, coordinator-audit) callers
 * can consume it (the latter via lib/fleet/db-clock.mjs, which re-exports this file).
 *
 * @param {object} supabase  a supabase client that can SELECT from v_active_sessions
 * @returns {Promise<number>} DB server clock in epoch-ms (or node clock on fail-open)
 */
async function getDbNowMs(supabase) {
  try {
    const { data, error } = await supabase
      .from('v_active_sessions')
      .select('heartbeat_at, heartbeat_age_seconds')
      .order('heartbeat_at', { ascending: false })
      .limit(1);
    const row = Array.isArray(data) ? data[0] : data;
    if (error || !row || !row.heartbeat_at || row.heartbeat_age_seconds == null) {
      return nodeFallback('no fresh v_active_sessions row');
    }
    const base = Date.parse(row.heartbeat_at);
    const ageMs = Number(row.heartbeat_age_seconds) * 1000;
    if (!Number.isFinite(base) || !Number.isFinite(ageMs)) {
      return nodeFallback('unparseable heartbeat_at / heartbeat_age_seconds');
    }
    return base + ageMs;
  } catch (e) {
    return nodeFallback((e && e.message) || 'getDbNowMs threw');
  }
}

function nodeFallback(why) {
  try { console.warn(`[db-clock] DB clock unavailable (${why}) — falling back to node clock; skew protection lost this check.`); } catch (_) { /* swallow */ }
  return Date.now();
}

module.exports = { getDbNowMs };
