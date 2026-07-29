/**
 * Vision-fidelity severity-tier policy. SD-LEO-INFRA-VISION-FIDELITY-GATE-001 FR-3.
 *
 * Pure functional. Maps SD type + element-severity counts to verdict + outcome.
 * Used by both the sub-agent (lib/sub-agents/vision-fidelity/index.js) and the
 * PLAN-TO-LEAD gate (PR-2). Keep imports zero — this is the policy seam.
 */

const SD_TYPE_POLICIES = {
  feature:        { mode: 'block', critical_threshold: 2, mixed_critical: 1, mixed_non_critical: 5 },
  bugfix:         { mode: 'block', critical_threshold: 2, mixed_critical: 1, mixed_non_critical: 5 },
  database:       { mode: 'block', critical_threshold: 1 },
  security:       { mode: 'block', critical_threshold: 1 },
  infrastructure: { mode: 'warn' },
  documentation:  { mode: 'skip', reason: 'sd-type does not produce UI' },
  refactor:       { mode: 'skip', reason: 'sd-type does not produce UI' }
};

const DEFAULT_POLICY = { mode: 'block', critical_threshold: 2, mixed_critical: 1, mixed_non_critical: 5 };

export function getPolicyForSdType(sdType) {
  return SD_TYPE_POLICIES[sdType] || DEFAULT_POLICY;
}

/**
 * Classify a vision-fidelity comparison result.
 *
 * @param {Object} input
 * @param {string} input.sdType - strategic_directives_v2.sd_type
 * @param {number} input.criticalMissing - count of missing_elements with severity=critical
 * @param {number} input.nonCriticalMissing - count of missing_elements with severity!=critical
 * @param {number} [input.totalElements] - delivered + partial + missing (for coverage_pct)
 * @param {number} [input.deliveredCount]
 * @param {string} [input.visionLevel] - eva_vision_documents.level of the doc being compared
 *   against ('L1' | 'L2'). Optional: omitting it reproduces the pre-SD-LEARN-FIX behaviour
 *   exactly, which is what keeps the existing sd_type matrix and its tests untouched.
 * @returns {{verdict: string, passed: boolean, mode: string, skipped: boolean, reason: string|null}}
 */
export function classifyOutcome({
  sdType,
  criticalMissing = 0,
  nonCriticalMissing = 0,
  visionLevel
} = {}) {
  const policy = getPolicyForSdType(sdType);

  if (policy.mode === 'skip') {
    return { verdict: 'PASS', passed: true, mode: 'skip', skipped: true, reason: policy.reason };
  }

  const noMisses = criticalMissing === 0 && nonCriticalMissing === 0;

  // SD-LEARN-FIX-ADDRESS-SAL-VISION-001. An L1 document is the WHOLE-COMPANY vision, and every SD
  // that lacks a bespoke one is gap-filled to it at creation (pipeline.js DEFAULT_VISION_KEY). Its
  // dimensions are constitutional pillars — automation_by_default, chairman_governance_model — that
  // no single SD can deliver. Not because the SD ships no UI: a UI-producing SD cannot deliver the
  // chairman governance model either. Blocking on it measures an SD against a document that was
  // never about that SD, which is why 5 of 5 observed FAIL verdicts were L1.
  //
  // *** ALLOWLIST, DELIBERATELY — NEVER REWRITE AS `visionLevel !== 'L2'`. ***
  // The s18 case-study fixture, which is the negative control proving this gate still bites, carries
  // NO level field at all. Under a denylist its undefined level would satisfy "is not L2", flip it
  // non-blocking, and silently delete the only evidence that this change did not just switch the
  // gate off. An unknown level must fall through to the stricter existing behaviour.
  if (visionLevel === 'L1') {
    return {
      verdict: noMisses ? 'PASS' : 'WARNING',
      passed: true,
      mode: 'warn',
      skipped: false,
      reason: noMisses ? null : 'vision_level_l1_portfolio_scope'
    };
  }

  if (policy.mode === 'warn') {
    return {
      verdict: noMisses ? 'PASS' : 'WARNING',
      passed: true,
      mode: 'warn',
      skipped: false,
      reason: null
    };
  }

  // mode === 'block'
  const ct = policy.critical_threshold;
  const mixedCritical = policy.mixed_critical ?? null;
  const mixedNonCritical = policy.mixed_non_critical ?? null;

  const tripsCritical = criticalMissing > ct;
  const tripsMixed =
    mixedCritical !== null &&
    mixedNonCritical !== null &&
    criticalMissing > mixedCritical &&
    nonCriticalMissing > mixedNonCritical;

  if (tripsCritical || tripsMixed) {
    return { verdict: 'FAIL', passed: false, mode: 'block', skipped: false, reason: null };
  }

  if (criticalMissing > 0 || nonCriticalMissing > 0) {
    return { verdict: 'CONDITIONAL_PASS', passed: true, mode: 'block', skipped: false, reason: null };
  }

  return { verdict: 'PASS', passed: true, mode: 'block', skipped: false, reason: null };
}

export function computeCoveragePct(deliveredCount, totalElements) {
  if (!totalElements || totalElements <= 0) return null;
  return Math.round((deliveredCount / totalElements) * 1000) / 1000;
}
