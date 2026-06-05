/**
 * Noise classifier for auto_rca issue_patterns
 * (SD-LEO-INFRA-SUPPRESS-PROVIDER-TEST-001)
 *
 * The auto_rca pipeline records every api_failure TriggerEvent as a PAT-AUTO
 * issue_pattern. Some of those are NOT protocol defects: LLM provider
 * quota/billing errors and test-stub fixtures. This classifier identifies that
 * noise so it can be flagged (data_quality_status='noise') at capture and
 * excluded from the /leo audit view — WITHOUT dropping any row.
 *
 * Design contract (precision over recall):
 *  - test scaffolding markers ('test-stub', 'stub-stuck')  -> noise (always)
 *  - provider quota / rate-limit (429 RESOURCE_EXHAUSTED / quota) -> noise
 *  - provider config/billing ("Budget … invalid")          -> noise
 *  - GENUINE outages (5xx), network errors, and any non-API / gate / handoff
 *    failure                                                -> NOT noise (real signal)
 *
 * The matcher is message-based so the SAME logic serves both the live capture
 * path (full TriggerEvent) and the one-time backfill (only issue_summary text).
 */

/**
 * Core pure predicate: does this error message describe provider/test-stub noise?
 * @param {string} message
 * @returns {boolean}
 */
export function isNoiseMessage(message) {
  if (!message || typeof message !== 'string') return false;
  const m = message.toLowerCase();

  // Test scaffolding markers are noise regardless of context — these strings
  // are emitted only by test stubs, never by a genuine provider failure.
  if (m.includes('test-stub') || m.includes('stub-stuck')) return true;

  // Beyond test markers, only API/provider errors are eligible to be noise.
  // This guard keeps gate failures, handoff failures, migration errors, and
  // script crashes OUT of the noise bucket even if they mention a number.
  const isApiError = m.includes('api error') || m.includes('api_error');
  if (!isApiError) return false;

  // Provider quota / rate-limit exhaustion (not a defect — billing/plan limit).
  if (m.includes('resource_exhausted')) return true;
  if (m.includes('429') && m.includes('quota')) return true;

  // Provider configuration/billing misconfiguration, e.g.
  // "Budget 0 is invalid. This model only works in thinking mode." — a config
  // problem, not a recurring protocol failure worth surfacing in the audit.
  if (m.includes('budget') && m.includes('invalid')) return true;

  // Genuine outages (5xx), auth errors, etc. fall through as REAL signal.
  return false;
}

/**
 * Classify a TriggerEvent (live capture path).
 * Fail-open: if the event has no usable message, treat it as real signal
 * (return false) rather than mislabeling it noise.
 * @param {{error_message?: string}} triggerEvent
 * @returns {boolean}
 */
export function isNoiseTriggerEvent(triggerEvent) {
  if (!triggerEvent || typeof triggerEvent !== 'object') return false;
  return isNoiseMessage(triggerEvent.error_message);
}

export default { isNoiseMessage, isNoiseTriggerEvent };
