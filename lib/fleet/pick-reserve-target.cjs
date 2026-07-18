'use strict';
/**
 * SD-LEO-INFRA-SOFT-RESERVE-LONGEST-IDLE-001 (FR-1): pick the SINGLE longest-idle signaled-ready
 * worker to soft-reserve a freshly-sourced leaf to, so a live idle worker that keeps losing the
 * open-queue race to faster-polling peers (the CA-14 incident: Alpha-2 stranded ~15h) wins the
 * leaf on its next natural checkin.
 *
 * PURE ranking (pickLongestIdleFromRows) is split from the IO fetch (pickLongestIdleSignaledReady),
 * mirroring reserve-sd.cjs's builder/IO split and refill-auto-promote.js's selectRefillBatch purity.
 * Both fail OPEN to null — a fault (no ready worker, read error, unexpected shape) never blocks
 * sourcing; it simply leaves the leaf in the open queue exactly as today.
 *
 * @module lib/fleet/pick-reserve-target
 */

const { liveFleetSessions } = require('./live-fleet-sessions.cjs');
const { PAYLOAD_KINDS } = require('./worker-status.cjs');

/** Coerce a Set | array | nullish into a Set (never throws). */
function toSet(v) {
  if (v instanceof Set) return v;
  if (Array.isArray(v)) return new Set(v);
  return new Set();
}

/**
 * PURE + TOTAL: from raw session_coordination rows (roll_call registrations) and a set of live
 * (heartbeat-fresh) session ids, return the SINGLE longest-idle, signaled-ready, live, unclaimed
 * session_id — or null when the intersection is empty. Never throws.
 *
 * A session is a candidate when it has an ACTIVE roll_call row with payload.available===true and no
 * working sd_key, and it is in the live set, and it is not in excludeSessions. The longest-idle
 * proxy is the EARLIEST currently-active roll_call created_at (smallest ms => longest idle); ties
 * break by session_id ascending so the pick is fully deterministic. excludeSessions removes
 * already-reserved-this-run workers so a refill batch spreads across DISTINCT workers (TR-3).
 *
 * @param {Array<{sender_session?:string, created_at?:string, payload?:object}>} rollCallRows
 * @param {Set<string>|Array<string>} liveSessionIds  heartbeat-fresh worker session ids
 * @param {Set<string>|Array<string>} [excludeSessions]  sessions already reserved this run
 * @returns {string|null}
 */
function pickLongestIdleFromRows(rollCallRows, liveSessionIds, excludeSessions) {
  const live = toSet(liveSessionIds);
  if (live.size === 0) return null;
  const exclude = toSet(excludeSessions);
  // idle-since proxy per session = earliest active roll_call created_at (longest idle => smallest).
  const idleSinceBySession = new Map();
  for (const row of Array.isArray(rollCallRows) ? rollCallRows : []) {
    if (!row || typeof row !== 'object') continue;
    const p = row.payload || {};
    if (p.kind !== PAYLOAD_KINDS.ROLL_CALL) continue; // only availability registrations
    if (p.available !== true) continue;               // busy (working an SD) => not ready
    if (p.sd_key) continue;                            // named a working SD => not unclaimed
    const sid = row.sender_session;
    if (!sid || !live.has(sid) || exclude.has(sid)) continue;
    const ms = Date.parse(row.created_at);
    const idleSince = Number.isFinite(ms) ? ms : Number.POSITIVE_INFINITY;
    const prev = idleSinceBySession.get(sid);
    if (prev === undefined || idleSince < prev) idleSinceBySession.set(sid, idleSince);
  }
  let best = null;
  for (const [sid, idleSince] of idleSinceBySession) {
    if (best === null
      || idleSince < best.idleSince
      || (idleSince === best.idleSince && sid < best.sid)) {
      best = { sid, idleSince };
    }
  }
  return best ? best.sid : null;
}

/**
 * IO: fetch active-unexpired roll_call rows + the live-fleet session set, then rank via the pure
 * function above. FAIL-OPEN: any fault (read error, resolver throw, unexpected shape) returns null,
 * leaving the leaf open. Never throws.
 *
 * @param {object} supabase service-role client
 * @param {{excludeSessions?:Set<string>|Array<string>, nowMs?:number, liveOpts?:object,
 *   liveFleetSessionsFn?:Function}} [opts]  liveFleetSessionsFn is injectable for tests; defaults
 *   to the real liveFleetSessions.
 * @returns {Promise<string|null>}
 */
async function pickLongestIdleSignaledReady(supabase, opts = {}) {
  try {
    const nowMs = Number.isFinite(opts.nowMs) ? opts.nowMs : Date.now();
    // (a) active-unexpired roll_call rows — expires_at > now bounds to still-signaling workers
    // (registerRollCall sets a ~1h TTL); payload.kind/available are filtered in the pure ranker.
    const { data, error } = await supabase
      .from('session_coordination')
      .select('sender_session, created_at, payload, expires_at')
      .eq('message_type', 'INFO')
      .gt('expires_at', new Date(nowMs).toISOString());
    if (error) return null; // fail-open
    // (b) live workers (heartbeat-fresh, server-side bounded)
    const liveFn = opts.liveFleetSessionsFn || liveFleetSessions;
    const liveSessions = await liveFn(supabase, { ...(opts.liveOpts || {}), nowMs });
    const liveIds = new Set((liveSessions || []).map((s) => s && s.session_id).filter(Boolean));
    return pickLongestIdleFromRows(data || [], liveIds, opts.excludeSessions);
  } catch {
    return null; // fail-open: never block sourcing
  }
}

module.exports = { pickLongestIdleFromRows, pickLongestIdleSignaledReady };
