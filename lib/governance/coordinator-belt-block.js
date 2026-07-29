/**
 * QF-20260727-395 — measure the OTHER side of the conversation.
 *
 * EVERY FLEET INSTRUMENT MEASURES WHETHER WORKERS ARE TALKING. NOTHING MEASURED WHETHER THE
 * COORDINATOR IS ANSWERING. Measured by Charlie at 2026-07-27T20:38Z: 21 SDs ranked, ZERO
 * claimable, none of them tier-blocked — 10 held on needs_coordinator_review, 9 on
 * human_action_required. A worker sat idle with capacity while the single largest bucket
 * blocking the whole belt was decisions only the coordinator could make.
 *
 * THREE GREEN GAUGES, ZERO CLAIMABLE WORK. None of them is broken; each measures the wrong side:
 *   1. the silent-holder audit keys on WORKER signal age and work product — every worker WAS
 *      talking, so it correctly reported zero silent holders;
 *   2. unanswered_over_30m excludes any signal with read_at set (lib/coordinator/detectors.cjs
 *      treats read as a soft answer), so a coordinator who READS and does not RULE is
 *      indistinguishable from one who answered;
 *   3. unranked-claimable-leaves reports 0 when every leaf is correctly ranked AND correctly
 *      fenced — a fully-fenced belt is indistinguishable from a healthy one.
 *
 * THE DISCRIMINATOR THIS ADDS, and it is the whole point: claimable depth reaching zero is not
 * itself a defect — the belt legitimately empties when work runs out. The alarm therefore fires
 * only when depth is zero AND the largest blocking bucket is COORDINATOR-OWNED. That second
 * clause is what separates "the belt is empty because work ran out" from "the belt is empty
 * because I have not ruled", which today look identical from every surface.
 *
 * WHAT THIS DELIBERATELY IS NOT. It does not auto-clear fences and it is not a nag. A fence held
 * for a stated reason is CORRECT BEHAVIOUR and several are currently held for good ones. The
 * defect is INVISIBILITY, not the holding — the coordinator should be unable to not-notice, and
 * must not be pushed into premature rulings.
 *
 * PURE AND DB-FREE ON PURPOSE (mirrors lib/governance/drain-inventory.js's split): all IO lives
 * in the caller. A DB-touching detector would route to the vitest `db` project, which resolves to
 * ZERO files unless a designated non-prod target is named — it would report green having executed
 * nothing, which is the same class of defect this row exists to fix.
 *
 * @module governance/coordinator-belt-block
 */

/**
 * Ineligibility reasons that only the COORDINATOR can clear. Keys are the reasons emitted by
 * lib/fleet/claim-eligibility.cjs::classifyDispatchIneligibility, which is the SSOT — this list
 * names a SUBSET of them and must never be widened to reasons a coordinator cannot act on.
 * human_action_required is deliberately EXCLUDED: it is the chairman's to clear, not the
 * coordinator's, and folding it in here would blame the coordinator for someone else's queue.
 */
export const COORDINATOR_OWNED_REASONS = Object.freeze(['needs_coordinator_review']);

/** Verdicts. NOT_MEASURED is a first-class outcome, never collapsed into OK. */
export const BELT_VERDICT = Object.freeze({
  OK: 'OK',
  BLOCKED_ON_COORDINATOR: 'BLOCKED_ON_COORDINATOR',
  NOT_MEASURED: 'NOT_MEASURED',
});

/**
 * Assess whether the belt is blocked on coordinator-owned fences.
 *
 * @param {object} input
 * @param {number|null|undefined} input.claimableDepth  ranked+claimable count (belt_claimable_at_my_tier
 *   or the agnostic belt_ranked_claimable). Missing => NOT_MEASURED, never OK.
 * @param {Record<string, number>|null|undefined} input.ineligibilityBreakdown  reason -> count, as
 *   tallied in lib/checkin/steps/merged-pool-self-claim.cjs. Missing => NOT_MEASURED.
 * @param {string[]} [input.coordinatorOwnedReasons]  override for tests.
 * @returns {{verdict:string, blocked:boolean, claimableDepth:(number|null),
 *   coordinatorOwnedCount:number, largestBucket:(string|null), largestBucketCount:number,
 *   totalIneligible:number, reason:string}}
 */
