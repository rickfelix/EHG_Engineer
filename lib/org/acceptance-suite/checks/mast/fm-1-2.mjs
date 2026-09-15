/**
 * MAST FM-1.2 (FC1 System Design): disobey role spec. Direct representation, cross-referencing a
 * REAL field: a task's owner_role must actually have the spec.required_capability in its own
 * (real, resolver-sourced) capabilities array -- a role acting outside its declared capability
 * set has disobeyed its role spec.
 */
import { findRoleByAgentRole } from './_shared.mjs';

export const id = 'fm-1-2';
export const mastCode = 'FM-1.2';
export const category = 'FC1';
export const label = 'disobey role spec';
export const proxy = false;

export function check(organization) {
  const tasks = organization?.tasks ?? [];
  for (const task of tasks) {
    const requiredCapability = task?.spec?.required_capability;
    if (!requiredCapability) continue;
    const role = findRoleByAgentRole(organization, task.owner_role);
    if (!role) {
      return { passed: false, reason: `task "${task.id}" owner_role "${task.owner_role}" not found in the organization` };
    }
    const capabilities = role.capabilities ?? [];
    if (!capabilities.includes(requiredCapability)) {
      return { passed: false, reason: `role "${role.agent_role}" disobeys its spec: task "${task.id}" requires capability "${requiredCapability}", not in its capabilities [${capabilities.join(', ')}]` };
    }
  }
  return { passed: true };
}
