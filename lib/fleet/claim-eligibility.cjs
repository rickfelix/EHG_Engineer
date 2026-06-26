'use strict';
/**
 * Shared SD dispatch-eligibility predicate (SD-LEO-FIX-COORDINATOR-SWEEP-CLAIMED-001).
 *
 * Single source of truth for "may this SD be dispatched/claimed onto a worker?" — used by BOTH
 * the worker-PULL path (scripts/worker-checkin.cjs self_claim) and the coordinator/sweep-PUSH path
 * (scripts/stale-session-sweep.cjs CLAIM_FIX). Previously the self_claim path guarded
 * orchestrator-parents + dep-blocked SDs (SD-FDBK-FIX-WORKER-SELF-CLAIM-001) while CLAIM_FIX did
 * not — a PAT-WRITER-CONSUMER-ASYMMETRY that let coordinator-push route an orchestrator PARENT
 * (SD-LEO-FEAT-POST-BUILD-LIFECYCLE-001) onto a worker. Sharing the predicate prevents the drift
 * from recurring.
 *
 * Eligibility rules (an SD is INELIGIBLE for worker dispatch when):
 *   - sd_type === 'orchestrator' (a parent — auto-completes on its children; never worker-built), OR
 *   - sd_key is a test-fixture key (SD-DEMO-* / SD-TEST-* — phantoms that surface transiently during
 *     test runs and must never be routed onto a real worker), OR
 *   - metadata.requires_human_action is truthy (a POSTGRES-001-class SD that a human must action), OR
 *   - any referenced dependency is not status='completed' (dep-blocked).
 *
 * The first three axes are DB-FREE (decidable from an already-loaded SD row), so they live in the pure
 * synchronous classifyDispatchIneligibility() below and are shared by every dispatch consumer WITHOUT
 * adding per-SD queries (SD-FDBK-INFRA-CONVERGE-WORK-ASSIGNMENT-001). Dependency satisfaction is the
 * only DB-backed axis and remains path-specific (the sweep uses a local completedKeys set; the
 * self_claim/evaluate paths use draftDepsSatisfied).
 */

/** Test-fixture key families that must never be dispatched onto a worker. Word-boundary anchored so
 *  real keys that merely START with these letters (SD-TESTABLE-*, SD-DEMONSTRATE-*) are NOT excluded. */
const TEST_FIXTURE_KEY_RE = /^SD-(DEMO|TEST)\b/;

// SD-LEO-INFRA-WORKER-CLAIM-TIME-001 (FR-2): claim-time fitness predicate (repo-match + premise +
// preconditions), composed here so the same gate that excludes orchestrator parents / fixtures /
// human-action SDs also excludes work that is unfit for the CURRENT checkout. Fail-open by design.
const { isSdExecutableHere } = require('./sd-executable-here.cjs');

/**
 * PURE, synchronous, DB-free dispatch-ineligibility classifier for the non-dependency axes.
 * Returns null when the SD is eligible on these axes, or a reason string when it is ineligible.
 * Shared by evaluateDispatchEligibility (after its fetch), the sweep available-set filter, and the
 * worker self_claim draft path — one source of truth so the classes cannot drift apart again.
 *
 * SD-LEO-INFRA-WORKER-CLAIM-TIME-001 (FR-2): an OPTIONAL `ctx` enables the claim-time fitness axes
 * (repo-match against ctx.cwd / ctx.currentApp, premise-open, preconditions). When `ctx` is omitted
 * the behavior is BYTE-IDENTICAL to before (zero regression for the ~existing callers); the SD row
 * must carry `target_application` + `status` for the repo/premise axes to apply (absent => fail-open
 * fit). isSdExecutableHere fails open, so a fitness fault never adds an ineligibility.
 *
 * SD-LEO-INFRA-COMPLEXITY-TIERED-WORKER-ASSIGNMENT-001 (FR-3): an OPTIONAL ctx.worker_tier_rank +
 * ctx.tiering_active enable the WORK-DOWN-NEVER-UP axis — a worker skips any SD whose stamped
 * metadata.min_tier_rank exceeds its own rung. Pure/DB-free (reads the already-stamped rank);
 * BYTE-IDENTICAL when ctx omits the new fields (existing callers pass only {cwd}).
 *
 * @param {{ sd_key?: string, sd_type?: string, metadata?: object, target_application?: string, status?: string }} sdRow
 * @param {{ cwd?: string, currentApp?: string, worker_tier_rank?: number, tiering_active?: boolean }} [ctx]  when present, applies the claim-time fitness + tier axes
 * @returns {null | 'orchestrator_parent' | 'test_fixture_key' | 'human_action_required' | 'sd_deferred' | 'sd_terminal' | 'above_worker_tier' | 'unfit_repo_mismatch' | 'unfit_premise_closed' | 'unfit_missing_precondition'}
 */
