/**
 * Known default ("placeholder") smoke-test markers — QF-20260529-985.
 *
 * leo-create-sd.js buildDefaultSmokeTestSteps emits GENERIC placeholder smoke_test_steps
 * when a plan has no real smoke/demo section. Those steps use title-independent, fixed
 * expected_outcome strings (below). SMOKE_TEST_SPECIFICATION uses isAllPlaceholderSmokeSteps()
 * to BLOCK a code-producing SD whose smoke steps are ENTIRELY these placeholders, forcing a
 * real LEAD Q9 "30-second demo" instead of a passing stub.
 *
 * KEEP IN SYNC with scripts/leo-create-sd.js buildDefaultSmokeTestSteps expected_outcome values.
 */

export const DEFAULT_SMOKE_OUTCOME_MARKERS = new Set([
  // infrastructure (code-producing) defaults
  'Script executes without errors',
  'Output is correct and complete',
  'Existing functionality unchanged',
  // feature / general defaults
  'Page loads without errors',
  'Core feature operates correctly with expected behavior',
  'Appropriate error handling or graceful degradation',
]);

/**
 * True when `steps` is a non-empty array whose EVERY step's expected_outcome is one of the
 * known generic placeholders — i.e. the auto-generated stub, not a real demo. A single
 * real step makes it false (partial-real is acceptable).
 *
 * @param {Array<{expected_outcome?: string}>} steps
 * @returns {boolean}
 */
export function isAllPlaceholderSmokeSteps(steps) {
  if (!Array.isArray(steps) || steps.length === 0) return false;
  return steps.every((s) => DEFAULT_SMOKE_OUTCOME_MARKERS.has(String(s?.expected_outcome ?? '').trim()));
}
