/**
 * MAST FM-1.5 (FC1 System Design): unaware of termination conditions. Direct representation -- a
 * task must not report terminated:true unless its own termination_condition_met flag is also
 * true; terminating without meeting the declared condition means the agent was unaware of (or
 * ignored) its termination condition.
 */
export const id = 'fm-1-5';
export const mastCode = 'FM-1.5';
export const category = 'FC1';
export const label = 'unaware of termination conditions';
export const proxy = false;

export function check(organization) {
  const tasks = organization?.tasks ?? [];
  for (const task of tasks) {
    const terminated = task?.produced?.terminated === true;
    const conditionMet = task?.produced?.termination_condition_met === true;
    if (terminated && !conditionMet) {
      return { passed: false, reason: `task "${task.id}" terminated without meeting its declared termination_condition ("${task?.spec?.termination_condition}")` };
    }
  }
  return { passed: true };
}
