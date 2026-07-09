// Extracted VERBATIM from scripts/worker-checkin.cjs resolveCheckin (rung 2c-2) —
// SD-ARCH-HOTSPOT-CHECKIN-001. Only edits: locals -> ctx.* + helper destructuring.
module.exports = {
  name: 'quarantine-self-clear',
  async run(ctx) {
    const { sb, sessionId } = ctx;
    const { selfClearQuarantine } = ctx.helpers;
    // 2c-2. SD-LEO-INFRA-CLAIM-BOUNDARY-PRE-001 FR-4: self-clear an uncleared probe quarantine.
    // This checkin executing IS the resumed-tool-activity proof (its Bash call fired PostToolUse).
    // Must run BEFORE the 5.9 isSelfClaimDisabled gate so a recovered window re-enters self-claim
    // in this same pass instead of idling one extra cycle.
    ctx.sessionMetadata = await selfClearQuarantine(sb, sessionId, ctx.sessionMetadata);
  },
};
