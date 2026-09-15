/**
 * MAST FM-3.1 (FC3 Task Verification): premature termination. Direct representation -- a task
 * that reports terminated:true must have every item in its spec.completion_checklist marked true
 * in produced.completion_status; terminating with unchecked items is premature.
 */
export const id = 'fm-3-1';
export const mastCode = 'FM-3.1';
export const category = 'FC3';
export const label = 'premature termination';
export const proxy = false;

export function check(organization) {
  const tasks = organization?.tasks ?? [];
  for (const task of tasks) {
    if (task?.produced?.terminated !== true) continue;
    const checklist = task?.spec?.completion_checklist ?? [];
    const status = task?.produced?.completion_status ?? {};
    const unmet = checklist.filter((item) => status[item] !== true);
    if (unmet.length > 0) {
      return { passed: false, reason: `task "${task.id}" terminated prematurely -- unmet completion checklist items [${unmet.join(', ')}]` };
    }
  }
  return { passed: true };
}
