/**
 * MAST FM-2.1 (FC2 Inter-Agent Misalignment): conversation reset. PROXY representation -- the
 * live substrate has no real conversation/session state yet (memory, P3, still unbuilt); this
 * checks the closest definitional proxy: within a single task's synthetic conversation_log
 * turns, every non-first turn must chain refs_prior_turn to the immediately preceding turn's
 * number, simulating a reset that dropped the conversation's continuity.
 */
export const id = 'fm-2-1';
export const mastCode = 'FM-2.1';
export const category = 'FC2';
export const label = 'conversation reset';
export const proxy = true;
export const proxyReason = 'no live conversation/session state exists yet (pending SD-LEO-INFRA-AGENT-MEMORY-WORKING-001); checks a synthetic turn-chaining proxy instead of real session continuity.';

export function check(organization) {
  const log = organization?.conversation_log ?? [];
  const byTask = new Map();
  for (const entry of log) {
    const list = byTask.get(entry.task_id) ?? [];
    list.push(entry);
    byTask.set(entry.task_id, list);
  }
  for (const [taskId, entries] of byTask) {
    const sorted = [...entries].sort((a, b) => a.turn - b.turn);
    for (let i = 1; i < sorted.length; i += 1) {
      const expectedPrior = sorted[i - 1].turn;
      if (sorted[i].refs_prior_turn !== expectedPrior) {
        return { passed: false, reason: `task "${taskId}" turn ${sorted[i].turn} does not chain to prior turn ${expectedPrior} (refs_prior_turn=${sorted[i].refs_prior_turn}) -- conversation appears reset` };
      }
    }
  }
  return { passed: true };
}
