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
const { classifyDispatchIneligibility, draftDepsSatisfied, parentLeadPending } = require('./claim-eligibility.cjs');
// The QF claimability predicate is OWNED by the coordinator's supply module. Imported, never
// restated — see countClaimableQuickFixes below for why a local copy would be a gate failure.
const { applyClaimableQfFilter } = require('../coordinator/qf-supply-predicate.cjs');
// SD-LEO-INFRA-QF-SUPPLY-PREDICATE-AUTO-START-001 (FR-3): the WORKER auto-start predicate —
// deliberately narrower than applyClaimableQfFilter (which is also fixture-blind by omission
// for a DIFFERENT consumer, detectThunderingHerd — see qf-supply-predicate.cjs's own docblock
// for why the two must stay independent). Imported, never restated, for the same reason as
// applyClaimableQfFilter above: a local copy is how two consumers drift.
const { isAutoStartableQF } = require('./qf-auto-start.cjs');

// The columns classifyDispatchIneligibility's axes actually read. Kept explicit (not select('*'))
// so a schema change that drops one fails loudly here rather than silently un-gating a row.
// QF-20260725-879: + dependencies — draftDepsSatisfied's ref extractor reads the top-level
// `dependencies` column (metadata is already present for its metadata.* ref keys). WITHOUT this
// column every row would look dependency-free and the dep gate would silently pass everything,
// which is precisely the over-count this QF fixes.
// QF-20260812-281: + parent_sd_id — parentLeadPending(sb, row) reads row.parent_sd_id; without
// it in the select, the check fails open on every row (looks wired, gates nothing).
const ELIGIBILITY_COLUMNS = 'id, sd_key, sd_type, status, metadata, target_application, dependencies, parent_sd_id';

// ---------------------------------------------------------------------------
// LANE SCOPING — SD-LEO-INFRA-BOTH-BELT-GAUGES-001. REPORTING AND DIAGNOSIS ONLY.
//
// NO GATE CONSUMES A SCOPED READING, and that is a REQUIREMENT (FR-1), not a
// limitation to be tidied up later. The demand gate compares `value <= floor`, so
// every scoping moves the reading DOWN and therefore MONOTONICALLY TOWARD SOURCED.
// Measured live: 158 fleet-wide vs 1 in the EHG lane against floor 3 — scoping the
// gate would flip today's verdict from WITHHELD to SOURCED, i.e. fail open ON ITS
// FIRST RUN on the exact axis demand-gate.js exists to hold. Worse, it is unfixable
// from here: both minters shell out to create-quick-fix.js, which mints into the
// GLOBAL pool, so a lane reading cannot correctly gate a global mint no matter how
// carefully the scoping is done. The mismatch is between the reading and the ACTION.
//
// So: scope-CAPABLE for reporting, and the gate keeps reading the fleet total.
const normalizeLane = (v) => String(v == null ? '' : v).toLowerCase().replace(/[^a-z0-9]/g, '');

/** A scope that cannot be resolved to a lane is a FAILED MEASUREMENT, never 0. */
function requireResolvableLane(scope) {
  if (typeof scope !== 'string' || normalizeLane(scope) === '') {
    throw new Error(`belt-depth: unresolvable lane scope (${JSON.stringify(scope)}) — refusing to guess. A scoped read that cannot name its lane must surface as UNMEASURABLE, because returning 0 reads as an empty belt and 0 <= floor SOURCES.`);
  }
}

/**
 * THROW if more than one spelling in `table` normalizes to `scope`.
 *
 * WHY THIS EXISTS RATHER THAN A BARE .eq(). A head-count cannot filter in memory, so
 * the QF gauge must push the lane into PostgREST as an exact match — and an exact
 * match silently drops every other spelling of the same lane. That undercount is the
 * SOURCED direction, and it is silent.
 *
 * MEASURED 2026-08-04, and the result is backwards from what the design assumed:
 * quick_fixes has 1343 rows and ZERO variant lanes, so .eq() is exactly correct there
 * TODAY — while strategic_directives_v2 has SIX variant lanes and 22 at-risk rows
 * (EHG/ehg, datadistill/DataDistill, axiom-insights/"Axiom Insights", ...) and is the
 * gauge that holds its rows and can normalize in memory. The hazard is absent where it
 * would be unfixable and present where it is trivial.
 *
 * That makes the clean QF column SAFE BY COINCIDENCE — safe because the data happens
 * to be tidy, with nothing enforcing it. One 'ehg' landing in quick_fixes would restore
 * the silent undercount with no alarm. This check converts that coincidence into an
 * enforced invariant: the moment a variant appears, the scoped read REFUSES instead of
 * under-reporting.
 *
 * ⚠ READ THIS BEFORE DELETING THIS FUNCTION AS DEAD CODE. It exists BECAUSE the variant
 * count in quick_fixes is currently ZERO — not despite it. If you re-run the measurement,
 * find zero variants, and conclude the guard never fires and can go: that zero is exactly
 * what the guard is protecting, and removing it restores a silent undercount in the
 * SOURCED direction the first time anyone writes 'ehg' instead of 'EHG'. A guard whose
 * condition is currently false is not dead code; it is a guard that is working. The only
 * evidence that would retire this is an ENFORCED constraint on the column (a CHECK, an
 * enum, or a normalising trigger) — at which point delete it and cite the constraint.
 */
