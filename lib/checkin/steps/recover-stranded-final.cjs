// Extracted VERBATIM from scripts/worker-checkin.cjs resolveCheckin (rung 5.7) —
// SD-ARCH-HOTSPOT-CHECKIN-001. Only edits: locals -> ctx.* + helper destructuring.
module.exports = {
  name: 'recover-stranded-final',
  async run(ctx) {
    const { sb, sessionId } = ctx;
    const { recoverStrandedFinal } = ctx.helpers;
    // 5.7 SD-FDBK-FIX-RECURRING-2ND-OCCURRENCE-001: recover a STRANDED pending_approval/LEAD_FINAL SD
    //      (claim cleared, one handoff from shipped) BEFORE self-claiming new work — finishing a
    //      near-shipped SD beats starting fresh. Re-claiming lets a worker run LEAD-FINAL-APPROVAL with
    //      a valid matching claim (passing the claim-validity gate the coordinator-from-main path fails).
    const recovered = await recoverStrandedFinal(sb, sessionId, ctx.base);
    if (recovered) return recovered;
  },
};
