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
 *   - metadata.not_before is a future timestamp (a time-gated SD-level hold; QF-20260705-585), OR
 *   - metadata.door_class_note === 'one_way' (Fable-tier-supervised re-architecture; QF-20260705-585), OR
 *   - sd_key matches SD-LEO-FIX-REMEDIATION-* AND target_application is a venture (not
 *     'EHG_Engineer') — an auto-filed Stage-20 quality-loop finding no EHG_Engineer worker can
 *     action (QF-20260705-043; mirrors the coordinator belt exclusion isUnactionableRemediationSd,
 *     lib/coordinator/sd-exclusion.mjs, SD-REFILL-00306WTS), OR
 *   - any referenced dependency is not status='completed' (dep-blocked).
 *
 * The first three axes are DB-FREE (decidable from an already-loaded SD row), so they live in the pure
 * synchronous classifyDispatchIneligibility() below and are shared by every dispatch consumer WITHOUT
 * adding per-SD queries (SD-FDBK-INFRA-CONVERGE-WORK-ASSIGNMENT-001). Dependency satisfaction is the
 * only DB-backed axis and remains path-specific (the sweep uses a local completedKeys set; the
 * self_claim/evaluate paths use draftDepsSatisfied).
 */

/** Test-fixture key families that must never be dispatched onto a worker. Word-boundary anchored so
 *  real keys that merely START with these letters (SD-TESTABLE-*, SD-DEMONSTRATE-*) are NOT excluded.
 *  QF-20260703-773: the SD- prefix is OPTIONAL -- some fixtures (e.g. tests/integration/migrations/
 *  trigger-audit-f3-race-fix.db.test.js) insert bare TEST- or DEMO- prefixed keys with no SD- prefix
 *  at all; those previously passed this guard and leaked onto the real claimable belt when their
 *  afterEach cleanup was interrupted. Mirrors FIXTURE_TITLE_RE in lib/sourcing-engine/refill-candidate-validity.js. */
const TEST_FIXTURE_KEY_RE = /^(SD-)?(DEMO|TEST)\b/i;

// SD-LEO-INFRA-WORKER-CLAIM-TIME-001 (FR-2): claim-time fitness predicate (repo-match + premise +
// preconditions), composed here so the same gate that excludes orchestrator parents / fixtures /
// human-action SDs also excludes work that is unfit for the CURRENT checkout. Fail-open by design.
const { isSdExecutableHere } = require('./sd-executable-here.cjs');
// SD-LEO-INFRA-AUTO-TIERING-ACTIVATION-001-E (FR-6): pure, synchronous backlog comparator for the
// downward-claim reservation branch below. lowerTierBacklog does NOT touch the DB itself — the
// caller precomputes ctx.lower_tier_backlog_data once per tick (see tier-backlog.cjs docstring).
const { lowerTierBacklog } = require('./tier-backlog.cjs');

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
 * BYTE-IDENTICAL when ctx omits the new fields (existing callers pass only {cwd}). QF-20260703-242:
 * when tiering is active but the worker's OWN rank is missing/non-finite, tier-gated SDs (finite
 * min_tier_rank) FAIL CLOSED ('tier_stamp_missing') instead of silently skipping the whole axis.
 *
 * @param {{ sd_key?: string, sd_type?: string, metadata?: object, target_application?: string, status?: string }} sdRow
 * @param {{ cwd?: string, currentApp?: string, worker_tier_rank?: number, tiering_active?: boolean, lower_tier_backlog_data?: object }} [ctx]  when present, applies the claim-time fitness + tier axes
 * @returns {null | 'orchestrator_parent' | 'test_fixture_key' | 'human_action_required' | 'not_before_hold' | 'one_way_door_requires_supervision' | 'co_author_pending' | 'test_clone_build_tree' | 'unactionable_venture_remediation' | 'sd_deferred' | 'sd_terminal' | 'tier_stamp_missing' | 'above_worker_tier' | 'reserved_no_lower_backlog' | 'unfit_repo_mismatch' | 'unfit_premise_closed' | 'unfit_missing_precondition'}
 */
