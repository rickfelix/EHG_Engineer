// Extracted VERBATIM from scripts/worker-checkin.cjs resolveCheckin (rung 2c) —
// SD-ARCH-HOTSPOT-CHECKIN-001. Only edits: locals -> ctx.* + helper destructuring.
module.exports = {
  name: 'model-effort-merge',
  async run(ctx) {
    const { sb, sessionId } = ctx;
    const { cliModel, cliEffort } = ctx.opts;
    const { mergeCheckinModelEffort } = ctx.helpers;
    // 2c. SD-LEO-INFRA-AUTO-TIERING-ACTIVATION-001-B (FR-3): merge --model/--effort into
    // sessionMetadata BEFORE it is used below (tierCtx.worker_tier_rank at the resolveWorkerTierRank
    // call further down reads sessionMetadata, so this call's own fresh values must land here first).
    // Fail-open: a persist error never blocks the check-in itself.
    try {
      const { changed } = mergeCheckinModelEffort(ctx.sessionMetadata, { model: cliModel, effort: cliEffort });
      if (changed) {
        // QF-20260703-314: re-read metadata FRESH immediately before writing instead of persisting
        // the whole step-2 snapshot merged in-memory -- a concurrent writer (e.g.
        // assign-fleet-identities.cjs setting fleet_identity) landing between step 2's read and this
        // write was otherwise silently clobbered by this whole-object update (mechanism (c) of the
        // callsign-collision chain, backlog cfea31a7: worker 3c40949b lost Charlie/red within 9min).
        const { data: freshRow } = await sb.from('claude_sessions').select('metadata').eq('session_id', sessionId).maybeSingle();
        const freshBase = (freshRow && freshRow.metadata) || ctx.sessionMetadata || {};
        const { metadata: freshMerged } = mergeCheckinModelEffort(freshBase, { model: cliModel, effort: cliEffort });
        ctx.sessionMetadata = freshMerged;
        await sb.from('claude_sessions').update({ metadata: freshMerged }).eq('session_id', sessionId);
      }
    } catch { /* fail-open: check-in proceeds with whatever metadata was already read */ }
  },
};
