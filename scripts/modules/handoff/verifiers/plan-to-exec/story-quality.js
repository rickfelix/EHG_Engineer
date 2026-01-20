/**
 * Story Quality Thresholds for PLAN-TO-EXEC Verifier
 *
 * SD-type-aware minimum story quality scores.
 *
 * Extracted from scripts/verify-handoff-plan-to-exec.js for maintainability.
 * Part of SD-LEO-REFACTOR-HANDOFF-001
 */

/**
 * Category/type thresholds for user story quality
 */
export const CATEGORY_THRESHOLDS = {
  // Very lenient for documentation-only work
  'documentation': 50,
  'docs': 50,

  // Lenient for QA/testing work (E2E test execution SDs have simple user stories)
  'quality assurance': 50,
  'qa': 50,
  'testing': 50,
  'e2e': 50,

  // Lenient for internal/infrastructure work (includes QA/testing tooling)
  'infrastructure': 50,  // Lowered from 55% - infrastructure SDs have simpler narratives
  'infra': 50,
  'tooling': 55,
  'devops': 55,
  'quality': 50,  // QA/testing work is similar to infrastructure

  // Moderate for standard features (lowered to 55% during Phase 1 AI calibration)
  // TODO: Increase to 65% once AI scoring is calibrated (target: 2-4 weeks)
  'feature': 55,
  'enhancement': 55,

  // ROOT CAUSE FIX: SD-NAV-CMD-001A - bugfix SDs have simpler scope
  // Bugfix stories are targeted fixes, not full feature narratives
  'bugfix': 55,
  'bug_fix': 55,  // Handle underscore variant

  // Stricter for data/security work
  'database': 68,
  'security': 68,

  // Default for unknown categories
  'default': 70
};

/**
 * Get minimum user story quality score based on SD category
 * Infrastructure and documentation SDs have more lenient thresholds
 * since they focus less on user-facing acceptance criteria
 *
 * @param {string} category - SD category from strategic_directives_v2
 * @param {string|null} sdType - SD type from strategic_directives_v2
 * @returns {number} Minimum score percentage
 */
export function getStoryMinimumScoreByCategory(category, sdType = null) {
  const normalizedCategory = (category || '').toLowerCase();
  const normalizedSdType = (sdType || '').toLowerCase();

  // Try category first, then sd_type, then default
  return CATEGORY_THRESHOLDS[normalizedCategory] ||
         CATEGORY_THRESHOLDS[normalizedSdType] ||
         CATEGORY_THRESHOLDS.default;
}
