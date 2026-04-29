/**
 * Canonical finding shape for the Stage 20 Unified Quality Lifecycle Loop.
 *
 * SD: SD-LEO-ORCH-QUALITY-LIFECYCLE-LOOP-001-A
 *
 * Stage 20 owns Code Review (structural) + QA (behavioral) + UAT (experiential)
 * findings as one canonical record set. The 10 finding categories are the
 * single source of truth — downstream components B (table), C (per-finding SD
 * generator), D (sandbox), E (Rule 9 capability checks), and F (aggregator)
 * all consume this shape.
 *
 * The stage_number column on the persistence layer is kept open (no CHECK
 * constraint pinning to 20) so future stages can adopt the same fabric
 * without schema changes.
 *
 * @module lib/eva/quality-findings/finding-shape
 */

/**
 * The 10 unified Stage 20 finding categories.
 *
 * Code Review (structural):
 *   - npm_audit:    package vulnerability findings
 *   - secrets:      secret-detection findings
 *   - lint:         lint rule violations
 *   - test_suite:   test-runner failures (suite-level, e.g., did suite run)
 *   - capability:   missing capability findings (gh CLI, sandbox, etc.)
 *
 * QA (behavioral):
 *   - unit_test:    individual unit-test case failures
 *   - e2e_test:     end-to-end test failures
 *
 * UAT (experiential):
 *   - uat_test:     user-acceptance-test case failures
 *   - bug_report:   chairman-filed bug reports
 *   - uat_signoff:  UAT signoff rejections
 */
export const FINDING_CATEGORIES = Object.freeze([
  'npm_audit',
  'secrets',
  'lint',
  'test_suite',
  'unit_test',
  'e2e_test',
  'uat_test',
  'bug_report',
  'uat_signoff',
  'capability',
]);

/**
 * Severity values for any category.
 */
export const SEVERITY_LEVELS = Object.freeze(['critical', 'high', 'medium', 'low']);

/**
 * @typedef {Object} FindingShape
 * @property {string} venture_id          - UUID of the venture this finding belongs to.
 * @property {number} stage_number        - Stage that emitted the finding (always 20 today; future-compatible).
 * @property {string} finding_category    - One of FINDING_CATEGORIES.
 * @property {string} severity            - One of SEVERITY_LEVELS.
 * @property {string} finding_hash        - Deterministic dedup key (see computeFindingHash).
 * @property {Object} evidence_pointer    - JSONB; references to source evidence (file paths, test ids, log URLs).
 * @property {string|null} sd_key         - SD key when remediation SD has been generated (Component C).
 * @property {string} created_at          - ISO timestamp (set by DB).
 * @property {string|null} resolved_at    - ISO timestamp when finding was resolved.
 */

/**
 * Compute a deterministic finding_hash for idempotency. Components C (SD generator),
 * E (capability gate), and F (aggregator) all key on this hash so re-runs against
 * the same venture state produce zero duplicates.
 *
 * @param {Object} args
 * @param {string} args.venture_id
 * @param {number} args.stage_number
 * @param {string} args.finding_category
 * @param {string} args.finding_signature  - category-specific identity (e.g. "lint:no-unused-vars:src/foo.js:42")
 * @returns {string} short hex digest (16 chars)
 */
export function computeFindingHash({ venture_id, stage_number, finding_category, finding_signature }) {
  if (!venture_id || stage_number == null || !finding_category || !finding_signature) {
    throw new Error('computeFindingHash requires venture_id, stage_number, finding_category, finding_signature');
  }
  const input = `${venture_id}|${stage_number}|${finding_category}|${finding_signature}`;
  // FNV-1a 32-bit, doubled for 64-bit-ish digest. Sufficient for dedup;
  // not cryptographic.
  let h1 = 2166136261, h2 = 1099511628211 & 0xFFFFFFFF;
  for (let i = 0; i < input.length; i++) {
    const c = input.charCodeAt(i);
    h1 = (h1 ^ c) * 16777619 >>> 0;
    h2 = (h2 ^ c) * 1099511628211 >>> 0;
  }
  return (h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0')).slice(0, 16);
}

/**
 * Validate that an object conforms to FindingShape. Returns {valid, errors}.
 * @param {Object} f
 */
export function validateFindingShape(f) {
  const errors = [];
  if (!f || typeof f !== 'object') return { valid: false, errors: ['finding must be an object'] };
  if (!f.venture_id) errors.push('venture_id required');
  if (typeof f.stage_number !== 'number') errors.push('stage_number must be a number');
  if (!FINDING_CATEGORIES.includes(f.finding_category)) errors.push(`finding_category must be one of: ${FINDING_CATEGORIES.join(', ')}`);
  if (!SEVERITY_LEVELS.includes(f.severity)) errors.push(`severity must be one of: ${SEVERITY_LEVELS.join(', ')}`);
  if (!f.finding_hash) errors.push('finding_hash required (use computeFindingHash)');
  return { valid: errors.length === 0, errors };
}
