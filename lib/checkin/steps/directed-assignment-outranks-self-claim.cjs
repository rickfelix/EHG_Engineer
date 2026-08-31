// QF-20260831-947 — WORK_ASSIGNMENT-outranks-self-claim, fork (b) (coordinator ruling
// 6fe0e4fe, 2026-08-31 ~15:18Z; Adam as owner, Solomon concurring on author-intent).
//
// ROOT CAUSE: directed-assignment.cjs's own parent_completion exception (line ~247) ONLY fires
// when the dispatching WORK_ASSIGNMENT's payload.kind is LITERALLY 'parent_completion'. A
// coordinator dispatch that conveys "this is a completable orchestrator parent" only as reply
// PROSE (not that payload tag) gets mechanically purged here as assignment_ineligible_purged,
// and directed-assignment.cjs's run() then falls through with an undefined return -- letting
// runSteps continue straight to the self-claim tiers in the SAME atomic checkin response.
// Witnessed live: SD-ALTIFYAI-LEO-ORCH-SPRINT-2026-002 purged as orchestrator_parent while
// QF-20260831-947 was self-claimed in the same tick.
//
// FIX SHAPE (fork (b), narrow): this is a SEPARATE, LATER pipeline step -- it does not touch
// directed-assignment.cjs at all, so that file's 5 existing tests (including the SEC-H1
// two-axis regression) keep asserting exactly what they always have. When the immediately-prior
// directed-assignment step purged a WORK_ASSIGNMENT as ineligible for the SOLE reason
// orchestrator_parent, this step independently re-verifies completability via
// checkParentCompletable (the SAME shared predicate, never fail-open) and, ONLY if genuinely
// completable, short-circuits the pipeline here -- MECHANICALLY suppressing every self-claim
// tier below for this tick, no prose-reading required. A not-completable or could-not-check
// parent is left exactly as before: undecided, self-claim proceeds as the existing fallback.
//
// Fork (a) -- suppressing self-claim for EVERY ineligible-purge reason -- was explicitly ruled
// out: it is a selector-contract change (Tier-3 SD scope), not this QF.
const { checkParentCompletable } = require('../../fleet/orchestrator-completion.cjs');

module.exports = {
  name: 'directed-assignment-outranks-self-claim',
  applies(ctx) {
    const purge = ctx.base && ctx.base.assignment_ineligible_purged;
    return !!(purge && purge.reason === 'orchestrator_parent' && purge.sd);
  },
  async run(ctx) {
    const { sb } = ctx;
    const sdKey = ctx.base.assignment_ineligible_purged.sd;
    let parentRow = null;
    try {
      const { data, error } = await sb.from('strategic_directives_v2')
        .select('id, sd_key, status').eq('sd_key', sdKey).maybeSingle();
      if (error || !data) return undefined; // could not confirm -- leave self-claim fallthrough as-is
      parentRow = data;
    } catch { return undefined; }

    let check;
    try {
      check = await checkParentCompletable(sb, { id: parentRow.id, sd_key: parentRow.sd_key, status: parentRow.status });
    } catch { return undefined; }
    if (check.couldNotCheck || !check.completable) return undefined; // never fail-open on doubt

    return { ...ctx.base, action: 'directed_assignment_outranks_self_claim', sd: sdKey,
      message: `Directed assignment for ${sdKey} was purged as orchestrator_parent-ineligible, but the parent is independently completable (${check.reason}). Holding for the coordinator instead of self-claiming this tick -- surface to the coordinator/Adam if this needs re-dispatch, then re-run /checkin.` };
  },
};
