// Extracted VERBATIM from scripts/worker-checkin.cjs resolveCheckin (rung 3 + base
// construction + prior_wind_down + coordinator_messages) — SD-ARCH-HOTSPOT-CHECKIN-001.
// Only edits: locals -> ctx.* + helper destructuring. ctx.base is CREATED here; every
// later step spreads ctx.base into its returns exactly as the inline code did.
module.exports = {
  name: 'roll-call',
  async run(ctx) {
    const { sb, sessionId, coordinatorId, sessionRole } = ctx;
    const { registerRollCall, surfaceCoordinatorMessages } = ctx.helpers;
    // 3. register availability (idempotent)
    const rollCall = await registerRollCall(sb, { sessionId, coordinatorId, callsign: ctx.callsign, mySd: ctx.mySd });

    ctx.base = { ok: true, callsign: ctx.callsign, coordinator: coordinatorId, roll_call_id: rollCall.id, two_way: process.env.COORDINATOR_TWOWAY_V2 === 'on' };

    // SD-LEO-INFRA-WORKER-WINDDOWN-SURVEY-001 (b): surface the prior wind-down reason captured by the
    // Stop hook (claude_sessions.metadata.wind_down) so the /checkin skill can render "you previously
    // stopped because X — confirm/correct" and the worker can correct the inferred reason at re-engage.
    ctx.base.prior_wind_down = (ctx.sessionMetadata && ctx.sessionMetadata.wind_down) ? ctx.sessionMetadata.wind_down : null;

    // FR-1/FR-3: surface UNCONSUMED coordinator->worker push as coordinator_messages[] on the `base`
    // object so EVERY return path (resume / idle / self_claimed / self_claimed_qf) carries it — a busy
    // claim-holder AND an idle worker both see coordinator coaching. Non-draining + bounded (see fn).
    ctx.base.coordinator_messages = await surfaceCoordinatorMessages(sb, sessionId, { role: sessionRole });
  },
};
