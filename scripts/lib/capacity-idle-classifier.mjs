/**
 * Pure idle/stall classifier for the coordinator capacity forecast.
 * SD-LEO-INFRA-CAPACITY-FORECAST-STALLED-BELT-EMPTY-FP-001 (FR-1, belt-empty guard).
 * SD-LEO-FEAT-COORDINATOR-CAPACITY-FORECAST-001 (TTL realism — see below).
 *
 * A worker is IDLE-STALLED only when its loop is alive but NOT claiming DESPITE
 * available claimable work — i.e. a stale heartbeat AND a non-empty belt. When
 * the belt is empty there is nothing to claim, so a stale-heartbeat idle worker
 * is correctly idle, NOT stalled — labeling it STALLED is a false positive that
 * inflates the STALLED count and emits misleading "needs /loop re-arm" guidance.
 *
 * TTL realism (SD-LEO-FEAT-COORDINATOR-CAPACITY-FORECAST-001): a healthy idle /loop
 * worker only re-polls (and writes its heartbeat) every idle wake cycle — the fleet
 * idle cadence is 600s (worker-checkin DEFAULT_IDLE_WAKEUP_SECONDS) and the propose-only
 * branch waits 1200s. So between ticks an idle worker's heartbeat legitimately ages up to
 * ~1200s. The previous 180s default therefore false-flagged EVERY healthy idle worker as
 * STALLED the moment the global belt held any claimable item (it had simply not reached its
 * next scheduled wake yet). DEFAULT_STALL_TTL_S = 1800 sits above the max healthy idle
 * interval (1200s) + a margin for one slow tick, so only a worker that has demonstrably
 * MISSED a wake (loop actually dead → needs /loop re-arm) is flagged. It is also above
 * claim_sd's 900s liveness guard, keeping the two notions of "alive" consistent.
 *
 * @param {{hbAgeS:number, beltDepth:number, ttlS?:number}} input
 *   hbAgeS    - heartbeat age in seconds
 *   beltDepth - claimable SDs + open QFs (worker-claimable work available now)
 *   ttlS      - stall threshold in seconds (default DEFAULT_STALL_TTL_S)
 * @returns {{stalled:boolean, state:string, detail:string}}
 */
export const DEFAULT_STALL_TTL_S = 1800;

export function classifyIdleWorker({ hbAgeS, beltDepth, ttlS = DEFAULT_STALL_TTL_S } = {}) {
  const stalled = hbAgeS > ttlS && beltDepth > 0;
  return stalled
    ? { stalled: true, state: 'IDLE⚠STALLED', detail: 'alive but loop not claiming (needs /loop re-arm)' }
    : { stalled: false, state: 'IDLE', detail: 'available' };
}
