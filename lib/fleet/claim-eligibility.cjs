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
 *   - any referenced dependency is not status='completed' (dep-blocked).
 */

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

/**
 * Evaluate whether an SD may be dispatched/claimed onto a worker. Returns a discriminated verdict
 * so callers can distinguish CONFIRMED-ineligible from a query error:
 *   { eligible: true }
 *   { eligible: false, reason: 'orchestrator_parent' | 'dep_blocked' | 'sd_not_found' }
 * THROWS on a query error (the lookup or the dep-status check) — the caller decides how to degrade.
 * `sdKey` is the sd_KEY string (v_sd_next_candidates.sd_id holds the key; claude_sessions.sd_key too).
 */
async function evaluateDispatchEligibility(sb, sdKey) {
  const { data, error } = await sb
    .from('strategic_directives_v2')
    .select('sd_type, dependencies')
    .eq('sd_key', sdKey)
    .maybeSingle();
  if (error) throw error;                                       // uncertain -> caller decides
  if (!data) return { eligible: false, reason: 'sd_not_found' }; // can't verify -> not dispatchable
  if (data.sd_type === 'orchestrator') return { eligible: false, reason: 'orchestrator_parent' };
  const depsOk = await draftDepsSatisfied(sb, data, { throwOnError: true }); // propagate dep-query errors
  return depsOk ? { eligible: true } : { eligible: false, reason: 'dep_blocked' };
}

/**
 * Boolean wrapper preserving the worker-checkin self_claim contract: false for orchestrator parents,
 * dep-blocked SDs, not-found, OR any query error (conservative: never claim on uncertainty).
 */
async function baselinedCandidateEligible(sb, sdKey) {
  try {
    return (await evaluateDispatchEligibility(sb, sdKey)).eligible;
  } catch {
    return false; // conservative: skip this candidate on a query error
  }
}

module.exports = { draftDepsSatisfied, evaluateDispatchEligibility, baselinedCandidateEligible };
