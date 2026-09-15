/**
 * MAST FM-1.3 (FC1 System Design): step repetition. PROXY representation -- the live substrate
 * has no real execution-step trace yet (tracing/duty-ledger, P4, still unbuilt); this checks the
 * closest definitional proxy: a task's synthetic `history[]` (a step-by-step execution log) with
 * the same step description repeated 3+ times consecutively simulates a stuck/looping task.
 */
export const id = 'fm-1-3';
export const mastCode = 'FM-1.3';
export const category = 'FC1';
export const label = 'step repetition';
export const proxy = true;
export const proxyReason = 'no live execution-step trace exists yet (pending SD-LEO-INFRA-DUTY-LEDGER-TRACING-001); checks a synthetic history[] repetition proxy instead of a real trace.';

const REPETITION_THRESHOLD = 3;

export function check(organization) {
  const tasks = organization?.tasks ?? [];
  for (const task of tasks) {
    const history = task?.history ?? [];
    let runLength = 1;
    for (let i = 1; i < history.length; i += 1) {
      if (history[i]?.description === history[i - 1]?.description) {
        runLength += 1;
        if (runLength >= REPETITION_THRESHOLD) {
          return { passed: false, reason: `task "${task.id}" repeats step "${history[i].description}" ${runLength} times consecutively (threshold ${REPETITION_THRESHOLD})` };
        }
      } else {
        runLength = 1;
      }
    }
  }
  return { passed: true };
}
