/**
 * Pure "is this session a live, capacity-countable worker?" predicate for the capacity forecaster.
 * SD-LEO-INFRA-FORECASTER-FIXTURE-WORKER-EXCLUSION-001 (FR-1/FR-2).
 *
 * Extracted from scripts/coordinator-capacity-forecast.mjs (which runs main() on import and so cannot
 * be imported by a test). Wraps the canonical session SSOT isDispatchableFleetMember
 * (lib/fleet/session-predicates.mjs, SD-FDBK-INFRA-SHARED-FLEET-WORKER-001) — which already drops the
 * coordinator (by id) + adam + non_fleet + fixture/test sessions — and adds two forecaster-specific
 * guards: a stale metadata.is_coordinator marker, and a released/terminal session status (a worker
 * that released its claim is not available even with a fresh heartbeat).
 */

import { isDispatchableFleetMember } from '../../lib/fleet/session-predicates.mjs';

// Session statuses that mean "not an available worker" even within the live-heartbeat window.
export const RELEASED_WORKER_STATUSES = new Set(['released', 'completed', 'terminated', 'inactive']);

/**
 * @param {{session_id?:string, terminal_id?:string, status?:string, metadata?:object}} session
 * @param {string|null} coordinatorId - the active coordinator's session_id (excluded by id)
 * @returns {boolean} true when the session should be counted as a live fleet worker
 */
export function isLiveCountableWorker(session, coordinatorId) {
  if (!session || typeof session !== 'object') return false;
  const md = session.metadata || {};
  if (md.is_coordinator) return false; // a stale coordinator-marked session is never a worker
  if (session.status && RELEASED_WORKER_STATUSES.has(session.status)) return false; // FR-2
  return isDispatchableFleetMember(session, coordinatorId); // FR-1: drops adam/non_fleet/fixture
}
