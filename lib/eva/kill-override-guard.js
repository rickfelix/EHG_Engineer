/**
 * Guard against silently approving a chairman_decisions row whose underlying kill-gate
 * verdict was computed as 'kill'. Without this, approveDecision() has no visibility into
 * the S5 financial kill-gate's verdict and approves unconditionally.
 *
 * SD-LEO-INFRA-VENTURE-SELECTION-DEMAND-001 (Solomon consult finding: "queryable != consulted"
 * pull-vs-push class -- the computed kill verdict is stored but nothing enforced it downstream).
 */

/**
 * @param {Object} args
 * @param {Object|null|undefined} args.briefData - chairman_decisions.brief_data
 * @param {boolean} [args.overrideKill] - explicit operator override flag
 * @returns {boolean} true if approval should be BLOCKED
 */
export function shouldBlockKillApproval({ briefData, overrideKill }) {
  if (overrideKill) return false;
  if (!briefData || typeof briefData !== 'object') return false;
  return briefData.decision === 'kill';
}

/**
 * Extract the kill-gate verdict fields from a persisted truth_financial_model artifact
 * payload, for merging into a chairman_decisions.brief_data blob. Returns {} (no keys)
 * when the payload has no 'decision' field, so callers can safely spread the result
 * without polluting brief_data with undefined keys.
 *
 * @param {Object|null|undefined} artifactPayload - venture_artifacts.artifact_data
 * @returns {{decision?: any, blockProgression?: any, reasons?: any, remediationRoute?: any}}
 */
export function extractKillGateVerdict(artifactPayload) {
  if (!artifactPayload || typeof artifactPayload !== 'object' || !('decision' in artifactPayload)) {
    return {};
  }
  return {
    decision: artifactPayload.decision,
    blockProgression: artifactPayload.blockProgression,
    reasons: artifactPayload.reasons,
    remediationRoute: artifactPayload.remediationRoute,
  };
}
