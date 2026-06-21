/**
 * Canonical retrospectives.learning_category allowlist + normalizer.
 * SD-FDBK-INFRA-RETROSPECTIVES-CHECK-LEARNING-001.
 *
 * The `check_learning_category` CHECK constraint on `retrospectives` accepts EXACTLY these 9 values
 * (verified live 2026-06-21). Plausible-sounding categories that workers/manual inserts often reach for
 * — PROTOCOL_PROCESS, PROCESS, INFRASTRUCTURE, CI_CD, TOOLING, WORKFLOW, CONFIGURATION, OTHER — are NOT
 * in the set and get REJECTED by the constraint, forcing a poor-fit category or an outright insert
 * failure. Rather than widen a constraint that is already reasonable, this module makes the canonical
 * list discoverable and coerces any near-miss to the nearest valid value so a retro NEVER fails on
 * category. Import { LEARNING_CATEGORIES, normalizeLearningCategory } from here in every retro writer.
 */

/** The exact set permitted by the check_learning_category constraint (keep in sync with the DB). */
export const LEARNING_CATEGORIES = Object.freeze([
  'APPLICATION_ISSUE',
  'PROCESS_IMPROVEMENT',
  'TESTING_STRATEGY',
  'DATABASE_SCHEMA',
  'DEPLOYMENT_ISSUE',
  'PERFORMANCE_OPTIMIZATION',
  'USER_EXPERIENCE',
  'SECURITY_VULNERABILITY',
  'DOCUMENTATION',
]);

/** Safe default when nothing else matches (also the legacy generate-retrospective.js default). */
export const DEFAULT_LEARNING_CATEGORY = 'APPLICATION_ISSUE';

const VALID = new Set(LEARNING_CATEGORIES);

// Common rejected/near-miss inputs → the closest valid canonical value. Keys are normalized
// (uppercased, non-alphanumerics collapsed to '_') so 'ci/cd', 'CI-CD', 'ci_cd' all map the same.
const ALIASES = Object.freeze({
  // process / infra / tooling / workflow / config → PROCESS_IMPROVEMENT
  PROTOCOL_PROCESS: 'PROCESS_IMPROVEMENT',
  PROCESS: 'PROCESS_IMPROVEMENT',
  WORKFLOW: 'PROCESS_IMPROVEMENT',
  CONFIGURATION: 'PROCESS_IMPROVEMENT',
  CONFIG: 'PROCESS_IMPROVEMENT',
  TOOLING: 'PROCESS_IMPROVEMENT',
  INFRASTRUCTURE: 'PROCESS_IMPROVEMENT',
  INFRA: 'PROCESS_IMPROVEMENT',
  GOVERNANCE: 'PROCESS_IMPROVEMENT',
  // ci/cd / deploy / pipeline / release → DEPLOYMENT_ISSUE
  CI_CD: 'DEPLOYMENT_ISSUE',
  CICD: 'DEPLOYMENT_ISSUE',
  CI: 'DEPLOYMENT_ISSUE',
  DEPLOY: 'DEPLOYMENT_ISSUE',
  DEPLOYMENT: 'DEPLOYMENT_ISSUE',
  PIPELINE: 'DEPLOYMENT_ISSUE',
  RELEASE: 'DEPLOYMENT_ISSUE',
  // testing
  TEST: 'TESTING_STRATEGY',
  TESTING: 'TESTING_STRATEGY',
  QA: 'TESTING_STRATEGY',
  // database
  DATABASE: 'DATABASE_SCHEMA',
  SCHEMA: 'DATABASE_SCHEMA',
  DB: 'DATABASE_SCHEMA',
  MIGRATION: 'DATABASE_SCHEMA',
  // performance
  PERFORMANCE: 'PERFORMANCE_OPTIMIZATION',
  PERF: 'PERFORMANCE_OPTIMIZATION',
  OPTIMIZATION: 'PERFORMANCE_OPTIMIZATION',
  // security
  SECURITY: 'SECURITY_VULNERABILITY',
  AUTH: 'SECURITY_VULNERABILITY',
  RLS: 'SECURITY_VULNERABILITY',
  // docs
  DOCS: 'DOCUMENTATION',
  DOC: 'DOCUMENTATION',
  // ux
  UI: 'USER_EXPERIENCE',
  UX: 'USER_EXPERIENCE',
  USER: 'USER_EXPERIENCE',
  // explicit catch-alls
  OTHER: DEFAULT_LEARNING_CATEGORY,
  GENERAL: DEFAULT_LEARNING_CATEGORY,
});

/**
 * Coerce any input to a value the check_learning_category constraint accepts.
 * - already-valid → returned unchanged
 * - known alias (case/separator-insensitive) → mapped to the nearest valid value
 * - anything else (null/empty/unknown) → DEFAULT_LEARNING_CATEGORY
 * Always returns a member of LEARNING_CATEGORIES, so the insert never fails on this column.
 *
 * @param {unknown} input
 * @returns {string} a valid learning_category
 */
export function normalizeLearningCategory(input) {
  if (typeof input !== 'string') return DEFAULT_LEARNING_CATEGORY;
  const key = input.trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  if (!key) return DEFAULT_LEARNING_CATEGORY;
  if (VALID.has(key)) return key;
  if (Object.prototype.hasOwnProperty.call(ALIASES, key)) return ALIASES[key];
  return DEFAULT_LEARNING_CATEGORY;
}

