/**
 * MAST FM-3.3 (FC3 Task Verification): incorrect verification. Direct representation, CROSS-ENTITY
 * (per FR-2 AC-4: "any FC3 check that compares a verifier's claim against an actual outcome" names
 * this check explicitly) -- a task's verification.claimed_pass must agree with its independent
 * verification.actual_pass; a verifier that claims pass on an actually-failing output has verified
 * incorrectly.
 *
 * checkEach() exposes a per-task verdict (not just the aggregate) so a discrimination test can
 * prove the check correctly distinguishes a broken verification from a well-formed one in the SAME
 * fixture, per this session's single-candidate mutation-testing gotcha.
 */
export const id = 'fm-3-3';
export const mastCode = 'FM-3.3';
export const category = 'FC3';
export const label = 'incorrect verification';
export const proxy = false;

export function checkEach(organization) {
  const tasks = organization?.tasks ?? [];
  const results = [];
  for (const task of tasks) {
    const verification = task?.produced?.verification;
    if (!verification || verification.actual_pass === undefined) continue;
    const passed = !(verification.claimed_pass === true && verification.actual_pass === false);
    results.push({
      task_id: task.id,
      passed,
      reason: passed ? undefined : `task "${task.id}" verification incorrectly claims pass while the independent check reports failure`,
    });
  }
  return results;
}

export function check(organization) {
  const perTask = checkEach(organization);
  const failed = perTask.find((r) => !r.passed);
  if (failed) return { passed: false, reason: failed.reason };
  return { passed: true };
}
