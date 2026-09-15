/**
 * MAST FM-2.5 (FC2 Inter-Agent Misalignment): ignored other agent's input. Direct
 * representation, CROSS-ENTITY (per FR-2 AC-4) -- a task with multiple contributing roles
 * (task.contributions[]) must incorporate every contribution's input marker into its
 * produced.incorporated_inputs; a contribution never incorporated means that agent's input was
 * ignored.
 *
 * checkEach() exposes a per-contribution verdict so a discrimination test can prove the check
 * flags only the ignored contribution, not every contribution indiscriminately.
 */
export const id = 'fm-2-5';
export const mastCode = 'FM-2.5';
export const category = 'FC2';
export const label = "ignored other agent's input";
export const proxy = false;

export function checkEach(organization) {
  const results = [];
  const tasks = organization?.tasks ?? [];
  for (const task of tasks) {
    const contributions = task?.contributions ?? [];
    if (contributions.length < 2) continue; // nothing to be "ignored" relative to
    const incorporated = new Set(task?.produced?.incorporated_inputs ?? []);
    for (const contribution of contributions) {
      const passed = incorporated.has(contribution.input);
      results.push({
        task_id: task.id,
        role: contribution.role,
        passed,
        reason: passed ? undefined : `task "${task.id}" ignored input "${contribution.input}" from role "${contribution.role}"`,
      });
    }
  }
  return results;
}

export function check(organization) {
  const perContribution = checkEach(organization);
  const failed = perContribution.find((r) => !r.passed);
  if (failed) return { passed: false, reason: failed.reason };
  return { passed: true };
}
