/**
 * lib/agent-readiness/concurrency-limiter.js
 * SD-LEO-FEAT-AGENT-READINESS-SERVICE-001 FR-6 / US-012.
 *
 * Bounds the audit runner's Promise.allSettled fan-out to a configured number of in-flight cells,
 * with an observed peak-in-flight counter so the bound is MEASURED rather than assumed (AC-012-1).
 * Orthogonal to FR-1's no-fallback rule: throttling reduces 429s but a throttled retry must still go
 * to the SAME model and fail per FR-1, never silently substitute (AC-012-2) — enforced by
 * agent_readiness_audit_sample_no_fallback at the DB layer regardless of what this module does.
 */

/**
 * Run `tasks` (array of () => Promise<T>) with at most `bound` concurrently in flight.
 * Returns results in the SAME ORDER as `tasks`, Promise.allSettled-shaped ({status, value|reason}).
 * @param {Array<() => Promise<any>>} tasks
 * @param {number} bound - max concurrent in-flight tasks (>=1)
 * @param {{onPeakUpdate?: (peak:number) => void}} [opts]
 * @returns {Promise<Array<{status:'fulfilled', value:any}|{status:'rejected', reason:any}>>}
 */
export async function runBounded(tasks, bound, opts = {}) {
  const boundedTo = Math.max(1, Number(bound) || 1);
  const results = new Array(tasks.length);
  let nextIndex = 0;
  let inFlight = 0;
  let peakInFlight = 0;

  async function worker() {
    for (;;) {
      const i = nextIndex++;
      if (i >= tasks.length) return;
      inFlight++;
      peakInFlight = Math.max(peakInFlight, inFlight);
      if (opts.onPeakUpdate) opts.onPeakUpdate(peakInFlight);
      try {
        const value = await tasks[i]();
        results[i] = { status: 'fulfilled', value };
      } catch (reason) {
        results[i] = { status: 'rejected', reason };
      } finally {
        inFlight--;
      }
    }
  }

  const workerCount = Math.min(boundedTo, tasks.length) || 1;
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}

export const _internal = {};
