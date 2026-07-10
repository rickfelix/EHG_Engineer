// Weakest-link evidence propagation (SD-LEO-INFRA-VALUE-AUTHENTICITY-SPEC-002, SSOT L3 §2.2).
//
// A spec-authored criterion's authenticity-grade is the WEAKEST load-bearing
// domain claim beneath it, never the average and never the canonical
// library grade alone -- a confident spec must not launder an E0 domain
// assumption into a hard runtime gate.

const GRADE_ORDER = ['E0', 'E1', 'E2', 'E3'];

function assertValidGrade(grade) {
  if (!GRADE_ORDER.includes(grade)) {
    throw new Error(`weakest-link: invalid evidence grade "${grade}" (expected one of ${GRADE_ORDER.join(', ')})`);
  }
}

/**
 * Compare two grades. Returns the WEAKER of the two (lower ordinal).
 */
export function weakerGrade(a, b) {
  assertValidGrade(a);
  assertValidGrade(b);
  return GRADE_ORDER.indexOf(a) <= GRADE_ORDER.indexOf(b) ? a : b;
}

/**
 * Compute the weakest-link grade across a set of domain claims.
 *
 * @param {Array<{evidence_grade: string}>} domainClaims - non-empty array of
 *   load-bearing domain claims, each carrying an E0-E3 evidence_grade.
 * @returns {string} the MINIMUM (weakest) grade across all claims
 */
export function computeWeakestLinkGrade(domainClaims) {
  if (!Array.isArray(domainClaims) || domainClaims.length === 0) {
    throw new Error('computeWeakestLinkGrade: domainClaims must be a non-empty array');
  }
  return domainClaims.reduce((weakest, claim) => weakerGrade(weakest, claim.evidence_grade), 'E3');
}

/**
 * Compute the EFFECTIVE grade for a spec-authored criterion selection: the
 * weaker of the criterion's canonical library grade and the computed
 * weakest-link grade of its domain claims. Never laundered upward.
 *
 * @param {string} canonicalGrade - the library criterion's designed grade
 * @param {Array<{evidence_grade: string}>} domainClaims
 * @returns {{ computedWeakestLinkGrade: string, effectiveGrade: string }}
 */
export function computeEffectiveGrade(canonicalGrade, domainClaims) {
  const computedWeakestLinkGrade = computeWeakestLinkGrade(domainClaims);
  return {
    computedWeakestLinkGrade,
    effectiveGrade: weakerGrade(canonicalGrade, computedWeakestLinkGrade),
  };
}

export { GRADE_ORDER };
