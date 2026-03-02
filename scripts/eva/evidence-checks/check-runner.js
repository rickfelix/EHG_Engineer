/**
 * check-runner.js — Rubric Check Orchestrator
 *
 * Runs all checks for a dimension rubric, computes weighted score,
 * and generates deterministic reasoning + gap lists.
 */

import { checkTypes } from './check-types.js';

/**
 * Run all checks in a rubric definition.
 * @param {object} rubric - { id, name, checks: [{ id, label, type, weight, params }] }
 * @param {object} context - { supabase } for DB checks
 * @returns {Promise<Array<{ id, label, type, weight, passed, evidence }>>}
 */
export async function runRubricChecks(rubric, context = {}) {
  const results = [];
  for (const check of rubric.checks) {
    const runner = checkTypes[check.type];
    if (!runner) {
      results.push({
        ...check, passed: false,
        evidence: `Unknown check type: ${check.type}`,
      });
      continue;
    }
    // Inject context for db_row_exists checks
    const params = check.type === 'db_row_exists'
      ? { ...check.params, _context: context }
      : check.params;

    const result = await runner(params);
    results.push({
      id: check.id,
      label: check.label,
      type: check.type,
      weight: check.weight,
      passed: result.passed,
      evidence: result.evidence,
    });
  }
  return results;
}

/**
 * Compute a 0-100 score from check results using weights.
 * @param {Array} results - Output of runRubricChecks
 * @returns {number} Score 0-100
 */
export function computeDimensionScore(results) {
  const totalWeight = results.reduce((sum, r) => sum + r.weight, 0);
  if (totalWeight === 0) return 0;
  const earned = results.reduce((sum, r) => sum + (r.passed ? r.weight : 0), 0);
  return Math.round((earned / totalWeight) * 100);
}

/**
 * Generate deterministic reasoning text from check results.
 * @param {Array} results - Output of runRubricChecks
 * @returns {string} Reasoning summary
 */
export function generateReasoning(results) {
  const passed = results.filter(r => r.passed);
  const failed = results.filter(r => !r.passed);
  const parts = [];

  if (passed.length > 0) {
    parts.push(`Passed (${passed.length}/${results.length}): ${passed.map(r => r.label).join('; ')}.`);
  }
  if (failed.length > 0) {
    parts.push(`Failed (${failed.length}/${results.length}): ${failed.map(r => `${r.label} — ${r.evidence}`).join('; ')}.`);
  }

  return parts.join(' ');
}

/**
 * Extract gap descriptions from failed checks.
 * @param {Array} results - Output of runRubricChecks
 * @returns {string[]} Array of gap descriptions
 */
export function generateGaps(results) {
  return results
    .filter(r => !r.passed)
    .map(r => r.label);
}
