/**
 * MAST FM-3.2 (FC3 Task Verification): no or incomplete verification. Direct representation -- a
 * task's produced.verification.covers must include every check named in
 * spec.verification_required_checks; a missing verification object, or one covering fewer checks
 * than required, is no/incomplete verification.
 */
export const id = 'fm-3-2';
export const mastCode = 'FM-3.2';
export const category = 'FC3';
export const label = 'no or incomplete verification';
export const proxy = false;

export function check(organization) {
  const tasks = organization?.tasks ?? [];
  for (const task of tasks) {
    const required = task?.spec?.verification_required_checks ?? [];
    if (required.length === 0) continue;
    const verification = task?.produced?.verification;
    if (!verification) {
      return { passed: false, reason: `task "${task.id}" has no verification object despite requiring checks [${required.join(', ')}]` };
    }
    const covered = new Set(verification.covers ?? []);
    const missing = required.filter((c) => !covered.has(c));
    if (missing.length > 0) {
      return { passed: false, reason: `task "${task.id}" verification is incomplete -- missing checks [${missing.join(', ')}]` };
    }
  }
  return { passed: true };
}
