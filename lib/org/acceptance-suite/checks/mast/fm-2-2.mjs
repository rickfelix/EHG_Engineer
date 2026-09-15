/**
 * MAST FM-2.2 (FC2 Inter-Agent Misalignment): fail to ask for clarification. Direct
 * representation -- a task whose spec is marked ambiguous_input:true must produce a
 * clarification_request before terminating; proceeding to termination without one means the
 * agent failed to ask for clarification on genuinely ambiguous input.
 */
export const id = 'fm-2-2';
export const mastCode = 'FM-2.2';
export const category = 'FC2';
export const label = 'fail to ask for clarification';
export const proxy = false;

export function check(organization) {
  const tasks = organization?.tasks ?? [];
  for (const task of tasks) {
    const ambiguous = task?.spec?.ambiguous_input === true;
    const terminated = task?.produced?.terminated === true;
    const askedForClarification = Boolean(task?.produced?.clarification_request);
    if (ambiguous && terminated && !askedForClarification) {
      return { passed: false, reason: `task "${task.id}" had ambiguous input but terminated without a clarification_request` };
    }
  }
  return { passed: true };
}