function classifyDispatchIneligibility(sdRow, ctx) {
  const row = sdRow || {};
  if (row.sd_type === 'orchestrator') return 'orchestrator_parent';
  if (typeof row.sd_key === 'string' && TEST_FIXTURE_KEY_RE.test(row.sd_key)) return 'test_fixture_key';
  // QF-20260704-193: the verdict stays a bare string (consumers string-compare it) —
  // callers that need the WHY resolve it via resolveHoldProvenance(row.metadata) below,
  // the SSOT coalescer for the ad-hoc hold-reason keys. Deliberate scope decision over
  // changing this return type (recorded in the QF completion notes).
  if (row.metadata && row.metadata.requires_human_action) return 'human_action_required';
  // QF-20260705-585: metadata.not_before is a future-dated SD-level hold -- mirrors the
  // quick_fixes.not_before semantics already respected in worker-checkin.cjs (L511-515,
  // L1516-1534), generalized here so the self-claim path respects it too (feedback b0ac7ba1:
  // a Sonnet worker self-claimed a Fable-framed, pre-release-window hotspot SD). Auto-clears
  // once the timestamp passes -- no manual flag/clear needed.
  const notBefore = row.metadata && Date.parse(row.metadata.not_before);
  if (Number.isFinite(notBefore) && notBefore > Date.now()) return 'not_before_hold';
  // QF-20260705-585: a one_way door-class SD (metadata.door_class_note === 'one_way') is a
  // re-architecture requiring a Fable-tier session to execute or supervise -- never
  // self-claimable. Still reachable via DIRECTED-ASSIGN (which does not route through this
  // classifier), so the coordinator can hand it to a specific Fable session deliberately.
  if (row.metadata && row.metadata.door_class_note === 'one_way') return 'one_way_door_requires_supervision';
  // SD-LEO-INFRA-CO-AUTHOR-CONVERGE-BEFORE-CLAIMABLE-001: a co-authored DRAFT SD is NON-CLAIMABLE
  // until co-author convergence — else a parked worker claims it and writes the PRD before the
  // co-author input lands, so the late co-author FRs never reach EXEC (the PRD-drift-after-co-author
  // race, [[reference-sd-scope-edits-after-prd-dont-reach-exec]]). Strict === true so a false/absent
  // flag (converged or non-co-authored) falls through unchanged. Shared SSOT: the self-claim (draft +
  // baselined) and stale-session-sweep paths all route through this predicate, so they exclude it too.
  if (row.metadata && row.metadata.co_author_pending === true) return 'co_author_pending';
  // SD-LEO-INFRA-NEEDS-COORDINATOR-REVIEW-HOLD-001: a review-pending SD (metadata.needs_coordinator_review
  // === true) is NON-CLAIMABLE until the coordinator REVIEWS it — the coordinator clearing the flag
  // (set false / remove) IS the dispatch authorization (no separate approval artifact). This is the SHARED
  // authoritative gate the worker self-claim path (baselined + draft) and the stale-session-sweep consult,
  // so the hold holds across all of them. Strict === true so a false/absent flag falls through unchanged.
  // SD-LEO-INFRA-HANDOFF-DISPATCH-AUTHORIZATION-001 (FR-1, mirror-kill): the DIRECTED-ASSIGN path
  // (lib/coordinator/dispatch.cjs assertSdDispatchable) now routes through THIS SAME classifier
  // (with ctx=undefined, so the ctx-gated tier/fitness blocks below are no-ops there) instead of
  // hand-mirroring a subset of axes.
  // Composition: the SELF-CLAIM-WINDOW fetchFleetCriticalCandidates union routes through this classifier,
  // so a fleet_critical-AND-review-pending SD is correctly surfaced-then-EXCLUDED (the hold wins).
  if (row.metadata && row.metadata.needs_coordinator_review === true) return 'needs_coordinator_review';
  // SD-LEO-INFRA-CLONE-BUILD-TREE-BELT-EXCLUSION-001: a CLONE venture's build-tree (orchestrator +
  // children + grandchildren, stamped metadata.test_clone_build_tree=true at creation by
  // lib/eva/lifecycle-sd-bridge.js convertSprintToSDs) is a throwaway test-clone MVP that must never
  // reach a worker belt — else the fleet builds it unless the coordinator manually defers every clone.
  // DB-free marker (strict === true), read here so BOTH the self_claim and stale-session-sweep paths
  // exclude it. The clone determination happens ONCE at bridge creation (where the ventures query
  // already runs); a venture->clone JOIN deliberately stays OUT of this pure/synchronous/DB-free predicate.
  if (row.metadata && row.metadata.test_clone_build_tree === true) return 'test_clone_build_tree';
  // QF-20260705-043: an auto-filed Stage-20 quality-loop remediation SD (fr-c-prime-generator)
  // targeting a VENTURE (target_application e.g. 'EHG') rather than the fleet's own checkout
  // (EHG_Engineer) cannot be actioned by a worker here — mirrors the coordinator's belt exclusion
  // (isUnactionableRemediationSd, lib/coordinator/sd-exclusion.mjs, SD-REFILL-00306WTS), which
  // excluded these from ranking but left them claimable via self-claim. Live incident: worker
  // self-claimed SD-LEO-FIX-REMEDIATION-LINT-MEDIUM-005 (a fr-c-generator.test.js real-DB fixture
  // row, fc000000- sentinel venture_id) within 0.5s of its creation; the test's own cleanup
  // cancelled+deleted the row 2s later and sd-start.js crashed on the vanished row. CONSERVATIVE:
  // requires BOTH the canonical key prefix AND a non-EHG_Engineer target — a remediation SD
  // genuinely targeting EHG_Engineer (or with no target) is unaffected.
  if (typeof row.sd_key === 'string' && /^SD-LEO-FIX-REMEDIATION-/.test(row.sd_key)) {
    const target = row.target_application || (row.metadata && row.metadata.target_application);
    if (typeof target === 'string' && target !== '' && target !== 'EHG_Engineer') {
      return 'unactionable_venture_remediation';
    }
  }
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
  if (ctx && ctx.tiering_active === true) {
    const minRank = Number(row.metadata && row.metadata.min_tier_rank);
    // QF-20260703-242: a missing/non-finite worker tier stamp must FAIL CLOSED on tier-gated SDs
    // (minRank finite) instead of silently skipping this whole axis — else an unstamped or
    // momentarily-flapping worker can self-claim above its real rung. Unscored SDs (no
    // min_tier_rank) are unaffected: there is nothing to gate against.
    if (!Number.isFinite(Number(ctx.worker_tier_rank))) {
      if (Number.isFinite(minRank)) return 'tier_stamp_missing';
    } else {
      const workerRank = Number(ctx.worker_tier_rank);
      if (Number.isFinite(minRank) && minRank > workerRank) return 'above_worker_tier';
      // FR-6 WORK-DOWN-ONLY-WHEN-LOWER-TIER-BACKLOGGED: a worker claims AT its own rung
      // unconditionally (minRank === workerRank falls through unchanged); claiming a STRICTLY
      // LOWER rung is gated on that lower tier having a genuine backlog, reserving capability
      // otherwise. ctx.lower_tier_backlog_data is OPTIONAL and precomputed by the caller once per
      // tick (lowerTierBacklog's inputs are DB-dependent, so they cannot be computed inside this
      // pure/sync classifier) — omitted => byte-identical pre-FR-6 WORK-DOWN-ALWAYS behavior for
      // any caller that has not wired it yet.
      if (Number.isFinite(minRank) && minRank < workerRank && ctx.lower_tier_backlog_data) {
        if (!lowerTierBacklog(minRank, ctx.lower_tier_backlog_data)) return 'reserved_no_lower_backlog';
      }
    }
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
  // QF-20260706-786: metadata.blocked_on_sd is an ad-hoc single-dependency hold (distinct
  // from the `dependencies` array) that a boolean flag (requires_human_action) can be
  // cleared without the referenced SD actually completing. Folding it into refKeys means
  // this axis is re-derived from LIVE status every time, independent of that flag.
  const blockedOn = sd.metadata && sd.metadata.blocked_on_sd;
  if (typeof blockedOn === 'string' && blockedOn && blockedOn !== 'none') refKeys.push(blockedOn);
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
      .select('promoted_to_sd_key, lane, title, source_id') // schema-lint-disable-line: roadmap_wave_items.lane exists live; snapshot stale (pre-existing select, re-flagged by an unrelated edit)
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

/**
 * QF-20260704-193: coalesce the KNOWN ad-hoc hold-provenance keys into ONE reading.
 * requires_human_action holds were stamped by different writers under different
 * metadata keys (coordinator defers: not_worker_claimable_reason/deferred_by;
 * bridge review-holds: review_hold_reason; pilot parking: pilot_throwaway) — so
 * every surface that wanted to explain a hold had to know every key, most printed
 * nothing, and a 3 AM operator could not tell deliberate-vs-accidental without
 * hand-querying metadata (live specimen: the 47 rha-frozen sprint children,
 * 2026-07-05). This reader lives HERE — beside the classifyDispatchIneligibility
 * verdict that consumes the flag — so ranker/dashboard/eligibility all resolve
 * the same provenance. Writers SHOULD stamp requires_human_action_reason
 * (+ requires_human_action_by / _at) going forward; legacy keys stay readable.
 * Pure; returns null when no reason key is present (a bare boolean hold).
 * @param {object|null|undefined} metadata - strategic_directives_v2.metadata
 * @returns {null | { reason: string, set_by: string|null, set_at: string|null, source_key: string }}
 */
function resolveHoldProvenance(metadata) {
  const m = metadata || {};
  // Adversarial-review W3: strip control chars (newlines/ANSI escapes) from
  // metadata-sourced strings — they reach console skip-lines and the dashboard,
  // where an embedded \n or ESC could forge/alter rendered lines.
  const s = (v) => {
    if (typeof v !== 'string') return null;
    const clean = v.replace(/[\x00-\x1f\x7f]/g, ' ').trim();
    return clean || null;
  };
  const canonical = s(m.requires_human_action_reason);
  if (canonical) {
    return { reason: canonical, set_by: s(m.requires_human_action_by), set_at: s(m.requires_human_action_at), source_key: 'requires_human_action_reason' };
  }
  const notClaimable = s(m.not_worker_claimable_reason);
  if (notClaimable) {
    return { reason: notClaimable, set_by: s(m.not_worker_claimable_by) || s(m.deferred_by), set_at: s(m.not_worker_claimable_at) || s(m.deferred_at), source_key: 'not_worker_claimable_reason' };
  }
  const reviewHold = s(m.review_hold_reason);
  if (reviewHold) {
    return { reason: reviewHold, set_by: s(m.review_hold_by), set_at: s(m.review_hold_at), source_key: 'review_hold_reason' };
  }
  const dispatchIneligible = s(m.dispatch_ineligible_reason);
  if (dispatchIneligible) {
    return { reason: dispatchIneligible, set_by: null, set_at: null, source_key: 'dispatch_ineligible_reason' };
  }
  if (m.pilot_throwaway === true) {
    return { reason: 'pilot throwaway venture', set_by: s(m.deferred_by), set_at: s(m.deferred_at), source_key: 'pilot_throwaway' };
  }
  if (s(m.deferred_by) || s(m.deferred_at)) {
    return { reason: `deferred by ${s(m.deferred_by) || '?'}`, set_by: s(m.deferred_by), set_at: s(m.deferred_at), source_key: 'deferred_by' };
  }
  return null;
}

/** Pure: one-line render of a provenance object for skip lines / dashboards. */
function formatHoldProvenance(prov) {
  if (!prov || !prov.reason) return 'no reason recorded';
  const by = prov.set_by ? ` — by ${prov.set_by}` : '';
  const at = prov.set_at ? ` @ ${prov.set_at}` : '';
  return `${prov.reason}${by}${at}`;
}

// SD-LEO-INFRA-HANDOFF-DISPATCH-AUTHORIZATION-001 (FR-2): OPT-IN dispatch_auth check,
// wiring SD-1's decision-binding primitive (lib/decision-binding/disposition.js, ESM —
// dynamic import() since this module is CJS). When an SD does NOT opt in via
// metadata.dispatch_auth_required===true, this returns authorized:true IMMEDIATELY with
// no DB lookup — zero behavior change for the ~100% of SDs that never set the flag. This
// is the primitive WIRING, not a default-on gate; async (needs a Supabase client), so it
// is deliberately NOT called from the synchronous classifyDispatchIneligibility above.
//
// @param {{ sd_key?: string, metadata?: object }} sd
// @param {object} supabase - Supabase client (service-role), required only when the SD opts in
// @returns {Promise<{ authorized: boolean, reason?: string }>}
async function isDispatchAuthorized(sd, supabase) {
  const row = sd || {};
  if (!(row.metadata && row.metadata.dispatch_auth_required === true)) {
    return { authorized: true };
  }
  const { getDispositionBySubject } = await import('../decision-binding/disposition.js');
  const disposition = await getDispositionBySubject(supabase, 'dispatch_auth', {
    subject_id: row.sd_key,
    gate_type: 'dispatch',
  });
  if (disposition && (disposition.payload.status === 'dispositioned' || disposition.payload.status === 'consumed')) {
    return { authorized: true };
  }
  return { authorized: false, reason: 'dispatch_auth_pending' };
}

module.exports = { draftDepsSatisfied, evaluateDispatchEligibility, baselinedCandidateEligible, classifyDispatchIneligibility, parentLeadPending, TEST_FIXTURE_KEY_RE, resolveHoldProvenance, formatHoldProvenance, isDispatchAuthorized };
