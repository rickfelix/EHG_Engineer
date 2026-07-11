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
 * Evaluate the actor-separation sub-dimension of P2, given a
 * ship_review_findings row's optional `metadata` column (SD-LEO-INFRA-SHIP-
 * WITNESS-TRIO-001 FR-2: {actor_type, actor_role, agent_id}, reusing the
 * system_events attribution vocabulary). This is reported as its OWN status
 * (pass/not_evaluable — never silently folded into P2's overall pass) rather
 * than P2's top-level gate, per retro b119bba1 item #2's explicit ask ("do not
 * silently treat not_evaluable as pass"): P2's own pass/fail stays verdict-only
 * (TR-3 — the /ship lane's existing behavior must not regress), while this
 * sub-field makes the previously-buried "not evaluable, no actor columns" note
 * into a genuine, structured, evaluable status a future enforcement rung can key
 * on once the design for what "separation" requires is specified.
 * @private
 */
function evaluateActorSeparation(finding, tier) {
  if (tier === 'light') {
    return rung('P2.actorSeparation', RUNG_STATUS.NOT_APPLICABLE, 'actor-separation not required at tier=light');
  }
  const metadata = finding?.metadata;
  if (!metadata || typeof metadata !== 'object') {
    return rung('P2.actorSeparation', RUNG_STATUS.NOT_EVALUABLE, 'no actor attribution present on this ship_review_findings row');
  }
  if (!metadata.actor_type) {
    return rung('P2.actorSeparation', RUNG_STATUS.NOT_EVALUABLE, 'ship_review_findings.metadata present but missing actor_type');
  }
  return rung('P2.actorSeparation', RUNG_STATUS.PASS, `actor attribution present (actor_type=${metadata.actor_type})`);
}

/**
 * P2 WITNESS: a ship_review_findings row must exist for this PR with
 * verdict='pass'. Reviewer/author actor-separation (tier>=standard) is
 * reported via the nested actorSeparation status (see evaluateActorSeparation)
 * — P2's own top-level pass/fail remains verdict-only, unchanged from before
 * FR-2, so existing evaluateEnforcementDecision() behavior on the /ship lane
 * does not regress (TR-3).
 * fetchReviewFinding(prNumber) => Promise<{verdict, metadata?}|null>.
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
  const actorSeparation = evaluateActorSeparation(finding, tier);
  const base = verdictPass
    ? rung('P2', RUNG_STATUS.PASS, `verdict=pass for PR #${prNumber}`)
    : rung('P2', RUNG_STATUS.FAIL, `verdict=${finding.verdict} for PR #${prNumber}`);
  return { ...base, actorSeparation };
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
 * P4 PROTECTION INTEGRITY: reports NOT_APPLICABLE (the pre-P0 stub) when no
 * repo/checker is supplied, preserving every existing caller's behavior.
 * QF-20260703-744: given {repoOwner, repoName, checkProtection}, probes the
 * EXACT repo authoritatively instead of a hardcoded platform-wide assumption.
 * checkProtection(repoOwner, repoName) => true|false|null (null=not_evaluable,
 * e.g. detectBranchProtectionEnabled from lib/ship/auto-merge.mjs) — a read
 * failure is NEVER folded into "disabled" (the false-negative this QF closes).
 */
/**
 * SD-LEO-INFRA-SHIP-WITNESS-TRIO-001 (FR-3): when this specific merge used an
 * admin-override bypass (--admin), the ordinary branch-protection-enabled check
 * above is the wrong question — protection WAS enabled, it was just bypassed.
 * The escapeAuth dual-key audit substrate (ship_escape_audit table) answers the
 * real question for that case: was the bypass durably audited? adminOverride
 * and checkEscapeAudit are both optional and additive — every pre-existing
 * caller that omits them gets byte-identical behavior to before FR-3 (TR-3).
 * checkEscapeAudit(prNumber, repoOwner, repoName) => Promise<boolean|null>
 * (null = lookup itself failed — not_evaluable, never folded into a false pass).
 * @private
 */
async function evaluateEscapeAuth({ prNumber, repoOwner, repoName, checkEscapeAudit }) {
  if (typeof checkEscapeAudit !== 'function') {
    return rung('P4.escapeAuth', RUNG_STATUS.NOT_EVALUABLE, 'admin override used but no checkEscapeAudit injected');
  }
  let audited;
  try {
    audited = await checkEscapeAudit(prNumber, repoOwner, repoName);
  } catch (e) {
    return rung('P4.escapeAuth', RUNG_STATUS.NOT_EVALUABLE, `escape-audit lookup threw: ${e?.message || e}`);
  }
  if (audited === true) return rung('P4.escapeAuth', RUNG_STATUS.PASS, `admin-override merge has a ship_escape_audit row for PR #${prNumber}`);
  if (audited === false) return rung('P4.escapeAuth', RUNG_STATUS.FAIL, `admin-override merge has NO ship_escape_audit row for PR #${prNumber} — unaudited bypass`);
  return rung('P4.escapeAuth', RUNG_STATUS.NOT_EVALUABLE, `could not read escape-audit state for PR #${prNumber}`);
}

export async function evaluateP4ProtectionIntegrity({ repoOwner, repoName, checkProtection, adminOverride = false, prNumber, checkEscapeAudit } = {}) {
  if (!repoOwner || !repoName || typeof checkProtection !== 'function') {
    return rung('P4', RUNG_STATUS.NOT_APPLICABLE, 'pre-P0: GitHub branch protection not yet enabled on this repo');
  }
  let enabled;
  try {
    enabled = checkProtection(repoOwner, repoName);
  } catch (e) {
    return rung('P4', RUNG_STATUS.NOT_EVALUABLE, `protection check threw: ${e?.message || e}`);
  }
  const base = enabled === true
    ? rung('P4', RUNG_STATUS.PASS, `branch protection confirmed enabled on ${repoOwner}/${repoName}`)
    : enabled === false
      ? rung('P4', RUNG_STATUS.FAIL, `branch protection confirmed NOT enabled on ${repoOwner}/${repoName}`)
      : rung('P4', RUNG_STATUS.NOT_EVALUABLE, `could not read protection state for ${repoOwner}/${repoName} (403/scope/network)`);
  if (!adminOverride) return base;
  const escapeAuth = await evaluateEscapeAuth({ prNumber, repoOwner, repoName, checkEscapeAudit });
  return { ...base, escapeAuth };
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
 *   checkProtection?: (repoOwner: string, repoName: string) => (true|false|null),
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
  repoOwner,
  repoName,
  checkProtection,
  // SD-LEO-INFRA-SHIP-WITNESS-TRIO-001 (FR-3): optional, additive — omitted by
  // every pre-existing caller, so P4's escapeAuth sub-field is simply absent
  // (byte-identical behavior to before FR-3, TR-3).
  adminOverride = false,
  checkEscapeAudit,
}) {
  const p1 = await evaluateP1Admission({ workKey, lookupWorkKeyReal });
  const p2 = await evaluateP2Witness({ prNumber, tier, fetchReviewFinding });
  const p3 = evaluateP3CI({ statusCheckRollup });
  const p4 = await evaluateP4ProtectionIntegrity({ repoOwner, repoName, checkProtection, adminOverride, prNumber, checkEscapeAudit });
  const p5 = evaluateP5PostVerify({ merged, verifyResult });

  return {
    overall: 'observe-only',
    prNumber,
    workKey: workKey ?? null,
    tier,
    rungs: [p1, p2, p3, p4, p5],
  };
}
