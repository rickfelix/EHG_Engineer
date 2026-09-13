// Extracted VERBATIM from scripts/worker-checkin.cjs resolveCheckin (rung 6.5) —
// SD-ARCH-HOTSPOT-CHECKIN-001. Only edits: locals -> ctx.* + helper destructuring.
module.exports = {
  name: 'self-claim-qf',
  async run(ctx) {
    const { sb, sessionId } = ctx;
    const { selfClaimQuickFix } = ctx.helpers;
    // SD-LEO-INFRA-FIX-CLAIM-EVICTION-001 (FR-3): skip self-claim when this session already
    // authoritatively holds ANY live claim (SD or QF) -- getMyClaims() is the shared, both-kinds
    // predicate (lib/claim/get-my-claims.cjs), applied uniformly across all three self-claim
    // producer steps (this one, critical-qf-jump.cjs, merged-pool-self-claim.cjs). FAIL-CLOSED on
    // a read error (skip), unlike most of this file's fail-open convention -- an uncertain read
    // proceeding here would re-enable exactly the claim-switch eviction race this SD exists to
    // close; failing closed only costs one idle tick.
    const { getMyClaims } = require('../../claim/get-my-claims.cjs');
    const myClaims = await getMyClaims(sb, sessionId);
    if (myClaims.error || myClaims.count > 0) return;
    // 6.5 self-claim an open quick_fix. v_sd_next_candidates is SD-only, so open
    // QFs are sourced here — strictly BELOW SD candidates and ABOVE idle, so a
    // worker pulls an open QF instead of idling, but SD work always wins.
    // SD-LEO-INFRA-MAKE-OPEN-QFS-001.
    // SD-LEO-INFRA-WORK-CLASS-CLAIM-001 (C-QF-SEAM): thread the session's model so the
    // work-class fence covers this entry point too — undefined for sessions without a
    // self-reported model keeps the path byte-identical (C-AC5).
    const sessionModel = (ctx.sessionMetadata && typeof ctx.sessionMetadata.model === 'string')
      ? ctx.sessionMetadata.model : undefined;
    // QF-20260911-004: thread ctx.reservations/tierCtx so a coordinator_reservation fence
    // (previously SD-only) also fences QF self-claim -- see claim-eligibility.cjs's
    // coordinatorReservation() row.sd_key||row.id key.
    const qfClaimed = await selfClaimQuickFix(sb, sessionId, ctx.base, sessionModel, {
      reservations: ctx.reservations,
      worker_tier_rank: ctx.tierCtx && ctx.tierCtx.worker_tier_rank,
    });
    if (qfClaimed) return qfClaimed;
  },
};
