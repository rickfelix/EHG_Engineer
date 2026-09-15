/**
 * MAST FM-2.3 (FC2 Inter-Agent Misalignment): task derailment. Direct representation -- a task's
 * produced.output_topic must match its own spec.goal_topic; a divergence means the task drifted
 * away from its assigned goal.
 */
export const id = 'fm-2-3';
export const mastCode = 'FM-2.3';
export const category = 'FC2';
export const label = 'task derailment';
export const proxy = false;

export function check(organization) {
  const tasks = organization?.tasks ?? [];
  for (const task of tasks) {
    const goalTopic = task?.spec?.goal_topic;
    const outputTopic = task?.produced?.output_topic;
    if (goalTopic && outputTopic && goalTopic !== outputTopic) {
      return { passed: false, reason: `task "${task.id}" derailed: goal_topic="${goalTopic}" but output_topic="${outputTopic}"` };
    }
  }
  return { passed: true };
}
