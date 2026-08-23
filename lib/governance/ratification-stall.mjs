/**
 * Chairman-ratification encoding-staleness predicate —
 * SD-LEO-INFRA-CHAIRMAN-RATIFICATION-LEDGER-001 / FR-3.
 *
 * Mirrors lib/governance/parked-sms-stall.mjs's pure, zero-I/O tiered-clock pattern. Shared by
 * all three role integration points (Adam and coordinator quiet-tick aggregators; Solomon's
 * inbox advisory) so the staleness definition lives in exactly one place.
 *
 * Pure (data-in / verdict-out): zero I/O, zero DB, never throws.
 */

/**
 * DEFAULT_STALE_RATIFICATION_HOURS — 24 hours, matching the chairman's own D4 ruling
 * ("ENCODE-BEFORE-NEXT-USE"). A single named constant, easy to tune post-launch without a
 * schema change.
 * @type {number}
 */
export const DEFAULT_STALE_RATIFICATION_HOURS = 24;

/**
 * Has a ratification sat unencoded long enough to warrant the staleness escalation?
 * Inclusive at the threshold — exactly 24h counts as stale, matching the parked-sms-stall.mjs
 * precedent's already-resolved convention (>=, not strict >).
 * @param {number} ageHours - hours since ratified_at
 * @param {string|null|undefined} encodedAt - the row's encoded_at value (or null/undefined)
 * @param {number} [thresholdHours=DEFAULT_STALE_RATIFICATION_HOURS]
 * @returns {boolean}
 */
export function isStaleRatification(ageHours, encodedAt, thresholdHours = DEFAULT_STALE_RATIFICATION_HOURS) {
  if (encodedAt !== null && encodedAt !== undefined) return false; // already encoded — never stale
  return Number.isFinite(ageHours) && Number.isFinite(thresholdHours) && ageHours >= thresholdHours;
}

/**
 * Format a single actionable QUIET_TICK_RATIFICATION_STALE line for a stale row.
 * @param {string} roleName - 'adam' | 'coordinator' | 'solomon'
 * @param {{id:string, ratified_at:string, target_contracts:string[]}} row
 * @param {number} ageHours
 * @returns {string}
 */
export function formatRatificationStaleLine(roleName, row, ageHours) {
  const ageMinutes = Math.round(ageHours * 60);
  const targets = Array.isArray(row.target_contracts) ? row.target_contracts.join(',') : '';
  return `QUIET_TICK_RATIFICATION_STALE=${roleName} id=${row.id} age=${ageMinutes}m target=${targets} — ratified ${ageHours.toFixed(1)}h ago, still unencoded; encode the contract change and call markRatificationEncoded() to clear.`;
}
