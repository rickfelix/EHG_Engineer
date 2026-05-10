/**
 * Canonical sd_type enum — single source of truth aligned with the
 * strategic_directives_v2.sd_type_check CHECK constraint.
 *
 * SD: SD-FDBK-INFRA-TYPE-SOURCE-TRUTH-001
 *
 * Why this module exists:
 *   The DB CHECK constraint is the authoritative writer of the contract.
 *   Multiple consumers (plan-parser, leo-create-sd CLI, threshold maps in
 *   handoff gates) had drifted, with several emitting the phantom value
 *   `'fix'` — which is NOT in the CHECK list and causes UPDATEs to fail.
 *   This module pins one canonical Set; tests/db-invariants/
 *   sd-type-canonical.test.js asserts equality with pg_constraint at every CI
 *   run, so DB and lib can never silently disagree.
 *
 * Source migration:
 *   database/migrations/20260206_register_uat_sd_type.sql (PART 1.5, lines 76-86)
 *   defines the current 15-value CHECK list. Values listed here in the same
 *   order for traceability.
 */

const _CANONICAL_SD_TYPES = new Set([
  'feature', 'bugfix', 'database', 'infrastructure', 'security',
  'refactor', 'documentation', 'orchestrator', 'performance', 'enhancement',
  'docs', 'discovery_spike', 'implementation', 'ux_debt', 'uat'
]);

/** Frozen Set of canonical sd_type values. Mirrors DB CHECK constraint. */
export const CANONICAL_SD_TYPES = Object.freeze(_CANONICAL_SD_TYPES);

/**
 * Boolean check: is `value` a canonical sd_type?
 * @param {unknown} value
 * @returns {boolean}
 */
export function isValidSdType(value) {
  return typeof value === 'string' && _CANONICAL_SD_TYPES.has(value);
}

/**
 * Throws if `value` is not a canonical sd_type. Error message includes the
 * full canonical enum list so CLI users get an actionable message.
 * @param {unknown} value
 * @param {string} [contextLabel] - Optional context label for error message
 * @throws {Error} when value is not canonical
 */
export function assertValidSdType(value, contextLabel) {
  if (isValidSdType(value)) return;
  const list = [..._CANONICAL_SD_TYPES].join(', ');
  const ctx = contextLabel ? ` (${contextLabel})` : '';
  throw new Error(
    `Invalid sd_type: ${JSON.stringify(value)}${ctx}. Must be one of: ${list}`
  );
}
