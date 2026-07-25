/**
 * Belt/backlog DEPTH gauge — QF-20260725-089.
 *
 * THE BUG THIS REPLACES: both consumers independently ran
 *   .eq('status','draft').is('claiming_session_id', null)
 * and emitted the raw count as "dispatchable". Measured 2026-07-25 that read 8 while TRUE
 * claimable depth was 0 — the 8 being 7x human_action_required plus orchestrator parents,
 * deferred/fenced rows and a test fixture. One ungated number, two governance surfaces, wrong
 * in OPPOSITE directions: it fired IDLE_WITH_BACKLOG against the coordinator (a dispatch gap
 * that did not exist) while scoring Adam D1 5/5 for a full belt at the moment the belt was empty.
 *
 * WHY THIS IS A SHARED MODULE, not a filter in each caller: the two consumers drifted apart
 * precisely because each owned its own copy of the query. Depth is computed HERE, once, through
 * the same claim gate the dispatcher itself uses (the structural classifyDispatchIneligibility
 * axes PLUS the async evaluateDispatchEligibility dependency gate — QF-20260725-879), so a held
 * or dep-blocked row can never again read as available work on one surface and not the other.
 *
 * Corroborated from three independent directions: Adam's metadata inspection, the coordinator
 * running the classifier across every non-terminal SD, and worker Echo's /checkin returning
 * belt_ranked_claimable=8 with belt_claimable_at_my_tier=0 continuously for ~2.5h.
 */
const { classifyDispatchIneligibility, draftDepsSatisfied } = require('./claim-eligibility.cjs');

// The columns classifyDispatchIneligibility's axes actually read. Kept explicit (not select('*'))
// so a schema change that drops one fails loudly here rather than silently un-gating a row.
// QF-20260725-879: + dependencies — draftDepsSatisfied's ref extractor reads the top-level
// `dependencies` column (metadata is already present for its metadata.* ref keys). WITHOUT this
// column every row would look dependency-free and the dep gate would silently pass everything,
// which is precisely the over-count this QF fixes.
const ELIGIBILITY_COLUMNS = 'id, sd_key, sd_type, status, metadata, target_application, dependencies';

/**
 * Count belt depth with ineligible rows excluded BEFORE emission.
 *
 * Deliberately fetches rows rather than using a head-count: eligibility cannot be expressed as a
 * PostgREST filter, so the classifier needs the rows. The prior head-count existed to dodge the
 * 1000-row cap (a truncated read would corrupt this invariant); fetchAllPaginated preserves that
 * protection by range-paginating past the cap instead of silently under-reporting depth.
 *
 * @param {object} supabase
 * @returns {Promise<{dispatchable:number, raw:number, ineligible:Record<string,number>}>}
 */
async function countDispatchableBacklog(supabase) {
  const { fetchAllPaginated } = await import('../db/fetch-all-paginated.mjs');
  // queryFactory must return a FRESH builder per page and must NOT pre-range — fetchAllPaginated
  // applies .range() itself.
  const rows = await fetchAllPaginated(() =>
    supabase
      .from('strategic_directives_v2')
      .select(ELIGIBILITY_COLUMNS)
      .eq('status', 'draft')
      .is('claiming_session_id', null));

  const ineligible = {};
  let dispatchable = 0;
  for (const row of rows || []) {
    // No ctx: this is the STRUCTURAL gate (orchestrator parent, human-action hold, deferred,
    // fenced, test fixture, not-before). Tier/fitness axes are per-worker and deliberately not
    // applied to a fleet-wide depth gauge.
    const reason = classifyDispatchIneligibility(row);
    if (reason) { ineligible[reason] = (ineligible[reason] || 0) + 1; continue; }
    // QF-20260725-879: the sync classifier above is DB-BLIND BY DESIGN, so it cannot evaluate
    // DEPENDENCIES at all — that gate is async and lived only in evaluateDispatchEligibility. A
    // dep_blocked SD therefore survived this loop and was counted as dispatchable, manufacturing
    // an integrity divergence that did not exist (measured: recomputed=1 vs self_reported=0,
    // integrity_ok=false, falsely indicting the coordinator for a dispatch failure that never
    // happened while everything downstream was genuinely blocked).
    //
    // Reuses draftDepsSatisfied — the SAME dependency predicate evaluateDispatchEligibility
    // itself calls — so there is ONE dependency definition across depth, dispatch and the
    // stale-session-sweep. Deliberately NOT evaluateDispatchEligibility(sb, sd_key): that
    // re-fetches each row by key, and these rows are already in hand — it would add an N+1 and
    // force every consumer's test seam to model a per-row SD fetch, for no added signal.
    // Cost is near-zero: draftDepsSatisfied short-circuits before any query when a row carries
    // no dependency refs, so only dep-carrying rows touch the DB.
    // throwOnError: a dep-query fault must PROPAGATE — this gauge's contract is fail-loud, and
    // silently treating an unverifiable row as dispatchable is the exact over-count being fixed.
    if (await draftDepsSatisfied(supabase, row, { throwOnError: true })) dispatchable += 1;
    else ineligible.dep_blocked = (ineligible.dep_blocked || 0) + 1;
  }
  return { dispatchable, raw: (rows || []).length, ineligible };
}

module.exports = { countDispatchableBacklog, ELIGIBILITY_COLUMNS };
