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

/** PostgREST's default cap. Named so a caller can detect that it fetched exactly a full page. */
const POPULATION_ROW_LIMIT = 1000;

/**
 * Fetch the seats eligible for stuck-seat classification.
 *
 * @param {object} supabase
 * @returns {Promise<Array<object>>} rows, fixture sessions already removed
 */
async function fetchPopulation(supabase) {
  // ROWCAP. PostgREST caps an unbounded select at 1000 rows and returns the truncation SILENTLY —
  // no error, just fewer rows. Without .order() the retained subset is not even deterministic, so a
  // stuck seat past the cap would vanish from the count with nothing to indicate it. That is the
  // silent false negative this whole SD exists to remove, reproduced in its own instrumentation.
  // Latent at today's 14 rows and fixed anyway, because "latent" is how this class always starts.
  // .order('last_tool_at') is not cosmetic: it makes the retained page the STALEST seats, so if the
  // cap is ever hit the rows that survive are the ones most likely to be stuck.
  const { data, error } = await supabase
    .from('claude_sessions')
    .select(POPULATION_COLUMNS)
    .in('status', POPULATION_STATUSES)
    .order('last_tool_at', { ascending: true, nullsFirst: true })
    .limit(POPULATION_ROW_LIMIT);
  if (error) throw new Error('stuck-seat-population: query failed: ' + error.message);
  const rows = data || [];
  // TRUNCATION IS REPORTED, NEVER SWALLOWED. A caller that renders a count must be able to say the
  // count was computed over a capped page — otherwise a truncated read renders as a smaller, clean
  // number. Returning the flag rather than logging it keeps this module pure.
  const truncated = rows.length >= POPULATION_ROW_LIMIT;
  const seats = rows.filter((row) => !isFixtureSession(row));
  seats.truncated = truncated;
  return seats;
}

module.exports = { fetchPopulation, POPULATION_STATUSES, POPULATION_COLUMNS, POPULATION_ROW_LIMIT };
