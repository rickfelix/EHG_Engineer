/**
 * Pure idle/stall classifier for the coordinator capacity forecast.
 * SD-LEO-INFRA-CAPACITY-FORECAST-STALLED-BELT-EMPTY-FP-001 (FR-1).
 *
 * A worker is IDLE-STALLED only when its loop is alive but NOT claiming DESPITE
 * available claimable work — i.e. a stale heartbeat AND a non-empty belt. When
 * the belt is empty there is nothing to claim, so a stale-heartbeat idle worker
 * is correctly idle, NOT stalled — labeling it STALLED is a false positive that
 * inflates the STALLED count and emits misleading "needs /loop re-arm" guidance.
 *
 * @param {{hbAgeS:number, beltDepth:number, ttlS?:number}} input
 *   hbAgeS    - heartbeat age in seconds
 *   beltDepth - claimable SDs + open QFs (worker-claimable work available now)
 *   ttlS      - stall threshold in seconds (default 180 = the prior inline value)
 * @returns {{stalled:boolean, state:string, detail:string}}
 */
export function classifyIdleWorker({ hbAgeS, beltDepth, ttlS = 180 } = {}) {
  const stalled = hbAgeS > ttlS && beltDepth > 0;
  return stalled
    ? { stalled: true, state: 'IDLE⚠STALLED', detail: 'alive but loop not claiming (needs /loop re-arm)' }
    : { stalled: false, state: 'IDLE', detail: 'available' };
}
