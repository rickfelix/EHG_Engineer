// Extracted VERBATIM from scripts/worker-checkin.cjs resolveCheckin (rung 3 + base
// construction + prior_wind_down + coordinator_messages) — SD-ARCH-HOTSPOT-CHECKIN-001.
// Only edits: locals -> ctx.* + helper destructuring. ctx.base is CREATED here; every
// later step spreads ctx.base into its returns exactly as the inline code did.
module.exports = {
  name: 'roll-call',
  async run(ctx) {
    const { sb, sessionId, coordinatorId, sessionRole } = ctx;
    const { registerRollCall, surfaceCoordinatorMessages, fetchOutstandingSignals, formatOutstandingWarning } = ctx.helpers;
    // 3. register availability (idempotent)
    const rollCall = await registerRollCall(sb, { sessionId, coordinatorId, callsign: ctx.callsign, mySd: ctx.mySd });

    ctx.base = { ok: true, callsign: ctx.callsign, coordinator: coordinatorId, roll_call_id: rollCall.id, two_way: process.env.COORDINATOR_TWOWAY_V2 === 'on' };

    // SD-LEO-INFRA-CHECKIN-DIRECTED-BEFORE-RESUME-001 (FR-2): a default, always-present verdict so a
    // directed row can never be silently outranked by omission -- resume.cjs and directed-assignment.cjs
    // overwrite this with a more specific outcome ('consumed' | 'skipped' | 'ineligible' | 'expired' |
    // 'deferred' | 'yielded_to_resume' | 'yielded_to_directed'); a checkin with no directed lane
    // activity at all still reports 'none' explicitly rather than omitting the field.
    ctx.base.directed_lane_verdict = { outcome: 'none', id: null, sd_key: null, reason: null };

    // SD-LEO-INFRA-WORKER-WINDDOWN-SURVEY-001 (b): surface the prior wind-down reason captured by the
    // Stop hook (claude_sessions.metadata.wind_down) so the /checkin skill can render "you previously
    // stopped because X — confirm/correct" and the worker can correct the inferred reason at re-engage.
    ctx.base.prior_wind_down = (ctx.sessionMetadata && ctx.sessionMetadata.wind_down) ? ctx.sessionMetadata.wind_down : null;

    // FR-1/FR-3: surface UNCONSUMED coordinator->worker push as coordinator_messages[] on the `base`
    // object so EVERY return path (resume / idle / self_claimed / self_claimed_qf) carries it — a busy
    // claim-holder AND an idle worker both see coordinator coaching. Non-draining + bounded (see fn).
    ctx.base.coordinator_messages = await surfaceCoordinatorMessages(sb, sessionId, { role: sessionRole });

    // SD-FDBK-INFRA-WORKER-VISIBLE-UNACKED-001: the OUTBOUND counterpart of the surface
    // above — signals THIS worker sent that nobody has acknowledged. Attached to
    // ctx.base for the same reason coordinator_messages is: base spreads into EVERY
    // return path (resume / idle / self_claimed / self_claimed_qf), so a busy
    // claim-holder and an idle worker both see it.
    //
    // Keyed on acknowledged_at, never read_at — read_at is transport-DELIVERED and is
    // set by the sweep, so a read_at predicate reports a delivered-but-ignored signal as
    // answered (2 of 3 live outstanding signals had exactly that shape).
    //
    // STRICTLY READ-ONLY: /checkin is the only ack-stamping path in the fleet, so a
    // surface that stamped its own report would erase the evidence it exists to expose
    // and make the answered-rate metric improve because nobody answered.
    //
    // Absent (not empty) when there is nothing outstanding — this runs once per loop
    // pass per seat, and a permanent empty stub is a line workers learn to skim past.
    //
    // ROUND-2 FIX (adversarial post-merge review, PR #8356): fetchOutstandingSignals no longer
    // returns bare null for "genuinely zero outstanding" (see outstanding-signals.cjs's own
    // correction note) -- it returns a real, still-falsy-for-count object so a gauge can
    // distinguish verified-zero from unknown. `if (outstanding)` alone is therefore now truthy
    // on every healthy check-in, attaching the empty stub this comment (and the module's own
    // docblock) says must never be emitted. Gate on actual content instead.
    const outstanding = await fetchOutstandingSignals(sb, sessionId);
    if (outstanding && outstanding.count > 0) {
      ctx.base.outstanding_signals = outstanding;
      const warning = formatOutstandingWarning(outstanding);
      if (warning) ctx.base.outstanding_signals_warning = warning;
    }
  },
};
