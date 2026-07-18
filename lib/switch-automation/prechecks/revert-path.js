/**
 * PC-1: revert-path verified — SD-LEO-INFRA-INTELLIGENT-SWITCH-AUTOMATION-001-C.
 *
 * Computes the isReversibleByMechanism boolean that
 * lib/switch-automation/reversibility-classifier.js already anticipates as an input
 * (nothing populates it today — see that module's own doc comment). Fail-closed: a
 * declared-but-unrehearsed, or rehearsed-but-stale, revert path is NOT reversible
 * (Solomon adjudication point 3: "an untested revert path is not reversible").
 *
 * @module lib/switch-automation/prechecks/revert-path
 */

const DEFAULT_MAX_REHEARSAL_AGE_DAYS = 90;

/**
 * @param {Object} evidence
 * @param {boolean} [evidence.declared] - the class declares a revert verb/TTL/invoker.
 * @param {boolean|null} [evidence.rehearsalPassed] - most recent rehearsal outcome.
 * @param {string|null} [evidence.rehearsedAt] - ISO timestamp of that rehearsal.
 * @param {Object} [opts]
 * @param {number} [opts.maxRehearsalAgeDays=90]
 * @returns {{id:string, name:string, passed:boolean, reason:string}}
 */
export function checkRevertPathVerified(evidence = {}, opts = {}) {
  const maxAgeDays = opts.maxRehearsalAgeDays ?? DEFAULT_MAX_REHEARSAL_AGE_DAYS;
  const { declared, rehearsalPassed, rehearsedAt } = evidence;
  const base = { id: 'PC-1', name: 'revert-path-verified' };

  if (declared !== true) {
    return { ...base, passed: false, reason: 'no-declared-revert-path' };
  }
  if (rehearsalPassed !== true) {
    return { ...base, passed: false, reason: 'no-rehearsal-evidence' };
  }
  const rehearsedAtMs = rehearsedAt ? Date.parse(rehearsedAt) : NaN;
  if (!Number.isFinite(rehearsedAtMs)) {
    return { ...base, passed: false, reason: 'no-rehearsal-evidence' };
  }
  const ageDays = (Date.now() - rehearsedAtMs) / 86_400_000;
  if (ageDays > maxAgeDays) {
    return { ...base, passed: false, reason: 'stale-rehearsal' };
  }
  return { ...base, passed: true, reason: 'revert-path-verified' };
}

export default checkRevertPathVerified;
