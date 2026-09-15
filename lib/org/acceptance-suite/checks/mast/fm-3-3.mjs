/**
 * MAST FM-3.3 (FC3 Task Verification): incorrect verification. Direct representation -- a task's
 * verification.claimed_pass must agree with its independent verification.actual_pass; a verifier
 * that claims pass on an actually-failing output has verified incorrectly.
 */
export const id = 'fm-3-3';
export const mastCode = 'FM-3.3';
export const category = 'FC3';
export const label = 'incorrect verification';
export const proxy = false;

export function check(organization) {
  const tasks = organization?.tasks ?? [];
  for (const task of tasks) {
    const verification = task?.produced?.verification;
    if (!verification || verification.actual_pass === undefined) continue;
    if (verification.claimed_pass === true && verification.actual_pass === false) {
      return { passed: false, reason: `task "${task.id}" verification incorrectly claims pass while the independent check reports failure` };
    }
  }
  return { passed: true };
}
