/**
 * MAST FM-2.6 (FC2 Inter-Agent Misalignment): reasoning-action mismatch. Direct representation --
 * a task declares spec.reasoning_action_rule ({if_reasoning_contains, expected_action}); if the
 * agent's stated_reasoning contains that phrase, its action_taken must match the expected action,
 * or its stated reasoning and its actual action have diverged.
 */
export const id = 'fm-2-6';
export const mastCode = 'FM-2.6';
export const category = 'FC2';
export const label = 'reasoning-action mismatch';
export const proxy = false;

export function check(organization) {
  const tasks = organization?.tasks ?? [];
  for (const task of tasks) {
    const rule = task?.spec?.reasoning_action_rule;
    if (!rule) continue;
    const reasoning = task?.produced?.stated_reasoning ?? '';
    const actionTaken = task?.produced?.action_taken;
    if (reasoning.includes(rule.if_reasoning_contains) && actionTaken !== rule.expected_action) {
      return { passed: false, reason: `task "${task.id}" stated reasoning implies action "${rule.expected_action}" but action_taken was "${actionTaken}"` };
    }
  }
  return { passed: true };
}