function classifyDispatchIneligibility(sdRow, ctx) {
  const row = sdRow || {};
  if (row.sd_type === 'orchestrator') return 'orchestrator_parent';
  if (typeof row.sd_key === 'string' && TEST_FIXTURE_KEY_RE.test(row.sd_key)) return 'test_fixture_key';
  if (row.metadata && row.metadata.requires_human_action) return 'human_action_required';
  // SD-FDBK-INFRA-STALE-SESSION-SWEEP-001: a DEFERRED SD is parked off the belt (coordinator/Adam
  // deferral) and must NEVER be re-dispatched — without this the sweep CLAIM_FIX re-asserted a
  // deferred SD's claim onto a worker with a live worktree every tick, defeating the deferral and
  // re-trapping the worker. Terminal SDs (completed/cancelled) are likewise never claimable (the
  // sweep also terminal-guards these earlier; this is the shared-SSOT defense so the worker
  // self-claim path refuses them too). Active/claimable statuses fall through unchanged.
  if (row.status === 'deferred') return 'sd_deferred';
  if (row.status === 'completed' || row.status === 'cancelled') return 'sd_terminal';
  // FR-3 WORK-DOWN-NEVER-UP: a below-rung worker skips above-rung work, but ONLY when tiering is
  // active (>= 2 live workers, FR-5) and the caller supplied its rung. A higher rung may take lower
  // work (no block when worker_tier_rank >= min_tier_rank). Unscored SDs (no min_tier_rank) fall
  // through unchanged. ctx-gated => byte-identical for callers that omit the tier fields.
  if (ctx && ctx.tiering_active === true && Number.isFinite(Number(ctx.worker_tier_rank))) {
    const minRank = Number(row.metadata && row.metadata.min_tier_rank);
    if (Number.isFinite(minRank) && minRank > Number(ctx.worker_tier_rank)) return 'above_worker_tier';
  }
  if (ctx) {
    try {
      const verdict = isSdExecutableHere(row, ctx);
      if (verdict && verdict.fit === false && verdict.blockClass) return `unfit_${verdict.blockClass}`;
    } catch { /* fail-open: a fitness fault never blocks dispatch */ }
  }
  return null;
}

/**
 * Are ALL of this SD's dependencies satisfied (each referenced SD completed)?
 * The `dependencies` array is heterogeneously shaped across the fleet: plain text
 * ("SD-X needs Y"), {sd_id:"SD-X"}, {sd_key:"SD-X"}, {sd_key:"none"} sentinel, and free-form
 * {type,status,dependency} notes with NO SD ref. Each element resolves to a referenced sd_key;
 * elements with no SD ref (or the "none" sentinel) are non-blocking. Re-implemented here rather than
 * trusting v_sd_next_candidates.deps_satisfied: that column historically mis-evaluated object-shaped
 * deps (it text-compared the whole JSON object, never matching a completed key); the 2026-06-08 view
 * fix (SD-LEO-INFRA-FIX-NEXT-CANDIDATES-001) corrected it, but this DB-backed re-check is retained as
 * a claim-time guard independent of the view (and the view never gated on sd_type/orchestrator-parent).
 *
 * Error semantics are caller-selectable so the two dispatch paths can differ safely:
 *   - default ({ throwOnError:false }) -> returns false on a query error (worker-checkin self_claim:
 *     conservative skip; never claim a maybe-blocked SD). This preserves the prior behavior exactly.
 *   - { throwOnError:true } -> rethrows the query error so the sweep's CLAIM_FIX can treat an error
 *     as "uncertain -> no-op this cycle" rather than "confirmed dep-blocked -> clear the claim".
 */