export function assessCoordinatorBeltBlock({
  claimableDepth,
  ineligibilityBreakdown,
  coordinatorOwnedReasons = COORDINATOR_OWNED_REASONS,
} = {}) {
  // NOT_MEASURED is the load-bearing branch. If the inputs were never supplied, saying OK would
  // make an unwired gauge indistinguishable from a healthy belt — the exact defect being fixed.
  const depthMissing = typeof claimableDepth !== 'number' || Number.isNaN(claimableDepth);
  const breakdownMissing =
    !ineligibilityBreakdown || typeof ineligibilityBreakdown !== 'object' || Array.isArray(ineligibilityBreakdown);
  if (depthMissing || breakdownMissing) {
    const missing = [depthMissing && 'claimableDepth', breakdownMissing && 'ineligibilityBreakdown']
      .filter(Boolean)
      .join(', ');
    return {
      verdict: BELT_VERDICT.NOT_MEASURED,
      blocked: false,
      claimableDepth: depthMissing ? null : claimableDepth,
      coordinatorOwnedCount: 0,
      largestBucket: null,
      largestBucketCount: 0,
      totalIneligible: 0,
      reason: `not measured: missing ${missing}`,
    };
  }

  const entries = Object.entries(ineligibilityBreakdown).filter(([, n]) => Number(n) > 0);
  const totalIneligible = entries.reduce((acc, [, n]) => acc + Number(n), 0);

  // Deterministic largest bucket: count DESC, then reason name ASC so a tie never flickers.
  const sorted = [...entries].sort((a, b) => Number(b[1]) - Number(a[1]) || String(a[0]).localeCompare(String(b[0])));
  const largestBucket = sorted.length ? sorted[0][0] : null;
  const largestBucketCount = sorted.length ? Number(sorted[0][1]) : 0;

  const owned = new Set(coordinatorOwnedReasons);
  const coordinatorOwnedCount = entries
    .filter(([reason]) => owned.has(reason))
    .reduce((acc, [, n]) => acc + Number(n), 0);

  const blocked = claimableDepth === 0 && largestBucket !== null && owned.has(largestBucket);

  return {
    verdict: blocked ? BELT_VERDICT.BLOCKED_ON_COORDINATOR : BELT_VERDICT.OK,
    blocked,
    claimableDepth,
    coordinatorOwnedCount,
    largestBucket,
    largestBucketCount,
    totalIneligible,
    reason: blocked
      ? `claimable depth 0 and the largest blocking bucket is coordinator-owned (${largestBucket}=${largestBucketCount} of ${totalIneligible} ineligible)`
      : claimableDepth === 0
        ? `claimable depth 0, but the largest blocking bucket is ${largestBucket ?? 'none'} which is not coordinator-owned — the belt ran out of work, it is not waiting on a ruling`
        : `claimable depth ${claimableDepth}`,
  };
}

/**
 * One-line summary for the coordinator surface. Prints the counts UNCONDITIONALLY — including the
 * zeroes — following lib/coordinator/worker-signal-starvation.cjs:18, so measured-and-zero is
 * distinguishable from not-measured-at-all.
 * @param {ReturnType<typeof assessCoordinatorBeltBlock>} a
 * @returns {string}
 */
export function formatCoordinatorBeltBlock(a) {
  if (a.verdict === BELT_VERDICT.NOT_MEASURED) {
    return `[belt-block] NOT_MEASURED — ${a.reason}. This is NOT a healthy belt; it is an unread one.`;
  }
  const head = a.blocked ? 'BLOCKED_ON_COORDINATOR' : 'OK';
  return (
    `[belt-block] ${head} claimable=${a.claimableDepth} coordinator_owned=${a.coordinatorOwnedCount} ` +
    `largest_bucket=${a.largestBucket ?? 'none'}(${a.largestBucketCount}) total_ineligible=${a.totalIneligible} — ${a.reason}`
  );
}
