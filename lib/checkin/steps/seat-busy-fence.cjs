// SD-LEO-INFRA-NON-SD-WORK-CLAIM-FENCE-001: a seat-scoped BUSY-ON-DIRECTED-WORK signal fences
// ALL self-claim-of-new-work tiers (recovery, adoption, QF-jump, draft/baselined self-claim,
// QF self-claim) when this seat holds live non-SD directed work (a console assessment, an
// audit sweep, an open-loop gather -- dispatched via an unstructured coordinator INFO row with
// NO target_sd, so the existing coordinator_reservation fence and every per-SD eligibility
// check are structurally blind to it). Live incident 683617ed (Alpha-3, 2026-07-10): mid a
// directed console assessment, checkin auto-self-claimed a belt SD for exactly this reason.
//
// Positioned strictly AFTER directed-assignment (rung 7 -- a WORK_ASSIGNMENT this tick is
// claimed BEFORE this step runs, so it is unaffected even by a stale seat-busy row) and
// strictly BEFORE recover-stranded-final (rung 8 -- so recovery/adoption/QF-jump/self-claim
// all short-circuit here in one place, mirroring self-claim-gates.cjs's own idle-short-circuit
// idiom rather than threading a new ctx field through each tier's own eligibility check).
// resume.cjs (own-claim resume) runs even earlier in the ladder and is untouched by this SD.
module.exports = {
  name: 'seat-busy-fence',
  async run(ctx) {
    const { sb, sessionId, coordinatorId } = ctx;
    const { ws, isSeatBusyOnDirectedWork } = ctx.helpers;
    try {
      const { data, error } = await sb
        .from('session_coordination')
        .select('id, sender_session, payload, expires_at, created_at')
        .eq('message_type', 'INFO')
        .eq('target_session', sessionId)
        .is('target_sd', null)
        .order('created_at', { ascending: false })
        .limit(5);
      if (error) throw error;
      for (const row of (data || [])) {
        const p = row.payload || {};
        if (p.kind !== ws.PAYLOAD_KINDS.SEAT_BUSY_RESERVATION) continue;
        // Same coordinator-authentication posture as drain-reservations.cjs's coordinator_reservation
        // read: only a row genuinely authored by the LIVE coordinator can fence this seat. A null
        // coordinatorId (identity unresolved this tick) never matches any row's sender_session, so
        // this fails closed for the tick (no fence set) without a separate branch.
        if (!coordinatorId || row.sender_session !== coordinatorId) continue;
        ctx.seatBusy = { reason: p.reason || 'directed non-SD work', expiresAt: row.expires_at || null, reservationId: row.id };
        break; // most recent live-coordinator-authored row wins
      }
    } catch (err) {
      // fail-open: a transient read failure must never fence a seat that isn't actually busy.
      console.warn(`[seat-busy-fence] reservation read failed, continuing unfenced: ${err.message || err}`);
      return undefined;
    }
    const reason = isSeatBusyOnDirectedWork(ctx);
    if (reason) {
      return {
        ...ctx.base,
        action: 'idle',
        recommended_wakeup_seconds: 900,
        message: `Seat busy on directed non-SD work (${ctx.seatBusy.reason}) — skipping recovery/adoption/self-claim tiers to avoid double-booking this seat. Directed WORK_ASSIGNMENT and own-claim resume are unaffected. Reservation expires ${ctx.seatBusy.expiresAt || 'never (coordinator must clear it)'} — fails open to claimable after expiry.`,
      };
    }
    return undefined;
  },
};
