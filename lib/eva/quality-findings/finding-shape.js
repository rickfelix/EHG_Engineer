/**
 * Canonical finding shape for the Stage 20 Unified Quality Lifecycle Loop.
 *
 * SD: SD-LEO-ORCH-QUALITY-LIFECYCLE-LOOP-001-A
 *
 * Stage 20 owns Code Review (structural) + QA (behavioral) + UAT (experiential)
 * findings as one canonical record set. FINDING_CATEGORIES below is the
 * single source of truth — downstream components B (table), C (per-finding SD
 * generator), D (sandbox), E (Rule 9 capability checks), and F (aggregator)
 * all consume this shape. NOTE: the code-level array can carry categories the
 * live venture_quality_findings_finding_category_check constraint does not
 * yet accept — a migration authored but never applied is a recurring gap
 * class in this file's history (see the 20260828/20260913 migration files'
 * own comments); check the live constraint before assuming a category here
 * is actually insertable.
 *
 * The stage_number column on the persistence layer is kept open (no CHECK
 * constraint pinning to 20) so future stages can adopt the same fabric
 * without schema changes.
 *
 * // eva-logger-lint-ignore: pure constant/shape-validation module (no I/O,
 * // no request/response cycle, no side effects) -- computeFindingHash and
 * // validateFindingShape are deterministic pure functions with nothing
 * // operationally meaningful to log; callers (writer.js, sd-generator.js)
 * // own the logging for the actual persistence/generation side effects.
 *
 * @module lib/eva/quality-findings/finding-shape
 */

/**
 * SD-LEO-INFRA-VENTURE-QUALITY-CAPA-001-B: GENERATED from the Venture Quality Model v1
 * registry (lib/eva/quality-model/registry.js), filtered to owner_stage===20, in registry
 * order. The registry is now the single source of truth for which categories exist and
 * what tier/producer/reader/severity_policy each carries — see
 * docs/04_features/venture-quality-model-v1.md for the full narrative. Order is pinned to
 * the registry's own declaration order, which is deliberately identical to this array's
 * pre-generation literal order (order is observable: this file's own error text below
 * joins the array, and stage-20.js publishes it as a JSON-schema enum).
 */
import { QUALITY_MODEL_DIMENSIONS, WARN_CAPPED_DIMENSION_IDS } from '../quality-model/registry.js';

const STAGE_20_DIMENSIONS = QUALITY_MODEL_DIMENSIONS.filter((d) => d.owner_stage === 20);

export const FINDING_CATEGORIES = Object.freeze(STAGE_20_DIMENSIONS.map((d) => d.id));

/**
 * SD-LEO-FEAT-STAGE-EXPERIENCE-DESIGN-001 (+ SD-LEO-INFRA-VENTURE-QUALITY-CAPA-001-A):
 * the WARN-cap set — findings in these categories are persisted at true severity but
 * excluded from the Stage-20 hasCritical/hasHigh verdict scan (stage-20-code-quality.js),
 * so no experience/baseline finding can ever produce a FAIL. Single source of truth for
 * both the verdict formula and any test asserting the cap. GENERATED (CAPA-001-B) from
 * the registry's severity_policy==='warn_capped' dimensions.
 */
export const WARN_CAPPED_CATEGORIES = WARN_CAPPED_DIMENSION_IDS;

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
