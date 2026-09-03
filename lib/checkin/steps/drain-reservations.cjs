// SD-LEO-INFRA-DISPATCH-AUTH-AUTO-AUTHORIZE-001-C / FR-2: read-only, fail-open, coordinator-
// authenticated drain of active coordinator_reservation rows into ctx.reservations. Positioned
// strictly after adopt-orphan.cjs and before self-claim-gates.cjs (lib/checkin/steps/index.cjs)
// so directed WORK_ASSIGNMENT dispatch, stranded/orphan recovery, and own-claim resume (all
// earlier in the pipeline) are structurally unaffected. Never stamps read_at/acknowledged_at —
// target_session=NULL broadcast rows must stay visible to every session, not just the first
// reader, or the first checkin after a reservation is written would silently unfence everyone
// else (the exact "first reader consumes it" bug this step must not reproduce).
//
// Deliberately does NOT filter by expires_at at query time — FR-3's coordinatorReservation axis
// is the one contractually required to self-compare expires_at > now() (never relying on
// cleanup_expired_coordination()'s GC, which lags to the next stale-session-sweep tick). This
// step only threads raw expiresAt through; expiry is judged where the claim decision is made.
//
// SD-LEO-INFRA-SOFT-RESERVE-LONGEST-IDLE-001 (FR-3 net-new): resolve the live-fleet session set ONCE
// per tick and stamp each session-scoped fence with reservedForSessionLive, so coordinatorReservation
// can VOID a fence whose reserved-for worker is dead (heartbeat stale) immediately — the leaf opens to
// everyone without waiting out the TTL. Fail-open: a live-set resolution fault leaves the stamp absent,
// so fences keep enforcing under the TTL backstop (never a strand, never a throw — the existing
// read-error fail-open below is unchanged).
const { liveFleetSessions } = require('../../fleet/live-fleet-sessions.cjs');
const { PAYLOAD_KINDS } = require('../../fleet/worker-status.cjs');

// SD-LEO-INFRA-COUNT-TRUNCATION-DISCIPLINE-001 FR-6 batch 8 — this step iterates EVERY matching
// broadcast INFO row to build the reservation fences that gate self-claim; the filter is not
// partitioned to a small parent and carries no expiry cutoff, so on a growing session_coordination
// table a silent 1000-row cap would drop reservation rows and un-fence claims. Paginate to
// completion; the pre-existing fail-open catch is preserved (fetchAllPaginated throws on a page error).
let _fapModule = null;
async function fapPaginate(queryFactory, opts) {
  _fapModule ||= await import('../../db/fetch-all-paginated.mjs');
  return _fapModule.fetchAllPaginated(queryFactory, opts);
}

/**
 * Build the active-coordinator-reservation map — EXTRACTED from this step's own run(ctx) by
 * SD-LEO-INFRA-ONE-BELT-CENSUS-001 (implementation step 1b) so lib/fleet/belt-census.cjs can
 * reuse the exact same SELECT + transform logic instead of duplicating it. run(ctx) below is
 * refactored to call this function too — behavior is unchanged (verified: this file's own
 * existing tests pass unmodified).
 *
 * Fail-open by design: returns {} (no fences) on any read/transform error, mirroring run(ctx)'s
 * pre-extraction try/catch. A null coordinatorId (no active coordinator) also returns {} — every
 * reservation row fails closed for that tick, matching the SECURITY MUST (a) check below.
 *
 * @param {object} supabase
 * @param {string|null} coordinatorId
 * @param {object} [opts]
 * @param {Function} [opts.liveFleetSessionsFn] test override for the live-fleet resolve
 * @returns {Promise<Record<string, Array>>}
 */
async function fetchActiveReservationsMap(supabase, coordinatorId, opts = {}) {
  try {
    const data = await fapPaginate(() => supabase
      .from('session_coordination')
      .select('id, target_sd, sender_session, payload, expires_at')
      .eq('message_type', 'INFO')
      .is('target_session', null)
      .not('target_sd', 'is', null)
      .order('id', { ascending: true }));
    const reservations = {};
    for (const row of data) {
      const p = row.payload || {};
      if (p.kind !== PAYLOAD_KINDS.COORDINATOR_RESERVATION) continue;
      // FR-2 SECURITY MUST (a): only honor rows genuinely authored by the live active
      // coordinator — defense-in-depth against a buggy (not necessarily malicious) worker
      // accidentally writing a self-serving fence. No write-side DB enforcement exists (RLS is
      // service_role_full_access; the insert-lint trigger only RAISE NOTICEs). A null
      // coordinatorId (identity unresolved this tick) never matches any row's sender_session,
      // so every reservation fails closed for the tick without a separate branch.
      if (!coordinatorId || row.sender_session !== coordinatorId) continue;
      const sdKey = row.target_sd;
      if (!reservations[sdKey]) reservations[sdKey] = [];
      reservations[sdKey].push({
        sd: sdKey,
        reservedForSession: p.reserved_for_session || null,
        reservedForTier: p.reserved_for_tier || null,
        lanePattern: p.lane_pattern || null,
        expiresAt: row.expires_at || null,
      });
    }
    const sdKeys = Object.keys(reservations);
    if (sdKeys.length) {
      // FR-3 (SD-LEO-INFRA-SOFT-RESERVE-LONGEST-IDLE-001): stamp reservedForSessionLive from ONE
      // live-fleet resolve per tick, so a dead-session fence voids immediately at claim time.
      // Wrapped independently so a live-set fault (or an injected test override) leaves the stamp
      // undefined — the fence keeps enforcing under the TTL backstop rather than throwing/unfencing.
      const liveFn = opts.liveFleetSessionsFn || liveFleetSessions;
      try {
        const liveSessions = await liveFn(supabase, { coordinatorId });
        const liveIds = new Set((liveSessions || []).map((s) => s && s.session_id).filter(Boolean));
        for (const key of sdKeys) {
          for (const fence of reservations[key]) {
            if (fence.reservedForSession) fence.reservedForSessionLive = liveIds.has(fence.reservedForSession);
          }
        }
      } catch (liveErr) {
        console.warn(`[drain-reservations] live-fleet resolve failed, fences keep enforcing under TTL: ${liveErr.message || liveErr}`);
      }
    }
    return reservations;
  } catch (err) {
    // TR-3: fail-open — a transient read failure must never block the rest of the self-claim
    // pipeline (or, for belt-census, the rest of the census read).
    console.warn(`[drain-reservations] reservation read failed, continuing without fences: ${err.message || err}`);
    return {};
  }
}

module.exports = {
  name: 'drain-reservations',
  fetchActiveReservationsMap,
  async run(ctx) {
    const { sb, coordinatorId } = ctx;
    const reservations = await fetchActiveReservationsMap(sb, coordinatorId, {
      liveFleetSessionsFn: ctx.liveFleetSessionsFn,
    });
    // Preserve pre-extraction behavior exactly: ctx.reservations is only assigned when there is
    // at least one fence, so it stays absent (not {}) for existing checkin-pipeline consumers
    // that check its truthiness.
    if (Object.keys(reservations).length) {
      ctx.reservations = reservations;
    }
    return undefined; // never short-circuits — always falls through to self-claim-gates.
  },
};
