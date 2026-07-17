// Extracted VERBATIM from scripts/worker-checkin.cjs resolveCheckin (rung 6.5) —
// SD-ARCH-HOTSPOT-CHECKIN-001. Only edits: locals -> ctx.* + helper destructuring.
module.exports = {
  name: 'self-claim-qf',
  async run(ctx) {
    const { sb, sessionId } = ctx;
    const { selfClaimQuickFix } = ctx.helpers;
    // 6.5 self-claim an open quick_fix. v_sd_next_candidates is SD-only, so open
    // QFs are sourced here — strictly BELOW SD candidates and ABOVE idle, so a
    // worker pulls an open QF instead of idling, but SD work always wins.
    // SD-LEO-INFRA-MAKE-OPEN-QFS-001.
    // SD-LEO-INFRA-WORK-CLASS-CLAIM-001 (C-QF-SEAM): thread the session's model so the
    // work-class fence covers this entry point too — undefined for sessions without a
    // self-reported model keeps the path byte-identical (C-AC5).
    const sessionModel = (ctx.sessionMetadata && typeof ctx.sessionMetadata.model === 'string')
      ? ctx.sessionMetadata.model : undefined;
    const qfClaimed = await selfClaimQuickFix(sb, sessionId, ctx.base, sessionModel);
    if (qfClaimed) return qfClaimed;
  },
};
