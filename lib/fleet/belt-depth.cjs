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
// The QF claimability predicate is OWNED by the coordinator's supply module. Imported, never
// restated — see countClaimableQuickFixes below for why a local copy would be a gate failure.
const { applyClaimableQfFilter } = require('../coordinator/qf-supply-predicate.cjs');

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

/**
 * QF-side depth: quick_fixes that a worker could claim right now.
 *
 * WHY IT LIVES HERE AND NOT IN THE CALLER. This module's whole premise (see the header) is that two
 * consumers each owning a copy of the query is how they drift. The QF side had exactly that shape:
 * scripts/coordinator-capacity-forecast.mjs:252 head-counted `status='open'` while ignoring
 * claiming_session_id — so it counted 148 where 145 are actually claimable — and its SD term two
 * dozen lines later DOES skip claimed rows. One surface, two claimability rules.
 *
 * IT REUSES applyClaimableQfFilter RATHER THAN RESTATING THE PREDICATE. lib/coordinator/qf-supply-
 * predicate.cjs already owns "unclaimed and in a claimable status" and is what the coordinator's own
 * supply reads use. Restating it here would make this the twelfth independent depth derivation in a
 * module written to abolish the second — the sibling SD's acceptance criterion names a further
 * implementation as a gate failure rather than a style choice.
 *
 * DELIBERATELY SEPARATE FROM countDispatchableBacklog, NOT FOLDED INTO IT. Widening that function to
 * include quick_fixes would break scripts/adam-coordinator-health.mjs:223, which asserts EXACT
 * equality against an SD-only count and whose asymmetric tolerance was retired at :209-222 — so
 * integrity_ok would read false on every run. Two NAMED readings sharing one implementation is the
 * invariant this module actually asserts; one number everywhere is not.
 *
 * FAIL-LOUD, matching countDispatchableBacklog's contract: a gauge that silently reports 0 when it
 * cannot read is indistinguishable from an empty belt, and an empty belt is an alarm condition.
 * A caller that genuinely wants fail-open must say so at its own call site, in the open.
 *
 * @param {object} supabase
 * @returns {Promise<number>} count of unclaimed, claimable-status quick_fixes
 */
async function countClaimableQuickFixes(supabase) {
  const { count, error } = await applyClaimableQfFilter(
    supabase.from('quick_fixes').select('id', { count: 'exact', head: true }));
  if (error) throw error;
  // A NON-NUMERIC COUNT IS A FAILED MEASUREMENT, NOT AN EMPTY BELT — and this branch, not the
  // `error` branch above, is the dangerous one. PostgREST returns {count:null, error:null} for a
  // missing relation (lib/db/fetch-all-paginated.mjs:93-97 documents exactly that signature and
  // ships renderCount to render 'unavailable' rather than coerce). The first version of this
  // function ended `? count : 0`, so an unreadable gauge produced a genuine finite 0 — which
  // normalizeGaugeReading accepts as a valid reading, so decideDemand's operand guards never fire
  // and 0 <= floor resolves to SOURCED. The gate would OPEN because it could not see the belt.
  // That is the fail-open flood this whole mechanism exists to prevent, sitting one layer BELOW the
  // guard built to stop it. Caught by SECURITY at EXEC-TO-PLAN (SEC-GSB-1): the mutation set pinned
  // the `error` branch and left this one unpinned — the safe half hiding the unsafe half.
  if (typeof count !== 'number' || !Number.isFinite(count)) {
    throw new Error(`countClaimableQuickFixes: measurement FAILED (count=${String(count)}, error=null) — refusing to report a healthy-looking 0 for a belt that could not be read`);
  }
  return count;
}

/**
 * Both readings together, for a caller that legitimately wants claimable WORK rather than claimable
 * SDs. `total` is the sum and is NOT interchangeable with sdDepth — a consumer that swaps one for
 * the other moves whatever threshold it feeds.
 *
 * @param {object} supabase
 * @returns {Promise<{sdDepth:number, qfDepth:number, total:number, raw:number, ineligible:object}>}
 */
async function countBeltDepth(supabase) {
  const sd = await countDispatchableBacklog(supabase);
  const qfDepth = await countClaimableQuickFixes(supabase);
  return { sdDepth: sd.dispatchable, qfDepth, total: sd.dispatchable + qfDepth, raw: sd.raw, ineligible: sd.ineligible };
}

module.exports = { countDispatchableBacklog, countClaimableQuickFixes, countBeltDepth, ELIGIBILITY_COLUMNS };
