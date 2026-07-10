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
module.exports = {
  name: 'drain-reservations',
  async run(ctx) {
    const { sb, coordinatorId } = ctx;
    const { ws } = ctx.helpers;
    try {
      const { data, error } = await sb
        .from('session_coordination')
        .select('id, target_sd, sender_session, payload, expires_at')
        .eq('message_type', 'INFO')
        .is('target_session', null)
        .not('target_sd', 'is', null);
      if (error) throw error;
      const reservations = {};
      for (const row of (data || [])) {
        const p = row.payload || {};
        if (p.kind !== ws.PAYLOAD_KINDS.COORDINATOR_RESERVATION) continue;
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
      if (Object.keys(reservations).length) ctx.reservations = reservations;
    } catch (err) {
      // TR-3: fail-open — a transient read failure must never block the rest of the self-claim
      // pipeline. ctx.reservations stays absent, byte-identical to pre-SD behavior.
      console.warn(`[drain-reservations] reservation read failed, continuing without fences: ${err.message || err}`);
    }
    return undefined; // never short-circuits — always falls through to self-claim-gates.
  },
};
