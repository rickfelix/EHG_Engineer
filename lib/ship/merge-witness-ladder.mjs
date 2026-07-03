/**
 * mergeWork() P1-P5 precondition ladder — OBSERVE-ONLY evaluator.
 *
 * SD-LEO-INFRA-SHIP-WITNESS-MERGEWORK-001 (Ship-witness A). Grounded in Solomon
 * advisory solomon_advice_outcome_ledger id=879a6826 (correlation_id
 * sprintC-B-finding-006-unified-ship-witness): every merge lane in this repo
 * currently reinvents its own safety checks. This module evaluates a shared
 * precondition ladder for a single merge attempt and returns a structured
 * verdict — it NEVER blocks or alters the caller's merge decision. That is
 * Ship-witness D's (SD-LEO-INFRA-SHIP-WITNESS-ENFORCE-001) job, once the
 * telemetry this substrate produces shows 100% lane adoption for 7 days.
 *
 * Each rung reports one of four statuses (never a bare boolean, so "not yet
 * checkable" is never silently folded into "pass" — mirrors the existing
 * verifyBranchDeleted() true|false|null idiom in lib/ship/auto-merge.mjs):
 *   pass          — precondition evaluated and satisfied
 *   fail          — precondition evaluated and NOT satisfied
 *   not_applicable — precondition does not apply yet (e.g. P4 pre-P0)
 *   not_evaluable — cannot currently be checked (e.g. P2's actor-separation
 *                    dimension has no supporting columns yet)
 *
 * P1 (admission) and P2 (witness) need a DB lookup; the lookups are injected
 * (lookupWorkKeyReal, fetchReviewFinding) rather than hard-wired to a specific
 * client, so this module has no direct Supabase dependency and every rung is
 * unit-testable in isolation. P3 reuses the shared summarizeCIStatus helper
 * (lib/ship/ci-status.mjs, FR-1). P5 reuses verifyMerged/verifyBranchDeleted
 * from lib/ship/auto-merge.mjs rather than reimplementing verification.
 */

import { summarizeCIStatus } from './ci-status.mjs';

export const RUNG_STATUS = Object.freeze({
  PASS: 'pass',
  FAIL: 'fail',
  NOT_APPLICABLE: 'not_applicable',
  NOT_EVALUABLE: 'not_evaluable',
});

function rung(id, status, reason) {
  return { id, status, reason };
}

/**
 * P1 ADMISSION: workKey must resolve to a real SD or QF row, not a
 * synthetic/test fixture. lookupWorkKeyReal(workKey) => Promise<boolean|null>
 * (null = lookup itself failed — recorded as not_evaluable, not a false fail).
 */
export async function evaluateP1Admission({ workKey, lookupWorkKeyReal }) {
  if (!workKey) return rung('P1', RUNG_STATUS.FAIL, 'no workKey supplied');
  if (typeof lookupWorkKeyReal !== 'function') {
    return rung('P1', RUNG_STATUS.NOT_EVALUABLE, 'no lookupWorkKeyReal injected');
  }
  let isReal;
  try {
    isReal = await lookupWorkKeyReal(workKey);
  } catch (e) {
    return rung('P1', RUNG_STATUS.NOT_EVALUABLE, `lookup threw: ${e?.message || e}`);
  }
  if (isReal === null || isReal === undefined) {
    return rung('P1', RUNG_STATUS.NOT_EVALUABLE, 'lookup could not determine workKey origin');
  }
  return isReal
    ? rung('P1', RUNG_STATUS.PASS, `workKey ${workKey} resolves to a real SD/QF row`)
    : rung('P1', RUNG_STATUS.FAIL, `workKey ${workKey} does not resolve to a real SD/QF row`);
}

/**
 * P2 WITNESS: a ship_review_findings row must exist for this PR with
 * verdict='pass'. Reviewer/author actor-separation (tier>=standard) is NOT
 * evaluable today — ship_review_findings has no actor columns (confirmed
 * against database/migrations/20260408_create_ship_review_findings.sql) — so
 * that dimension is reported separately and never folded into a false pass.
 * fetchReviewFinding(prNumber) => Promise<{verdict}|null>.
 */
