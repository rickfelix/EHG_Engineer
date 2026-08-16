// SD-LEO-INFRA-SELF-CLAIM-TIER-ENFORCEMENT-001: hoisted tierCtx producer.
//
// Computes {worker_tier_rank, tiering_active} ONCE per check-in tick and stores it on
// ctx.tierCtx, positioned before recover-stranded-final (rung 5.7) and adopt-orphan (rung 5.8) so
// BOTH can apply the tier axis via tierBlocks(). Previously only merged-pool-self-claim (rung 6)
// computed this, too late for the two earlier lanes -- the root cause of the tier axis being
// silently inert on them.
//
// merged-pool-self-claim.cjs reads ctx.tierCtx.worker_tier_rank/tiering_active instead of
// recomputing them, so this RELOCATES rather than duplicates the existing
// resolveWorkerTierRank/isTieringActive calls -- per-tick DB/metadata-read cost is unchanged.
//
// run() never short-circuits the pipeline (always returns undefined); it only annotates ctx.
// Fail-open on any fault: ctx.tierCtx stays {}, and tierBlocks(sd, undefined, undefined) only
// blocks a SCORED SD via its explicit-floor branch -- never an unscored one -- so a producer
// failure degrades to today's pre-fix behavior on unscored SDs and fails closed on scored ones.
module.exports = {
  name: 'tier-context',
  async run(ctx) {
    const { resolveWorkerTierRank, isTieringActive } = ctx.helpers;
    try {
      ctx.tierCtx = {
        worker_tier_rank: resolveWorkerTierRank({ metadata: ctx.sessionMetadata }),
        tiering_active: await isTieringActive(ctx.sb),
      };
    } catch (e) {
      // SD-LEO-INFRA-SELF-CLAIM-TIER-ENFORCEMENT-001 (REGRESSION review): this fault fails EVERY
      // scored stranded/orphan SD closed fleet-wide (tierBlocks(sd, undefined, undefined) blocks
      // any SCORED SD) until it clears -- silent here would read as "nothing claimable" with no
      // trail explaining why. Loud on purpose, mirroring this SD's own fail-closed-must-be-loud
      // principle for the lanes it fixed.
      console.log(`[tier-context] producer failed, tierCtx={} (scored SDs fail closed until this clears): ${e.message}`);
      ctx.tierCtx = {};
    }
  },
};
