/**
 * MAST FM-1.1 (FC1 System Design): disobey task spec. Direct representation -- the synthetic
 * task schema (organization.tasks[]) carries spec.expected_output_fields; a task whose
 * produced.output is missing a required field has disobeyed its own spec.
 */
export const id = 'fm-1-1';
export const mastCode = 'FM-1.1';
export const category = 'FC1';
export const label = 'disobey task spec';
export const proxy = false;

export function check(organization) {
  const tasks = organization?.tasks ?? [];
  for (const task of tasks) {
    const requiredFields = task?.spec?.expected_output_fields;
    if (!Array.isArray(requiredFields)) continue;
    const output = task?.produced?.output ?? {};
    const missing = requiredFields.filter((f) => !(f in output));
    if (missing.length > 0) {
      return { passed: false, reason: `task "${task.id}" disobeys its spec: missing output fields [${missing.join(', ')}]` };
    }
  }
  return { passed: true };
}
