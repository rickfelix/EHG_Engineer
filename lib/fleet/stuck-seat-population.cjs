/**
 * STUCK-SEAT POPULATION — SD-FDBK-INFRA-STUCK-SEAT-DETECTION-001, FR-5.
 *
 * THE DENOMINATOR IS THE WHOLE BALLGAME, AND THIS FILE EXISTS BECAUSE I GOT IT WRONG ONCE.
 * The first version of FR-5 pinned the population as `status IN ('active','idle')` filtered by the
 * shipped isFleetWorker() — which requires everClaimed = (sd_key || claimed_at || worktree_path ||
 * continuous_sds_completed > 0) at lib/fleet/genuine-worker.mjs:25. So the condition predicate
 * correctly dropped has_live_claim and the POPULATION quietly put it back one field over. Measured
 * live: that population returns 1 OF THIS SD'S OWN 4 STUCK SPECIMENS. Bravo, Alpha and Charlie all
 * have everClaimed=FALSE; Delta survived only on a residual claimed_at and drops out the moment the
 * sweep clears it. A detector cannot see a class of seat its population excludes, and it reports
 * clean while doing so.
 *
 * SO: NO CLAIM-DERIVED FIELD MAY APPEAR IN THIS QUERY — not sd_key, not claimed_at, not
 * worktree_path, not continuous_sds_completed, not everClaimed, not isFleetWorker.
 * Synthetic fixtures are excluded by SESSION-ID SHAPE via isFixtureSession(), which inspects
 * session_id only and fails toward "real" so a classification quirk can never drop a genuine worker.
 *
 * WHY status IN ('active','idle') AND NOT status='active': three of the four stuck specimens are
 * status='idle' RIGHT NOW (Bravo, Alpha, Charlie). Restricting to 'active' would miss 75% of the
 * target class on the same rows that motivated the SD.
 */

'use strict';

const { isFixtureSession } = require('./session-predicates.mjs');

/** The statuses a seat can hold while stuck. Measured: 3 of 4 stuck specimens are 'idle'. */
const POPULATION_STATUSES = Object.freeze(['active', 'idle']);

/**
 * Column list. session_id is TEXT and is the identity; claude_sessions.id is a uuid PK and is NOT
 * selected at all, so no downstream consumer can accidentally join on it. Querying the wrong one
 * returns zero rows WITH NO ERROR — a silent empty indistinguishable from "no stuck seats found".
 */
const POPULATION_COLUMNS = 'session_id, status, loop_state, last_tool_at, heartbeat_at, metadata';

/**
 * Fetch the seats eligible for stuck-seat classification.
 *
 * @param {object} supabase
 * @returns {Promise<Array<object>>} rows, fixture sessions already removed
 */
async function fetchPopulation(supabase) {
  const { data, error } = await supabase
    .from('claude_sessions')
    .select(POPULATION_COLUMNS)
    .in('status', POPULATION_STATUSES);
  if (error) throw new Error('stuck-seat-population: query failed: ' + error.message);
  return (data || []).filter((row) => !isFixtureSession(row));
}

module.exports = { fetchPopulation, POPULATION_STATUSES, POPULATION_COLUMNS };
