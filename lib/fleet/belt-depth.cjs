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
 * the same claim gate the dispatcher itself uses (classifyDispatchIneligibility), so a held row
 * can never again read as available work on one surface and not the other.
 *
 * Corroborated from three independent directions: Adam's metadata inspection, the coordinator
 * running the classifier across every non-terminal SD, and worker Echo's /checkin returning
 * belt_ranked_claimable=8 with belt_claimable_at_my_tier=0 continuously for ~2.5h.
 */
const { classifyDispatchIneligibility } = require('./claim-eligibility.cjs');

// The columns classifyDispatchIneligibility's axes actually read. Kept explicit (not select('*'))
// so a schema change that drops one fails loudly here rather than silently un-gating a row.
const ELIGIBILITY_COLUMNS = 'id, sd_key, sd_type, status, metadata, target_application';

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
    if (reason) ineligible[reason] = (ineligible[reason] || 0) + 1;
    else dispatchable += 1;
  }
  return { dispatchable, raw: (rows || []).length, ineligible };
}

module.exports = { countDispatchableBacklog, ELIGIBILITY_COLUMNS };