async function draftDepsSatisfied(sb, sd, { throwOnError = false } = {}) {
  const deps = Array.isArray(sd.dependencies) ? sd.dependencies : [];
  const refKeys = [];
  for (const e of deps) {
    let k = null;
    if (typeof e === 'string') k = e.split(/\s/)[0];
    else if (e && typeof e === 'object') k = e.sd_id || e.sd_key || null;
    if (!k || k === 'none' || k === 'None') continue; // no SD ref / sentinel -> non-blocking
    refKeys.push(k);
  }
  if (!refKeys.length) return true;
  try {
    const { data, error } = await sb.from('strategic_directives_v2').select('sd_key, status').in('sd_key', refKeys);
    if (error) throw error;
    const statusByKey = Object.fromEntries((data || []).map((r) => [r.sd_key, r.status]));
    return refKeys.every((k) => statusByKey[k] === 'completed');
  } catch (e) {
    if (throwOnError) throw e;
    return false; // conservative: don't claim a maybe-blocked SD on a query error
  }
}

// Phases at/before LEAD-TO-PLAN — a parent here has NOT yet passed LEAD.
const PRE_LEAD_PASS_PHASES = new Set(['LEAD', 'LEAD_APPROVAL']);

/**
 * SD-REFILL-00SO4HZY: an orchestrator CHILD must not be dispatched until its PARENT passes LEAD
 * (LEAD-TO-PLAN accepted). Before that, the child is claimable+buildable through PLAN, then hits a
 * hard EXEC-transition block (a child cannot enter EXEC until the parent completes LEAD) — wasting
 * PLAN cycles + churn. This re-fetches the parent and reports whether it is still pre-LEAD-pass.
 *   true  -> parent exists and is NOT past LEAD (status != completed AND current_phase in {LEAD,LEAD_APPROVAL}) -> child NOT dispatchable.
 *   false -> no parent / parent past LEAD / completed -> not blocked on this axis.
 * Fail-open on any query fault or missing parent (never strand a child on a transient error); the
 * caller composes this with the other eligibility axes.
 * @returns {Promise<boolean>} true when the child is blocked by a parent that has not yet passed LEAD.
 */
async function parentLeadPending(sb, sd) {
  const parentRef = sd && sd.parent_sd_id;
  if (!parentRef) return false;                                  // not an orchestrator child
  try {
    const { data, error } = await sb
      .from('strategic_directives_v2')
      .select('status, current_phase')
      .or(`id.eq.${parentRef},sd_key.eq.${parentRef}`)           // parent_sd_id references the parent id (== sd_key here)
      .maybeSingle();
    if (error || !data) return false;                            // fail-open: can't confirm -> don't strand the child
    if (data.status === 'completed') return false;               // parent done -> children fully workable
    return PRE_LEAD_PASS_PHASES.has(String(data.current_phase || '').toUpperCase());
  } catch {
    return false;                                                // fail-open
  }
}

/**
 * Evaluate whether an SD may be dispatched/claimed onto a worker. Returns a discriminated verdict
 * so callers can distinguish CONFIRMED-ineligible from a query error:
 *   { eligible: true }
 *   { eligible: false, reason: 'orchestrator_parent' | 'dep_blocked' | 'sd_not_found' }
 * THROWS on a query error (the lookup or the dep-status check) — the caller decides how to degrade.
 * `sdKey` is the sd_KEY string (v_sd_next_candidates.sd_id holds the key; claude_sessions.sd_key too).
 */