async function assertLaneUnambiguous(supabase, table, scope) {
  const { fetchAllPaginated } = await import('../db/fetch-all-paginated.mjs');
  // Paginated deliberately: a truncated read could miss the very variant this guards
  // against, turning the guard into decoration that always passes.
  const rows = await fetchAllPaginated(() => supabase.from(table).select('target_application'));
  const want = normalizeLane(scope);
  const spellings = new Set();
  for (const r of rows || []) {
    if (normalizeLane(r.target_application) === want) spellings.add(r.target_application);
  }
  if (spellings.size > 1) {
    throw new Error(`belt-depth: lane ${JSON.stringify(scope)} is AMBIGUOUS in ${table} — ${JSON.stringify([...spellings])}. An exact-match scope would count one spelling and silently drop the rest, under-reporting toward SOURCED. Refusing to report a number that is wrong in the fail-open direction.`);
  }
}

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
async function countDispatchableBacklog(supabase, scope) {
  const { fetchAllPaginated } = await import('../db/fetch-all-paginated.mjs');
  // queryFactory must return a FRESH builder per page and must NOT pre-range — fetchAllPaginated
  // applies .range() itself.
  let rows = await fetchAllPaginated(() =>
    supabase
      .from('strategic_directives_v2')
      .select(ELIGIBILITY_COLUMNS)
      .eq('status', 'draft')
      .is('claiming_session_id', null));

  // Scoped in MEMORY, not in the query, and that is the correct choice here rather than a
  // convenience: this gauge already holds the rows, and strategic_directives_v2 is the table
  // that actually carries spelling variants (6 lanes, 22 rows). Normalizing absorbs them, so a
  // scoped SD reading is exact by construction and needs no ambiguity guard.
  if (scope !== undefined && scope !== null) {
    requireResolvableLane(scope);
    const want = normalizeLane(scope);
    rows = (rows || []).filter((r) => normalizeLane(r.target_application) === want);
  }

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
    if (!(await draftDepsSatisfied(supabase, row, { throwOnError: true }))) {
      ineligible.dep_blocked = (ineligible.dep_blocked || 0) + 1;
      continue;
    }
    // QF-20260812-281: computeClaimableLeaves (self_reported side, claimable-leaves.mjs:135-137)
    // already applies this gate — a draft child of a not-yet-past-LEAD orchestrator parent is not
    // dispatchable. Without it here, such a child counted as dispatchable on this (recomputed)
    // side but not on self_reported, manufacturing a KPI-3 integrity divergence that did not
    // reflect a real dispatch gap. Same reason string ('parent_lead_pending') evaluateDispatchEligibility
    // already uses at :584, so the ineligible{} breakdown stays consistent across callers.
    if (await parentLeadPending(supabase, row)) {
      ineligible.parent_lead_pending = (ineligible.parent_lead_pending || 0) + 1;
      continue;
    }
    dispatchable += 1;
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
async function countClaimableQuickFixes(supabase, scope) {
  let builder = supabase.from('quick_fixes').select('id', { count: 'exact', head: true });
  if (scope !== undefined && scope !== null) {
    requireResolvableLane(scope);
    // Guard BEFORE the read, not after: once the count comes back there is nothing in it that
    // could reveal the dropped spellings — an undercount and a genuinely small lane are the
    // same number.
    await assertLaneUnambiguous(supabase, 'quick_fixes', scope);
    builder = builder.eq('target_application', scope);
  }
  const { count, error } = await applyClaimableQfFilter(builder);
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

// Columns isAutoStartableQF's row-level checks read, mirroring scripts/worker-checkin.cjs's
// QF_CANDIDATE_COLUMNS (selfClaimQuickFix) minus `severity` (only isCriticalQfJumpEligible
// reads that, which is a priority-ordering concern, not part of the auto-start predicate).
const AUTO_START_CANDIDATE_COLUMNS = 'id, status, pr_url, commit_sha, created_at, routing_tier, title, description, not_before, factory_lane, owner, release_condition, target_application';
const AUTO_START_CANDIDATE_COLUMNS_NO_FACTORY_LANE = AUTO_START_CANDIDATE_COLUMNS.replace(', factory_lane', '');

/**
 * Fetch the raw candidate rows countAutoStartableQuickFixes filters in memory. Split out so the
 * factory_lane probe stays a single LIMIT-1 round trip regardless of how many pages the real
 * fetch needs — factory_lane's existence doesn't vary per row, so probing once and reusing the
 * confirmed column list for the full paginated fetch is correct, not just cheaper.
 */
async function fetchAutoStartCandidateRows(supabase, scope) {
  const { fetchAllPaginated } = await import('../db/fetch-all-paginated.mjs');
  // Adversarial-review finding (deep-tier /ship gate, PR #7040): isAutoStartableQF does not
  // inspect claiming_session_id (it mirrors scripts/worker-checkin.cjs's selfClaimQuickFix
  // candidate query, which relies on claim_sd flipping status to 'in_progress' atomically with
  // the claimant) -- safe for the WORKER, whose downstream claim_sd RPC call is the real
  // arbiter and simply skips a row it can't claim. This gauge has no such downstream arbiter; a
  // status='open'-but-claimed row (a reachable state -- lib/checkin/steps/resume.cjs handles it
  // explicitly, lib/fleet/best-effort-release.mjs writes status/claimant separately) would be
  // over-counted. countClaimableQuickFixes (this function's predecessor here) already applied
  // this filter via applyClaimableQfFilter -- dropping it silently reopens the exact defect
  // class SD-LEO-INFRA-GATE-SIDE-BELT-001 fixed ("IGNORED claiming_session_id ... over-reporting
  // by 3", quoted in capacity-inputs.mjs next to this gauge's own call site). Filtering it can
  // only REDUCE the count -- the safe direction for a gauge answering "how much is really
  // there" -- so it is added at the query level even though the worker's own candidate query
  // does not carry it.
  const applyFilters = (q) => {
    let out = q.eq('status', 'open').is('pr_url', null).is('commit_sha', null).is('claiming_session_id', null);
    if (scope !== undefined && scope !== null) out = out.eq('target_application', scope);
    return out;
  };
  // factory_lane is a staged, not-yet-applied column (database/migrations/
  // 20260713_quick_fixes_factory_lane.sql) — same condition scripts/worker-checkin.cjs's
  // selfClaimQuickFix already retries around (QF-20260720-763). fetchAllPaginated throws on any
  // page error, wrapping it as a plain Error (losing .code), so the retry-on-42703 decision has
  // to be made BEFORE handing a queryFactory to it — hence this cheap LIMIT-1 probe on the raw
  // client, where the real PostgREST error.code is still available. A non-42703 probe error is a
  // genuine failure and propagates (fail-loud, matching fetchAllPaginated's own contract).
  const probe = await applyFilters(supabase.from('quick_fixes').select(AUTO_START_CANDIDATE_COLUMNS)).limit(1);
  if (probe.error && probe.error.code !== '42703') throw probe.error;
  // Adversarial-review finding (deep-tier /ship gate, PR #7040), CRITICAL: the first cut of this
  // guard only ran in the `!probe.error` branch below -- but on LIVE PRODUCTION the probe ALWAYS
  // hits 42703 (factory_lane genuinely does not exist yet), so probe.error is truthy on every
  // real call and that guard never fired. The column list that actually gets used
  // (AUTO_START_CANDIDATE_COLUMNS_NO_FACTORY_LANE) was never itself probed -- it went straight
  // into fetchAllPaginated, whose own `Array.isArray(data) ? data : []` coercion
  // (lib/db/fetch-all-paginated.mjs:40) would have silently turned a genuine {data:null,
  // error:null} failure into a healthy-looking 0, exactly the fail-open direction TR-1 exists to
  // close. Fix: re-probe with the CONFIRMED column list before trusting it, so the shape check
  // below always covers the query fetchAllPaginated is about to run, not a discarded first
  // attempt.
  let columns = AUTO_START_CANDIDATE_COLUMNS;
  let confirmedProbeData = probe.data;
  if (probe.error) {
    columns = AUTO_START_CANDIDATE_COLUMNS_NO_FACTORY_LANE;
    const retryProbe = await applyFilters(supabase.from('quick_fixes').select(columns)).limit(1);
    // A second failure here is never the expected 42703 (factory_lane is already excluded) --
    // always a genuine, unanticipated failure. Fail loud.
    if (retryProbe.error) throw retryProbe.error;
    confirmedProbeData = retryProbe.data;
  }
  // TR-1: countClaimableQuickFixes's SEC-GSB-1 contract exists because a missing relation can come
  // back as {count:null, error:null} under head:true — a non-array/null successful-looking response
  // with no error at all. fetchAllPaginated's own defensive `Array.isArray(data) ? data : []`
  // coercion (lib/db/fetch-all-paginated.mjs:40) shows the same shape is a live enough concern for a
  // plain row-select that its own author guarded it — silently, in the fail-open direction. This
  // probe is the one place that shape is still checkable (fetchAllPaginated discards it inside its
  // own loop), so it is checked HERE, against the CONFIRMED column list: no error but data isn't an
  // array is treated as a failed measurement, not an empty table.
  if (!Array.isArray(confirmedProbeData)) {
    throw new Error(`countAutoStartableQuickFixes: probe returned data=${JSON.stringify(confirmedProbeData)} with no error — refusing to treat an unreadable quick_fixes table as empty`);
  }
  return fetchAllPaginated(() => applyFilters(supabase.from('quick_fixes').select(columns)));
}

/**
 * QF-side depth, WORKER-AUTO-START definition: quick_fixes a worker's /checkin self-claim path
 * would actually pick up right now. NOT interchangeable with countClaimableQuickFixes — that
 * reading is deliberately looser (unclaimed + open-ish status only; see
 * lib/coordinator/qf-supply-predicate.cjs's docblock for why detectThunderingHerd needs the wider
 * count). This is the same isAutoStartableQF predicate worker-checkin.cjs's self-claim loop runs,
 * so a "belt depth" that includes stale/factory-lane/chairman-gated/risk-flagged rows a worker
 * would never actually reach stops happening. SD-LEO-INFRA-QF-SUPPLY-PREDICATE-AUTO-START-001.
 *
 * FAIL-LOUD, same contract as countClaimableQuickFixes and countDispatchableBacklog: an unreadable
 * belt must never present as an empty one. fetchAutoStartCandidateRows propagates any real query
 * error; this function does the JS-side filtering only after that succeeds.
 *
 * @param {object} supabase
 * @returns {Promise<number>} count of quick_fixes rows isAutoStartableQF admits right now
 */
async function countAutoStartableQuickFixes(supabase, scope) {
  if (scope !== undefined && scope !== null) {
    requireResolvableLane(scope);
    await assertLaneUnambiguous(supabase, 'quick_fixes', scope);
  }
  const rows = await fetchAutoStartCandidateRows(supabase, scope);
  const nowMs = Date.now();
  return (rows || []).filter((row) => isAutoStartableQF(row, nowMs)).length;
}

/**
 * Both readings together, for a caller that legitimately wants claimable WORK rather than claimable
 * SDs. `total` is the sum and is NOT interchangeable with sdDepth — a consumer that swaps one for
 * the other moves whatever threshold it feeds.
 *
 * @param {object} supabase
 * @returns {Promise<{sdDepth:number, qfDepth:number, total:number, raw:number, ineligible:object}>}
 */
async function countBeltDepth(supabase, scope) {
  const sd = await countDispatchableBacklog(supabase, scope);
  // SD-LEO-INFRA-QF-SUPPLY-PREDICATE-AUTO-START-001 (FR-3): was countClaimableQuickFixes (the
  // looser "unclaimed + open-ish" reading). Belt depth is supposed to answer "how much work is
  // actually there for a worker to pick up" — countAutoStartableQuickFixes is the reading that
  // matches what a worker's self-claim loop would really take. countClaimableQuickFixes itself is
  // untouched: lib/governance/qf-mint-gate.mjs still calls it directly for its own contract (a
  // mint-floor supply gauge, not a belt-depth reading). scripts/lib/capacity-inputs.mjs's OWN
  // QF term was ALSO switched to countAutoStartableQuickFixes (FR-4) — it has no remaining call
  // to countClaimableQuickFixes at all.
  const qfDepth = await countAutoStartableQuickFixes(supabase, scope);
  return { sdDepth: sd.dispatchable, qfDepth, total: sd.dispatchable + qfDepth, raw: sd.raw, ineligible: sd.ineligible };
}

module.exports = { countDispatchableBacklog, countClaimableQuickFixes, countAutoStartableQuickFixes, countBeltDepth, ELIGIBILITY_COLUMNS };
