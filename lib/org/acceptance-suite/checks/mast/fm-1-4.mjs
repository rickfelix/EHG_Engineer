/**
 * MAST FM-1.4 (FC1 System Design): loss of conversation history / context truncation. PROXY
 * representation -- the live substrate has no real runtime context window to truncate (memory/
 * tracing, P3/P4, are still unbuilt); this checks the closest definitional proxy available today:
 * a task's spec.required_context_refs (turn numbers it depends on) must each be present in the
 * synthetic conversation_log -- a missing turn simulates context that was truncated before the
 * task could read it.
 */
export const id = 'fm-1-4';
export const mastCode = 'FM-1.4';
export const category = 'FC1';
export const label = 'loss of conversation history / context truncation';
export const proxy = true;
export const proxyReason = 'no live runtime context window exists yet (pending SD-LEO-INFRA-AGENT-MEMORY-WORKING-001); checks a required-turn-presence proxy instead of real truncation.';

export function check(organization) {
  const tasks = organization?.tasks ?? [];
  const log = organization?.conversation_log ?? [];
  const presentTurns = new Set(log.map((entry) => entry.turn));
  for (const task of tasks) {
    const requiredRefs = task?.spec?.required_context_refs ?? [];
    const missing = requiredRefs.filter((turn) => !presentTurns.has(turn));
    if (missing.length > 0) {
      return { passed: false, reason: `task "${task.id}" requires conversation turns [${missing.join(', ')}] that are missing from conversation_log -- context appears truncated` };
    }
  }
  return { passed: true };
}
