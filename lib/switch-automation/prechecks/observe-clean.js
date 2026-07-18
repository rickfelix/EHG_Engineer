/**
 * PC-2: observe-clean windowed + fresh-at-flip — SD-LEO-INFRA-INTELLIGENT-SWITCH-AUTOMATION-001-C.
 *
 * No existing table tracks a generic "observe-clean window" concept for op-co
 * components (confirmed by exhaustive grep at PLAN). Evidence is caller-supplied;
 * this check evaluates it. Two independent conditions, both required:
 *   (a) no incident within the lookback window ("clean")
 *   (b) the evidence itself was computed recently ("fresh-at-flip") — a stale clean
 *       snapshot cannot authorize a flip happening now, since conditions may have
 *       changed since the snapshot was taken.
 *
 * @module lib/switch-automation/prechecks/observe-clean
 */

const DEFAULT_WINDOW_HOURS = 24;
const DEFAULT_MAX_EVIDENCE_AGE_MINUTES = 15;

/**
 * @param {Object} evidence
 * @param {string|null} [evidence.lastIncidentAt] - ISO timestamp of the most recent incident, or null.
 * @param {string} [evidence.checkedAt] - ISO timestamp when this evidence was computed.
 * @param {Object} [opts]
 * @param {number} [opts.windowHours=24]
 * @param {number} [opts.maxEvidenceAgeMinutes=15]
 * @returns {{id:string, name:string, passed:boolean, reason:string}}
 */
export function checkObserveClean(evidence = {}, opts = {}) {
  const windowHours = opts.windowHours ?? DEFAULT_WINDOW_HOURS;
  const maxEvidenceAgeMinutes = opts.maxEvidenceAgeMinutes ?? DEFAULT_MAX_EVIDENCE_AGE_MINUTES;
  const { lastIncidentAt, checkedAt } = evidence;
  const base = { id: 'PC-2', name: 'observe-clean' };

  const checkedAtMs = checkedAt ? Date.parse(checkedAt) : NaN;
  if (!Number.isFinite(checkedAtMs)) {
    return { ...base, passed: false, reason: 'no-evidence-timestamp' };
  }
  const evidenceAgeMinutes = (Date.now() - checkedAtMs) / 60_000;
  if (evidenceAgeMinutes > maxEvidenceAgeMinutes) {
    return { ...base, passed: false, reason: 'stale-evidence' };
  }

  if (lastIncidentAt) {
    const incidentMs = Date.parse(lastIncidentAt);
    if (!Number.isFinite(incidentMs)) {
      return { ...base, passed: false, reason: 'unparseable-incident-timestamp' };
    }
    const incidentAgeHours = (Date.now() - incidentMs) / 3_600_000;
    if (incidentAgeHours <= windowHours) {
      return { ...base, passed: false, reason: 'incident-in-window' };
    }
  }

  return { ...base, passed: true, reason: 'clean-and-fresh' };
}

export default checkObserveClean;
