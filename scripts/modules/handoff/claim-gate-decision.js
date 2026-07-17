/**
 * SD-FDBK-FIX-HANDOFF-CLAIM-GATE-001 — pure decision seams for the handoff claim gate.
 *
 * Witnessed 2026-06-12: a second session drove the full handoff pipeline interleaved
 * with the claim holder (duplicate LEAD-TO-PLAN .. double LEAD-FINAL-APPROVAL),
 * producing a ghost completion. Two soft seams allowed it:
 *   1. scripts/handoff.js treated claimGuard fallback=true (ACTIVE foreign owner)
 *      as a pass for `execute`.
 *   2. BaseExecutor discarded assertValidClaim's return, so ownership='unclaimed'
 *      (NULL claim or orphan auto-release) proceeded into the gate pipeline.
 * Both decisions live here as pure functions so they are directly testable.
 */

/**
 * Decide the pre-delegate verdict in scripts/handoff.js for `execute`.
 * @param {{success:boolean, fallback?:boolean, error?:string, owner?:object}} guardResult result of claimGuard(..., {autoFallback:true})
 * @param {boolean} bypassRequested --bypass-validation present (reason recorded downstream)
 * @returns {{action:'proceed'|'proceed_bypassed'|'exit', label?:string}}
 */
export function decideExecuteClaimGate(guardResult, bypassRequested) {
  if (guardResult?.success) return { action: 'proceed' };
  if (guardResult?.fallback && bypassRequested) return { action: 'proceed_bypassed', label: 'FOREIGN_CLAIM' };
  return { action: 'exit', label: guardResult?.fallback ? 'FOREIGN_CLAIM' : 'CLAIM_CHECK_FAILED' };
}

/**
 * Decide whether BaseExecutor Step 1.3 must hard-fail on the assertValidClaim return.
 * Handoffs are claim-holder-only: an unclaimed SD (NULL claim, or a claim the gate
 * just auto-released from a stale owner) requires explicit re-claim via sd-start.
 *
 * SD-LEO-FIX-POST-MERGE-AUTOMATION-001 FR-2: an SD can also be "unclaimed" because it
 * already reached status='completed' moments ago (LEAD-FINAL-APPROVAL clears the claim
 * as part of completing). That is not a foreign/abandoned claim — it is benign and must
 * NOT hard-block, or a concurrent invocation racing the completing session gets a
 * misleading NO_CLAIM rejection instead of the existing idempotent already-completed
 * path. sdStatus is only honored when the caller re-reads it FRESH at decision time
 * (a stale snapshot would reopen the exact race this closes) — see BaseExecutor.js.
 * @param {{ownership?:string, reason?:string, released_owner_session?:string}|null} claimCheck
 * @param {string} sdKey
 * @param {string} [sdStatus] - fresh strategic_directives_v2.status read at decision time
 * @returns {{block:boolean, detail?:string, alreadyCompleted?:boolean}}
 */
export function evaluateClaimCheckForHandoff(claimCheck, sdKey, sdStatus) {
  if (!claimCheck || claimCheck.ownership !== 'unclaimed') return { block: false };
  if (sdStatus === 'completed') return { block: false, alreadyCompleted: true };
  const detail = claimCheck.released_owner_session
    ? `claim was auto-released from stale owner ${claimCheck.released_owner_session} (reason=${claimCheck.reason}) — explicit re-claim required`
    : 'no session holds the claim';
  return { block: true, detail: `${detail}. Run: node scripts/sd-start.js ${sdKey}` };
}