async function evaluateDispatchEligibility(sb, sdKey, ctx) {
  const { data, error } = await sb
    .from('strategic_directives_v2')
    // SD-LEO-INFRA-WORKER-CLAIM-TIME-001 (FR-2): target_application + status added so the optional
    // claim-time fitness axes (repo-match / premise-open) have the fields they need when ctx is passed.
    // SD-REFILL-00SO4HZY: + parent_sd_id so the parent-LEAD gate (below) can see if this is an
    // orchestrator child whose parent has not yet passed LEAD.
    .select('sd_key, sd_type, dependencies, metadata, target_application, status, parent_sd_id')
    .eq('sd_key', sdKey)
    .maybeSingle();
  if (error) throw error;                                       // uncertain -> caller decides
  if (!data) return { eligible: false, reason: 'sd_not_found' }; // can't verify -> not dispatchable
  // Shared DB-free axes (orchestrator-parent, test-fixture, human-action) + optional fitness (ctx).
  // data carries sd_key from the query above so the fixture check resolves even though the caller
  // passed sdKey separately.
  const ineligible = classifyDispatchIneligibility({ ...data, sd_key: data.sd_key || sdKey }, ctx);
  if (ineligible) return { eligible: false, reason: ineligible };
  // SD-REFILL-00SO4HZY: a child of an orchestrator parent that has not yet passed LEAD is NOT
  // dispatchable — claiming it now only burns PLAN cycles before the hard EXEC-transition block.
  if (await parentLeadPending(sb, data)) return { eligible: false, reason: 'parent_lead_pending' };
  // SD-LEO-INFRA-AUTO-REFILL-SELECTION-GATE-001-D: claim-time source-integrity guard for auto-refilled
  // SDs only. -C enforces candidate-validity at PROMOTION time; this re-consults the SOURCE row at CLAIM
  // time so a source that was declined/deleted/unlinked AFTER promotion no longer routes onto a worker.
  // Fail-open: any uncertainty (no marker, no source-id, fetch/parse/import error) leaves the SD eligible
  // — a well-formed promoted SD is never stranded on a transient fault. The minted key is always
  // SD-REFILL-*, so the sd_key fixture guard above cannot see a fixture that entered via the source.
  const refillSource = await refillSourceIneligibility(sb, { ...data, sd_key: data.sd_key || sdKey });
  if (refillSource) return { eligible: false, reason: refillSource };
  const depsOk = await draftDepsSatisfied(sb, data, { throwOnError: true }); // propagate dep-query errors
  return depsOk ? { eligible: true } : { eligible: false, reason: 'dep_blocked' };
}

/**
 * SD-LEO-INFRA-AUTO-REFILL-SELECTION-GATE-001-D: for an auto-refilled SD, fetch its SOURCE
 * roadmap_wave_items row and re-check the post-promotion invariants via the pure -A SSOT helper
 * evaluateClaimTimeRefillSource. Returns a `refill_source_<reason>` string when the source is no longer
 * a valid promotion, or null (eligible) otherwise. FAIL-OPEN by contract: only auto-refilled SDs
 * (metadata.sourced_by==='auto-refill' with a promoted_from_roadmap_item_id) are checked, and ANY error
 * — missing marker, missing source id, fetch failure, import failure — returns null so dispatch is never
 * blocked on uncertainty (byte-identical to pre-D behavior for every non-auto-refill SD).
 * @param {object} sb       service-role client
 * @param {{ sd_key?:string, metadata?:object }} sdRow  the already-fetched SD row
 * @returns {Promise<string|null>}
 */
async function refillSourceIneligibility(sb, sdRow) {
  try {
    const md = (sdRow && sdRow.metadata) || {};
    if (md.sourced_by !== 'auto-refill') return null;            // scope: auto-refill SDs only
    const sourceId = md.promoted_from_roadmap_item_id;
    if (!sourceId) return null;                                  // no traceable source -> fail-open
    const { data: source, error } = await sb
      .from('roadmap_wave_items')
      .select('promoted_to_sd_key, lane, title, source_id')
      .eq('id', sourceId)
      .maybeSingle();
    if (error) return null;                                      // fetch fault -> fail-open
    // ESM helper from a CJS module: dynamic import is valid here (this fn is async).
    const { evaluateClaimTimeRefillSource } = await import('../sourcing-engine/refill-candidate-validity.js');
    const verdict = evaluateClaimTimeRefillSource(source, sdRow.sd_key);
    if (verdict && verdict.valid === false && verdict.reason) return `refill_source_${verdict.reason}`;
    return null;
  } catch {
    return null;                                                 // any fault -> fail-open (never strand)
  }
}

/**
 * Boolean wrapper preserving the worker-checkin self_claim contract: false for orchestrator parents,
 * dep-blocked SDs, not-found, OR any query error (conservative: never claim on uncertainty).
 */
async function baselinedCandidateEligible(sb, sdKey, ctx) {
  try {
    return (await evaluateDispatchEligibility(sb, sdKey, ctx)).eligible;
  } catch {
    return false; // conservative: skip this candidate on a query error
  }
}

module.exports = { draftDepsSatisfied, evaluateDispatchEligibility, baselinedCandidateEligible, classifyDispatchIneligibility, parentLeadPending, TEST_FIXTURE_KEY_RE };
