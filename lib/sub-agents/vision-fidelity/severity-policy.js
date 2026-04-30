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
 * @returns {{verdict: string, passed: boolean, mode: string, skipped: boolean, reason: string|null}}
 */
export function classifyOutcome({ sdType, criticalMissing = 0, nonCriticalMissing = 0 } = {}) {
  const policy = getPolicyForSdType(sdType);

  if (policy.mode === 'skip') {
    return { verdict: 'PASS', passed: true, mode: 'skip', skipped: true, reason: policy.reason };
  }

  const noMisses = criticalMissing === 0 && nonCriticalMissing === 0;

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