export async function evaluateP2Witness({ prNumber, tier, fetchReviewFinding }) {
  if (typeof fetchReviewFinding !== 'function') {
    return rung('P2', RUNG_STATUS.NOT_EVALUABLE, 'no fetchReviewFinding injected');
  }
  let finding;
  try {
    finding = await fetchReviewFinding(prNumber);
  } catch (e) {
    return rung('P2', RUNG_STATUS.NOT_EVALUABLE, `lookup threw: ${e?.message || e}`);
  }
  if (!finding) {
    return rung('P2', RUNG_STATUS.FAIL, `no ship_review_findings row for PR #${prNumber}`);
  }
  const verdictPass = finding.verdict === 'pass';
  const actorNote = tier === 'light'
    ? 'actor-separation not required at tier=light'
    : 'actor-separation dimension not_evaluable — ship_review_findings has no actor columns yet';
  return verdictPass
    ? rung('P2', RUNG_STATUS.PASS, `verdict=pass for PR #${prNumber}; ${actorNote}`)
    : rung('P2', RUNG_STATUS.FAIL, `verdict=${finding.verdict} for PR #${prNumber}`);
}

/** P3 CI: statusCheckRollup via the shared summarizeCIStatus helper. Pure — no IO. */
export function evaluateP3CI({ statusCheckRollup }) {
  const summary = summarizeCIStatus(statusCheckRollup);
  if (summary.total === 0) {
    return rung('P3', RUNG_STATUS.NOT_EVALUABLE, 'no CI checks reported for this PR');
  }
  if (summary.isPending) {
    return rung('P3', RUNG_STATUS.NOT_EVALUABLE, `${summary.pending}/${summary.total} check(s) still pending`);
  }
  return summary.hasFailed
    ? rung('P3', RUNG_STATUS.FAIL, `${summary.failed}/${summary.total} check(s) failed`)
    : rung('P3', RUNG_STATUS.PASS, `all ${summary.total} check(s) passed`);
}

/**
 * P4 PROTECTION INTEGRITY: always not_applicable until GitHub branch
 * protection (P0) has landed on the platform repos — there is nothing to
 * enforce integrity of yet, and the escapeAuth audit table this rung would
 * eventually check is a separate out-of-scope chairman-gated migration.
 */
export function evaluateP4ProtectionIntegrity() {
  return rung('P4', RUNG_STATUS.NOT_APPLICABLE, 'pre-P0: GitHub branch protection not yet enabled on this repo');
}

/**
 * P5 POST-VERIFY: delegates to the EXISTING verifyMerged/verifyBranchDeleted
 * from lib/ship/auto-merge.mjs. Only meaningful after a merge attempt has
 * actually completed; not_applicable beforehand.
 */
export function evaluateP5PostVerify({ merged, verifyResult }) {
  if (!merged) {
    return rung('P5', RUNG_STATUS.NOT_APPLICABLE, 'merge attempt has not completed yet');
  }
  if (!verifyResult) {
    return rung('P5', RUNG_STATUS.NOT_EVALUABLE, 'no verify result supplied');
  }
  return verifyResult.ok
    ? rung('P5', RUNG_STATUS.PASS, 'verifyMerged confirmed post-merge state')
    : rung('P5', RUNG_STATUS.FAIL, 'verifyMerged could not confirm post-merge state');
}

/**
 * Top-level orchestrator: evaluates P1-P5 in fixed order and returns a
 * structured, OBSERVE-ONLY verdict. Never throws for a rung-level failure —
 * every evaluator above degrades to a rung status, never an exception.
 *
 * @param {{
 *   prNumber: number|string, repoOwner?: string, repoName?: string,
 *   workKey?: string, tier?: string,
 *   lookupWorkKeyReal?: (workKey: string) => Promise<boolean|null>,
 *   fetchReviewFinding?: (prNumber: number|string) => Promise<{verdict:string}|null>,
 *   statusCheckRollup?: Array, merged?: boolean, verifyResult?: {ok:boolean},
 * }} params
 */
export async function evaluateMergeWorkLadder({
  prNumber,
  workKey,
  tier = 'standard',
  lookupWorkKeyReal,
  fetchReviewFinding,
  statusCheckRollup = [],
  merged = false,
  verifyResult = null,
}) {
  const p1 = await evaluateP1Admission({ workKey, lookupWorkKeyReal });
  const p2 = await evaluateP2Witness({ prNumber, tier, fetchReviewFinding });
  const p3 = evaluateP3CI({ statusCheckRollup });
  const p4 = evaluateP4ProtectionIntegrity();
  const p5 = evaluateP5PostVerify({ merged, verifyResult });

  return {
    overall: 'observe-only',
    prNumber,
    workKey: workKey ?? null,
    tier,
    rungs: [p1, p2, p3, p4, p5],
  };
}
