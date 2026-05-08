/**
 * scripts/lib/killed-initiatives.js
 *
 * Centralized constants for ventures/initiatives that have been formally killed.
 * Used by audit scripts to detect residual data without inline-hardcoding venture
 * UUIDs or display names. CommonJS module — importable from both .cjs (require)
 * and .mjs (named import) callers.
 *
 * SD-LEO-INFRA-AUDIT-SHARED-TABLES-001 (FR-3)
 *
 * Adding a new killed initiative:
 *   1. Append entry to KILLED_PATTERNS.entries[] with { name, sd_key_prefix, venture_uuid }
 *   2. Update tests/unit/killed-initiatives.test.js with the new fixture
 *   3. Update audit scripts that should consume the new entry (search for KILLED_PATTERNS imports)
 */

const KILLED_PATTERNS = {
  // Display-name patterns (used for ILIKE matches against free-text columns)
  name_patterns: ['PrivacyPatrol', 'CommitCraft'],

  // SD-key prefixes (used to identify SDs that originated from these ventures)
  sd_key_prefixes: ['SD-PRIVACYPATROL-', 'SD-COMMITCRAFT-'],

  // Canonical venture UUIDs — authoritative anchor for FK-based audit queries.
  // CommitCraft is intentionally absent: database-agent confirmed (evidence
  // 459c01f2-9bc1-4771-9eef-364a35f1b6dd) that CommitCraft has no rows in
  // ventures or eva_ventures. Only PrivacyPatrol AI venture exists.
  venture_uuids: ['08d20036-03c9-4a26-bbc5-f37a18dfdf23'],

  // Per-initiative entries for richer reporting (kept narrow on purpose).
  entries: [
    {
      name: 'PrivacyPatrol AI',
      display_name_patterns: ['PrivacyPatrol'],
      sd_key_prefix: 'SD-PRIVACYPATROL-',
      venture_uuid: '08d20036-03c9-4a26-bbc5-f37a18dfdf23',
      killed_at_isodate: '2026-05-05',
      campaign_sd: 'SD-LEO-FIX-REVERT-CROSS-VENTURE-001',
      notes:
        'workflow_status=killed, killed_at IS NOT NULL, deleted_at IS NULL (kill-not-delete state)',
    },
    {
      name: 'CommitCraft AI',
      display_name_patterns: ['CommitCraft'],
      sd_key_prefix: 'SD-COMMITCRAFT-',
      venture_uuid: null, // No row exists in ventures/eva_ventures.
      killed_at_isodate: null,
      campaign_sd: 'SD-LEO-FIX-REVERT-CROSS-VENTURE-001',
      notes:
        'No row in ventures or eva_ventures (eliminated entirely; only text mentions remain in lib/venture-resolver.js:114)',
    },
  ],
};

/**
 * isKilledVentureId — returns true iff the input matches a known killed-venture UUID.
 * Null, undefined, empty string, and non-matching UUIDs return false.
 *
 * @param {string|null|undefined} id - venture id or eva_ventures.id
 * @returns {boolean}
 */
function isKilledVentureId(id) {
  if (typeof id !== 'string' || id.length === 0) return false;
  return KILLED_PATTERNS.venture_uuids.includes(id);
}

/**
 * isKilledVentureName — returns true iff the input string contains any killed
 * initiative display-name pattern (case-insensitive).
 *
 * @param {string|null|undefined} name
 * @returns {boolean}
 */
function isKilledVentureName(name) {
  if (typeof name !== 'string' || name.length === 0) return false;
  const lower = name.toLowerCase();
  return KILLED_PATTERNS.name_patterns.some((p) => lower.includes(p.toLowerCase()));
}

/**
 * isKilledSDKey — returns true iff the input SD-key starts with a known killed
 * initiative prefix.
 *
 * @param {string|null|undefined} sdKey
 * @returns {boolean}
 */
function isKilledSDKey(sdKey) {
  if (typeof sdKey !== 'string' || sdKey.length === 0) return false;
  return KILLED_PATTERNS.sd_key_prefixes.some((p) => sdKey.startsWith(p));
}

module.exports = {
  KILLED_PATTERNS,
  isKilledVentureId,
  isKilledVentureName,
  isKilledSDKey,
};
