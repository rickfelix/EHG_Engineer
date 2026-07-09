// Extracted VERBATIM from scripts/worker-checkin.cjs resolveCheckin (rung 2b) —
// SD-ARCH-HOTSPOT-CHECKIN-001. Only edits: locals -> ctx.* + helper destructuring.
module.exports = {
  name: 'callsign-rehydrate',
  async run(ctx) {
    const { sb, sessionId } = ctx;
    const { rehydrateCallsign } = ctx.helpers;
    // 2b. FR-2: re-hydrate callsign from the durable SET_IDENTITY row if metadata lost it (survives
    // release/sweep). Runs BEFORE registerRollCall so the re-hydrated callsign flows into the roll-call
    // row + base.callsign in the SAME response.
    if (!ctx.callsign) {
      const rehydrated = await rehydrateCallsign(sb, sessionId, ctx.sessionMetadata);
      if (rehydrated) ctx.callsign = rehydrated;
    }
  },
};
